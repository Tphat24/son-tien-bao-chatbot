import { db } from '../db/supabase.js';
import { env } from '../config/env.js';
import { normalizeText } from '../utils/text.js';

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string | null;
  description: string | null;
  use_case: string | null;
  coverage_text: string | null;
  coverage_min: number | null;
  coverage_max: number | null;
  recommended_coats: number | null;
  package_text: string | null;
  package_sizes: number[] | null;
  price: number | null;
  image_url: string | null;
  source_url: string | null;
}

export interface KnowledgeRow {
  title: string;
  content: string;
  source_url: string | null;
  approval_status?: string | null;
}

const productColumns = 'id,sku,name,brand,category,description,use_case,coverage_text,coverage_min,coverage_max,recommended_coats,package_text,package_sizes,price,image_url,source_url';

const STOP_WORDS = new Set([
  'toi', 'can', 'cho', 'giup', 'tu', 'van', 've', 'co', 'khong', 'nhu', 'the', 'nao', 'anh', 'chi', 'em',
  'la', 'mot', 'cac', 'loai', 'san', 'pham', 'muon', 'hoi', 'hay', 'duoc', 'va', 'voi', 'de', 'dung'
]);

const QUERY_EXPANSIONS: Record<string, string[]> = {
  'noi that': ['trong nha', 'phong ngu', 'phong khach', 'essence', 'majestic', 'jotaplast', 'easy wash', 'odour less'],
  'ngoai that': ['ngoai troi', 'mat tien', 'tough shield', 'jotashield'],
  'chong tham': ['tham nuoc', 'ro ri', 'waterproof'],
  'son lot': ['primer', 'lot khang kiem'],
  'bot tret': ['putty', 'ba matit'],
  'nam moc': ['reu moc', 'moc tuong'],
  'bong troc': ['phan hoa', 'troc son'],
  'kim loai': ['sat', 'thep', 'metal'],
  'go': ['wood'],
  'san the thao': ['flexipave', 'tennis', 'the thao'],
  'giao hang': ['van chuyen', 'ship'],
  'thanh toan': ['chuyen khoan', 'payment'],
  'bao gia': ['gia', 'chi phi', 'quotation'],
  'dia chi': ['cua hang', 'kho', 'chi nhanh'],
  'thi cong': ['quy trinh son', 'tho son']
};

export type QueryIntent =
  | 'interior'
  | 'exterior'
  | 'waterproof'
  | 'primer'
  | 'putty'
  | 'metal'
  | 'wood'
  | 'floor_sport'
  | 'policy'
  | 'technical'
  | 'general';

export function detectQueryIntent(query: string): QueryIntent {
  const value = normalizeText(query);
  if (/noi that|trong nha|phong ngu|phong khach/.test(value)) return 'interior';
  if (/ngoai that|ngoai troi|mat tien/.test(value)) return 'exterior';
  if (/chong tham|tham nuoc|ro ri/.test(value)) return 'waterproof';
  if (/son lot|primer|khang kiem/.test(value)) return 'primer';
  if (/bot tret|putty|ba matit/.test(value)) return 'putty';
  if (/kim loai|sat|thep/.test(value)) return 'metal';
  if (/(^|\s)go(\s|$)|son go/.test(value)) return 'wood';
  if (/san the thao|tennis|flexipave|son san|epoxy/.test(value)) return 'floor_sport';
  if (/giao hang|van chuyen|thanh toan|doi tra|bao hanh|dia chi|gio lam|chinh sach/.test(value)) return 'policy';
  if (/nam moc|bong troc|nut tuong|xu ly be mat|ky thuat|thi cong/.test(value)) return 'technical';
  return 'general';
}

export function queryTerms(query: string): string[] {
  const normalized = normalizeText(query);
  const result = new Set(
    normalized
      .split(' ')
      .filter((term) => term.length > 1 && !STOP_WORDS.has(term))
  );
  for (const [phrase, expansions] of Object.entries(QUERY_EXPANSIONS)) {
    if (normalized.includes(phrase)) {
      for (const expansion of expansions) {
        for (const term of normalizeText(expansion).split(' ')) {
          if (term.length > 1) result.add(term);
        }
      }
    }
  }
  return [...result].slice(0, 20);
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while ((index = haystack.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
    if (count >= 4) break;
  }
  return count;
}

function intentBoost(value: string, intent: QueryIntent, strongField = false): number {
  const multiplier = strongField ? 2 : 1;
  switch (intent) {
    case 'interior':
      return multiplier * ((/noi that|trong nha|phong ngu|phong khach/.test(value) ? 18 : 0) - (/ngoai that|san the thao|kim loai|son go|cong nghiep/.test(value) ? 24 : 0));
    case 'exterior':
      return multiplier * ((/ngoai that|ngoai troi|mat tien/.test(value) ? 18 : 0) - (/noi that|san the thao/.test(value) ? 20 : 0));
    case 'waterproof':
      return multiplier * ((/chong tham|tham nuoc|waterproof/.test(value) ? 20 : 0) - (/san the thao/.test(value) ? 10 : 0));
    case 'primer':
      return multiplier * (/son lot|primer|khang kiem/.test(value) ? 18 : 0);
    case 'putty':
      return multiplier * (/bot tret|putty|ba matit/.test(value) ? 18 : 0);
    case 'metal':
      return multiplier * ((/kim loai|sat|thep|metal/.test(value) ? 18 : 0) - (/noi that|ngoai that/.test(value) ? 6 : 0));
    case 'wood':
      return multiplier * (/son go|wood|go /.test(value) ? 18 : 0);
    case 'floor_sport':
      return multiplier * (/san the thao|tennis|flexipave|son san|epoxy/.test(value) ? 20 : 0);
    case 'policy':
      return multiplier * (/chinh sach|giao hang|van chuyen|thanh toan|doi tra|bao hanh|dia chi|gio lam/.test(value) ? 18 : 0);
    case 'technical':
      return multiplier * (/nam moc|bong troc|nut tuong|xu ly|thi cong|be mat/.test(value) ? 16 : 0);
    default:
      return 0;
  }
}

export function relevanceScore(input: {
  query: string;
  title?: string | null;
  category?: string | null;
  useCase?: string | null;
  description?: string | null;
  content?: string | null;
  url?: string | null;
}): number {
  const terms = queryTerms(input.query);
  const intent = detectQueryIntent(input.query);
  const title = normalizeText(input.title ?? '');
  const category = normalizeText(input.category ?? '');
  const useCase = normalizeText(input.useCase ?? '');
  const description = normalizeText(input.description ?? '');
  const content = normalizeText((input.content ?? '').slice(0, 30000));
  const url = normalizeText(input.url ?? '');
  const normalizedQuery = normalizeText(input.query);

  let score = 0;
  if (normalizedQuery.length > 5) {
    if (title.includes(normalizedQuery)) score += 45;
    if (category.includes(normalizedQuery)) score += 35;
    if (content.includes(normalizedQuery)) score += 18;
  }
  for (const term of terms) {
    score += Math.min(4, countOccurrences(title, term)) * 8;
    score += Math.min(3, countOccurrences(category, term)) * 7;
    score += Math.min(3, countOccurrences(useCase, term)) * 6;
    score += Math.min(2, countOccurrences(description, term)) * 3;
    score += Math.min(2, countOccurrences(content, term)) * 1.5;
    score += Math.min(2, countOccurrences(url, term)) * 2;
  }
  score += intentBoost(`${title} ${category} ${useCase}`, intent, true);
  score += intentBoost(`${description} ${content.slice(0, 5000)}`, intent, false);
  return score;
}

export async function searchProducts(query: string): Promise<ProductRow[]> {
  const { data, error } = await db
    .from('products')
    .select(productColumns)
    .eq('status', 'active')
    .eq('approval_status', 'approved')
    .limit(500);
  if (error) throw error;

  return ((data ?? []) as ProductRow[])
    .map((product) => ({
      product,
      score: relevanceScore({
        query,
        title: product.name,
        category: product.category,
        useCase: product.use_case,
        description: product.description,
        content: product.coverage_text,
        url: product.source_url
      })
    }))
    .filter((item) => item.score >= 8)
    .sort((a, b) => b.score - a.score)
    .slice(0, env.AI_MAX_PRODUCTS)
    .map((item) => item.product);
}

export async function getProductBySku(sku: string): Promise<ProductRow | null> {
  const { data, error } = await db
    .from('products')
    .select(productColumns)
    .eq('sku', sku)
    .eq('status', 'active')
    .eq('approval_status', 'approved')
    .maybeSingle();
  if (error) throw error;
  return data as ProductRow | null;
}

function isCompanyWebsiteUrl(rawUrl: string | null): boolean {
  if (!rawUrl) return false;
  try {
    return new URL(rawUrl).origin === new URL(env.COMPANY_WEBSITE).origin;
  } catch {
    return false;
  }
}

export async function searchKnowledge(query: string, max = env.AI_MAX_KNOWLEDGE_DOCS): Promise<KnowledgeRow[]> {
  const { data, error } = await db
    .from('knowledge_documents')
    .select('title,content,source_url,approval_status')
    .neq('approval_status', 'rejected')
    .limit(700);
  if (error) throw error;

  return ((data ?? []) as KnowledgeRow[])
    .filter((document) => document.approval_status === 'approved' || isCompanyWebsiteUrl(document.source_url))
    .map((document) => ({
      document,
      score: relevanceScore({ query, title: document.title, content: document.content, url: document.source_url })
    }))
    .filter((item) => item.score >= 6)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((item) => item.document);
}
