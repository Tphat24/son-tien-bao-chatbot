import assert from 'node:assert/strict';
import test from 'node:test';
import './_setup-env.js';
import { detectQueryIntent, queryTerms, relevanceScore } from '../src/services/catalog.service.js';

test('câu hỏi giữ màu dưới nắng được nhận diện là ngoại thất', () => {
  const query = 'Loại sơn nào giữ màu tốt khi nhà thường xuyên bị nắng?';
  assert.equal(detectQueryIntent(query), 'exterior');
  assert.ok(queryTerms(query).includes('chong phai mau'));
  assert.ok(!queryTerms(query).includes('nang'));
});

test('fallback lexical xếp Jotashield chống phai màu trên sơn sân thể thao', () => {
  const query = 'Loại sơn nào giữ màu tốt khi nhà thường xuyên bị nắng?';
  const relevant = relevanceScore({
    query,
    title: 'Jotun Jotashield Chống Phai Màu (Sơn ngoại thất cao cấp)',
    content: 'Công nghệ bền màu chống tia UV cho tường ngoài trời.'
  });
  const irrelevant = relevanceScore({
    query,
    title: 'Flexipave Resurfacer cho sân thể thao',
    content: 'Vật liệu tạo phẳng cho sân tennis, có khả năng chịu mài mòn.'
  });
  assert.ok(relevant > irrelevant, `${relevant} phải lớn hơn ${irrelevant}`);
});
