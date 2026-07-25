import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstStr, optStr } from '../src/utils/http-params.js';

/**
 * Kiểm thử chuẩn hoá tham số HTTP (Express 5: string | string[] | undefined).
 */

test('firstStr với string thường', () => {
  assert.equal(firstStr('abc'), 'abc');
});

test('firstStr với mảng lấy phần tử đầu', () => {
  assert.equal(firstStr(['x', 'y']), 'x');
});

test('firstStr với undefined/null trả rỗng', () => {
  assert.equal(firstStr(undefined), '');
  assert.equal(firstStr(null), '');
  assert.equal(firstStr([]), '');
});

test('optStr trả undefined khi rỗng', () => {
  assert.equal(optStr(''), undefined);
  assert.equal(optStr('   '), undefined);
  assert.equal(optStr(undefined), undefined);
});

test('optStr trả giá trị đã trim', () => {
  assert.equal(optStr('  hello  '), 'hello');
  assert.equal(optStr(['  a  ', 'b']), 'a');
});
