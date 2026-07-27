import * as cheerio from 'cheerio';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { db } from '../db/supabase.js';
import { detectQueryIntent, relevanceScore, sanitizeKnowledgeForGtc, type KnowledgeRow } from './catalog.service.js';

const EXCLUDED_PATH = /\/(cart|checkout|login|logout|register|account|wishlist|admin|wp-admin|gio-hang|thanh-toan)(\/|$)/i;
const HTML_TYPES = ['text/html', 'application/xhtml+xml'];

function canonicalUrl(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    const origin = new URL(env.COMPANY_WEBSITE).origin;
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) return null;
    if (EXCLUDED_PATH.test(url.pathname)) return null;
    url.hash = '';
    for (const key of ['fbclid', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchHtml(url: string, timeoutMs = env.WEBSITE_FETCH_TIMEOUT_MS): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'SonTienBaoSmartAdvisor/3.0 (+https://sontienbao.com/)',
        accept: 'text/html,application/xhtml+xml'
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok || !HTML_TYPES.some((type) => contentType.includes(type))) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function extractPage(html: string, url: string): KnowledgeRow | null {
  const $ = cheerio.load(html);
  $('script,style,noscript,svg,iframe,form,nav,footer,.footer,.header,.menu,.breadcrumb').remove();
  const title = ($('h1').first().text() || $('meta[property="og:title"]').attr('content') || $('title').text() || url)
    .replace(/\s+/g, ' ')
    .trim();
  const candidates = ['main', 'article', '.product-detail', '.product-info', '#content', '.content', '.entry-content', 'body'];
  let content = '';
  for (const selector of candidates) {
    const text = $(selector).first().text().replace(/\s+/g, ' ').trim();
    if (text.length > content.length) content = text;
    if (content.length > 1200) break;
  }
  content = content.slice(0, 60000);
  if (content.length < 180) return null;
  return { title, content, source_url: url, approval_status: 'approved' };
}

function searchSeeds(query: string): string[] {
  const origin = new URL(env.COMPANY_WEBSITE).origin;
  const encoded = encodeURIComponent(query);
  const intent = detectQueryIntent(query);
  const seeds = new Set<string>([
    env.COMPANY_WEBSITE,
    `${origin}/?s=${encoded}`,
    `${origin}/search?q=${encoded}`,
    `${origin}/tim-kiem?q=${encoded}`
  ]);

  const hints: Partial<Record<ReturnType<typeof detectQueryIntent>, string[]>> = {
    interior: [
      '/son-jotun-nauy/son-phu-noi-that-jotun/',
      '/son-terraco/son-nuoc-noi-that/',
      '/san-pham/son-nippon/son-phu-noi-that-nippon/'
    ],
    exterior: ['/son-jotun-nauy/son-phu-ngoai-that-jotun/', '/son-terraco/son-nuoc-ngoai-that/'],
    waterproof: ['/son-chong-tham/', '/chong-tham/'],
    primer: ['/son-lot/', '/son-jotun-nauy/son-lot-jotun/'],
    putty: ['/son-jotun-nauy/bot-tret-jotun/'],
    floor_sport: ['/son-terraco/son-san-the-thao/']
  };
  for (const path of hints[intent] ?? []) seeds.add(new URL(path, origin).toString());
  return [...seeds];
}

function collectLinks(html: string, baseUrl: string, query: string): Array<{ url: string; score: number }> {
  const $ = cheerio.load(html);
  const links = new Map<string, number>();
  $('a[href]').each((_index, element) => {
    const url = canonicalUrl($(element).attr('href') ?? '', baseUrl);
    if (!url) return;
    const anchor = $(element).text().replace(/\s+/g, ' ').trim();
    const score = relevanceScore({ query, title: anchor, url });
    if (score > (links.get(url) ?? -Infinity)) links.set(url, score);
  });
  return [...links.entries()]
    .map(([url, score]) => ({ url, score }))
    .sort((a, b) => b.score - a.score);
}

async function saveTrustedWebsiteDocument(document: KnowledgeRow): Promise<void> {
  if (!document.source_url) return;
  const contentHash = crypto.createHash('sha256').update(document.content).digest('hex');
  await db.from('knowledge_documents').upsert({
    title: document.title,
    content: document.content,
    source_url: document.source_url,
    content_hash: contentHash,
    approval_status: 'approved',
    updated_at: new Date().toISOString()
  }, { onConflict: 'source_url' });
}

export async function searchWebsiteLive(query: string): Promise<KnowledgeRow[]> {
  if (!env.LIVE_WEBSITE_SEARCH_ENABLED) return [];

  const seeds = searchSeeds(query);
  const seedPages = await Promise.all(seeds.map(async (url) => ({ url, html: await fetchHtml(url) })));
  const candidates = new Map<string, number>();

  for (const seed of seedPages) {
    if (!seed.html) continue;
    const seedDocument = extractPage(seed.html, seed.url);
    if (seedDocument) {
      const score = relevanceScore({ query, title: seedDocument.title, content: seedDocument.content, url: seed.url });
      if (score >= 8) candidates.set(seed.url, Math.max(score, candidates.get(seed.url) ?? 0));
    }
    for (const link of collectLinks(seed.html, seed.url, query).slice(0, 30)) {
      candidates.set(link.url, Math.max(link.score, candidates.get(link.url) ?? 0));
    }
  }

  const urls = [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, env.LIVE_WEBSITE_MAX_PAGES)
    .map(([url]) => url);

  const pages = await Promise.all(urls.map(async (url) => {
    const html = await fetchHtml(url);
    return html ? extractPage(html, url) : null;
  }));

  const ranked = pages
    .filter((page): page is KnowledgeRow => Boolean(page))
    .map((page) => ({
      page,
      score: relevanceScore({ query, title: page.title, content: page.content, url: page.source_url })
    }))
    .filter((item) => item.score >= 8)
    .sort((a, b) => b.score - a.score)
    .slice(0, env.AI_MAX_KNOWLEDGE_DOCS)
    .map((item) => sanitizeKnowledgeForGtc(item.page));

  await Promise.all(ranked.map((document) => saveTrustedWebsiteDocument(document).catch(() => undefined)));
  return ranked;
}
