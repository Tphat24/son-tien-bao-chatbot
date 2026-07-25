import { db } from '../db/supabase.js';
import { normalizeText } from '../utils/text.js';


export const CATALOG_PAGE_SIZE = 5;
const DATABASE_BATCH_SIZE = 500;
const MAX_DATABASE_ROWS = 5000;


export type CatalogCategoryKey =
  | 'interior'
  | 'exterior'
  | 'primer'
  | 'waterproof'
  | 'putty'
  | 'industrial'
  | 'floor_sport'
  | 'all';


export type CatalogItem = {
  id: string;
  name: string;
  brand: string | null;
  category: CatalogCategoryKey;
  categoryLabel: string;
  packageText: string | null;
  price: number | null;
  sourceUrl: string | null;
  source: 'products' | 'knowledge_documents';
};


export type CatalogBrowseRequest = {
  category?: CatalogCategoryKey;
  brand?: string;
  query?: string;
  page?: number;
  pageSize?: number;
};


export type CatalogPage = {
  category: CatalogCategoryKey;
  categoryLabel: string;
  brand?: string;
  query?: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: CatalogItem[];
};


type ProductDatabaseRow = {
  id: string;
  sku: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  description: string | null;
  use_case: string | null;
  package_text: string | null;
  price: number | null;
  source_url: string | null;
};


type KnowledgeDatabaseRow = {
  title: string;
  content: string;
  source_url: string | null;
  approval_status: string | null;
};


const CATEGORY_LABELS: Record<CatalogCategoryKey, string> = {
  interior: 'Sơn nội thất',
  exterior: 'Sơn ngoại thất',
  primer: 'Sơn lót',
  waterproof: 'Sơn chống thấm',
  putty: 'Bột trét',
  industrial: 'Sơn kim loại, gỗ và công nghiệp',
  floor_sport: 'Sơn sàn và sân thể thao',
  all: 'Tất cả sản phẩm'
};


const PRODUCT_HINT_PATTERN =
  /son|paint|primer|putty|bot tret|chong tham|jotun|nippon|terraco|dulux|kova|mykolor|toa|expo|ruby|jotashield|majestic|essence|weathergard|weatherbond/i;


function clampInteger(value: number | undefined, minimum: number, maximum: number): number {
  const candidate = Number.isFinite(value) ? Math.floor(value as number) : minimum;
  return Math.min(maximum, Math.max(minimum, candidate));
}


export function getCatalogCategoryLabel(category: CatalogCategoryKey): string {
  return CATEGORY_LABELS[category];
}


export function detectCatalogCategory(value: string): CatalogCategoryKey {
  const normalized = normalizeText(value);


  if (/san the thao|tennis|flexipave|son san|epoxy/.test(normalized)) return 'floor_sport';
  if (/chong tham|tham nuoc|waterproof|chong am/.test(normalized)) return 'waterproof';
  if (/bot tret|putty|ba matit|bot ba/.test(normalized)) return 'putty';
  if (/son lot|primer|khang kiem|lot chong kiem/.test(normalized)) return 'primer';
  if (/ngoai that|ngoai troi|mat tien|tuong ngoai|jotashield|tough shield|weathergard|weatherbond|supergard/.test(normalized)) {
    return 'exterior';
  }
  if (/noi that|trong nha|phong ngu|phong khach|majestic|essence|jotaplast|easy wash|odour less/.test(normalized)) {
    return 'interior';
  }
  if (/kim loai|sat|thep|metal|son go|wood|cong nghiep|chiu nhiet|son dau|dung moi/.test(normalized)) {
    return 'industrial';
  }


  return 'all';
}


function inferBrand(value: string): string | null {
  const normalized = normalizeText(value);
  const brands: Array<[RegExp, string]> = [
    [/jotun/, 'Jotun'],
    [/nippon/, 'Nippon'],
    [/terraco/, 'Terraco'],
    [/dulux/, 'Dulux'],
    [/kova/, 'Kova'],
    [/mykolor/, 'Mykolor'],
    [/(^|\s)toa(\s|$)/, 'TOA'],
    [/expo/, 'Expo'],
    [/ruby/, 'Ruby']
  ];


  for (const [pattern, brand] of brands) {
    if (pattern.test(normalized)) return brand;
  }


  return null;
}


function isLikelyProductDocument(document: KnowledgeDatabaseRow): boolean {
  const titleAndUrl = normalizeText(`${document.title} ${document.source_url ?? ''}`);
  if (!PRODUCT_HINT_PATTERN.test(titleAndUrl)) return false;


  if (/gio hang|thanh toan|dang nhap|lien he|chinh sach|tin tuc|gioi thieu|tuyen dung/.test(titleAndUrl)) {
    return false;
  }


  const url = document.source_url ?? '';
  const looksLikeProductUrl = /\.html(?:$|\?)/i.test(url) || /\/san-pham\//i.test(url);
  const looksLikeProductTitle = /\b\d+(?:[.,]\d+)?\s*(?:l|lit|kg|ml)\b/i.test(document.title);
  return looksLikeProductUrl || looksLikeProductTitle;
}


function productRowToCatalogItem(product: ProductDatabaseRow): CatalogItem {
  const searchable = [
    product.name,
    product.brand,
    product.category,
    product.use_case,
    product.description,
    product.source_url
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');


  return {
    id: product.id || product.sku || product.source_url || product.name,
    name: product.name,
    brand: product.brand ?? inferBrand(searchable),
    category: detectCatalogCategory(searchable),
    categoryLabel: getCatalogCategoryLabel(detectCatalogCategory(searchable)),
    packageText: product.package_text,
    price: typeof product.price === 'number' ? product.price : null,
    sourceUrl: product.source_url,
    source: 'products'
  };
}


function knowledgeRowToCatalogItem(document: KnowledgeDatabaseRow): CatalogItem {
  const titleAndUrl = `${document.title} ${document.source_url ?? ''}`;
  const categoryFromTitle = detectCatalogCategory(titleAndUrl);
  const category = categoryFromTitle !== 'all'
    ? categoryFromTitle
    : detectCatalogCategory(document.content.slice(0, 1500));


  return {
    id: document.source_url || document.title,
    name: document.title,
    brand: inferBrand(titleAndUrl),
    category,
    categoryLabel: getCatalogCategoryLabel(category),
    packageText: null,
    price: null,
    sourceUrl: document.source_url,
    source: 'knowledge_documents'
  };
}


async function fetchAllProducts(): Promise<ProductDatabaseRow[]> {
  const rows: ProductDatabaseRow[] = [];


  for (let from = 0; from < MAX_DATABASE_ROWS; from += DATABASE_BATCH_SIZE) {
    const to = from + DATABASE_BATCH_SIZE - 1;
    const { data, error } = await db
      .from('products')
      .select('id,sku,name,brand,category,description,use_case,package_text,price,source_url')
      .eq('status', 'active')
      .eq('approval_status', 'approved')
      .order('name', { ascending: true })
      .range(from, to);


    if (error) throw error;
    const batch = (data ?? []) as ProductDatabaseRow[];
    rows.push(...batch);
    if (batch.length < DATABASE_BATCH_SIZE) break;
  }


  return rows;
}


async function fetchAllKnowledgeDocuments(): Promise<KnowledgeDatabaseRow[]> {
  const rows: KnowledgeDatabaseRow[] = [];


  for (let from = 0; from < MAX_DATABASE_ROWS; from += DATABASE_BATCH_SIZE) {
    const to = from + DATABASE_BATCH_SIZE - 1;
    const { data, error } = await db
      .from('knowledge_documents')
      .select('title,content,source_url,approval_status')
      .eq('approval_status', 'approved')
      .order('title', { ascending: true })
      .range(from, to);


    if (error) throw error;
    const batch = (data ?? []) as KnowledgeDatabaseRow[];
    rows.push(...batch);
    if (batch.length < DATABASE_BATCH_SIZE) break;
  }


  return rows;
}


function canonicalItemKey(item: CatalogItem): string {
  if (item.sourceUrl) {
    try {
      const url = new URL(item.sourceUrl);
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) {
        if (key.startsWith('utm_') || key === 'fbclid' || key === 'gclid') {
          url.searchParams.delete(key);
        }
      }
      return `url:${url.toString().replace(/\/$/, '').toLowerCase()}`;
    } catch {
      return `url:${item.sourceUrl.replace(/\/$/, '').toLowerCase()}`;
    }
  }


  return `name:${normalizeText(item.name)}`;
}


function uniqueCatalogItems(items: CatalogItem[]): CatalogItem[] {
  const selected = new Map<string, CatalogItem>();


  for (const item of items) {
    const key = canonicalItemKey(item);
    const current = selected.get(key);
    if (!current || current.source === 'knowledge_documents') selected.set(key, item);
  }


  return [...selected.values()];
}


function matchesCategory(item: CatalogItem, category: CatalogCategoryKey): boolean {
  return category === 'all' || item.category === category;
}


function matchesBrand(item: CatalogItem, brand: string | undefined): boolean {
  if (!brand?.trim()) return true;
  const expected = normalizeText(brand);
  const searchable = normalizeText(`${item.brand ?? ''} ${item.name} ${item.sourceUrl ?? ''}`);
  return searchable.includes(expected);
}


function matchesQuery(item: CatalogItem, query: string | undefined): boolean {
  if (!query?.trim()) return true;
  const terms = normalizeText(query)
    .split(' ')
    .filter((term) => term.length > 1);
  if (!terms.length) return true;


  const searchable = normalizeText(
    `${item.name} ${item.brand ?? ''} ${item.categoryLabel} ${item.packageText ?? ''} ${item.sourceUrl ?? ''}`
  );
  return terms.every((term) => searchable.includes(term));
}


function sortCatalogItems(items: CatalogItem[]): CatalogItem[] {
  return [...items].sort((left, right) => {
    const leftBrand = normalizeText(left.brand ?? '');
    const rightBrand = normalizeText(right.brand ?? '');
    if (leftBrand !== rightBrand) return leftBrand.localeCompare(rightBrand, 'vi');
    return left.name.localeCompare(right.name, 'vi');
  });
}


export async function listCatalogProducts(request: CatalogBrowseRequest = {}): Promise<CatalogPage> {
  const category = request.category ?? 'all';
  const pageSize = clampInteger(request.pageSize, 1, 10) || CATALOG_PAGE_SIZE;
  const [products, documents] = await Promise.all([
    fetchAllProducts(),
    fetchAllKnowledgeDocuments()
  ]);


  const items = uniqueCatalogItems([
    ...products.map(productRowToCatalogItem),
    ...documents.filter(isLikelyProductDocument).map(knowledgeRowToCatalogItem)
  ]);


  const filtered = sortCatalogItems(
    items.filter(
      (item) =>
        matchesCategory(item, category) &&
        matchesBrand(item, request.brand) &&
        matchesQuery(item, request.query)
    )
  );


  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = clampInteger(request.page, 1, totalPages);
  const offset = (page - 1) * pageSize;
  const brand = request.brand?.trim();
  const query = request.query?.trim();


  return {
    category,
    categoryLabel: getCatalogCategoryLabel(category),
    ...(brand ? { brand } : {}),
    ...(query ? { query } : {}),
    page,
    pageSize,
    total,
    totalPages,
    items: filtered.slice(offset, offset + pageSize)
  };
}


function formatMoney(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(value);
}


export function formatCatalogPage(result: CatalogPage): string {
  const heading = result.query
    ? `🔎 KẾT QUẢ TÌM: ${result.query}`
    : result.brand
      ? `🏷️ SẢN PHẨM HÃNG ${result.brand.toUpperCase()}`
      : `📦 ${result.categoryLabel.toUpperCase()}`;


  if (!result.items.length) {
    return [
      heading,
      '',
      'Chưa tìm thấy sản phẩm phù hợp trong dữ liệu đã duyệt.',
      '',
      'Anh/Chị có thể nhập “danh mục” để chọn nhóm khác hoặc “tư vấn trực tiếp” để gặp nhân viên.'
    ].join('\n');
  }


  const itemLines = result.items.flatMap((item, index) => {
    const absoluteIndex = (result.page - 1) * result.pageSize + index + 1;
    const details: string[] = [];
    if (item.brand) details.push(`Hãng: ${item.brand}`);
    if (item.packageText) details.push(`Quy cách: ${item.packageText}`);
    if (item.price !== null) details.push(`Giá tham khảo: ${formatMoney(item.price)}`);


    return [
      `${absoluteIndex}. ${item.name}`,
      ...details.map((detail) => `   ${detail}`),
      item.sourceUrl ? `   ${item.sourceUrl}` : undefined,
      ''
    ].filter((line): line is string => Boolean(line));
  });


  return [
    heading,
    '',
    `Tìm thấy ${result.total} sản phẩm phù hợp.`,
    `Trang ${result.page}/${result.totalPages}`,
    '',
    ...itemLines,
    result.page < result.totalPages ? 'Nhập “xem thêm” để xem trang tiếp theo.' : 'Đây là trang cuối.',
    result.page > 1 ? 'Nhập “trang trước” để quay lại.' : undefined,
    'Nhập “danh mục” để chọn nhóm khác hoặc “menu” để quay lại menu chính.'
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}


export function catalogMenuMessage(): string {
  return [
    '📦 DANH MỤC SẢN PHẨM',
    '',
    '1. Sơn nội thất',
    '2. Sơn ngoại thất',
    '3. Sơn lót',
    '4. Sơn chống thấm',
    '5. Bột trét',
    '6. Sơn kim loại, gỗ và công nghiệp',
    '7. Sơn sàn và sân thể thao',
    '8. Xem theo thương hiệu',
    '9. Xem tất cả sản phẩm',
    '0. Quay lại menu chính',
    '',
    'Anh/Chị nhập số hoặc gõ tên nhóm cần xem.'
  ].join('\n');
}