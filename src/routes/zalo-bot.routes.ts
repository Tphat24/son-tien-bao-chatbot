import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import {
  getZaloWebhookInfo,
  processZaloWebhook,
  setZaloWebhook,
  type ZaloWebhookBody
} from '../services/zalo-bot.service.js';

export const zaloBotRouter = Router();

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function requireAdminKey(value: unknown): boolean {
  return typeof value === 'string' && safeEqual(value, env.ADMIN_API_KEY);
}

zaloBotRouter.post('/webhook', (req, res) => {
  if (!env.ZALO_WEBHOOK_SECRET_TOKEN) {
    return res.status(503).json({ ok: false, error: 'zalo_webhook_not_configured' });
  }

  const secret = req.header('X-Bot-Api-Secret-Token') ?? '';
  if (!safeEqual(secret, env.ZALO_WEBHOOK_SECRET_TOKEN)) {
    return res.status(403).json({ ok: false, error: 'unauthorized' });
  }

  const body = req.body as ZaloWebhookBody;
  res.status(200).json({ ok: true });
  void processZaloWebhook(body);
});

zaloBotRouter.post('/admin/set-webhook', async (req, res, next) => {
  try {
    if (!requireAdminKey(req.header('X-Admin-Key'))) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const result = await setZaloWebhook();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

zaloBotRouter.get('/admin/webhook-info', async (req, res, next) => {
  try {
    if (!requireAdminKey(req.header('X-Admin-Key'))) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const result = await getZaloWebhookInfo();
    res.json(result);
  } catch (error) {
    next(error);
  }
});
