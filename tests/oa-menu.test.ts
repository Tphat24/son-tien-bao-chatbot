import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMenuPayload, buildMainMenuButtons } from '../src/services/oa-menu.service.js';

/**
 * Kiểm thử nhận diện menu (mục 4, 20).
 * Cần env giả: chạy với --import ./tests/_setup-env.ts
 */

test('menu chính có đúng 5 nút', () => {
  const buttons = buildMainMenuButtons();
  assert.equal(buttons.length, 5);
  assert.ok(buttons.every((b) => b.payload.startsWith('MENU_')));
});

test('payload nút bấm khớp chính xác', () => {
  const r = resolveMenuPayload('MENU_QUOTE');
  assert.ok(r);
  assert.equal(r?.handoff, true); // báo giá → chuyển nhân viên
});

test('nhận diện từ khóa có dấu', () => {
  assert.ok(resolveMenuPayload('tư vấn chọn sơn'));
  assert.ok(resolveMenuPayload('báo giá'));
});

test('nhận diện từ khóa KHÔNG dấu', () => {
  assert.ok(resolveMenuPayload('tu van'));
  assert.ok(resolveMenuPayload('bao gia'));
  assert.ok(resolveMenuPayload('gap nhan vien'));
});

test('nhận diện có dấu lẫn không dấu, chữ hoa', () => {
  assert.ok(resolveMenuPayload('CHỐNG THẤM'));
  assert.ok(resolveMenuPayload('Tinh Luong Son'));
});

test('"gặp nhân viên" bật handoff', () => {
  const r = resolveMenuPayload('gap nhan vien');
  assert.equal(r?.handoff, true);
});

test('câu hỏi tự do dài KHÔNG khớp menu (để AI xử lý)', () => {
  const r = resolveMenuPayload(
    'em oi cho anh hoi loai son nao chong tham tot ma gia hop ly cho nha moi xay o quan 7'
  );
  assert.equal(r, undefined);
});

test('chuỗi rỗng trả về undefined', () => {
  assert.equal(resolveMenuPayload('   '), undefined);
});
