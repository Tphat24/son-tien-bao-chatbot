import './_setup-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSafeReply } from '../src/services/ai.service.js';
import { buildImageReply, conditionLabel, type VisionResult } from '../src/services/vision.service.js';

/**
 * Kiểm thử GUARDRAIL AI (yêu cầu mục 8 + 23).
 *
 * Mục tiêu: xác nhận các cơ chế chống bịa & an toàn hoạt động mà KHÔNG cần
 * gọi Gemini thật. Ta test các nhánh tất định:
 *  - Không có dữ liệu sản phẩm/website => trả câu "chưa có dữ liệu" (không bịa).
 *  - Câu trả lời từ ảnh LUÔN kèm cảnh báo sơ bộ + mời nhân viên kiểm tra.
 *  - Nhãn tình trạng lạ (do AI bịa) bị loại khỏi câu trả lời.
 */

test('generateSafeReply: không có dữ liệu thì trả câu "chưa tìm thấy", không bịa sản phẩm', async () => {
  const reply = await generateSafeReply({
    userText: 'Sơn ABC giá bao nhiêu?',
    products: [],
    knowledge: []
  });

  // Phải là câu an toàn, có hotline; tuyệt đối không chứa giá bịa.
  assert.match(reply, /chưa tìm thấy thông tin xác thực/i);
  assert.match(reply, /hotline/i);
  assert.doesNotMatch(reply, /\d{4,}\s*(đ|vnd|đồng)/i);
});

test('buildImageReply: luôn kèm cảnh báo sơ bộ và mời nhân viên kiểm tra thực tế', () => {
  const result: VisionResult = {
    observation: 'Em thấy bề mặt tường có mảng loang màu.',
    conditions: ['tham_nuoc'],
    confidence: 'medium'
  };
  const reply = buildImageReply(result);

  assert.match(reply, /sơ bộ/i);
  assert.match(reply, /kiểm tra thực tế/i);
  assert.match(reply, /Ẩm|thấm/i); // nhãn hợp lệ được diễn giải
});

test('buildImageReply: khi không quan sát rõ thì không liệt kê tình trạng cụ thể', () => {
  const result: VisionResult = {
    observation: 'Em chưa quan sát rõ tình trạng bề mặt.',
    conditions: ['khong_ro'],
    confidence: 'low'
  };
  const reply = buildImageReply(result);

  assert.doesNotMatch(reply, /dấu hiệu:/i); // không bịa dấu hiệu khi khong_ro
  assert.match(reply, /kiểm tra thực tế/i);
});

test('conditionLabel: nhãn lạ (AI bịa) trả về nguyên trạng, không có nhãn tiếng Việt giả', () => {
  assert.equal(conditionLabel('tham_nuoc'), 'Ẩm / thấm nước / ố');
  // Nhãn không thuộc danh sách đóng => trả nguyên key, không tự chế mô tả.
  assert.equal(conditionLabel('san_pham_sieu_ben'), 'san_pham_sieu_ben');
});
