import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { db } from '../db/supabase.js';
import { withTimeout } from '../utils/async.js';
import { clip } from '../utils/text.js';

/**
 * Nhận diện SƠ BỘ tình trạng bề mặt từ ảnh khách gửi (yêu cầu mục 7).
 *
 * NGUYÊN TẮC AN TOÀN (bắt buộc):
 *  - Chỉ mô tả quan sát sơ bộ, KHÔNG kết luận kỹ thuật chắc chắn.
 *  - KHÔNG khẳng định nguyên nhân khi dữ liệu chưa đủ.
 *  - LUÔN khuyến nghị nhân viên kỹ thuật kiểm tra thực tế.
 *  - KHÔNG đề xuất sản phẩm/giá cụ thể từ ảnh (việc đó do luồng tư vấn text + RAG).
 *
 * Kết quả lưu vào bảng surface_images, gắn với lead để nhân viên xem lại.
 */

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

/** Các tình trạng bề mặt AI được phép gắn nhãn (danh sách đóng, tránh bịa). */
export const SURFACE_CONDITIONS = [
  'bong_troc', // bong tróc, phồng rộp
  'tham_nuoc', // ẩm, thấm nước, ố vàng
  'nam_moc', // nấm mốc, rêu
  'ri_set', // rỉ sét kim loại
  'nut_tuong', // nứt tường
  'phan_hoa', // phấn hóa bề mặt
  'ban_bui', // bám bẩn, bụi
  'khong_ro' // không quan sát rõ
] as const;

export type SurfaceCondition = (typeof SURFACE_CONDITIONS)[number];

const CONDITION_LABELS: Record<SurfaceCondition, string> = {
  bong_troc: 'Bong tróc / phồng rộp',
  tham_nuoc: 'Ẩm / thấm nước / ố',
  nam_moc: 'Nấm mốc / rêu',
  ri_set: 'Rỉ sét kim loại',
  nut_tuong: 'Nứt tường',
  phan_hoa: 'Phấn hóa bề mặt',
  ban_bui: 'Bám bẩn / bụi',
  khong_ro: 'Không quan sát rõ'
};

export function conditionLabel(key: string): string {
  return CONDITION_LABELS[key as SurfaceCondition] ?? key;
}

export type VisionResult = {
  observation: string; // Mô tả sơ bộ, thân thiện, an toàn.
  conditions: SurfaceCondition[]; // Nhãn tình trạng quan sát được.
  confidence: 'low' | 'medium' | 'high';
};

/** Câu trả lời an toàn khi không phân tích được ảnh. */
function fallbackResult(): VisionResult {
  return {
    observation:
      'Em đã nhận được hình ảnh nhưng chưa quan sát rõ tình trạng bề mặt. ' +
      'Để chính xác, nhân viên kỹ thuật sẽ xem trực tiếp và phản hồi Anh/Chị ạ.',
    conditions: ['khong_ro'],
    confidence: 'low'
  };
}

/**
 * Tải ảnh từ URL về base64 (giới hạn dung lượng để tránh lạm dụng).
 * Zalo trả URL ảnh tạm; ta chỉ tải khi cần phân tích.
 */
async function fetchImageAsBase64(
  url: string
): Promise<{ data: string; mimeType: string } | undefined> {
  const MAX_BYTES = 6 * 1024 * 1024; // 6MB
  try {
    const response = await withTimeout(fetch(url), env.WEBSITE_FETCH_TIMEOUT_MS);
    if (!response.ok) return undefined;

    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) return undefined;

    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (contentLength && contentLength > MAX_BYTES) return undefined;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) return undefined;

    return { data: buffer.toString('base64'), mimeType: contentType };
  } catch {
    return undefined;
  }
}

/** Ép mảng nhãn về danh sách đóng, loại nhãn lạ (tránh AI bịa). */
function sanitizeConditions(raw: unknown): SurfaceCondition[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set<string>(SURFACE_CONDITIONS);
  const result: SurfaceCondition[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && valid.has(item) && !result.includes(item as SurfaceCondition)) {
      result.push(item as SurfaceCondition);
    }
  }
  return result;
}

/**
 * Gọi Gemini vision phân tích ảnh bề mặt với guardrail chặt.
 * Trả kết quả sơ bộ; không bao giờ ném lỗi (luôn fallback an toàn).
 */
export async function analyzeSurfaceImage(imageUrl: string): Promise<VisionResult> {
  const image = await fetchImageAsBase64(imageUrl);
  if (!image) return fallbackResult();

  const prompt = `Bạn là trợ lý kỹ thuật của một cửa hàng sơn, đang xem MỘT tấm ảnh bề mặt (tường, kim loại, gỗ...) do khách gửi.

NHIỆM VỤ: quan sát SƠ BỘ và mô tả tình trạng nhìn thấy. Đây KHÔNG phải chẩn đoán kỹ thuật.

QUY TẮC BẮT BUỘC:
- Chỉ mô tả những gì THẤY RÕ trong ảnh. Không suy đoán nguyên nhân.
- Nếu ảnh mờ, thiếu sáng hoặc không phải bề mặt cần sơn, hãy nói rõ là chưa quan sát được.
- Không khẳng định chắc chắn. Không đề xuất tên sản phẩm hay giá.
- Giọng điệu: xưng "em", gọi khách "Anh/Chị", lịch sự, ngắn gọn.

Chỉ trả về JSON đúng định dạng sau, không thêm chữ nào khác:
{
  "observation": "1-2 câu mô tả sơ bộ bằng tiếng Việt, kèm lời nhắc nhân viên sẽ kiểm tra thực tế",
  "conditions": ["chọn 0-3 nhãn từ danh sách: bong_troc, tham_nuoc, nam_moc, ri_set, nut_tuong, phan_hoa, ban_bui, khong_ro"],
  "confidence": "low | medium | high"
}`;

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType: image.mimeType, data: image.data } }
            ]
          }
        ],
        config: { temperature: 0.1, maxOutputTokens: 320 }
      }),
      env.AI_TIMEOUT_MS
    );

    const text = response.text?.trim() ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallbackResult();

    const parsed = JSON.parse(jsonMatch[0]) as {
      observation?: unknown;
      conditions?: unknown;
      confidence?: unknown;
    };

    const observation =
      typeof parsed.observation === 'string' && parsed.observation.trim()
        ? clip(parsed.observation, 500)
        : fallbackResult().observation;

    const conditions = sanitizeConditions(parsed.conditions);
    const confidence =
      parsed.confidence === 'high' || parsed.confidence === 'medium' ? parsed.confidence : 'low';

    return { observation, conditions, confidence: confidence as VisionResult['confidence'] };
  } catch {
    return fallbackResult();
  }
}

/** Lưu ảnh + nhận định vào surface_images, gắn với lead. */
export async function saveSurfaceImage(input: {
  leadId?: string;
  zaloUserId?: string;
  imageUrl: string;
  channel?: string;
  result?: VisionResult;
}): Promise<void> {
  const { error } = await db.from('surface_images').insert({
    lead_id: input.leadId ?? null,
    zalo_user_id: input.zaloUserId ?? null,
    image_url: input.imageUrl,
    channel: input.channel ?? 'oa',
    ai_observation: input.result?.observation ?? null,
    ai_conditions: input.result?.conditions ?? [],
    ai_confidence: input.result?.confidence ?? null
  });
  if (error) console.error('save_surface_image_failed', error.message);
}

export type SurfaceImageRow = {
  id: string;
  lead_id: string | null;
  zalo_user_id: string | null;
  image_url: string;
  channel: string | null;
  ai_observation: string | null;
  ai_conditions: string[] | null;
  ai_confidence: string | null;
  created_at: string;
};

/** Lấy danh sách ảnh hiện trạng của một lead (để nhân viên xem lại). */
export async function listSurfaceImagesByLead(leadId: string): Promise<SurfaceImageRow[]> {
  const { data, error } = await db
    .from('surface_images')
    .select('id,lead_id,zalo_user_id,image_url,channel,ai_observation,ai_conditions,ai_confidence,created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('list_surface_images_failed', error.message);
    return [];
  }
  return (data ?? []) as SurfaceImageRow[];
}

/** Ghép câu trả lời gửi cho khách: quan sát sơ bộ + cảnh báo bắt buộc. */
export function buildImageReply(result: VisionResult): string {
  const conditionText =
    result.conditions.length && !result.conditions.includes('khong_ro')
      ? `Em thấy bề mặt có dấu hiệu: ${result.conditions.map(conditionLabel).join(', ')}. `
      : '';

  return (
    `${result.observation} ${conditionText}`.trim() +
    '\n\nĐây chỉ là quan sát sơ bộ qua ảnh nên có thể chưa chính xác. ' +
    `Nhân viên kỹ thuật của ${env.COMPANY_NAME} sẽ kiểm tra thực tế và tư vấn cách xử lý phù hợp cho Anh/Chị ạ. ` +
    `Nếu cần gấp, Anh/Chị gọi hotline ${env.COMPANY_HOTLINE} giúp em nhé.`
  );
}
