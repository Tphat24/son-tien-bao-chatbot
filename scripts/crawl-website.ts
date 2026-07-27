import 'dotenv/config';
import * as cheerio from 'cheerio';
import crypto from 'node:crypto';
import { db } from '../src/db/supabase.js';
import { env } from '../src/config/env.js';
import { sanitizeKnowledgeForGtc } from '../src/services/catalog.service.js';

const maxPages = Number(process.env.CRAWL_MAX_PAGES ?? 300);
const concurrency = Math.max(1, Math.min(8, Number(process.env.CRAWL_CONCURRENCY ?? 5)));
const origin = new URL(env.COMPANY_WEBSITE).origin;
const queue = [env.COMPANY_WEBSITE];
const visited = new Set<string>();
const EXCLUDED_PATH = /\/(cart|checkout|login|logout|register|account|wishlist|admin|wp-admin|gio-hang|thanh-toan)(\/|$)/i;

function canonical(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || EXCLUDED_PATH.test(url.pathname)) return null;
    url.hash = '';
    for (const key of ['fbclid', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign']) url.searchParams.delete(key);
    return url.toString();
  } catch {
    return null;
  }
}

async function importPage(url: string): Promise<string[]> {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'SonTienBaoKnowledgeImporter/3.0 (+https://sontienbao.com/)' },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('text/html')) return [];
    const html = await response.text();
    const $ = cheerio.load(html);
    const links: string[] = [];
    $('a[href]').each((_index, element) => {
      const next = canonical($(element).attr('href') ?? '', url);
      if (next) links.push(next);
    });

    $('script,style,noscript,svg,iframe,form,nav,footer,.footer,.header,.menu,.breadcrumb').remove();
    const title = ($('h1').first().text() || $('meta[property="og:title"]').attr('content') || $('title').text() || url)
      .replace(/\s+/g, ' ')
      .trim();
    const selectors = ['main', 'article', '.product-detail', '.product-info', '#content', '.content', '.entry-content', 'body'];
    let content = '';
    for (const selector of selectors) {
      const text = $(selector).first().text().replace(/\s+/g, ' ').trim();
      if (text.length > content.length) content = text;
      if (content.length > 1200) break;
    }
    content = content.slice(0, 60000);

    if (content.length > 180) {
      const sanitized = sanitizeKnowledgeForGtc({
        title,
        content,
        source_url: url,
        approval_status: 'approved'
      });
      content = sanitized.content;

      const { error } = await db.from('knowledge_documents').upsert({
        title,
        content,
        source_url: url,
        content_hash: crypto.createHash('sha256').update(content).digest('hex'),
        approval_status: 'approved',
        page_type: /san-pham|son-jotun|son-terraco|son-nippon/i.test(new URL(url).pathname) ? 'product_or_category' : 'website',
        last_crawled_at: new Date().toISOString()
      }, { onConflict: 'source_url' });
      if (error) throw error;
      console.log('Indexed and approved:', url);
    }
    return [...new Set(links)];
  } catch (error) {
    console.warn('Skipped:', url, String(error));
    return [];
  }
}

while (queue.length && visited.size < maxPages) {
  const batch: string[] = [];
  while (queue.length && batch.length < concurrency && visited.size + batch.length < maxPages) {
    const url = queue.shift()!;
    if (!visited.has(url)) batch.push(url);
  }
  for (const url of batch) visited.add(url);
  const results = await Promise.all(batch.map(importPage));
  for (const links of results) {
    for (const next of links) {
      if (!visited.has(next) && !queue.includes(next)) queue.push(next);
    }
  }
}

console.log(`Done. Indexed ${visited.size} pages from ${origin}. Public company pages were auto-approved.`);
