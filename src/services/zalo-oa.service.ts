import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { db } from '../db/supabase.js';
import { withTimeout } from '../utils/async.js';

/**
 * Zalo Official Account (OA) integration module.
 *
 * Module riêng, độc lập với phần Zalo Bot cũ (zalo-api.service.ts).
 * Có thể thay/nâng cấp API mà không ảnh hưởng phần còn lại của hệ thống.
 *
 * Chức năng:
 *  - Quản lý & tự động làm mới access token (lưu trong bảng zalo_oa_tokens).
 *  - Gửi tin nhắn text (Consultation API v3.0) trong cửa sổ 48h.
 *  - Xác minh chữ ký webhook (X-ZEvent-Signature).
 *  - Chống xử lý trùng sự kiện (msg_id) qua bảng webhook_events.
 *  - Cắt tin nhắn dài theo giới hạn của Zalo.
 *
 * Tài liệu Zalo: https://developers.zalo.me/docs/official-account
 */

const OA_OPENAPI_BASE = 'https://openapi.zalo.me/v3.0/oa';
const OA_OAUTH_URL = 'https://oauth.zaloapp.com/v4/oa/access_token';
const MAX_TEXT_LENGTH = 2000;
const OA_API_TIMEOUT_MS = 15_000;
/** Zalo access token sống 25h; refresh token sống 3 tháng. Làm mới sớm 60 phút. */
const TOKEN_EARLY_REFRESH_MS = 60 * 60 * 1000;

const TOKEN_SETTING_KEY = 'zalo_oa_token';

type OaTokenRecord = {
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO timestamp
};

type OaSendResult = {
  ok: boolean;
  error?: number;
  message?: string;
  messageId?: string;
};

/* ------------------------------------------------------------------ */
/* Token store (Supabase system_settings)                              */
/* ------------------------------------------------------------------ */

let cachedToken: OaTokenRecord | undefined;
let cachedAt = 0;

async function readTokenFromDb(): Promise<OaTokenRecord | undefined> {
  const { data, error } = await db
    .from('system_settings')
    .select('value')
    .eq('key', TOKEN_SETTING_KEY)
    .maybeSingle();

  if (error || !data?.value) return undefined;
  const value = data.value as Partial<OaTokenRecord>;
  if (!value.access_token || !value.refresh_token || !value.expires_at) return undefined;
  return value as OaTokenRecord;
}

async function writeTokenToDb(record: OaTokenRecord): Promise<void> {
  const { error } = await db
    .from('system_settings')
    .upsert({ key: TOKEN_SETTING_KEY, value: record, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`Cannot persist Zalo OA token: ${error.message}`);
  cachedToken = record;
  cachedAt = Date.now();
}

/**
 * Khởi tạo token lần đầu từ ENV (nếu quản trị viên dán refresh token vào .env).
 * Chỉ dùng khi bảng system_settings chưa có token.
 */
async function bootstrapTokenFromEnv(): Promise<OaTokenRecord | undefined> {
  if (!env.ZALO_OA_REFRESH_TOKEN) return undefined;
  // Dùng refresh token trong ENV để lấy access token mới ngay.
  return refreshAccessToken(env.ZALO_OA_REFRESH_TOKEN);
}

/* ------------------------------------------------------------------ */
/* OAuth: refresh access token                                         */
/* ------------------------------------------------------------------ */

async function refreshAccessToken(refreshToken: string): Promise<OaTokenRecord> {
  if (!env.ZALO_OA_APP_ID || !env.ZALO_OA_APP_SECRET) {
    throw new Error('ZALO_OA_APP_ID / ZALO_OA_APP_SECRET chưa cấu hình');
  }

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    app_id: env.ZALO_OA_APP_ID,
    grant_type: 'refresh_token'
  });

  const response = await withTimeout(
    fetch(OA_OAUTH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        secret_key: env.ZALO_OA_APP_SECRET
      },
      body: body.toString()
    }),
    OA_API_TIMEOUT_MS
  );

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: string | number;
    error?: number;
    error_name?: string;
    error_description?: string;
  };

  if (!data.access_token || !data.refresh_token) {
    throw new Error(
      `Zalo OA refresh token thất bại: ${data.error ?? ''} ${data.error_name ?? ''} ${data.error_description ?? ''}`.trim()
    );
  }

  const expiresInSec = Number(data.expires_in ?? 90000);
  const record: OaTokenRecord = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString()
  };

  await writeTokenToDb(record);
  return record;
}

/**
 * Lấy access token hợp lệ. Tự động làm mới khi sắp hết hạn.
 * Có khóa mềm để tránh nhiều request refresh song song.
 */
let refreshInFlight: Promise<OaTokenRecord> | undefined;

export async function getValidAccessToken(): Promise<string> {
  // Cache trong RAM 30s để tránh đọc DB liên tục.
  if (cachedToken && Date.now() - cachedAt < 30_000) {
    if (!isExpiringSoon(cachedToken)) return cachedToken.access_token;
  }

  let token = cachedToken ?? (await readTokenFromDb());
  if (!token) token = await bootstrapTokenFromEnv();
  if (!token) throw new Error('Chưa có Zalo OA token. Vui lòng cấu hình OAuth trong trang quản trị.');

  cachedToken = token;
  cachedAt = Date.now();

  if (isExpiringSoon(token)) {
    if (!refreshInFlight) {
      refreshInFlight = refreshAccessToken(token.refresh_token).finally(() => {
        refreshInFlight = undefined;
      });
    }
    token = await refreshInFlight;
  }

  return token.access_token;
}

function isExpiringSoon(token: OaTokenRecord): boolean {
  return new Date(token.expires_at).getTime() - Date.now() < TOKEN_EARLY_REFRESH_MS;
}

/**
 * Lưu token lần đầu (sau khi quản trị viên hoàn tất OAuth authorization code flow).
 */
export async function saveInitialToken(input: {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}): Promise<void> {
  await writeTokenToDb({
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
    expires_at: new Date(Date.now() + input.expiresInSec * 1000).toISOString()
  });
}

/**
 * Đổi authorization code sang token (authorization code flow với PKCE).
 * Dùng khi quản trị viên bấm "Kết nối OA" lần đầu.
 */
export async function exchangeAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
}): Promise<OaTokenRecord> {
  if (!env.ZALO_OA_APP_ID || !env.ZALO_OA_APP_SECRET) {
    throw new Error('ZALO_OA_APP_ID / ZALO_OA_APP_SECRET chưa cấu hình');
  }

  const body = new URLSearchParams({
    code: input.code,
    app_id: env.ZALO_OA_APP_ID,
    grant_type: 'authorization_code',
    code_verifier: input.codeVerifier
  });

  const response = await withTimeout(
    fetch(OA_OAUTH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        secret_key: env.ZALO_OA_APP_SECRET
      },
      body: body.toString()
    }),
    OA_API_TIMEOUT_MS
  );

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: string | number;
    error?: number;
    error_description?: string;
  };

  if (!data.access_token || !data.refresh_token) {
    throw new Error(`Đổi authorization code thất bại: ${data.error ?? ''} ${data.error_description ?? ''}`.trim());
  }

  const record: OaTokenRecord = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + Number(data.expires_in ?? 90000) * 1000).toISOString()
  };
  await writeTokenToDb(record);
  return record;
}

/* ------------------------------------------------------------------ */
/* Send message (Consultation API — cửa sổ 48h, miễn phí)              */
/* ------------------------------------------------------------------ */

function splitText(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= MAX_TEXT_LENGTH) return [normalized];

  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > MAX_TEXT_LENGTH) {
    let cut = remaining.lastIndexOf('\n', MAX_TEXT_LENGTH);
    if (cut < MAX_TEXT_LENGTH * 0.6) cut = remaining.lastIndexOf(' ', MAX_TEXT_LENGTH);
    if (cut < MAX_TEXT_LENGTH * 0.6) cut = MAX_TEXT_LENGTH;
    const chunk = remaining.slice(0, cut).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function callOaApi(
  path: string,
  payload: Record<string, unknown>
): Promise<OaSendResult> {
  const accessToken = await getValidAccessToken();

  const response = await withTimeout(
    fetch(`${OA_OPENAPI_BASE}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        access_token: accessToken
      },
      body: JSON.stringify(payload)
    }),
    OA_API_TIMEOUT_MS
  );

  const data = (await response.json().catch(() => ({}))) as {
    error?: number;
    message?: string;
    data?: { message_id?: string };
  };

  const ok =
    response.ok &&
    (data.error === 0 || data.error === undefined);

  if (ok) {
    console.log('zalo_oa_send_ok', {
      path,
      status: response.status,
      messageId: data.data?.message_id
    });
  } else {
    console.error('zalo_oa_send_failed', {
      path,
      status: response.status,
      error: data.error,
      message: data.message
    });
  }

  return {
    ok,
    error: data.error,
    message: data.message,
    messageId: data.data?.message_id
  };
}

/**
 * Gửi tin nhắn text tới người dùng (trong cửa sổ 48h kể từ tin cuối của khách).
 * Đây là loại tin "Consultation" — miễn phí, phù hợp doanh nghiệp nhỏ.
 */
export async function sendOaText(userId: string, text: string): Promise<OaSendResult> {
  const chunks = splitText(text);
  if (!chunks.length) return { ok: true };

  let last: OaSendResult = { ok: true };
  for (const chunk of chunks) {
    last = await callOaApi('/message/cs', {
      recipient: { user_id: userId },
      message: { text: chunk }
    });
    if (!last.ok) break;
  }
  return last;
}

/**
 * Gửi tin kèm danh sách nút bấm (template list buttons).
 * Dùng cho menu chính và các lựa chọn nhanh.
 */
export async function sendOaButtons(
  userId: string,
  text: string,
  buttons: Array<{ title: string; payload: string }>
): Promise<OaSendResult> {
  const trimmed = buttons.slice(0, 5).map((button) => ({
    type: 'oa.query.show',
    title: button.title.slice(0, 100),
    payload: button.payload.slice(0, 1000)
  }));

  return callOaApi('/message/cs', {
    recipient: {
      user_id: userId
    },
    message: {
      text: text.slice(0, 2000),
      attachment: {
        type: 'template',
        payload: {
          buttons: trimmed
        }
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* Webhook signature verification & deduplication                      */
/* ------------------------------------------------------------------ */

/**
 * Zalo ký webhook bằng: mac = sha256(appId + data + timestamp + OASecretKey)
 * Header: X-ZEvent-Signature = "mac=<hex>"
 * Trả về true nếu chữ ký hợp lệ.
 */
export function verifyWebhookSignature(input: {
  signatureHeader: string | undefined;
  rawBody: string;
  timestamp: string | undefined;
}): boolean {
  if (!env.ZALO_OA_APP_ID || !env.ZALO_OA_SECRET_KEY) {
    return false;
  }

  if (!input.signatureHeader || !input.timestamp || !input.rawBody) {
    return false;
  }

  const provided = input.signatureHeader
    .replace(/^mac\s*=\s*/i, '')
    .trim()
    .toLowerCase();

  const expected = crypto
    .createHash('sha256')
    .update(
      env.ZALO_OA_APP_ID +
        input.rawBody +
        input.timestamp +
        env.ZALO_OA_SECRET_KEY,
      'utf8'
    )
    .digest('hex');

  if (provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(provided, 'utf8'),
    Buffer.from(expected, 'utf8')
  );
}

/**
 * Chống xử lý trùng sự kiện. Dùng msg_id (hoặc event_id) làm khóa.
 * Trả về true nếu đây là sự kiện MỚI (nên xử lý), false nếu đã thấy rồi.
 */
export async function markWebhookEventOnce(input: {
  eventId: string;
  eventName: string;
  payload: unknown;
}): Promise<boolean> {
  const { error } = await db.from('webhook_events').insert({
    provider: 'zalo_oa',
    event_id: input.eventId,
    event_name: input.eventName,
    payload: input.payload as Record<string, unknown>
  });

  if (error) {
    // Vi phạm unique (provider,event_id) => đã xử lý rồi.
    if (error.code === '23505') return false;
    // Lỗi khác: vẫn cho xử lý nhưng ghi log để không mất tin khách.
    console.error('webhook_event_insert_failed', error.message);
    return true;
  }
  return true;
}

/**
 * Gửi thông báo cho quản trị viên qua OA (nếu đã cấu hình admin user id).
 */
export async function sendOwnerOaNotification(text: string): Promise<boolean> {
  if (!env.ZALO_OA_ADMIN_USER_ID) return false;
  const result = await sendOaText(env.ZALO_OA_ADMIN_USER_ID, text);
  return result.ok;
}
