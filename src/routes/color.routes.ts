import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { firstStr } from '../utils/http-params.js';
import {
  findColors,
  suggestColors,
  getColorByCode,
  saveFavoriteColor,
  listFavoriteColors,
  COLOR_DISCLAIMER
} from '../services/color.service.js';

/**
 * Route tư vấn màu sơn (công khai — dùng cho chatbot & website).
 *
 *   GET  /api/colors/search?q=...        — tìm theo mã màu / tên
 *   GET  /api/colors/:code               — chi tiết một mã màu
 *   POST /api/colors/suggest             — gợi ý theo phòng / phong cách
 *   POST /api/colors/favorite            — lưu màu yêu thích của khách Zalo
 *   GET  /api/colors/favorite/:userId    — danh sách màu yêu thích
 *
 * Mọi phản hồi kèm COLOR_DISCLAIMER: màu trên màn hình có thể khác thực tế.
 */

export const colorRouter = Router();

colorRouter.get('/search', async (req: Request, res: Response) => {
  const parsed = z.object({ q: z.string().trim().min(1).max(120) }).safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'missing_query' });
    return;
  }
  const colors = await findColors(parsed.data.q);
  res.json({ colors, disclaimer: COLOR_DISCLAIMER });
});

colorRouter.post('/suggest', async (req: Request, res: Response) => {
  const parsed = z
    .object({
      room: z.string().trim().max(120).optional(),
      style: z.string().trim().max(120).optional(),
      brand: z.string().trim().max(120).optional()
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const colors = await suggestColors(parsed.data);
  res.json({ colors, disclaimer: COLOR_DISCLAIMER });
});

colorRouter.post('/favorite', async (req: Request, res: Response) => {
  const parsed = z
    .object({
      zaloUserId: z.string().trim().min(1).max(120),
      colorId: z.string().uuid()
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  await saveFavoriteColor({ zaloUserId: parsed.data.zaloUserId, colorId: parsed.data.colorId });
  res.json({ ok: true });
});

colorRouter.get('/favorite/:userId', async (req: Request, res: Response) => {
  const userId = firstStr(req.params.userId).trim();
  if (!userId) {
    res.status(400).json({ error: 'missing_user' });
    return;
  }
  const colors = await listFavoriteColors(userId);
  res.json({ colors, disclaimer: COLOR_DISCLAIMER });
});

// Đặt cuối cùng vì :code khớp rộng.
colorRouter.get('/:code', async (req: Request, res: Response) => {
  const code = firstStr(req.params.code).trim();
  const color = await getColorByCode(code);
  if (!color) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({ color, disclaimer: COLOR_DISCLAIMER });
});
