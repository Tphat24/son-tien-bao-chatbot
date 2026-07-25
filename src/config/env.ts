import 'dotenv/config';
import { z } from 'zod';

const boolString = (defaultValue: 'true' | 'false') => z.string().default(defaultValue).transform((value) => value === 'true');
const optionalEmail = z.string().email().or(z.literal(''));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  ADMIN_API_KEY: z.string().min(24),
  DYNAMIC_API_KEY: z.string().min(24),
  ZALO_BOT_TOKEN: z.string().default(''),
  ZALO_WEBHOOK_SECRET_TOKEN: z.string().min(8).max(256).or(z.literal('')).default(''),
  ZALO_ADMIN_CHAT_ID: z.string().trim().default(''),
  // ----- Zalo Official Account (OA) -----
  ZALO_OA_APP_ID: z.string().trim().default(''),
  ZALO_OA_APP_SECRET: z.string().trim().default(''),
  ZALO_OA_SECRET_KEY: z.string().trim().default(''),
  ZALO_OA_ID: z.string().trim().default(''),
  // Refresh token khởi tạo (dán 1 lần từ Zalo OA Explorer). Sau đó hệ thống tự làm mới.
  ZALO_OA_REFRESH_TOKEN: z.string().trim().default(''),
  // OAuth redirect (authorization code flow) – dùng cho nút "Kết nối OA" trong admin.
  ZALO_OA_REDIRECT_URI: z.string().trim().default(''),
  // User ID của quản trị viên trên OA để nhận thông báo lead.
  ZALO_OA_ADMIN_USER_ID: z.string().trim().default(''),
  // Chọn kênh Zalo đang dùng: 'bot' (Bot Creator cũ) hoặc 'oa' (Official Account).
  ZALO_CHANNEL: z.enum(['bot', 'oa']).default('bot'),
  DYNAMIC_API_TIMEOUT_MS: z.coerce.number().int().min(500).max(1950).default(1800),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(15000),
  AI_JOB_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
  REDACT_DYNAMIC_KEY_IN_LOGS: boolString('true'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  GEMINI_API_KEY: z.string().min(10),
  GEMINI_MODEL: z.string().default('gemini-3.1-flash-lite'),
  AI_MAX_PRODUCTS: z.coerce.number().int().min(1).max(5).default(5),
  AI_MAX_KNOWLEDGE_DOCS: z.coerce.number().int().min(1).max(8).default(5),
  LIVE_WEBSITE_SEARCH_ENABLED: boolString('true'),
  LIVE_WEBSITE_MAX_PAGES: z.coerce.number().int().min(1).max(12).default(8),
  WEBSITE_FETCH_TIMEOUT_MS: z.coerce.number().int().min(1500).max(15000).default(7000),
  AI_CACHE_TTL_MINUTES: z.coerce.number().int().min(1).max(10080).default(1440),
  WEB_CHAT_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5000).max(60000).default(40000),
  WEB_CHAT_RATE_LIMIT_PER_10_MIN: z.coerce.number().int().min(5).max(200).default(30),
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: boolString('true'),
  SMTP_USER: optionalEmail.default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('Sơn Tiến Bảo Chatbot'),
  MAIL_TO: optionalEmail.default(''),
  COMPANY_NAME: z.string(),
  COMPANY_WEBSITE: z.string().url(),
  COMPANY_HOTLINE: z.string(),
  COMPANY_EMAIL: z.string().email(),
  DIRECTOR_PHONE: z.string().default('0913712195'),
  DIRECTOR_ZALO_URL: z.string().url().default('https://zalo.me/0913712195')
});

export const env = schema.parse(process.env);
