import { db } from '../db/supabase.js';
import { env } from '../config/env.js';
import { getSetting } from './settings.service.js';

/**
 * Service báo giá chính thức (yêu cầu mục 3.3 & 11 "Quản lý báo giá").
 *
 * Chức năng:
 *  - Tạo báo giá từ danh sách sản phẩm (tự tính line_total, subtotal, total).
 *  - Sinh mã báo giá duy nhất.
 *  - Cập nhật trạng thái (draft → sent → accepted/rejected/expired).
 *  - Sinh HTML báo giá khổ A4 để in/xuất PDF từ trình duyệt (không cần thư viện nặng).
 *
 * Ghi chú xuất PDF: DN nhỏ, tối ưu chi phí — dùng "In → Lưu PDF" của trình duyệt
 * thay vì puppeteer/thư viện PDF tốn RAM hosting. Route /print trả HTML đã tối ưu print CSS.
 */

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

export type QuotationItemInput = {
  productId?: string;
  productName: string;
  packageText?: string;
  unitPrice: number;
  quantity: number;
};

export type QuotationInput = {
  leadId?: string;
  customerName?: string;
  customerPhone?: string;
  customerArea?: string;
  projectType?: string;
  areaM2?: number;
  needConstruction?: boolean;
  note?: string;
  discount?: number;
  shippingFee?: number;
  validUntil?: string; // ISO date
  items: QuotationItemInput[];
};

export type QuotationRecord = {
  id: string;
  code: string;
  lead_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_area: string | null;
  project_type: string | null;
  area_m2: number | null;
  need_construction: boolean | null;
  note: string | null;
  subtotal: number;
  discount: number;
  shipping_fee: number;
  total: number;
  status: QuotationStatus;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
};

export type QuotationItemRecord = {
  id: string;
  quotation_id: string;
  product_id: string | null;
  product_name: string;
  package_text: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
  sort_order: number;
};

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function generateCode(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BG-${ymd}-${rand}`;
}

/** Tạo báo giá mới cùng các dòng sản phẩm. Tự tính tổng tiền phía server. */
export async function createQuotation(
  input: QuotationInput,
  createdBy?: string
): Promise<QuotationRecord> {
  if (!input.items.length) {
    throw new Error('Báo giá phải có ít nhất một sản phẩm');
  }

  const items = input.items.map((item, index) => {
    const quantity = Math.max(0, item.quantity);
    const unitPrice = Math.max(0, item.unitPrice);
    return {
      product_id: item.productId ?? null,
      product_name: item.productName,
      package_text: item.packageText ?? null,
      unit_price: round(unitPrice),
      quantity: round(quantity),
      line_total: round(unitPrice * quantity),
      sort_order: index
    };
  });

  const subtotal = round(items.reduce((sum, item) => sum + item.line_total, 0));
  const discount = round(Math.max(0, input.discount ?? 0));
  const shippingFee = round(Math.max(0, input.shippingFee ?? 0));
  const total = round(Math.max(0, subtotal - discount + shippingFee));

  const { data: quotation, error } = await db
    .from('quotations')
    .insert({
      code: generateCode(),
      lead_id: input.leadId ?? null,
      customer_name: input.customerName ?? null,
      customer_phone: input.customerPhone ?? null,
      customer_area: input.customerArea ?? null,
      project_type: input.projectType ?? null,
      area_m2: input.areaM2 ?? null,
      need_construction: input.needConstruction ?? false,
      note: input.note ?? null,
      subtotal,
      discount,
      shipping_fee: shippingFee,
      total,
      status: 'draft',
      valid_until: input.validUntil ?? null,
      created_by: createdBy ?? null
    })
    .select('*')
    .single();

  if (error || !quotation) throw new Error(`Cannot create quotation: ${error?.message}`);

  const itemsToInsert = items.map((item) => ({ ...item, quotation_id: quotation.id }));
  const { error: itemsError } = await db.from('quotation_items').insert(itemsToInsert);
  if (itemsError) {
    // Rollback thủ công: xóa quotation vừa tạo để tránh dữ liệu mồ côi.
    await db.from('quotations').delete().eq('id', quotation.id);
    throw new Error(`Cannot create quotation items: ${itemsError.message}`);
  }

  return quotation as QuotationRecord;
}

export async function getQuotation(
  id: string
): Promise<{ quotation: QuotationRecord; items: QuotationItemRecord[] } | null> {
  const { data: quotation, error } = await db.from('quotations').select('*').eq('id', id).maybeSingle();
  if (error || !quotation) return null;

  const { data: items } = await db
    .from('quotation_items')
    .select('*')
    .eq('quotation_id', id)
    .order('sort_order', { ascending: true });

  return { quotation: quotation as QuotationRecord, items: (items ?? []) as QuotationItemRecord[] };
}

export type ListQuotationsParams = {
  status?: QuotationStatus;
  search?: string;
  page?: number;
  pageSize?: number;
};

export async function listQuotations(params: ListQuotationsParams): Promise<{
  rows: QuotationRecord[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const from = (page - 1) * pageSize;

  let query = db.from('quotations').select('*', { count: 'exact' });
  if (params.status) query = query.eq('status', params.status);
  if (params.search) {
    const term = `%${params.search.trim()}%`;
    query = query.or(`code.ilike.${term},customer_name.ilike.${term},customer_phone.ilike.${term}`);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) throw new Error(`Cannot list quotations: ${error.message}`);
  return { rows: (data ?? []) as QuotationRecord[], total: count ?? 0, page, pageSize };
}

export async function updateQuotationStatus(id: string, status: QuotationStatus): Promise<void> {
  const { error } = await db.from('quotations').update({ status }).eq('id', id);
  if (error) throw new Error(`Cannot update quotation status: ${error.message}`);
}

function formatVnd(value: number): string {
  return `${Math.round(value).toLocaleString('vi-VN')} đ`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Sinh HTML báo giá khổ A4 để in hoặc "Lưu thành PDF" từ trình duyệt.
 * Thông tin doanh nghiệp lấy động từ system_settings (fallback ENV).
 */
export async function renderQuotationHtml(id: string): Promise<string | null> {
  const found = await getQuotation(id);
  if (!found) return null;
  const { quotation, items } = found;

  const companyName = (await getSetting('company_name')) ?? env.COMPANY_NAME;
  const companyHotline = (await getSetting('company_hotline')) ?? env.COMPANY_HOTLINE;
  const companyEmail = (await getSetting('company_email')) ?? env.COMPANY_EMAIL;
  const companyWebsite = (await getSetting('company_website')) ?? env.COMPANY_WEBSITE;
  const companyAddress = (await getSetting('company_address')) ?? '';

  const createdDate = new Date(quotation.created_at).toLocaleDateString('vi-VN');
  const validUntil = quotation.valid_until
    ? new Date(quotation.valid_until).toLocaleDateString('vi-VN')
    : null;

  const rows = items
    .map(
      (item, index) => `
      <tr>
        <td class="c">${index + 1}</td>
        <td>${escapeHtml(item.product_name)}${item.package_text ? `<br><span class="muted">${escapeHtml(item.package_text)}</span>` : ''}</td>
        <td class="r">${formatVnd(item.unit_price)}</td>
        <td class="c">${item.quantity}</td>
        <td class="r">${formatVnd(item.line_total)}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>Báo giá ${escapeHtml(quotation.code)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.5; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #c0392b; padding-bottom: 12px; margin-bottom: 18px; }
  .company { font-size: 18px; font-weight: 700; color: #c0392b; }
  .muted { color: #666; font-size: 11px; }
  h1 { font-size: 22px; letter-spacing: 1px; margin: 0; text-align: right; }
  .meta { text-align: right; font-size: 12px; }
  .cust { background: #f7f7f7; padding: 12px 14px; border-radius: 6px; margin-bottom: 16px; }
  .cust div { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid #ddd; padding: 8px 10px; vertical-align: top; }
  th { background: #c0392b; color: #fff; font-weight: 600; text-align: left; }
  td.c, th.c { text-align: center; }
  td.r, th.r { text-align: right; }
  .totals { width: 300px; margin-left: auto; }
  .totals td { border: none; padding: 4px 10px; }
  .totals .grand { font-size: 16px; font-weight: 700; color: #c0392b; border-top: 2px solid #c0392b; }
  .note { margin-top: 18px; font-size: 12px; }
  .foot { margin-top: 30px; display: flex; justify-content: space-between; font-size: 12px; }
  .sign { text-align: center; width: 45%; }
  .sign .line { margin-top: 60px; border-top: 1px solid #999; padding-top: 4px; }
  .disclaimer { margin-top: 24px; font-size: 10.5px; color: #888; border-top: 1px dashed #ccc; padding-top: 8px; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <div class="no-print" style="text-align:right;margin-bottom:10px;">
    <button onclick="window.print()" style="padding:8px 16px;background:#c0392b;color:#fff;border:0;border-radius:4px;cursor:pointer;">In / Lưu PDF</button>
  </div>

  <div class="head">
    <div>
      <div class="company">${escapeHtml(companyName)}</div>
      ${companyAddress ? `<div class="muted">${escapeHtml(companyAddress)}</div>` : ''}
      <div class="muted">Hotline: ${escapeHtml(companyHotline)} · ${escapeHtml(companyEmail)}</div>
      <div class="muted">${escapeHtml(companyWebsite)}</div>
    </div>
    <div>
      <h1>BÁO GIÁ</h1>
      <div class="meta">Số: <strong>${escapeHtml(quotation.code)}</strong></div>
      <div class="meta">Ngày: ${createdDate}</div>
      ${validUntil ? `<div class="meta">Hiệu lực đến: ${validUntil}</div>` : ''}
    </div>
  </div>

  <div class="cust">
    <div><strong>Khách hàng:</strong> ${escapeHtml(quotation.customer_name ?? '—')}</div>
    <div><strong>Điện thoại:</strong> ${escapeHtml(quotation.customer_phone ?? '—')}</div>
    ${quotation.customer_area ? `<div><strong>Khu vực / công trình:</strong> ${escapeHtml(quotation.customer_area)}</div>` : ''}
    ${quotation.project_type ? `<div><strong>Loại công trình:</strong> ${escapeHtml(quotation.project_type)}</div>` : ''}
    ${quotation.area_m2 ? `<div><strong>Diện tích:</strong> ${quotation.area_m2} m²</div>` : ''}
    ${quotation.need_construction ? `<div><strong>Có thi công:</strong> Có</div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th class="c" style="width:36px;">STT</th>
        <th>Sản phẩm</th>
        <th class="r" style="width:110px;">Đơn giá</th>
        <th class="c" style="width:60px;">SL</th>
        <th class="r" style="width:120px;">Thành tiền</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals">
    <tr><td>Tạm tính:</td><td class="r">${formatVnd(quotation.subtotal)}</td></tr>
    ${quotation.discount > 0 ? `<tr><td>Chiết khấu:</td><td class="r">- ${formatVnd(quotation.discount)}</td></tr>` : ''}
    ${quotation.shipping_fee > 0 ? `<tr><td>Phí giao hàng:</td><td class="r">${formatVnd(quotation.shipping_fee)}</td></tr>` : ''}
    <tr class="grand"><td>TỔNG CỘNG:</td><td class="r">${formatVnd(quotation.total)}</td></tr>
  </table>

  ${quotation.note ? `<div class="note"><strong>Ghi chú:</strong> ${escapeHtml(quotation.note)}</div>` : ''}

  <div class="foot">
    <div class="sign"><strong>Khách hàng</strong><div class="line">(Ký, ghi rõ họ tên)</div></div>
    <div class="sign"><strong>${escapeHtml(companyName)}</strong><div class="line">(Ký, đóng dấu)</div></div>
  </div>

  <div class="disclaimer">
    Báo giá mang tính tham khảo, giá và tồn kho có thể thay đổi theo thời điểm.
    Vui lòng liên hệ ${escapeHtml(companyHotline)} để xác nhận trước khi đặt hàng.
  </div>
</body>
</html>`;
}
