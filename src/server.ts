import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import path from 'node:path';
import { env } from './config/env.js';
import { zaloChatbotRouter } from './routes/zalo-chatbot.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { webChatRouter } from './routes/web-chat.routes.js';
import { zaloBotRouter } from './routes/zalo-bot.routes.js';
import { zaloOaRouter } from './routes/zalo-oa.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { productAdminRouter } from './routes/product-admin.routes.js';
import { colorRouter } from './routes/color.routes.js';
import { quotationRouter } from './routes/quotation.routes.js';
import { leadAdminRouter } from './routes/lead-admin.routes.js';
import { settingsRouter } from './routes/settings.routes.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({ origin: env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()) }));
app.use(pinoHttp({
  redact: env.REDACT_DYNAMIC_KEY_IN_LOGS
    ? ['req.headers.authorization', 'req.headers.x-stb-chatbot-key', 'req.headers.x-bot-api-secret-token', 'req.query.key', 'req.body.key']
    : ['req.headers.authorization', 'req.headers.x-stb-chatbot-key', 'req.headers.x-bot-api-secret-token', 'req.body.key']
}));
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buffer) => {
      (req as express.Request & { rawBody?: string }).rawBody =
        buffer.toString('utf8');
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'son-tien-bao-smart-advisor-v5-brain', version: '5.0.1', time: new Date().toISOString() }));
app.get('/version', (_req, res) => res.json({ version: '5.0.1', build: 'v5-brain-compact-ui' }));
app.use('/api/web-chat', webChatRouter);
app.use('/api/zalo-chatbot', zaloChatbotRouter);
app.use('/api/zalo-bot', zaloBotRouter);
app.use('/api/zalo-oa', zaloOaRouter);
app.use('/api/auth', authRouter);

app.use('/api/admin/products', productAdminRouter);
app.use('/api/admin/quotations', quotationRouter);
app.use('/api/admin/leads', leadAdminRouter);
app.use('/api/admin/settings', settingsRouter);

app.use('/api/colors', colorRouter);

// Route tổng quát phải đặt cuối cùng
app.use('/api/admin', adminRouter);

const publicDir = path.join(process.cwd(), 'public');

app.use(express.static(publicDir));

app.use((_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`Sơn Tiến Bảo v5 Brain + Compact UI running on 0.0.0.0:${env.PORT}`);
});
