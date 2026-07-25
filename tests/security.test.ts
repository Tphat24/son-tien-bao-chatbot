import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeEqual, hashText } from '../src/utils/security.js';
import { firstStr, optStr } from '../src/utils/http-params.js';

/** Unit test cho tiện ích bảo mật và chuẩn hoá tham số HTTP. */

test('safeEqual: bằng nhau khi chuỗi giống', () => {
  assert.equal(safeEqual('abc123', 'abc123'), true);
});

test('safeEqual: khác nhau khi nội dung khác', () => {
  assert.equal(safeEqual('abc123', 'abc124'), false);
});

test('safeEqual: khác độ dài trả false (không ném lỗi)', () => {
  assert.equal(safeEqual('abc', 'abcdef'), false);
});

test('hashText: cùng đầu vào cho cùng hash, khác đầu vào khác hash', () => {
  assert.equal(hashText('sontienbao'), hashText('sontienbao'));
  assert.notEqual(hashText('a'), hashText('b'));
  // sha256 hex = 64 ký tự.
  assert.equal(hashText('x').length, 64);
});

test('firstStr: xử lý string, mảng, undefined', () => {
  assert.equal(firstStr('abc'), 'abc');
  assert.equal(firstStr(['a', 'b']), 'a');
  assert.equal(firstStr(undefined), '');
  assert.equal(firstStr(null), '');
  assert.equal(firstStr([]), '');
});

test('optStr: trả undefined khi rỗng, string khi có giá trị', () => {
  assert.equal(optStr('  hello  '), 'hello');
  assert.equal(optStr('   '), undefined);
  assert.equal(optStr(undefined), undefined);
  assert.equal(optStr(['x']), 'x');
});
