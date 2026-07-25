import { db } from '../db/supabase.js';
import { normalizeText } from '../utils/text.js';

/**
 * Service tư vấn màu sơn (yêu cầu mục 6).
 *
 * Chức năng:
 *  - Tìm màu theo mã màu hoặc tên màu.
 *  - Gợi ý màu theo loại phòng / phong cách / nhu cầu (dựa trên tag trong DB).
 *  - Lưu danh sách màu khách yêu thích.
 *
 * Nguyên tắc:
 *  - Chỉ trả màu có trong bảng paint_colors (không bịa mã màu).
 *  - Luôn kèm cảnh báo màu hiển thị có thể khác thực tế (do route/AI thêm vào lời khuyên).
 */

export type PaintColor = {
  id: string;
  code: string;
  name: string | null;
  hex: string | null;
  brand: string | null;
  collection: string | null;
  room_tags: string[] | null;
  style_tags: string[] | null;
  image_url: string | null;
  status: string;
};

const COLOR_COLUMNS =
  'id,code,name,hex,brand,collection,room_tags,style_tags,image_url,status';

/** Tìm màu theo mã hoặc tên (khớp gần đúng, không phân biệt hoa thường/dấu). */
export async function findColors(query: string, limit = 8): Promise<PaintColor[]> {
  const term = query.trim();
  if (!term) return [];

  const { data, error } = await db
    .from('paint_colors')
    .select(COLOR_COLUMNS)
    .eq('status', 'active')
    .or(`code.ilike.%${term}%,name.ilike.%${term}%`)
    .limit(limit);

  if (error) throw new Error(`Cannot find colors: ${error.message}`);
  return (data ?? []) as PaintColor[];
}

/**
 * Gợi ý màu theo phòng và/hoặc phong cách.
 * roomTag ví dụ: 'phong ngu', 'phong khach', 'phong bep', 'phong tam', 'ngoai that'.
 * styleTag ví dụ: 'hien dai', 'toi gian', 'co dien', 'scandinavian'.
 */
export async function suggestColors(input: {
  room?: string;
  style?: string;
  limit?: number;
}): Promise<PaintColor[]> {
  const limit = input.limit ?? 6;
  let query = db.from('paint_colors').select(COLOR_COLUMNS).eq('status', 'active');

  if (input.room) {
    query = query.contains('room_tags', [normalizeText(input.room)]);
  }
  if (input.style) {
    query = query.contains('style_tags', [normalizeText(input.style)]);
  }

  const { data, error } = await query.limit(limit);
  if (error) throw new Error(`Cannot suggest colors: ${error.message}`);
  return (data ?? []) as PaintColor[];
}

export async function getColorByCode(code: string): Promise<PaintColor | null> {
  const { data, error } = await db
    .from('paint_colors')
    .select(COLOR_COLUMNS)
    .eq('code', code.trim())
    .maybeSingle();
  if (error) throw new Error(`Cannot get color: ${error.message}`);
  return (data as PaintColor) ?? null;
}

/** Lưu một màu vào danh sách yêu thích của khách (theo zalo user id). */
export async function saveFavoriteColor(input: {
  zaloUserId: string;
  colorId: string;
}): Promise<void> {
  const { error } = await db
    .from('color_favorites')
    .upsert(
      { zalo_user_id: input.zaloUserId, color_id: input.colorId },
      { onConflict: 'zalo_user_id,color_id' }
    );
  if (error) throw new Error(`Cannot save favorite color: ${error.message}`);
}

/** Lấy danh sách màu yêu thích của khách. */
export async function listFavoriteColors(zaloUserId: string): Promise<PaintColor[]> {
  const { data, error } = await db
    .from('color_favorites')
    .select(`color:paint_colors(${COLOR_COLUMNS})`)
    .eq('zalo_user_id', zaloUserId);
  if (error) throw new Error(`Cannot list favorite colors: ${error.message}`);

  const rows = (data ?? []) as unknown as Array<{ color: PaintColor | null }>;
  return rows.map((row) => row.color).filter((color): color is PaintColor => color !== null);
}

/** Cảnh báo bắt buộc kèm khi tư vấn màu (yêu cầu mục 6). */
export const COLOR_DISCLAIMER =
  'Lưu ý: màu hiển thị trên màn hình có thể khác màu thực tế; ánh sáng và bề mặt cũng ảnh hưởng cảm nhận màu. ' +
  'Anh/Chị nên xem mẫu màu thực tế trước khi thi công toàn bộ ạ.';
