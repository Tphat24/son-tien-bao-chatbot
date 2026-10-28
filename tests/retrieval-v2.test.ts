import './_setup-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { embeddingInput, normalizeEmbedding } from '../src/services/embedding-input.js';
import { buildRetrievalQuery, fuseKnowledge } from '../src/services/retrieval-ranking.js';
import type { KnowledgeRow } from '../src/services/catalog.service.js';
import { cleanReply } from '../src/services/ai.service.js';

const doc = (id: string, content = id): KnowledgeRow => ({ id, title: id, content, source_url: `https://sontienbao.com/${id}` });

test('RRF promotes agreement across retrievers without comparing raw scores', () => {
  const ranked = fuseKnowledge([
    [{ ...doc('vector-only'), retrieval_score: .99 }, doc('both')],
    [doc('keyword-only'), { ...doc('both'), retrieval_score: 200 }]
  ], 3, 12000);
  assert.equal(ranked[0]?.id, 'both');
});

test('matching passages from the same source do not crowd out other documents', () => {
  const ranked = fuseKnowledge([
    [doc('a', 'Quy trình thi công.'), doc('a', 'Định mức thi công.'), doc('b')],
    [doc('b')]
  ], 2, 12000);
  assert.equal(ranked[0]?.id, 'b');
  assert.match(ranked[1]!.content, /Quy trình/);
  assert.match(ranked[1]!.content, /Định mức/);
});

test('RRF deduplicates live and indexed sources and respects context budget', () => {
  const indexed = doc('a', 'x'.repeat(1800));
  const ranked = fuseKnowledge([[indexed], [{ ...indexed, id: undefined }], [doc('b', 'y'.repeat(1800))]], 5, 2000);
  assert.equal(ranked.filter((item) => item.source_url === indexed.source_url).length, 1);
  assert.ok(ranked.reduce((size, item) => size + item.content.length, 0) <= 2000);
});

test('current topic ignores unrelated history and assistant guesses', () => {
  const history = [
    { role: 'user' as const, content: 'Tôi cần sơn ngoại thất', created_at: '' },
    { role: 'assistant' as const, content: 'Sản phẩm không có thật ABC', created_at: '' }
  ];
  assert.equal(buildRetrievalQuery('Chính sách giao hàng tại Thủ Đức', history), 'Chính sách giao hàng tại Thủ Đức');
  const followUp = buildRetrievalQuery('Loại này cần mấy lớp?', history);
  assert.match(followUp, /ngoại thất/);
  assert.doesNotMatch(followUp, /ABC/);
});

test('Embedding 2 uses task prefixes and distinct Content objects per chunk', () => {
  const request = embeddingInput('gemini-embedding-2', ['Một', 'Hai'], 'RETRIEVAL_DOCUMENT', 'Hướng dẫn');
  assert.equal(request.contents.length, 2);
  assert.equal(request.contents[0]?.parts[0]?.text, 'title: Hướng dẫn | text: Một');
  assert.equal(request.contents[1]?.parts[0]?.text, 'title: Hướng dẫn | text: Hai');
  assert.ok(!('taskType' in request.config));
  assert.ok(!('title' in request.config));
  assert.equal(embeddingInput('models/gemini-embedding-2', ['Câu hỏi'], 'RETRIEVAL_QUERY').contents[0]?.parts[0]?.text, 'task: search result | query: Câu hỏi');
});

test('Embedding 001 keeps its native retrieval task and document title', () => {
  const request = embeddingInput('gemini-embedding-001', ['Nội dung'], 'RETRIEVAL_DOCUMENT', 'Tên');
  assert.equal(request.config.taskType, 'RETRIEVAL_DOCUMENT');
  assert.equal(request.config.title, 'Tên');
  assert.equal(request.contents[0]?.parts[0]?.text, 'Nội dung');
});

test('embedding validation rejects broken vectors and normalizes valid vectors', () => {
  assert.throws(() => normalizeEmbedding([1, 2]), /768/);
  assert.throws(() => normalizeEmbedding(Array(768).fill(0)), /zero/);
  assert.throws(() => normalizeEmbedding(Array(768).fill(NaN)), /finite/);
  assert.ok(Math.abs(Math.hypot(...normalizeEmbedding(Array(768).fill(2))) - 1) < 1e-10);
});

test('reply cleanup preserves paragraph and list boundaries for readable chat', () => {
  assert.equal(cleanReply('**Chọn sơn**\r\n\r\n- Ngoại thất\n- Nội thất  '), 'Chọn sơn\n\n- Ngoại thất\n- Nội thất');
});
