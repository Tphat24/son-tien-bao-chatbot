import { Router, type Response } from 'express';
import { z } from 'zod';
import { getAllSettings, setSetting } from '../services/settings.service.js';
import { requireAuth, requirePermission, type AuthedRequest } from '../utils/auth-middleware.js';
import { writeAuditLog } from '../services/audit.service.js';

/**
 * Route cấu hình động (system_settings).
 *
 *   GET  /api/admin/settings        — đọc toàn bộ cấu hình
 *   PUT  /api/admin/settings        — cập nhật một hoặc nhiều khóa
 *
 * Cho phép quản trị viên đổi thông tin doanh nghiệp, giờ làm việc,
 * lời chào... mà KHÔNG phải sửa mã nguồn (yêu cầu mục 2 & 11).
 *
 * RBAC: chỉ 'manager' trở lên (settings:write).
 */

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

/* ------------------------------------------------------------------ */
/* Đọc toàn bộ cấu hình                                                 */
/* ------------------------------------------------------------------ */
settingsRouter.get('/', requirePermission('settings:read'), async (_req, res: Response) => {
  try {
    const rows = await getAllSettings();
    // Ẩn các khóa nhạy cảm (token OA) khỏi giao diện.
    const safe = rows.filter((row) => row.key !== 'zalo_oa_token');
    res.json(safe);
  } catch (error) {
    console.error('settings_list_failed', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ------------------------------------------------------------------ */
/* Cập nhật cấu hình                                                    */
/* ------------------------------------------------------------------ */
const updateSchema = z.object({
  updates: z
    .array(
      z.object({
        key: z
          .string()
          .min(1)
          .max(80)
          .regex(/^[a-z0-9_]+$/, 'Khóa chỉ gồm chữ thường, số và gạch dưới'),
        value: z.string().max(4000)
      })
    )
    .min(1)
    .max(50)
});

settingsRouter.put('/', requirePermission('settings:write'), async (req: AuthedRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }

  // Không cho phép ghi đè token OA qua endpoint này.
  const blocked = parsed.data.updates.find((item) => item.key === 'zalo_oa_token');
  if (blocked) {
    res.status(403).json({ error: 'forbidden_key', key: 'zalo_oa_token' });
    return;
  }

  try {
    for (const item of parsed.data.updates) {
      await setSetting(item.key, item.value);
    }

    await writeAuditLog({
      actorId: req.staff?.sub,
      actorEmail: req.staff?.email,
      action: 'settings.update',
      entity: 'system_settings',
      metadata: { keys: parsed.data.updates.map((item) => item.key) },
      ip: (req.header('x-forwarded-for')?.split(',')[0] ?? req.ip ?? '').trim()
    });

    res.json({ ok: true, updated: parsed.data.updates.length });
  } catch (error) {
    console.error('settings_update_failed', error);
    res.status(500).json({ error: 'internal_error' });
  }
});
