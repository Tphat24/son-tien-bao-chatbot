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
  /** Chỉ chứa GTC đã xác thực. Không dùng giá đại lý trong trường này. */
  price: number | null;
  price_label?: 'GTC' | null;
  image_url: string | null;
  source_url: string | null;
}

export interface KnowledgeRow {
  title: string;
  content: string;
  source_url: string | null;
  approval_status?: string | null;
  price_policy?: 'GTC_ONLY';
}

const productColumns = 'id,sku,name,brand,category,description,use_case,coverage_text,coverage_min,coverage_max,recommended_coats,package_text,package_sizes,price,image_url,source_url';

const STOP_WORDS = new Set([
  'toi', 'can', 'cho', 'giup', 'tu', 'van', 've', 'co', 'khong', 'nhu', 'the', 'nao', 'anh', 'chi', 'em',
  'la', 'mot', 'cac', 'loai', 'san', 'pham', 'muon', 'hoi', 'hay', 'duoc', 'va', 'voi', 'de', 'dung', 'gia',
  'bao', 'nhieu', 'xem', 'tim', 'kiem', 'goi', 'y', 'phu', 'hop'
]);

const QUERY_EXPANSIONS: Record<string, string[]> = {
  'noi that': ['trong nha', 'phong ngu', 'phong khach', 'essence', 'majestic', 'jotaplast', 'easy wash', 'odour less'],
  'ngoai that': ['ngoai troi', 'mat tien', 'tough shield', 'jotashield', 'weatherbond', 'weathergard'],
  'chong tham': ['tham nuoc', 'ro ri', 'waterproof', 'waterguard'],
  'son lot': ['primer', 'lot khang kiem'],
  'bot tret': ['putty', 'ba matit', 'skimcoat'],
  'nam moc': ['reu moc', 'moc tuong', 'chong nam moc'],
  'bong troc': ['phan hoa', 'troc son', 'xu ly be mat'],
  'kim loai': ['sat', 'thep', 'metal', 'gardex'],
  'go': ['wood', 'son dau'],
  'san the thao': ['flexipave', 'tennis', 'the thao', 'san bong ro', 'san cau long'],
  'de lau chui': ['lau chui', 'chong bam ban', 'easy wash'],
  'it mui': ['nhe mui', 'khong mui', 'odour less'],
  'cao cap': ['ben mau', 'sach vuot troi', 'jotashield', 'majestic'],
  'kinh te': ['tiet kiem', 'gia hop ly', 'jotaplast', 'essence'],
  'giao hang': ['van chuyen', 'ship'],
  'thanh toan': ['chuyen khoan', 'payment'],
  'bao gia': ['gia', 'chi phi', 'quotation', 'gtc', 'gia tieu chuan'],
  'dia chi': ['cua hang', 'kho', 'chi nhanh'],
  'thi cong': ['quy trinh son', 'tho son']
};

const BRAND_PATTERNS: Array<[RegExp, string]> = [
  [/jotun/, 'jotun'],
  [/nippon/, 'nippon'],
  [/terraco/, 'terraco'],
  [/dulux/, 'dulux'],
  [/kova/, 'kova'],
  [/mykolor/, 'mykolor'],
  [/(^|\s)toa(\s|$)/, 'toa'],
  [/expo/, 'expo'],
  [/ruby/, 'ruby']
];

const VND_TOKEN_SOURCE = String.raw`\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?\s*(?:đ|vnd)`;
const VND_TOKEN_REGEX = new RegExp(VND_TOKEN_SOURCE, 'giu');
const EXPLICIT_GTC_REGEX = new RegExp(
  String.raw`(?:\bgtc\b|giá\s*tiêu\s*chuẩn|gia\s*tieu\s*chuan|giá\s*niêm\s*yết|gia\s*niem\s*yet|giá\s*thị\s*trường|gia\s*thi\s*truong)[\s():\-]*(${VND_TOKEN_SOURCE})`,
  'iu'
);
const DISCOUNT_PAIR_REGEX = new RegExp(
  String.raw`(${VND_TOKEN_SOURCE})[^\d]{0,30}(${VND_TOKEN_SOURCE})[^%]{0,30}-?\s*\d{1,2}\s*%`,
  'giu'
);
const DEALER_MARKER_REGEX = /(?:\bgiá\s*(?:đl|dl|đại\s*lý)\b|\bgia\s*(?:dl|dai\s*ly)\b|\bđl\b|\bdl\b|đại\s*lý|dai\s*ly|giá\s*khuyến\s*mãi|gia\s*khuyen\s*mai|giá\s*bán|gia\s*ban)/iu;
const GTC_MARKER_REGEX = /(?:\bgtc\b|giá\s*tiêu\s*chuẩn|gia\s*tieu\s*chuan|giá\s*niêm\s*yết|gia\s*niem\s*yet|giá\s*thị\s*trường|gia\s*thi\s*truong)/iu;

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
  if (/ngoai that|ngoai troi|mat tien|tuong ngoai/.test(value)) return 'exterior';
  if (/chong tham|tham nuoc|ro ri|waterguard/.test(value)) return 'waterproof';
  if (/son lot|primer|khang kiem/.test(value)) return 'primer';
  if (/bot tret|putty|ba matit|skimcoat/.test(value)) return 'putty';
  if (/kim loai|sat|thep|chong gi|gardex/.test(value)) return 'metal';
  if (/(^|\s)go(\s|$)|son go/.test(value)) return 'wood';
  if (/san the thao|tennis|flexipave|son san|epoxy|san bong ro|san cau long/.test(value)) return 'floor_sport';
  if (/giao hang|van chuyen|thanh toan|doi tra|bao hanh|dia chi|gio lam|chinh sach/.test(value)) return 'policy';
  if (/nam moc|bong troc|nut tuong|xu ly be mat|ky thuat|thi cong/.test(value)) return 'technical';
  return 'general';
}

function detectBrand(value: string): string | null {
  const normalized = normalizeText(value);
  for (const [pattern, brand] of BRAND_PATTERNS) {
    if (pattern.test(normalized)) return brand;
  }
  return null;
}

export function queryTerms(query: string): string[] {
  const normalized = normalizeText(query);
  const result = new Set(
    normalized
      .split(' ')
      .filter((term) => term.length > 1 && !STOP_WORDS.has(term))
  );

  for (const [phrase, expansions] of Object.entries(QUERY_EXPANSIONS)) {
    if (!normalized.includes(phrase)) continue;
    for (const expansion of expansions) {
      for (const term of normalizeText(expansion).split(' ')) {
        if (term.length > 1 && !STOP_WORDS.has(term)) result.add(term);
      }
    }
  }

  return [...result].slice(0, 24);
}

function parseVndAmount(value: string): number | null {
  const digits = value.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function canonicalUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl, env.COMPANY_WEBSITE);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('utm_') || key === 'fbclid' || key === 'gclid') url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return rawUrl.trim().replace(/\/$/, '').toLowerCase() || null;
  }
}

/**
 * Chỉ trả về giá tiêu chuẩn (GTC) khi có bằng chứng rõ ràng:
 * 1) Có nhãn GTC/giá tiêu chuẩn/giá niêm yết; hoặc
 * 2) Website hiển thị cặp giá kèm phần trăm giảm — GTC là số lớn hơn.
 * Một giá đơn lẻ trên trang đại lý không được xem là GTC.
 */
export function extractVerifiedGtcPrice(input: {
  title?: string | null;
  content?: string | null;
  url?: string | null;
}): number | null {
  const title = input.title ?? '';
  const content = input.content ?? '';
  const url = input.url ?? '';
  const combined = `${title}\n${content}`;

  const explicit = combined.match(EXPLICIT_GTC_REGEX);
  if (explicit?.[1]) return parseVndAmount(explicit[1]);

  const pairPrices: number[] = [];
  for (const match of combined.matchAll(DISCOUNT_PAIR_REGEX)) {
    const first = match[1] ? parseVndAmount(match[1]) : null;
    const second = match[2] ? parseVndAmount(match[2]) : null;
    if (first !== null && second !== null) pairPrices.push(Math.max(first, second));
  }
  const uniquePairPrices = [...new Set(pairPrices)];
  if (uniquePairPrices.length === 1) return uniquePairPrices[0] ?? null;

  const identity = `${title} ${url}`;
  if (GTC_MARKER_REGEX.test(identity) && !DEALER_MARKER_REGEX.test(identity)) {
    const amounts = [...combined.matchAll(VND_TOKEN_REGEX)]
      .map((match) => parseVndAmount(match[0]))
      .filter((amount): amount is number => amount !== null);
    return amounts.length ? Math.max(...amounts) : null;
  }

  return null;
}

function formatVnd(value: number): string {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)}đ`;
}

/** Loại mọi giá chưa được xác thực và chỉ chèn lại GTC đã xác thực. */
export function sanitizeKnowledgeForGtc(document: KnowledgeRow): KnowledgeRow {
  const gtc = extractVerifiedGtcPrice({
    title: document.title,
    content: document.content,
    url: document.source_url
  });

  let content = document.content
    .replace(DISCOUNT_PAIR_REGEX, ' ')
    .replace(VND_TOKEN_REGEX, ' ')
    .replace(/(?:giảm|giam)\s*:?\s*-?\s*\d{1,2}\s*%/giu, ' ')
    .replace(/(?:giá|gia)\s*(?:đl|dl|đại\s*lý|dai\s*ly|khuyến\s*mãi|khuyen\s*mai|bán|ban)\s*:?/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (gtc !== null) {
    content = `${content}\nGiá tiêu chuẩn (GTC) đã xác thực: ${formatVnd(gtc)}.`.trim();
  }

  return {
    ...document,
    content,
    price_policy: 'GTC_ONLY'
  };
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
      return multiplier * ((/noi that|trong nha|phong ngu|phong khach/.test(value) ? 20 : 0) - (/ngoai that|san the thao|kim loai|son go|cong nghiep/.test(value) ? 30 : 0));
    case 'exterior':
      return multiplier * ((/ngoai that|ngoai troi|mat tien|tuong ngoai/.test(value) ? 20 : 0) - (/noi that|san the thao/.test(value) ? 26 : 0));
    case 'waterproof':
      return multiplier * ((/chong tham|tham nuoc|waterproof|waterguard/.test(value) ? 24 : 0) - (/san the thao/.test(value) ? 14 : 0));
    case 'primer':
      return multiplier * ((/son lot|primer|khang kiem/.test(value) ? 22 : 0) - (/son phu|bot tret/.test(value) ? 8 : 0));
    case 'putty':
      return multiplier * ((/bot tret|putty|ba matit|skimcoat/.test(value) ? 22 : 0) - (/son phu|son lot/.test(value) ? 8 : 0));
    case 'metal':
      return multiplier * ((/kim loai|sat|thep|metal|chong gi|gardex/.test(value) ? 22 : 0) - (/noi that|ngoai that|san the thao/.test(value) ? 14 : 0));
    case 'wood':
      return multiplier * ((/son go|wood|go |son dau/.test(value) ? 22 : 0) - (/san the thao|tuong/.test(value) ? 12 : 0));
    case 'floor_sport':
      return multiplier * ((/san the thao|tennis|flexipave|son san|epoxy|san bong ro|san cau long/.test(value) ? 24 : 0) - (/noi that|ngoai that|son go/.test(value) ? 18 : 0));
    case 'policy':
      return multiplier * (/chinh sach|giao hang|van chuyen|thanh toan|doi tra|bao hanh|dia chi|gio lam/.test(value) ? 18 : 0);
    case 'technical':
      return multiplier * (/nam moc|bong troc|nut tuong|xu ly|thi cong|be mat/.test(value) ? 18 : 0);
    default:
      return 0;
  }
}

function hardIntentMismatch(value: string, intent: QueryIntent): boolean {
  switch (intent) {
    case 'interior': return /ngoai that|san the thao|kim loai|son go|cong nghiep/.test(value) && !/noi that/.test(value);
    case 'exterior': return /noi that|san the thao|kim loai|son go/.test(value) && !/ngoai that/.test(value);
    case 'waterproof': return !/chong tham|tham nuoc|waterproof|waterguard/.test(value);
    case 'primer': return !/son lot|primer|khang kiem/.test(value);
    case 'putty': return !/bot tret|putty|ba matit|skimcoat/.test(value);
    case 'metal': return !/kim loai|sat|thep|metal|chong gi|gardex/.test(value);
    case 'wood': return !/son go|wood|go |son dau/.test(value);
    case 'floor_sport': return !/san the thao|tennis|flexipave|son san|epoxy|san bong ro|san cau long/.test(value);
    default: return false;
  }
}

function strongQueryTokens(query: string): string[] {
  return normalizeText(query)
    .split(' ')
    .filter((term) => term.length >= 4 && !STOP_WORDS.has(term))
    .filter((term) => !['trong', 'ngoai', 'tuong', 'phong'].includes(term));
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
  const strongValue = `${title} ${category} ${useCase}`;
  const allValue = `${strongValue} ${description} ${content.slice(0, 6000)} ${url}`;
  const requestedBrand = detectBrand(input.query);
  const candidateBrand = detectBrand(`${input.title ?? ''} ${input.category ?? ''} ${input.url ?? ''}`);

  let score = 0;
  if (normalizedQuery.length > 3) {
    if (title === normalizedQuery) score += 100;
    else if (title.includes(normalizedQuery)) score += 55;
    if (category.includes(normalizedQuery)) score += 30;
    if (useCase.includes(normalizedQuery)) score += 26;
    if (content.includes(normalizedQuery)) score += 12;
  }

  for (const term of terms) {
    score += Math.min(4, countOccurrences(title, term)) * 10;
    score += Math.min(3, countOccurrences(category, term)) * 8;
    score += Math.min(3, countOccurrences(useCase, term)) * 7;
    score += Math.min(2, countOccurrences(description, term)) * 3;
    score += Math.min(2, countOccurrences(content, term)) * 1.2;
    score += Math.min(2, countOccurrences(url, term)) * 2;
  }

  for (const token of strongQueryTokens(input.query)) {
    if (title.includes(token)) score += 12;
  }

  if (requestedBrand) {
    if (candidateBrand === requestedBrand) score += 34;
    else if (candidateBrand) score -= 70;
  }

  score += intentBoost(strongValue, intent, true);
  score += intentBoost(`${description} ${content.slice(0, 5000)}`, intent, false);
  if (hardIntentMismatch(allValue, intent)) score -= 60;

  return score;
}

function productIdentity(product: ProductRow): string {
  return canonicalUrl(product.source_url) ?? `name:${normalizeText(`${product.brand ?? ''} ${product.name}`)}`;
}

function findMatchingDocument(product: ProductRow, documents: KnowledgeRow[]): KnowledgeRow | null {
  const productUrl = canonicalUrl(product.source_url);
  if (productUrl) {
    const exact = documents.find((document) => canonicalUrl(document.source_url) === productUrl);
    if (exact) return exact;
  }

  const productName = normalizeText(product.name);
  const productTokens = productName.split(' ').filter((term) => term.length >= 4);
  let best: { document: KnowledgeRow; score: number } | null = null;

  for (const document of documents) {
    const title = normalizeText(document.title);
    const overlap = productTokens.filter((term) => title.includes(term)).length;
    const score = overlap * 10 + (title.includes(productName) || productName.includes(title) ? 40 : 0);
    if (score >= 30 && (!best || score > best.score)) best = { document, score };
  }

  return best?.document ?? null;
}

function enrichProductWithGtc(product: ProductRow, documents: KnowledgeRow[]): ProductRow {
  const document = findMatchingDocument(product, documents);
  const gtc = document
    ? extractVerifiedGtcPrice({ title: document.title, content: document.content, url: document.source_url })
    : null;

  return {
    ...product,
    price: gtc,
    price_label: gtc !== null ? 'GTC' : null
  };
}

export async function searchProducts(query: string): Promise<ProductRow[]> {
  const [productsResult, documentsResult] = await Promise.all([
    db
      .from('products')
      .select(productColumns)
      .eq('status', 'active')
      .eq('approval_status', 'approved')
      .limit(700),
    db
      .from('knowledge_documents')
      .select('title,content,source_url,approval_status')
      .neq('approval_status', 'rejected')
      .limit(1000)
  ]);

  if (productsResult.error) throw productsResult.error;
  if (documentsResult.error) throw documentsResult.error;

  const products = (productsResult.data ?? []) as ProductRow[];
  const documents = ((documentsResult.data ?? []) as KnowledgeRow[])
    .filter((document) => document.approval_status === 'approved' || isCompanyWebsiteUrl(document.source_url));

  const requestedBrand = detectBrand(query);
  const intent = detectQueryIntent(query);
  const ranked = products
    .map((product) => {
      const searchable = normalizeText(`${product.name} ${product.brand ?? ''} ${product.category ?? ''} ${product.use_case ?? ''} ${product.description ?? ''}`);
      const productBrand = detectBrand(`${product.brand ?? ''} ${product.name}`);
      const compatibleBrand = !requestedBrand || !productBrand || productBrand === requestedBrand;
      const compatibleIntent = !hardIntentMismatch(searchable, intent);
      return {
        product,
        compatibleBrand,
        compatibleIntent,
        score: relevanceScore({
          query,
          title: product.name,
          category: product.category,
          useCase: product.use_case,
          description: product.description,
          content: product.coverage_text,
          url: product.source_url
        })
      };
    })
    .filter((item) => item.score >= 10)
    .filter((item) => item.compatibleBrand)
    .filter((item) => intent === 'general' || intent === 'policy' || intent === 'technical' || item.compatibleIntent)
    .sort((a, b) => b.score - a.score);

  const selected: ProductRow[] = [];
  const seen = new Set<string>();
  for (const item of ranked) {
    const key = productIdentity(item.product);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(enrichProductWithGtc(item.product, documents));
    if (selected.length >= env.AI_MAX_PRODUCTS) break;
  }

  return selected;
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
  if (!data) return null;

  const product = data as ProductRow;
  if (!product.source_url) return { ...product, price: null, price_label: null };

  const { data: documents, error: documentError } = await db
    .from('knowledge_documents')
    .select('title,content,source_url,approval_status')
    .eq('source_url', product.source_url)
    .neq('approval_status', 'rejected')
    .limit(5);
  if (documentError) throw documentError;

  return enrichProductWithGtc(product, (documents ?? []) as KnowledgeRow[]);
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
    .limit(1000);
  if (error) throw error;

  return ((data ?? []) as KnowledgeRow[])
    .filter((document) => document.approval_status === 'approved' || isCompanyWebsiteUrl(document.source_url))
    .map((document) => ({
      document,
      score: relevanceScore({ query, title: document.title, content: document.content, url: document.source_url })
    }))
    .filter((item) => item.score >= 7)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((item) => sanitizeKnowledgeForGtc(item.document));
}
