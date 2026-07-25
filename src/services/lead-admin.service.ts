import { db } from '../db/supabase.js';

/**
 * Service quản lý khách hàng tiềm năng (lead) cho trang quản trị.
 *
 * Yêu cầu mục 10:
 *  - Tìm kiếm, lọc, sắp xếp.
 *  - Đổi trạng thái, phân công nhân viên, gắn nhãn, ghi chú.
 *  - Xuất CSV.
 */

export type LeadStatus =
  | 'new'
  | 'uncontacted'
  | 'contacted'
  | 'consulting'
  | 'quoted'
  | 'negotiating'
  | 'won'
  | 'lost'
  | 'follow_up';

export const LEAD_STATUSES: LeadStatus[] = [
  'new',
  'uncontacted',
  'contacted',
  'consulting',
  'quoted',
  'negotiating',
  'won',
  'lost',
  'follow_up'
];

export type LeadRecord = {
  id: string;
  code: string;
  name: string | null;
  phone: string | null;
  area: string | null;
  budget: string | null;
  need: string;
  source: string;
  channel: string | null;
  priority: string;
  status: string;
  potential: string | null;
  note: string | null;
  tags: string[] | null;
  product_interest: string | null;
  area_m2: number | null;
  buy_time: string | null;
  assigned_to: string | null;
  zalo_user_id: string | null;
  zalo_chatbot_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ListLeadsParams = {
  search?: string;
  status?: LeadStatus;
  priority?: string;
  assignedTo?: string;
  source?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'created_at' | 'updated_at' | 'priority';
  sortDir?: 'asc' | 'desc';
};

export type ListLeadsResult = {
  items: LeadRecord[];
  total: number;
  page: number;
  pageSize: number;
};

const LEAD_COLUMNS =
  'id,code,name,phone,area,budget,need,source,channel,priority,status,potential,note,tags,product_interest,area_m2,buy_time,assigned_to,zalo_user_id,zalo_chatbot_user_id,created_at,updated_at';

/** Danh sách lead có lọc + phân trang + sắp xếp. */
export async function listLeads(params: ListLeadsParams): Promise<ListLeadsResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const sortBy = params.sortBy ?? 'created_at';
  const sortDir = params.sortDir ?? 'desc';

  let query = db.from('leads').select(LEAD_COLUMNS, { count: 'exact' });

  if (params.status) query = query.eq('status', params.status);
  if (params.priority) query = query.eq('priority', params.priority);
  if (params.assignedTo) query = query.eq('assigned_to', params.assignedTo);
  if (params.source) query = query.eq('source', params.source);

  if (params.search) {
    const term = params.search.replace(/[%,]/g, ' ').trim();
    if (term) {
      // Tìm theo tên, số điện thoại, mã lead hoặc nhu cầu.
      query = query.or(
        `name.ilike.%${term}%,phone.ilike.%${term}%,code.ilike.%${term}%,need.ilike.%${term}%`
      );
    }
  }

  query = query.order(sortBy, { ascending: sortDir === 'asc' }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(`Cannot list leads: ${error.message}`);

  return {
    items: (data ?? []) as LeadRecord[],
    total: count ?? 0,
    page,
    pageSize
  };
}

/** Lấy 1 lead theo id. */
export async function getLead(id: string): Promise<LeadRecord | null> {
  const { data, error } = await db.from('leads').select(LEAD_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(`Cannot get lead: ${error.message}`);
  return (data as LeadRecord) ?? null;
}

/** Cập nhật một số trường quản lý của lead. */
export type LeadUpdateInput = Partial<{
  status: LeadStatus;
  priority: string;
  assignedTo: string | null;
  note: string | null;
  tags: string[];
  potential: string | null;
  productInterest: string | null;
  areaM2: number | null;
  buyTime: string | null;
}>;

/** Map field camelCase (từ API) sang cột snake_case của bảng leads. */
const LEAD_FIELD_MAP: Record<keyof LeadUpdateInput, string> = {
  status: 'status',
  priority: 'priority',
  assignedTo: 'assigned_to',
  note: 'note',
  tags: 'tags',
  potential: 'potential',
  productInterest: 'product_interest',
  areaM2: 'area_m2',
  buyTime: 'buy_time'
};

export async function updateLead(id: string, patch: LeadUpdateInput): Promise<LeadRecord> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      const column = LEAD_FIELD_MAP[key as keyof LeadUpdateInput];
      if (column) clean[column] = value;
    }
  }
  if (Object.keys(clean).length === 0) {
    const current = await getLead(id);
    if (!current) throw new Error('Lead not found');
    return current;
  }

  const { data, error } = await db.from('leads').update(clean).eq('id', id).select(LEAD_COLUMNS).single();
  if (error) throw new Error(`Cannot update lead: ${error.message}`);
  return data as LeadRecord;
}

/** Xuất toàn bộ lead (theo bộ lọc) ra CSV. */
export async function exportLeadsCsv(params: ListLeadsParams): Promise<string> {
  const all = await listLeads({ ...params, page: 1, pageSize: 100 });
  const header = [
    'Mã',
    'Tên',
    'SĐT',
    'Khu vực',
    'Nhu cầu',
    'Sản phẩm quan tâm',
    'Ngân sách',
    'Nguồn',
    'Kênh',
    'Ưu tiên',
    'Trạng thái',
    'Tiềm năng',
    'Ghi chú',
    'Ngày tạo'
  ];

  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  const rows = all.items.map((lead) =>
    [
      lead.code,
      lead.name,
      lead.phone,
      lead.area,
      lead.need,
      lead.product_interest,
      lead.budget,
      lead.source,
      lead.channel,
      lead.priority,
      lead.status,
      lead.potential,
      lead.note,
      lead.created_at
    ]
      .map(escape)
      .join(',')
  );

  // BOM để Excel đọc đúng tiếng Việt UTF-8.
  return '﻿' + [header.join(','), ...rows].join('\r\n');
}

/* ------------------------------------------------------------------ */
/* Thống kê cho dashboard                                              */
/* ------------------------------------------------------------------ */

export type LeadStats = {
  total: number;
  unhandled: number;
  won: number;
  conversionRate: number;
  byStatus: Record<string, number>;
  topProducts: Array<{ name: string; count: number }>;
};

/**
 * Số liệu tổng quan cho dashboard.
 * Tính trực tiếp trên bảng leads (đủ nhanh cho quy mô DN nhỏ).
 */
export async function getLeadStats(): Promise<LeadStats> {
  const { data, error } = await db
    .from('leads')
    .select('status, product_interest')
    .limit(5000);

  if (error) throw new Error(`Cannot compute lead stats: ${error.message}`);

  const rows = (data ?? []) as Array<{ status: string | null; product_interest: string | null }>;
  const total = rows.length;

  const byStatus: Record<string, number> = {};
  const productCount: Record<string, number> = {};
  let won = 0;
  let unhandled = 0;

  for (const row of rows) {
    const status = row.status ?? 'new';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (status === 'won') won += 1;
    if (status === 'new' || status === 'uncontacted') unhandled += 1;

    const product = (row.product_interest ?? '').trim();
    if (product) productCount[product] = (productCount[product] ?? 0) + 1;
  }

  const conversionRate = total > 0 ? Math.round((won / total) * 1000) / 10 : 0;

  const topProducts = Object.entries(productCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return { total, unhandled, won, conversionRate, byStatus, topProducts };
}
