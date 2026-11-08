import './_setup-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import express from 'express';
import { webChatRouter } from '../src/routes/web-chat.routes.js';
import { answerReviewRouter } from '../src/routes/answer-review.routes.js';
import { comparisonRows, type ComparisonProduct } from '../src/services/product-comparison.service.js';
import { buildHandoff } from '../src/services/handoff.service.js';
import { recordAnswer, redactFaqQuestion } from '../src/services/answer-review.service.js';
import { env } from '../src/config/env.js';

const id1 = '00000000-0000-4000-8000-000000000001', id2 = '00000000-0000-4000-8000-000000000002';
const sessionId = 'web_00000000-0000-4000-8000-000000000003';
const products: ComparisonProduct[] = [id1, id2].map((id, i) => ({ id, sku: `SON-${i}`, name: `Sơn ${i}`, brand: 'Hãng', category: 'Nội thất', use_case: 'Tường trong nhà', coverage_text: null, coverage_min: 10, coverage_max: 12, recommended_coats: 2, package_text: '5 L' }));
function token(role: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: id1, role, email: 'staff@example.com', name: 'Test', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+60 })).toString('base64url');
  return `${header}.${body}.${crypto.createHmac('sha256', env.ADMIN_API_KEY).update(`${header}.${body}`).digest('base64url')}`;
}
test('comparison does not invent coverage units or expose prices', () => {
  const rows = comparisonRows(products);
  assert.ok(rows.find((r) => r.label === 'Định mức')?.values.every((v) => v === 'Chưa có dữ liệu đã xác minh'));
  assert.doesNotMatch(JSON.stringify(rows), /price|10–12|m²\/L/);
});
test('handoff summary uses customer statements and keeps bot claims clearly separate', () => {
  const result = buildHandoff({ need: 'Sơn nhà 100m²', products, history: [
    { role: 'user', content: 'Tường mới, cần sơn nội thất.', created_at: '' },
    { role: 'assistant', content: 'Cam kết bảo hành 100 năm.', created_at: '' }
  ] });
  assert.match(result.summary, /Tường mới/);
  assert.match(result.summary, /SON-0/);
  assert.doesNotMatch(result.summary, /100 năm/);
  assert.equal(result.transcript[1]?.role, 'assistant');
});
test('FAQ draft removes phone and email before review', () => {
  assert.equal(redactFaqQuestion('Gọi 0912345678 hoặc ten@example.com hỏi sơn'), 'Gọi [SĐT đã ẩn] hoặc [email đã ẩn] hỏi sơn');
});
test('review storage failure does not invent an answer ID or prevent chat delivery', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'storage unavailable' }, { status: 503 }));
  t.mock.method(console, 'warn', () => {});
  assert.equal(await recordAnswer({ sessionId, question: 'Hỏi sơn', answer: 'Phản hồi vẫn được trả cho khách.' }), null);
});
test('sales assistance HTTP workflows validate selections, scope feedback, store handoff and enforce review permissions', async (t) => {
  const originalFetch = globalThis.fetch;
  const writes: Array<{ path: string; query: URLSearchParams; body: Record<string, unknown> }> = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === '127.0.0.1') return originalFetch(input, init);
    assert.ok(url.hostname.endsWith('.supabase.co'), 'Unexpected external request');
    const path = url.pathname, body = init?.body ? JSON.parse(String(init.body)) : null;
    if (body) writes.push({ path, query: url.searchParams, body });
    if (path.endsWith('/consume_api_rate_limit')) return Response.json([{ allowed: true, remaining: 20, retry_after_seconds: 0 }]);
    if (path.endsWith('/products')) {
      assert.equal(url.searchParams.get('status'), 'eq.active');
      assert.equal(url.searchParams.get('approval_status'), 'eq.approved');
      return Response.json(products);
    }
    if (path.endsWith('/chat_sessions')) return Response.json({ last_messages: [{ role: 'user', content: 'Tôi muốn sơn nhà 100 m²', created_at: '' }] });
    if (path.endsWith('/leads')) return Response.json(body ? { id: id1, code: 'STB-TEST', ...body } : [{ id: id1, code: 'STB-TEST' }]);
    if (path.endsWith('/chat_answer_reviews')) {
      if (init?.method === 'PATCH' && url.searchParams.has('session_id')) {
        assert.equal(url.searchParams.get('tenant_id'), `eq.${env.RAG_TENANT_ID}`);
        return Response.json(url.searchParams.get('session_id') === `eq.${sessionId}` ? { id: id1 } : null);
      }
      return Response.json(body ? { id: id1 } : []);
    }
    if (path.endsWith('/publish_chat_answer_review')) return Response.json(id1);
    if (path.endsWith('/rag_index_jobs')) return init?.method === 'POST' ? Response.json({ code: '23505', message: 'Already indexing' }, { status: 409 }) : Response.json({ id: id2, created_at: new Date().toISOString() });
    return Response.json(null);
  });
  const app = express(); app.use(express.json()); app.use('/chat', webChatRouter); app.use('/reviews', answerReviewRouter);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: unknown, role?: string, method = 'POST') => originalFetch(base+path, { method, headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${token(role)}` } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post('/chat/compare', { productIds: [id1, id1] })).status, 400);
  assert.equal((await post('/chat/compare', { productIds: [id1, '00000000-0000-4000-8000-000000000099'] })).status, 409);
  assert.equal((await post('/chat/compare', { productIds: [id1, id2, id1, id2] })).status, 400);
  const compared = await (await post('/chat/compare', { productIds: [id2, id1] })).json();
  assert.equal(compared.products[0].id, id2);
  assert.doesNotMatch(JSON.stringify(compared), /"price"|source_url/);
  assert.equal((await post('/chat/feedback', { sessionId, answerId: id1, rating: 'not_helpful' })).status, 200);
  assert.equal((await post('/chat/feedback', { sessionId, answerId: id1, rating: 'helpful' })).status, 200);
  const helpfulUpdate = writes.find((w) => w.body.customer_rating === 'helpful');
  assert.ok(helpfulUpdate && !('needs_review' in helpfulUpdate.body) && !('customer_comment' in helpfulUpdate.body));
  assert.equal((await post('/chat/feedback', { sessionId: 'web_00000000-0000-4000-8000-000000000099', answerId: id1, rating: 'not_helpful' })).status, 404);
  assert.equal((await originalFetch(base+'/reviews')).status, 401);
  assert.equal((await post(`/reviews/${id1}`, { status: 'draft' }, 'viewer', 'PATCH')).status, 403);
  assert.equal((await post(`/reviews/${id1}/publish`, {}, 'manager')).status, 400);
  const published = await (await post(`/reviews/${id1}/publish`, { confirmed: true }, 'manager')).json();
  assert.equal(published.documentId, id1);
  assert.equal((await post('/chat/lead', { sessionId, name: 'Khách thử', phone: '0912345678', need: 'Cần tư vấn sơn cho nhà', area: 'Thủ Đức', productIds: [id1, id2] })).status, 201);
  const lead = writes.find((w) => w.path.endsWith('/leads'));
  assert.match(String(lead?.body.handoff_summary), /100 m²/);
  assert.match(String(lead?.body.handoff_summary), /SON-0/);
  assert.equal((lead?.body.handoff_transcript as unknown[]).length, 1);
  const answerId = await recordAnswer({ sessionId, question: 'Hỏi sơn', answer: 'Chưa có dữ liệu', reason: 'no_data' });
  assert.ok(answerId);
  assert.ok(writes.some((w) => w.path.endsWith('/chat_answer_reviews') && w.body.reason === 'no_data' && w.body.needs_review === true));
});
