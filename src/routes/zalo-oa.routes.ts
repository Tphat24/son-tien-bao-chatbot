import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import {
  verifyWebhookSignature,
  markWebhookEventOnce,
  sendOaText,
  sendOaButtons,
  exchangeAuthorizationCode
} from '../services/zalo-oa.service.js';
import { answerWebMessage } from '../services/web-chat.service.js';
import { createLead } from '../services/lead.service.js';
import { buildMainMenuButtons, resolveMenuPayload } from '../services/oa-menu.service.js';
import { analyzeSurfaceImage, saveSurfaceImage, buildImageReply } from '../services/vision.service.js';
import { normalizeText } from '../utils/text.js';

/**
 * Route webhook cho Zalo Official Account.
 *
 * Endpoint chính:
 *   POST /api/zalo-oa/webhook   — nhận sự kiện từ Zalo OA
 *   GET  /api/zalo-oa/webhook   — Zalo verify (trả 200)
 *   GET  /api/zalo-oa/oauth/callback — nhận authorization code khi kết nối OA
 *
 * Nguyên tắc:
 *  - Xác minh chữ ký trước khi xử lý.
 *  - Trả 200 ngay để Zalo không retry; xử lý AI chạy nền.
 *  - Chống trùng sự kiện bằng msg_id.
 */

export const zaloOaRouter = Router();

/* ------------------------------------------------------------------ */
/* Verify endpoint (Zalo gọi GET khi đăng ký webhook)                  */
/* ------------------------------------------------------------------ */
zaloOaRouter.get('/webhook', (_req, res) => {
  res.status(200).send('OK');
});

/* ------------------------------------------------------------------ */
/* Webhook nhận sự kiện                                                 */
/* ------------------------------------------------------------------ */
zaloOaRouter.post('/webhook', async (req: Request, res: Response) => {
  // Trả 200 ngay để Zalo không gửi lại sự kiện.
  res.status(200).json({ ok: true });

  const body = req.body ?? {};

  // Request kiểm tra URL không phải sự kiện thật.
  if (!body.event_name) {
    console.log('zalo_oa_webhook_probe_ok');
    return;
  }

  const rawBody =
    (req as Request & { rawBody?: string }).rawBody ??
    JSON.stringify(body);

  const signature = req.header('x-zevent-signature');
  const timestamp = (body.timestamp ?? '').toString();

  // Chỉ xác minh khi đã cấu hình OA Secret Key.
  if (env.ZALO_OA_SECRET_KEY && env.ZALO_OA_APP_ID) {
    const valid = verifyWebhookSignature({
      signatureHeader: signature,
      rawBody,
      timestamp
    });

    if (!valid) {
      console.warn('zalo_oa_webhook_invalid_signature', {
        eventName: body.event_name,
        hasSignature: Boolean(signature),
        hasTimestamp: Boolean(timestamp),
        rawBodyLength: rawBody.length
      });
      return;
    }
  } else {
    console.warn('zalo_oa_webhook_signature_not_configured');
  }

  try {
    await handleOaEvent(body);
  } catch (error) {
    console.error('zalo_oa_event_handler_failed', error);
  }
});
/* ------------------------------------------------------------------ */
/* OAuth callback — hoàn tất kết nối OA lần đầu                         */
/* ------------------------------------------------------------------ */
const pkceStore = new Map<string, { verifier: string; createdAt: number }>();

export function rememberPkce(state: string, verifier: string): void {
  pkceStore.set(state, { verifier, createdAt: Date.now() });
  // Dọn state cũ quá 15 phút.
  for (const [key, value] of pkceStore) {
    if (Date.now() - value.createdAt > 15 * 60_000) pkceStore.delete(key);
  }
}

/**
 * Bắt đầu kết nối OA: sinh PKCE, lưu verifier theo state, trả URL uỷ quyền.
 * Quản trị viên mở URL này để cấp quyền cho ứng dụng truy cập OA.
 * Bảo vệ bằng ADMIN_API_KEY (header Authorization: Bearer ...).
 */
zaloOaRouter.get('/oauth/start', (req, res) => {
  const token = req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (token !== env.ADMIN_API_KEY) return res.status(401).json({ error: 'unauthorized' });
  if (!env.ZALO_OA_APP_ID) return res.status(400).json({ error: 'ZALO_OA_APP_ID chưa cấu hình' });

  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  rememberPkce(state, codeVerifier);

  const redirectUri = `${env.PUBLIC_BASE_URL}/api/zalo-oa/oauth/callback`;
  const authorizeUrl =
    'https://oauth.zaloapp.com/v4/oa/permission?' +
    new URLSearchParams({
      app_id: env.ZALO_OA_APP_ID,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      state
    }).toString();

  res.json({ authorizeUrl, state });
});

zaloOaRouter.get('/oauth/callback', async (req, res) => {
  const parsed = z
    .object({ code: z.string().min(1), state: z.string().optional(), oa_id: z.string().optional() })
    .safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).send('Thiếu authorization code.');
  }

  const stateKey = parsed.data.state ?? '';
  const pkce = pkceStore.get(stateKey);
  if (!pkce) {
    return res
      .status(400)
      .send('Phiên kết nối OA đã hết hạn hoặc không hợp lệ. Vui lòng bấm "Kết nối OA" lại từ trang quản trị.');
  }
  pkceStore.delete(stateKey);

  try {
    await exchangeAuthorizationCode({ code: parsed.data.code, codeVerifier: pkce.verifier });
    res.status(200).send('Kết nối Zalo OA thành công. Anh/Chị có thể đóng cửa sổ này.');
  } catch (error) {
    console.error('zalo_oa_oauth_exchange_failed', error);
    res.status(500).send('Kết nối OA thất bại. Vui lòng thử lại hoặc kiểm tra App ID / Secret.');
  }
});

/* ------------------------------------------------------------------ */
/* Xử lý sự kiện                                                        */
/* ------------------------------------------------------------------ */

type OaEvent = {
  app_id?: string;
  sender?: { id?: string };
  follower?: { id?: string };
  recipient?: { id?: string };
  user_id_by_app?: string;
  event_name?: string;
  message?: {
    msg_id?: string;
    text?: string;
    attachments?: Array<{ type?: string; payload?: { url?: string; thumbnail?: string } }>;
  };
  timestamp?: string | number;
};

async function handleOaEvent(body: OaEvent): Promise<void> {
  const eventName = body.event_name ?? '';
  const senderId = body.sender?.id ?? body.follower?.id;
  const msgId = body.message?.msg_id ?? `${eventName}-${body.timestamp ?? ''}`;

  if (!senderId) return;

  // Chỉ xử lý các sự kiện người dùng gửi tới OA.
  const handledEvents = new Set([
    'user_send_text',
    'user_send_image',
    'user_send_file',
    'user_click_chatnow',
    'user_submit_info',
    'follow'
  ]);
  if (!handledEvents.has(eventName)) return;

  // Chống trùng sự kiện.
  const isNew = await markWebhookEventOnce({ eventId: msgId, eventName, payload: body });
  if (!isNew) {
    console.log('zalo_oa_duplicate_event_skipped', { msgId });
    return;
  }

  if (eventName === 'follow') {
    await sendGreeting(senderId);
    return;
  }

  if (eventName === 'user_send_image') {
    await handleImage(senderId, body);
    return;
  }

  const text = (body.message?.text ?? '').trim();
  if (!text) return;

  await handleText(senderId, text);
}

async function sendGreeting(userId: string): Promise<void> {
  const greeting =
    `Xin chào Anh/Chị! Em là trợ lý tư vấn của ${env.COMPANY_NAME}. ` +
    'Em có thể hỗ trợ Anh/Chị chọn loại sơn, tính lượng sơn, tham khảo giá và gửi yêu cầu cho nhân viên tư vấn.\n\n' +
    'Anh/Chị đang cần hỗ trợ nội dung nào ạ?';
  await sendOaButtons(userId, greeting, buildMainMenuButtons());
}

async function handleImage(userId: string, body: OaEvent): Promise<void> {
  const imageUrl = body.message?.attachments?.[0]?.payload?.url;

  // Tạo lead ưu tiên cao để nhân viên kỹ thuật theo dõi.
  const lead = await createLead({
    userId,
    need: `Khách gửi ảnh hiện trạng bề mặt${imageUrl ? `: ${imageUrl}` : ''}`,
    priority: 'high',
    source: 'zalo_oa'
  });
  const leadId = (lead as { id?: string })?.id;

  // Không có URL ảnh → chỉ báo đã nhận và chuyển nhân viên.
  if (!imageUrl) {
    await sendOaText(
      userId,
      'Em đã nhận được hình ảnh của Anh/Chị và chuyển cho nhân viên kỹ thuật xem giúp ạ. ' +
        `Nếu cần gấp, Anh/Chị gọi hotline ${env.COMPANY_HOTLINE} giúp em nhé.`
    );
    return;
  }

  // Phân tích sơ bộ bằng AI (luôn fallback an toàn, không bao giờ ném lỗi).
  const result = await analyzeSurfaceImage(imageUrl);
  await saveSurfaceImage({ leadId, zaloUserId: userId, imageUrl, channel: 'oa', result });
  await sendOaText(userId, buildImageReply(result));
}

async function handleText(userId: string, text: string): Promise<void> {
  // 1. Nếu khớp menu (nút hoặc từ khóa) → xử lý theo kịch bản.
  const menu = resolveMenuPayload(text);
  if (menu) {
    if (menu.reply) await sendOaText(userId, menu.reply);
    if (menu.buttons?.length) await sendOaButtons(userId, menu.buttonsHeader ?? 'Anh/Chị chọn giúp em:', menu.buttons);
    if (menu.handoff) {
      await createLead({ userId, need: menu.handoffReason ?? 'Khách yêu cầu gặp nhân viên', priority: 'high', source: 'zalo_oa' });
    }
    return;
  }

  // 2. Lời chào → menu chính.
  if (/^(?:xin chào|chào|hello|hi|alo|menu|bắt đầu|start)\b/i.test(normalizeText(text))) {
    await sendGreeting(userId);
    return;
  }

  // 3. Còn lại → bộ não AI (RAG + guardrail). Tái dùng answerWebMessage với channel Zalo.
  try {
    const result = await answerWebMessage({ sessionId: `oa:${userId}`, message: text, userName: undefined });
    await sendOaText(userId, result.reply);

    if (result.handoffRecommended) {
      await sendOaButtons(userId, 'Anh/Chị có muốn em kết nối nhân viên tư vấn trực tiếp không ạ?', [
        { title: 'Gặp nhân viên tư vấn', payload: 'MENU_HUMAN' },
        { title: 'Tiếp tục hỏi', payload: 'MENU_MAIN' }
      ]);
    }
  } catch (error) {
    console.error('zalo_oa_ai_failed', error);
    await sendOaText(
      userId,
      `Xin lỗi Anh/Chị, hệ thống đang bận. Anh/Chị vui lòng gọi hotline ${env.COMPANY_HOTLINE} để được hỗ trợ nhanh nhất ạ.`
    );
  }
}
