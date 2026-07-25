import type { Request, Response, NextFunction } from 'express';
import { verifyJwt, hasPermission, type AuthTokenPayload } from '../services/auth.service.js';

/**
 * Middleware xác thực & phân quyền cho các route quản trị.
 *
 * - requireAuth: bắt buộc có JWT hợp lệ (header Authorization: Bearer ...).
 * - requirePermission: kiểm tra RBAC theo vai trò.
 *
 * Gắn payload vào req.staff để handler dùng.
 */

export type AuthedRequest = Request & { staff?: AuthTokenPayload };

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    res.status(401).json({ error: 'missing_token' });
    return;
  }

  const payload = verifyJwt(token);
  if (!payload) {
    res.status(401).json({ error: 'invalid_or_expired_token' });
    return;
  }

  req.staff = payload;
  next();
}

export function requirePermission(permission: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.staff) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    if (!hasPermission(req.staff.role, permission)) {
      res.status(403).json({ error: 'forbidden', required: permission });
      return;
    }
    next();
  };
}
