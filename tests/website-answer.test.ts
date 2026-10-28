import './_setup-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSafeReply, cleanReply } from '../src/services/ai.service.js';
import { appendConversationTurn } from '../src/services/conversation.service.js';
import { env } from '../src/config/env.js';

const detailedReply = [
  'Anh/Chị cần chọn sơn phù hợp với bề mặt và vị trí thi công.',
  ...Array.from({ length: 12 }, (_, i) => `${i + 1}. Kiểm tra dữ liệu kỹ thuật của sản phẩm, điều kiện bề mặt và hướng dẫn thi công trước khi áp dụng; không thay đổi định mức khi chưa có tài liệu xác nhận.`),
  'Lưu ý cuối: giữ đúng đơn vị m²/L/lớp; số lớp thực tế cần được đối chiếu tài liệu sản phẩm.'
].join('\n\n');
const knowledge = [{ title: 'Tài liệu đã duyệt', content: 'Chọn sơn theo bề mặt và hướng dẫn thi công của nhà sản xuất.', source_url: null }];

test('website preserves a complete detailed answer and sends an adequate output budget', async (t) => {
  let request: Record<string, any> | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    request = JSON.parse(String(init.body));
    return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: detailedReply }] }, finishReason: 'STOP' }] });
  });
  const reply = await generateSafeReply({ userText: 'Giải thích đầy đủ các bước và lưu ý.', products: [], knowledge, channel: 'website' });
  assert.equal(reply, detailedReply);
  assert.ok(reply.length > 900);
  assert.match(reply, /Lưu ý cuối: giữ đúng đơn vị/);
  assert.equal(request?.generationConfig.maxOutputTokens, env.AI_WEBSITE_MAX_OUTPUT_TOKENS);
  const prompt = request?.contents[0].parts[0].text as string;
  assert.doesNotMatch(prompt, /Tối đa 650 ký tự/);
  assert.match(prompt, /giải đáp lần lượt tất cả các ý khách hỏi/);
  assert.match(prompt, /Phân biệt rõ thông tin đã xác minh/);
  assert.match(prompt, /không dùng tài liệu khác chủ đề/);
});

test('Zalo retains its short output budget independently of website answers', async (t) => {
  let request: Record<string, any> | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    request = JSON.parse(String(init.body));
    return Response.json({ candidates: [{ content: { parts: [{ text: detailedReply }] }, finishReason: 'STOP' }] });
  });
  const reply = await generateSafeReply({ userText: 'Tư vấn sơn.', products: [], knowledge, channel: 'zalo' });
  assert.ok(reply.length <= 760);
  assert.equal(request?.generationConfig.maxOutputTokens, 420);
});

test('website discloses a token-truncated answer instead of presenting it as complete', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ candidates: [{
    content: { parts: [{ text: 'Phần hướng dẫn hiện có.' }] }, finishReason: 'MAX_TOKENS'
  }] }));
  const reply = await generateSafeReply({ userText: 'Giải thích chi tiết.', products: [], knowledge, channel: 'website' });
  assert.match(reply, /Nội dung đã chạm giới hạn độ dài/);
  assert.match(reply, /yêu cầu em trình bày tiếp/);
});

test('conversation memory preserves the final details and paragraphs of a long website answer', async (t) => {
  let stored: { last_messages: Array<{ role: string; content: string }> } | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit = {}) => {
    if (init.method === 'POST') {
      stored = JSON.parse(String(init.body));
      return Response.json(null);
    }
    return Response.json({ last_messages: [] });
  });
  await appendConversationTurn({ userId: 'web_test', role: 'assistant', content: detailedReply });
  assert.equal(stored?.last_messages[0]?.content, detailedReply);
});

test('website guard limit cuts at sentence boundaries across paragraphs', () => {
  const reply = cleanReply(detailedReply, 1300);
  assert.ok(reply.length <= 1300);
  assert.match(reply, /[.!?]$/);
  assert.ok(reply.includes('\n\n'));
});
