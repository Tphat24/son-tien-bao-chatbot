import { db } from '../db/supabase.js';

/**
 * Service quản lý sản phẩm cho trang quản trị (yêu cầu mục 11 - Quản lý sản phẩm).
 *
 * Tách riêng khỏi catalog.service.ts (phần đọc/tìm kiếm cho chatbot) để:
 *  - Chatbot chỉ đọc sản phẩm status='active' & approval_status='approved'.
 *  - Admin quản lý toàn bộ vòng đời sản phẩm (tạo, sửa, xóa mềm, duyệt, giá, tồn kho).
 *
 * Nguyên tắc:
 *  - Không hard-code sản phẩm. Mọi dữ liệu nằm trong bảng products.
 *  - Xóa mềm bằng status='inactive' (không xóa cứng để giữ lịch sử báo giá/đơn).
 */

export type ProductStatus = 'active' | 'inactive';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type AdminProduct = {
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
  package_sizes: unknown;
  price: number | null;
  stock_quantity: number | null;
  image_url: string | null;
  source_url: string | null;
  status: ProductStatus;
  approval_status: ApprovalStatus;
  created_at: string;
  updated_at: string;
};

const ADMIN_COLUMNS =
  'id,sku,name,brand,category,description,use_case,coverage_text,coverage_min,coverage_max,recommended_coats,package_text,package_sizes,price,stock_quantity,image_url,source_url,status,approval_status,created_at,updated_at';

export type ListProductsParams = {
  search?: string;
  category?: string;
  brand?: string;
  status?: ProductStatus;
  approvalStatus?: ApprovalStatus;
  page?: number;
  pageSize?: number;
};

export type ListProductsResult = {
  items: AdminProduct[];
  total: number;
  page: number;
  pageSize: number;
};

/** Danh sách sản phẩm có lọc, tìm kiếm, phân trang cho admin. */
export async function listProductsForAdmin(params: ListProductsParams): Promise<ListProductsResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = db.from('products').select(ADMIN_COLUMNS, { count: 'exact' });

  if (params.search) {
    const term = params.search.trim();
    query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%,brand.ilike.%${term}%`);
  }
  if (params.category) query = query.eq('category', params.category);
  if (params.brand) query = query.eq('brand', params.brand);
  if (params.status) query = query.eq('status', params.status);
  if (params.approvalStatus) query = query.eq('approval_status', params.approvalStatus);

  query = query.order('updated_at', { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(`Cannot list products: ${error.message}`);

  return {
    items: (data ?? []) as AdminProduct[],
    total: count ?? 0,
    page,
    pageSize
  };
}

export async function getProductById(id: string): Promise<AdminProduct | null> {
  const { data, error } = await db.from('products').select(ADMIN_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(`Cannot get product: ${error.message}`);
  return (data as AdminProduct) ?? null;
}

export type ProductInput = {
  sku: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  description?: string | null;
  use_case?: string | null;
  coverage_text?: string | null;
  coverage_min?: number | null;
  coverage_max?: number | null;
  recommended_coats?: number | null;
  package_text?: string | null;
  package_sizes?: number[] | null;
  price?: number | null;
  stock_quantity?: number | null;
  image_url?: string | null;
  source_url?: string | null;
  status?: ProductStatus;
  approval_status?: ApprovalStatus;
};

/** Tạo sản phẩm mới. SKU phải là duy nhất. */
export async function createProduct(input: ProductInput): Promise<AdminProduct> {
  const payload = normalizeProductPayload(input);
  const { data, error } = await db.from('products').insert(payload).select(ADMIN_COLUMNS).single();
  if (error) {
    if (error.code === '23505') throw new Error(`SKU "${input.sku}" đã tồn tại.`);
    throw new Error(`Cannot create product: ${error.message}`);
  }
  return data as AdminProduct;
}

/** Cập nhật sản phẩm theo id. Chỉ ghi các trường được cung cấp. */
export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<AdminProduct> {
  const payload = normalizeProductPayload(input, true);
  const { data, error } = await db.from('products').update(payload).eq('id', id).select(ADMIN_COLUMNS).single();
  if (error) throw new Error(`Cannot update product: ${error.message}`);
  return data as AdminProduct;
}

/** Xóa mềm: đặt status='inactive'. Không xóa cứng để giữ tham chiếu lịch sử. */
export async function softDeleteProduct(id: string): Promise<void> {
  const { error } = await db.from('products').update({ status: 'inactive' }).eq('id', id);
  if (error) throw new Error(`Cannot soft-delete product: ${error.message}`);
}

/** Bật/tắt bán một sản phẩm. */
export async function setProductStatus(id: string, status: ProductStatus): Promise<void> {
  const { error } = await db.from('products').update({ status }).eq('id', id);
  if (error) throw new Error(`Cannot set product status: ${error.message}`);
}

/** Duyệt hoặc từ chối sản phẩm (chatbot chỉ dùng sản phẩm approved). */
export async function setProductApproval(id: string, approval: ApprovalStatus): Promise<void> {
  const { error } = await db.from('products').update({ approval_status: approval }).eq('id', id);
  if (error) throw new Error(`Cannot set approval: ${error.message}`);
}

/** Cập nhật nhanh giá và tồn kho (dùng cho màn quản lý giá/tồn). */
export async function updatePriceStock(
  id: string,
  input: { price?: number | null; stock_quantity?: number | null }
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.price !== undefined) patch.price = input.price;
  if (input.stock_quantity !== undefined) patch.stock_quantity = input.stock_quantity;
  if (Object.keys(patch).length === 0) return;
  const { error } = await db.from('products').update(patch).eq('id', id);
  if (error) throw new Error(`Cannot update price/stock: ${error.message}`);
}

/** Danh sách các danh mục & thương hiệu hiện có (để đổ vào bộ lọc admin). */
export async function listFacets(): Promise<{ categories: string[]; brands: string[] }> {
  const { data, error } = await db.from('products').select('category,brand');
  if (error) throw new Error(`Cannot list facets: ${error.message}`);
  const categories = new Set<string>();
  const brands = new Set<string>();
  for (const row of data ?? []) {
    const r = row as { category: string | null; brand: string | null };
    if (r.category) categories.add(r.category);
    if (r.brand) brands.add(r.brand);
  }
  return {
    categories: [...categories].sort(),
    brands: [...brands].sort()
  };
}

function normalizeProductPayload(
  input: Partial<ProductInput>,
  partial = false
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const assign = (key: keyof ProductInput, value: unknown) => {
    if (value !== undefined) payload[key] = value;
  };

  assign('sku', input.sku?.trim());
  assign('name', input.name?.trim());
  assign('brand', input.brand ?? undefined);
  assign('category', input.category ?? undefined);
  assign('description', input.description ?? undefined);
  assign('use_case', input.use_case ?? undefined);
  assign('coverage_text', input.coverage_text ?? undefined);
  assign('coverage_min', input.coverage_min ?? undefined);
  assign('coverage_max', input.coverage_max ?? undefined);
  assign('recommended_coats', input.recommended_coats ?? undefined);
  assign('package_text', input.package_text ?? undefined);
  assign('package_sizes', input.package_sizes ?? undefined);
  assign('price', input.price ?? undefined);
  assign('stock_quantity', input.stock_quantity ?? undefined);
  assign('image_url', input.image_url ?? undefined);
  assign('source_url', input.source_url ?? undefined);
  assign('status', input.status ?? undefined);
  assign('approval_status', input.approval_status ?? undefined);

  // Khi tạo mới, đảm bảo có sku & name.
  if (!partial) {
    if (!payload.sku) throw new Error('Thiếu SKU sản phẩm.');
    if (!payload.name) throw new Error('Thiếu tên sản phẩm.');
  }

  return payload;
}
