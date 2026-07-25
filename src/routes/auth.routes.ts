import { Router, type Response } from 'express';
import { z } from 'zod';
import {
  login,
  createStaff,
  changePassword,
  listStaff,
  setStaffActive,
  type StaffRole
} from '../services/auth.service.js';
import { requireAuth, requirePermission, type AuthedRequest } from '../utils/auth-middleware.js';
import { writeAuditLog } from '../services/audit.service.js';
import { firstStr } from '../utils/http-params.js';

/**
 * Route xác thực & quản lý tài khoản nhân viên.
 *
 *   POST /api/auth/login            — đăng nhập, trả JWT
 *   GET  /api/auth/me               — thông tin tài khoản hiện tại
 *   POST /api/auth/change-password  — đổi mật khẩu của chính mình
 *   GET  /api/auth/staff            — danh sách nhân viên (super_admin)
 *   POST /api/auth/staff            — tạo nhân viên (super_admin)
 *   POST /api/auth/staff/:id/active — bật/tắt nhân viên (super_admin)
 *
 * RBAC: chỉ super_admin được quản lý tài khoản.
 */

export const authRouter = Router();

const clientIp = (req: AuthedRequest): string =>
  (req.header('x-forwarded-for')?.split(',')[0] ?? req.ip ?? '').trim();

/* ------------------------------------------------------------------ */
/* Đăng nhập                                                           */
/* ------------------------------------------------------------------ */
authRouter.post('/login', async (req, res: Response) => {
  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(1).max(200) })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input' });
  }

  const result = await login(parsed.data.email, parsed.data.password);

  if (!result.ok) {
    // Không tiết lộ tài khoản có tồn tại hay không.
    const status = result.error === 'account_locked' ? 423 : 401;
    return res.status(status).json({ error: result.error, retryAfterMinutes: result.retryAfterMinutes });
  }

  void writeAuditLog({
    actorId: result.staff.id,
    actorEmail: result.staff.email,
    action: 'auth.login',
    ip: clientIp(req as AuthedRequest)
  });

  return res.json({
    token: result.token,
    staff: { id: result.staff.id, email: result.staff.email, fullName: result.staff.full_name, role: result.staff.role }
  });
});

/* ------------------------------------------------------------------ */
/* Thông tin tài khoản hiện tại                                        */
/* ------------------------------------------------------------------ */
authRouter.get('/me', requireAuth, (req: AuthedRequest, res: Response) => {
  return res.json({ staff: req.staff });
});

/* ------------------------------------------------------------------ */
/* Đổi mật khẩu của chính mình                                         */
/* ------------------------------------------------------------------ */
authRouter.post('/change-password', requireAuth, async (req: AuthedRequest, res: Response) => {
  const parsed = z
    .object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input', hint: 'Mật khẩu mới tối thiểu 8 ký tự.' });
  }

  const staffId = req.staff!.sub;
  const changed = await changePassword(staffId, parsed.data.currentPassword, parsed.data.newPassword);

  if (!changed) {
    return res.status(400).json({ error: 'wrong_current_password' });
  }

  void writeAuditLog({
    actorId: staffId,
    actorEmail: req.staff!.email,
    action: 'auth.change_password',
    ip: clientIp(req)
  });

  return res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Quản lý nhân viên — chỉ super_admin                                 */
/* ------------------------------------------------------------------ */
authRouter.get('/staff', requireAuth, requirePermission('staff.manage'), async (_req, res: Response) => {
  const staff = await listStaff();
  return res.json({ staff });
});

authRouter.post('/staff', requireAuth, requirePermission('staff.manage'), async (req: AuthedRequest, res: Response) => {
  const parsed = z
    .object({
      email: z.string().email(),
      fullName: z.string().min(2).max(120),
      password: z.string().min(8).max(200),
      role: z.enum(['super_admin', 'manager', 'sales', 'technician', 'viewer'])
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input' });
  }

  try {
    const staff = await createStaff({
      email: parsed.data.email,
      fullName: parsed.data.fullName,
      password: parsed.data.password,
      role: parsed.data.role as StaffRole
    });

    void writeAuditLog({
      actorId: req.staff!.sub,
      actorEmail: req.staff!.email,
      action: 'staff.create',
      entity: 'staff',
      entityId: staff.id,
      metadata: { email: staff.email, role: parsed.data.role },
      ip: clientIp(req)
    });

    return res.status(201).json({ staff });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    if (message.includes('duplicate') || message.includes('unique')) {
      return res.status(409).json({ error: 'email_exists' });
    }
    console.error('staff_create_failed', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

authRouter.post('/staff/:id/active', requireAuth, requirePermission('staff.manage'), async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input' });
  }

  const staffId = firstStr(req.params.id);
  if (!staffId) return res.status(400).json({ error: 'missing_id' });

  // Không cho tự khoá chính mình.
  if (staffId === req.staff!.sub && !parsed.data.active) {
    return res.status(400).json({ error: 'cannot_deactivate_self' });
  }

  await setStaffActive(staffId, parsed.data.active);

  void writeAuditLog({
    actorId: req.staff!.sub,
    actorEmail: req.staff!.email,
    action: parsed.data.active ? 'staff.activate' : 'staff.deactivate',
    entity: 'staff',
    entityId: staffId,
    ip: clientIp(req)
  });

  return res.json({ ok: true });
});
