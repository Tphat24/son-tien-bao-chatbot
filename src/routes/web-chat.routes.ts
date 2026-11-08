import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { createLead } from '../services/lead.service.js';
import { writeDynamicLog } from '../services/request-log.service.js';
import { answerWebMessage } from '../services/web-chat.service.js';
import { withTimeout } from '../utils/async.js';
import { consumeRateLimit } from '../services/rate-limit.service.js';
import { hashText } from '../utils/security.js';
import { comparisonRows, getComparisonProducts, searchComparisonProducts } from '../services/product-comparison.service.js';
import { getConversationHistory } from '../services/conversation.service.js';
import { buildHandoff } from '../services/handoff.service.js';
import { recordAnswer, submitAnswerFeedback } from '../services/answer-review.service.js';

export const webChatRouter = Router();

function clientKey(req: import('express').Request): string {
  return hashText(req.ip || req.socket.remoteAddress || 'unknown').slice(0, 32);
}

async function rateLimit(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): Promise<void> {
  const decision = await consumeRateLimit(`web-chat:${clientKey(req)}`, env.WEB_CHAT_RATE_LIMIT_PER_10_MIN, 10 * 60);
  res.setHeader('X-RateLimit-Remaining', String(decision.remaining));
  if (!decision.allowed) {
    res.setHeader('Retry-After', String(decision.retryAfterSeconds));
    res.status(429).json({
      error: 'rate_limited',
      message: `Anh/Chị đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau hoặc gọi hotline ${env.COMPANY_HOTLINE}.`
    });
    return;
  }

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
      'Để lại yêu cầu',
      'Tư vấn trực tiếp'
    ]
  });
});

webChatRouter.post('/session', (_req, res) => {
  res.status(201).json({ sessionId: `web_${randomUUID()}` });
});

webChatRouter.get('/products', rateLimit, async (req, res) => {
  const input = z.object({ q: z.string().trim().max(120).default('') }).safeParse(req.query);
  if (!input.success) { res.status(400).json({ error: 'invalid_query' }); return; }
  res.json({ products: await searchComparisonProducts(input.data.q) });
});
webChatRouter.post('/compare', rateLimit, async (req, res) => {
  const input = z.object({ productIds: z.array(z.string().uuid()).min(2).max(3).refine((ids) => new Set(ids).size === ids.length) }).safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: 'select_two_or_three_distinct_products' }); return; }
  const products = await getComparisonProducts(input.data.productIds);
  if (products.length !== input.data.productIds.length) { res.status(409).json({ error: 'product_no_longer_available', message: 'Có sản phẩm không còn được duyệt. Vui lòng tìm và chọn lại.' }); return; }
  res.json({ products: products.map(({ id, sku, name }) => ({ id, sku, name })), rows: comparisonRows(products), note: 'Đối chiếu tài liệu và điều kiện bề mặt trước khi chọn. Giá bán cần được nhân viên xác nhận.' });
});

webChatRouter.post('/feedback', rateLimit, async (req, res) => {
  const input = z.object({ sessionId: z.string().regex(/^web_[0-9a-f-]{36}$/i), answerId: z.string().uuid(), rating: z.enum(['helpful', 'not_helpful']), comment: z.string().trim().max(1000).optional() }).safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: 'invalid_feedback' }); return; }
  if (!await submitAnswerFeedback(input.data)) { res.status(404).json({ error: 'answer_not_found' }); return; }
  res.json({ ok: true });
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

    const { telemetry, ...clientResult } = result;
    const answerId = await recordAnswer({ sessionId: parsed.data.sessionId, question: parsed.data.message,
      answer: result.reply, ...(telemetry.generation.noData ? { reason: 'no_data' as const } : {}) });
    const response = {
      ...clientResult,
      ...(answerId ? { answerId } : {}),
      quickReplies: result.handoffRecommended
        ? [ 'Để lại yêu cầu', 'Tư vấn trực tiếp', 'Gọi hotline']
        : ['Tư vấn thêm', 'Tính lượng sơn', 'Tư vấn trực tiếp']
    };

    res.status(200).json(response);
    void writeDynamicLog({
      action: 'web_chat_message',
      userId: parsed.data.sessionId,
      requestPayload: { message: parsed.data.message, userName: parsed.data.userName },
      responsePayload: { ...response, telemetry },
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
    const answerId = await recordAnswer({ sessionId: parsed.data.sessionId, question: parsed.data.message, answer: response.reply, reason: 'system_fallback' });
    res.status(200).json({ ...response, ...(answerId ? { answerId } : {}) });
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
  budget: z.string().trim().max(120).optional(),
  productIds: z.array(z.string().uuid()).max(3).default([])
});

webChatRouter.post('/lead', rateLimit, async (req, res) => {
  const parsed = leadSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    return;
  }

  try {
    const history = await getConversationHistory(parsed.data.sessionId);
    const products = await getComparisonProducts(parsed.data.productIds);
    const handoff = buildHandoff({ ...parsed.data, history, products });
    const lead = await createLead({
      userId: parsed.data.sessionId,
      name: parsed.data.name,
      phone: parsed.data.phone,
      need: parsed.data.need,
      area: parsed.data.area,
      budget: parsed.data.budget,
      priority: 'high',
      source: 'website_chatbot',
      handoffSummary: handoff.summary,
      handoffTranscript: handoff.transcript
    });

    res.status(201).json({
      ok: true,
      code: lead.code,
      message: `Đã lưu yêu cầu ${lead.code} cùng tóm tắt trao đổi để nhân viên tiếp nhận.`,
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
