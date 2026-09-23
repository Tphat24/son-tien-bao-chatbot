import assert from 'node:assert/strict';
import test from 'node:test';
import './_setup-env.js';
import { chunkText } from '../src/services/rag.service.js';

test('chunkText returns compact non-empty chunks with overlap', () => {
  const source = Array.from({ length: 50 }, (_, index) => `Đoạn ${index + 1} mô tả quy trình thi công và định mức sản phẩm.`).join('\n\n');
  const chunks = chunkText(source, 500, 80);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length > 0 && chunk.length <= 500));
  assert.ok(chunks.slice(1).every((chunk, index) => {
    const previousWords = new Set(chunks[index]!.slice(-120).split(/\s+/));
    return chunk.slice(0, 120).split(/\s+/).some((word) => previousWords.has(word));
  }));
});

test('chunkText handles empty and short documents', () => {
  assert.deepEqual(chunkText('   '), []);
  assert.deepEqual(chunkText('  Nội dung ngắn.  '), ['Nội dung ngắn.']);
});
