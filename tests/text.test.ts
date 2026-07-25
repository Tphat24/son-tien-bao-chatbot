import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, clip, asFiniteNumber } from '../src/utils/text.js';

/**
 * Unit test cho tiện ích xử lý văn bản.
 * Đây là nền cho việc hiểu tin nhắn không dấu / sai chính tả của khách.
 */

test('normalizeText: bỏ dấu tiếng Việt và đổi đ -> d', () => {
  assert.equal(normalizeText('Sơn chống thấm'), 'son chong tham');
  assert.equal(normalizeText('Tường Đẹp'), 'tuong dep');
  assert.equal(normalizeText('ĐỎ đỏ'), 'do do');
});

test('normalizeText: gộp khoảng trắng và cắt hai đầu', () => {
  assert.equal(normalizeText('  báo    giá  '), 'bao gia');
});

test('normalizeText: loại ký tự đặc biệt nhưng giữ số, dấu chấm, gạch', () => {
  assert.equal(normalizeText('Jotun 5.0 lít!!!'), 'jotun 5.0 lit');
  assert.equal(normalizeText('mã: A-123'), 'ma a-123');
});

test('normalizeText: chuỗi rỗng trả về rỗng', () => {
  assert.equal(normalizeText('   '), '');
});

test('clip: giữ nguyên khi ngắn hơn giới hạn', () => {
  assert.equal(clip('xin chào', 100), 'xin chào');
});

test('clip: cắt và thêm dấu … khi vượt giới hạn', () => {
  const out = clip('a'.repeat(50), 10);
  assert.equal(out.length, 10);
  assert.ok(out.endsWith('…'));
});

test('clip: gộp khoảng trắng thừa', () => {
  assert.equal(clip('a   b    c'), 'a b c');
});

test('asFiniteNumber: parse số thập phân và dấu phẩy', () => {
  assert.equal(asFiniteNumber('1.234'), 1.234);
  assert.equal(asFiniteNumber('12,5'), 12.5);
  assert.equal(asFiniteNumber('100'), 100);
});

// LƯU Ý QUIRK (kế thừa từ v5): asFiniteNumber chỉ strip ký tự không phải số,
// KHÔNG tách token. Nên '50m2' -> '502' (bỏ chữ m rồi ghép 50+2), và chuỗi
// không có số -> '' -> 0. Test này ghi nhận hành vi thực tế để cảnh báo:
// KHÔNG dùng asFiniteNumber để parse diện tích khách gõ kèm đơn vị ('50m2').
test('asFiniteNumber: quirk — strip ký tự, không tách đơn vị', () => {
  assert.equal(asFiniteNumber('50m2'), 502); // 'm' bị bỏ, còn 502
  assert.equal(asFiniteNumber('không có số'), 0); // '' -> Number('') = 0
});

test('asFiniteNumber: trả undefined cho non-string/non-number', () => {
  assert.equal(asFiniteNumber(null), undefined);
  assert.equal(asFiniteNumber(undefined), undefined);
  assert.equal(asFiniteNumber({}), undefined);
});

test('asFiniteNumber: giữ nguyên number hữu hạn', () => {
  assert.equal(asFiniteNumber(42), 42);
  assert.equal(asFiniteNumber(Infinity), undefined);
});
