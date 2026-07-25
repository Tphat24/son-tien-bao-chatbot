import { db } from '../db/supabase.js';

/**
 * Cấu hình động (system_settings) — yêu cầu mục 2 & 11 "Quản lý nội dung".
 *
 * Cho phép quản trị viên đổi thông tin doanh nghiệp, lời chào, giờ làm việc,
 * ngưỡng thông báo... qua trang admin mà KHÔNG sửa mã nguồn.
 *
 * Có cache trong RAM (TTL ngắn) để giảm truy vấn; tự xoá cache khi ghi.
 */

const CACHE_TTL_MS = 60 * 1000;

type CacheEntry = { value: string | null; at: number };
const cache = new Map<string, CacheEntry>();

/** Đọc một giá trị cấu hình dạng chuỗi. Trả undefined nếu không có. */
export async function getSetting(key: string): Promise<string | undefined> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value ?? undefined;
  }

  const { data, error } = await db
    .from('system_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) {
    cache.set(key, { value: null, at: Date.now() });
    return undefined;
  }

  // value là jsonb — có thể là string trực tiếp hoặc object { value: ... }.
  const raw = data.value as unknown;
  const value =
    typeof raw === 'string'
      ? raw
      : raw && typeof raw === 'object' && 'value' in raw
        ? String((raw as { value: unknown }).value)
        : raw == null
          ? null
          : JSON.stringify(raw);

  cache.set(key, { value, at: Date.now() });
  return value ?? undefined;
}

/** Đọc nhiều giá trị cùng lúc. */
export async function getSettings(keys: string[]): Promise<Record<string, string | undefined>> {
  const result: Record<string, string | undefined> = {};
  await Promise.all(
    keys.map(async (key) => {
      result[key] = await getSetting(key);
    })
  );
  return result;
}

/** Ghi/đổi một giá trị cấu hình. Xoá cache ngay để lần đọc sau lấy giá trị mới. */
export async function setSetting(key: string, value: string): Promise<void> {
  const { error } = await db
    .from('system_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`Cannot save setting ${key}: ${error.message}`);
  cache.delete(key);
}

/** Lấy toàn bộ cấu hình (cho trang admin hiển thị). */
export async function getAllSettings(): Promise<Array<{ key: string; value: unknown; updated_at: string | null }>> {
  const { data, error } = await db
    .from('system_settings')
    .select('key, value, updated_at')
    .order('key', { ascending: true });
  if (error) throw new Error(`Cannot list settings: ${error.message}`);
  return (data ?? []) as Array<{ key: string; value: unknown; updated_at: string | null }>;
}

/** Xoá toàn bộ cache (dùng khi cập nhật hàng loạt). */
export function clearSettingsCache(): void {
  cache.clear();
}
