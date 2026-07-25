import { Router } from 'express';
import { env } from '../config/env.js';
import { handleDynamicRequest } from '../services/dynamic-chatbot.service.js';
import { writeDynamicLog } from '../services/request-log.service.js';
import { withTimeout } from '../utils/async.js';
import { fallbackResponse } from '../utils/chatbot-response.js';
import { parseDynamicRequest } from '../utils/dynamic-request.js';
import { safeEqual } from '../utils/security.js';

export const zaloChatbotRouter = Router();

function isAuthorized(req: Parameters<typeof parseDynamicRequest>[0]): boolean {
  const supplied = req.header('x-stb-chatbot-key') || String(req.query.key ?? req.body?.key ?? '');
  return Boolean(supplied) && safeEqual(supplied, env.DYNAMIC_API_KEY);
}

async function dynamicHandler(req: Parameters<typeof parseDynamicRequest>[0], res: import('express').Response): Promise<void> {
  const started = Date.now();
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const input = parseDynamicRequest(req);
  try {
    const response = await withTimeout(handleDynamicRequest(input), env.DYNAMIC_API_TIMEOUT_MS);
    res.status(200).json(response);
    void writeDynamicLog({ action: input.action, userId: input.userId, requestPayload: input.raw, responsePayload: response, durationMs: Date.now() - started, status: 'success' }).catch(() => undefined);
  } catch (error) {
    const response = fallbackResponse();
    res.status(200).json(response);
    void writeDynamicLog({ action: input.action, userId: input.userId, requestPayload: input.raw, responsePayload: response, durationMs: Date.now() - started, status: 'fallback', errorMessage: String(error) }).catch(() => undefined);
  }
}

zaloChatbotRouter.get('/dynamic', dynamicHandler);
zaloChatbotRouter.post('/dynamic', dynamicHandler);
