import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { db } from '../db/supabase.js';
import { env } from '../config/env.js';
import { safeEqual } from '../utils/security.js';

/**
 * Auth service cho trang quản trị.
 *
 * - Hash mật khẩu bằng scrypt (node:crypto, không cần cài bcrypt/argon2).
 *   Định dạng lưu: scrypt$N$r$p$salt(base64)$hash(base64).
 *   Có thể thay bằng bcrypt/argon2 sau này bằng cách đổi hai hàm hashPassword/verifyPassword.
 * - JWT ký HMAC-SHA256 bằng ADMIN_API_KEY (dùng làm secret).
 * - Khóa tạm thời khi đăng nhập sai nhiều lần (mục 16).
 *
 * RBAC vai trò (mục 11): super_admin, manager, sales, technician, viewer.
 */

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const SCRYPT_N = 16384;
const SCRYPT_KEYLEN = 64;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8 giờ làm việc

export type StaffRole = 'super_admin' | 'manager' | 'sales' | 'technician' | 'viewer';

export type StaffRecord = {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  is_active: boolean;
  failed_login_count: number;
  locked_until: string | null;
  password_hash: string;
};

export type AuthTokenPayload = {
  sub: string;
  email: string;
  role: StaffRole;
  name: string;
  iat: number;
  exp: number;
};

/* ------------------------------------------------------------------ */
/* Password hashing (scrypt)                                           */
/* ------------------------------------------------------------------ */

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(plain, salt, SCRYPT_KEYLEN);
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const saltB64 = parts[2];
  const hashB64 = parts[3];
  if (!saltB64 || !hashB64) return false;

  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const derived = await scrypt(plain, salt, expected.length);
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

/* ------------------------------------------------------------------ */
/* JWT (HS256, self-contained)                                         */
/* ------------------------------------------------------------------ */

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function signJwt(payload: AuthTokenPayload): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const signature = crypto.createHmac('sha256', env.ADMIN_API_KEY).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export function verifyJwt(token: string): AuthTokenPayload | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  const [header, body, signature] = parts;
  if (!header || !body || !signature) return undefined;

  const expected = crypto.createHmac('sha256', env.ADMIN_API_KEY).update(`${header}.${body}`).digest('base64url');
  if (!safeEqual(signature, expected)) return undefined;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AuthTokenPayload;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return undefined;
    return payload;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* Login flow                                                          */
/* ------------------------------------------------------------------ */

export type LoginResult =
  | { ok: true; token: string; staff: { id: string; email: string; full_name: string; role: StaffRole } }
  | { ok: false; error: 'invalid_credentials' | 'account_locked' | 'account_disabled'; retryAfterMinutes?: number };

export async function login(email: string, password: string): Promise<LoginResult> {
  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await db
    .from('staff')
    .select('*')
    .eq('email', normalizedEmail)
    .maybeSingle();

  // Không tiết lộ tài khoản có tồn tại hay không.
  if (error || !data) {
    // Vẫn tốn thời gian hash để tránh timing attack lộ email.
    await scrypt(password, crypto.randomBytes(16), SCRYPT_KEYLEN).catch(() => undefined);
    return { ok: false, error: 'invalid_credentials' };
  }

  const staff = data as StaffRecord;

  if (!staff.is_active) return { ok: false, error: 'account_disabled' };

  if (staff.locked_until && new Date(staff.locked_until).getTime() > Date.now()) {
    const retryAfterMinutes = Math.ceil((new Date(staff.locked_until).getTime() - Date.now()) / 60000);
    return { ok: false, error: 'account_locked', retryAfterMinutes };
  }

  const passwordOk = await verifyPassword(password, staff.password_hash);

  if (!passwordOk) {
    const nextCount = staff.failed_login_count + 1;
    const shouldLock = nextCount >= MAX_FAILED_LOGINS;
    await db
      .from('staff')
      .update({
        failed_login_count: shouldLock ? 0 : nextCount,
        locked_until: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null
      })
      .eq('id', staff.id);

    if (shouldLock) return { ok: false, error: 'account_locked', retryAfterMinutes: LOCK_MINUTES };
    return { ok: false, error: 'invalid_credentials' };
  }

  // Đăng nhập thành công: reset đếm sai, cập nhật last_login.
  await db
    .from('staff')
    .update({ failed_login_count: 0, locked_until: null, last_login_at: new Date().toISOString() })
    .eq('id', staff.id);

  const now = Math.floor(Date.now() / 1000);
  const token = signJwt({
    sub: staff.id,
    email: staff.email,
    role: staff.role,
    name: staff.full_name,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  });

  return {
    ok: true,
    token,
    staff: { id: staff.id, email: staff.email, full_name: staff.full_name, role: staff.role }
  };
}

/* ------------------------------------------------------------------ */
/* RBAC helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Ma trận quyền: mỗi quyền -> vai trò được phép.
 *
 * Lưu ý: tên quyền phải KHỚP CHÍNH XÁC với chuỗi truyền vào requirePermission(...)
 * ở các route. Ở đây gom cả hai quy ước đặt tên đang dùng trong dự án:
 *   - 'nhom:hanh_dong'  (ví dụ leads:read, settings:write)
 *   - 'nhom.hanh_dong'  (ví dụ product.view, quotation.manage, staff.manage)
 */
const VIEWER_UP: StaffRole[] = ['super_admin', 'manager', 'sales', 'technician', 'viewer'];
const SALES_UP: StaffRole[] = ['super_admin', 'manager', 'sales'];
const MANAGER_UP: StaffRole[] = ['super_admin', 'manager'];
const SUPER_ONLY: StaffRole[] = ['super_admin'];

const PERMISSION_MATRIX: Record<string, StaffRole[]> = {
  // Sản phẩm
  'product.view': VIEWER_UP,
  'product.edit': MANAGER_UP,
  'products.read': VIEWER_UP,
  'products.write': MANAGER_UP,
  // Lead
  'leads:read': VIEWER_UP,
  'leads:write': SALES_UP,
  'leads.read': VIEWER_UP,
  'leads.write': SALES_UP,
  // Báo giá
  'quotation.view': ['super_admin', 'manager', 'sales', 'viewer'],
  'quotation.manage': SALES_UP,
  'quotations.read': ['super_admin', 'manager', 'sales', 'viewer'],
  'quotations.write': SALES_UP,
  // Hội thoại
  'conversations.read': ['super_admin', 'manager', 'sales', 'technician'],
  'conversations.write': SALES_UP,
  // Cấu hình hệ thống
  'settings:read': MANAGER_UP,
  'settings:write': SUPER_ONLY,
  'settings.read': MANAGER_UP,
  'settings.write': SUPER_ONLY,
  // Tài khoản nhân viên
  'staff.manage': SUPER_ONLY,
  'staff.read': MANAGER_UP,
  'staff.write': SUPER_ONLY,
  // Báo cáo
  'reports.read': ['super_admin', 'manager', 'viewer']
};

export function hasPermission(role: StaffRole, permission: string): boolean {
  const allowed = PERMISSION_MATRIX[permission];
  return Boolean(allowed && allowed.includes(role));
}

/** Tạo tài khoản staff (dùng cho seed hoặc super_admin thêm nhân viên). */
export async function createStaff(input: {
  email: string;
  fullName: string;
  password: string;
  role: StaffRole;
}): Promise<{ id: string; email: string }> {
  const password_hash = await hashPassword(input.password);
  const { data, error } = await db
    .from('staff')
    .insert({
      email: input.email.trim().toLowerCase(),
      full_name: input.fullName,
      password_hash,
      role: input.role
    })
    .select('id, email')
    .single();

  if (error) throw new Error(`Cannot create staff: ${error.message}`);
  return data as { id: string; email: string };
}

/** Đổi mật khẩu của chính mình sau khi xác thực mật khẩu cũ. */
export async function changePassword(
  staffId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await db
    .from('staff')
    .select('password_hash')
    .eq('id', staffId)
    .maybeSingle();

  if (error || !data) return { ok: false, error: 'not_found' };

  const valid = await verifyPassword(currentPassword, (data as { password_hash: string }).password_hash);
  if (!valid) return { ok: false, error: 'wrong_password' };

  const password_hash = await hashPassword(newPassword);
  const { error: updateError } = await db
    .from('staff')
    .update({ password_hash })
    .eq('id', staffId);

  if (updateError) return { ok: false, error: 'update_failed' };
  return { ok: true };
}

/** Danh sách nhân viên (không trả password_hash). */
export async function listStaff(): Promise<Array<Omit<StaffRecord, 'password_hash'>>> {
  const { data, error } = await db
    .from('staff')
    .select('id, email, full_name, role, is_active, failed_login_count, locked_until, last_login_at, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Cannot list staff: ${error.message}`);
  return (data ?? []) as Array<Omit<StaffRecord, 'password_hash'>>;
}

/** Bật/tắt tài khoản nhân viên (cơ chế thu hồi quyền truy cập). */
export async function setStaffActive(staffId: string, isActive: boolean): Promise<boolean> {
  const { error } = await db
    .from('staff')
    .update({ is_active: isActive, failed_login_count: 0, locked_until: null })
    .eq('id', staffId);
  return !error;
}
