import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, verifyJwt, hasPermission } from '../src/services/auth.service.js';

/**
 * Kiểm thử xác thực & phân quyền (mục 11, 16, 23 - permission test, security test).
 * Cần env giả: chạy với --import ./tests/_setup-env.ts
 */

test('hashPassword tạo chuỗi scrypt hợp lệ và verify đúng', async () => {
  const hash = await hashPassword('MatKhauManh#2026');
  assert.match(hash, /^scrypt\$/);
  assert.equal(await verifyPassword('MatKhauManh#2026', hash), true);
});

test('verifyPassword từ chối mật khẩu sai', async () => {
  const hash = await hashPassword('MatKhauDung#2026');
  assert.equal(await verifyPassword('MatKhauSai#2026', hash), false);
});

test('verifyPassword từ chối chuỗi hash hỏng', async () => {
  assert.equal(await verifyPassword('abc', 'khong-phai-hash'), false);
  assert.equal(await verifyPassword('abc', 'scrypt$16384$only-two'), false);
});

test('verifyJwt từ chối token rác', () => {
  assert.equal(verifyJwt('khong.phai.jwt'), undefined);
  assert.equal(verifyJwt('abc'), undefined);
  assert.equal(verifyJwt(''), undefined);
});

test('verifyJwt từ chối token đã hết hạn (chữ ký sai)', () => {
  // Token bịa có 3 phần nhưng chữ ký không khớp ADMIN_API_KEY → phải trả undefined.
  const fake = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    + '.' + Buffer.from(JSON.stringify({ sub: 'x', exp: 9999999999 })).toString('base64url')
    + '.chu_ky_gia';
  assert.equal(verifyJwt(fake), undefined);
});

test('RBAC: super_admin có mọi quyền quan trọng', () => {
  assert.equal(hasPermission('super_admin', 'settings:write'), true);
  assert.equal(hasPermission('super_admin', 'staff.manage'), true);
  assert.equal(hasPermission('super_admin', 'product.edit'), true);
});

test('RBAC: viewer chỉ được xem, không được sửa', () => {
  assert.equal(hasPermission('viewer', 'product.view'), true);
  assert.equal(hasPermission('viewer', 'product.edit'), false);
  assert.equal(hasPermission('viewer', 'leads:write'), false);
  assert.equal(hasPermission('viewer', 'settings:write'), false);
});

test('RBAC: sales sửa được lead & báo giá nhưng không quản lý nhân viên', () => {
  assert.equal(hasPermission('sales', 'leads:write'), true);
  assert.equal(hasPermission('sales', 'quotation.manage'), true);
  assert.equal(hasPermission('sales', 'staff.manage'), false);
  assert.equal(hasPermission('sales', 'settings:write'), false);
});

test('RBAC: quyền không tồn tại luôn bị từ chối', () => {
  assert.equal(hasPermission('super_admin', 'quyen_khong_ton_tai'), false);
});
