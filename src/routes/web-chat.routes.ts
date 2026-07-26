import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { createLead } from '../services/lead.service.js';
import { writeDynamicLog } from '../services/request-log.service.js';
import { answerWebMessage } from '../services/web-chat.service.js';
import { withTimeout } from '../utils/async.js';

export const webChatRouter = Router();

type RateEntry = { count: number; resetAt: number };
const rateStore = new Map<string, RateEntry>();

function clientKey(req: import('express').Request): string {
  const forwarded = req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.ip || 'unknown';
}

function rateLimit(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): void {
  const now = Date.now();
  const key = clientKey(req);
  const existing = rateStore.get(key);
  const limit = env.WEB_CHAT_RATE_LIMIT_PER_10_MIN;

  if (!existing || existing.resetAt <= now) {
    rateStore.set(key, { count: 1, resetAt: now + 10 * 60_000 });
    next();
    return;
  }

  if (existing.count >= limit) {
    res.setHeader('Retry-After', String(Math.ceil((existing.resetAt - now) / 1000)));
    res.status(429).json({
      error: 'rate_limited',
      message: `Anh/Chị đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau hoặc gọi hotline ${env.COMPANY_HOTLINE}.`
    });
    return;
  }

  existing.count += 1;
  next();
}

webChatRouter.get('/config', (_req, res) => {
  res.json({
    companyName: env.COMPANY_NAME,
    hotline: env.COMPANY_HOTLINE,
    email: env.COMPANY_EMAIL,
    website: env.COMPANY_WEBSITE,
    directorPhone: env.DIRECTOR_PHONE,
    directorZaloUrl: env.DIRECTOR_ZALO_URL,
    directorLabel: 'Zalo tư vấn trực tiếp',
    welcome: `Xin chào Anh/Chị! Em là trợ lý AI của Sơn Tiến Bảo. Em có thể tư vấn chọn sơn, xử lý bề mặt, tính nhu cầu sơ bộ`,
    quickReplies: [
      'Tư vấn sơn nội thất',
      'Tư vấn sơn ngoại thất',
      'Tường bị thấm, bong tróc',
      'Tính lượng sơn cho công trình',
      'Tư vấn trực tiếp'
    ]
  });
});

webChatRouter.post('/session', (_req, res) => {
  res.status(201).json({ sessionId: `web_${randomUUID()}` });
});

const messageSchema = z.object({
  sessionId: z.string().regex(/^web_[0-9a-f-]{36}$/i),
  message: z.string().trim().min(2).max(1200),
  userName: z.string().trim().max(80).optional()
});

webChatRouter.post('/message', rateLimit, async (req, res) => {
  const started = Date.now();
  const parsed = messageSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await withTimeout(
      answerWebMessage(parsed.data),
      env.WEB_CHAT_REQUEST_TIMEOUT_MS
    );

    const response = {
      ...result,
      quickReplies: result.handoffRecommended
        ? [ 'Tư vấn trực tiếp', 'Gọi hotline']
        : ['Tư vấn thêm', 'Tính lượng sơn', 'Tư vấn trực tiếp']
    };

    res.status(200).json(response);
    void writeDynamicLog({
      action: 'web_chat_message',
      userId: parsed.data.sessionId,
      requestPayload: { message: parsed.data.message, userName: parsed.data.userName },
      responsePayload: response,
      durationMs: Date.now() - started,
      status: 'success'
    }).catch(() => undefined);
  } catch (error) {
    const response = {
      reply: `Em chưa thể xử lý câu hỏi lúc này. Anh/Chị vui lòng gọi hotline ${env.COMPANY_HOTLINE} hoặc để lại thông tin để nhân viên hỗ trợ.`,
      sources: [],
      handoffRecommended: true,
      directorZaloUrl: env.DIRECTOR_ZALO_URL,
      quickReplies: [ 'Tư vấn trực tiếp', 'Gọi hotline']
    };
    res.status(200).json(response);
    void writeDynamicLog({
      action: 'web_chat_message',
      userId: parsed.data.sessionId,
      requestPayload: { message: parsed.data.message, userName: parsed.data.userName },
      responsePayload: response,
      durationMs: Date.now() - started,
      status: 'fallback',
      errorMessage: String(error)
    }).catch(() => undefined);
  }
});

const leadSchema = z.object({
  sessionId: z.string().regex(/^web_[0-9a-f-]{36}$/i),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^[0-9+().\s-]{8,20}$/),
  need: z.string().trim().min(3).max(1000),
  area: z.string().trim().max(120).optional(),
  budget: z.string().trim().max(120).optional()
});

webChatRouter.post('/lead', rateLimit, async (req, res) => {
  const parsed = leadSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    return;
  }

  try {
    const lead = await createLead({
      userId: parsed.data.sessionId,
      name: parsed.data.name,
      phone: parsed.data.phone,
      need: parsed.data.need,
      area: parsed.data.area,
      budget: parsed.data.budget,
      priority: 'high',
      source: 'website_chatbot'
    });

    res.status(201).json({
      ok: true,
      code: lead.code,
      message: `Đã ghi nhận yêu cầu ${lead.code}. Thông tin đã được gửi tới nhân viên phụ trách.`,
      directorPhone: env.DIRECTOR_PHONE,
      directorZaloUrl: env.DIRECTOR_ZALO_URL
    });
  } catch (error) {
    console.error('Website lead error:', error);
    res.status(500).json({
      error: 'lead_failed',
      message: `Chưa lưu được yêu cầu. Anh/Chị vui lòng gọi ${env.DIRECTOR_PHONE} hoặc nhắn Zalo trực tiếp.`,
      directorZaloUrl: env.DIRECTOR_ZALO_URL
    });
  }
});
