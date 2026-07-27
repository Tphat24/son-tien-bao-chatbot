import './_setup-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractVerifiedGtcPrice,
  relevanceScore,
  sanitizeKnowledgeForGtc
} from '../src/services/catalog.service.js';

test('GTC: đọc giá có nhãn rõ ràng', () => {
  assert.equal(
    extractVerifiedGtcPrice({ content: 'Giá tiêu chuẩn (GTC): 4.950.000đ' }),
    4_950_000
  );
});

test('GTC: với cặp giá giảm, chỉ lấy giá lớn hơn làm giá tiêu chuẩn', () => {
  assert.equal(
    extractVerifiedGtcPrice({ content: '702.000đ 1.560.000đ -55%' }),
    1_560_000
  );
});

test('GTC: không lấy một giá đơn lẻ trên trang đại lý', () => {
  assert.equal(
    extractVerifiedGtcPrice({
      title: 'Jotun WaterGuard - ĐL Tiến Bảo',
      content: 'Giá ĐL: 702.000đ',
      url: 'https://sontienbao.com/jotun-waterguard-dl.html'
    }),
    null
  );
});

test('GTC: trang danh mục có nhiều cặp giá không được gán nhầm một giá cho mọi sản phẩm', () => {
  assert.equal(
    extractVerifiedGtcPrice({
      title: 'Danh mục sản phẩm',
      content: '702.000đ 1.560.000đ -55% 328.500đ 730.000đ -55%'
    }),
    null
  );
});

test('Tài liệu gửi AI chỉ còn GTC đã xác thực, không còn giá đại lý', () => {
  const result = sanitizeKnowledgeForGtc({
    title: 'Jotun WaterGuard',
    content: 'Giá ĐL 702.000đ, giá tiêu chuẩn GTC: 1.560.000đ, giảm 55%',
    source_url: 'https://sontienbao.com/waterguard.html'
  });

  assert.match(result.content, /Giá tiêu chuẩn \(GTC\) đã xác thực: 1\.560\.000đ/);
  assert.doesNotMatch(result.content, /702\.000đ/);
  assert.doesNotMatch(result.content, /55%/);
});

test('Tìm kiếm: sản phẩm đúng model và công dụng xếp trên sản phẩm chỉ trùng hãng', () => {
  const exact = relevanceScore({
    query: 'Jotun WaterGuard chống thấm ngoài trời',
    title: 'Jotun WaterGuard',
    category: 'Sơn chống thấm ngoại thất',
    useCase: 'Chống thấm tường ngoài trời'
  });
  const unrelated = relevanceScore({
    query: 'Jotun WaterGuard chống thấm ngoài trời',
    title: 'Jotun Majestic',
    category: 'Sơn nội thất',
    useCase: 'Sơn phòng ngủ'
  });

  assert.ok(exact > unrelated, `Điểm đúng=${exact}, sai=${unrelated}`);
});

test('Tìm kiếm: hỏi nội thất không ưu tiên sản phẩm ngoại thất', () => {
  const interior = relevanceScore({
    query: 'sơn nội thất dễ lau chùi',
    title: 'Sơn nội thất Easy Wash',
    category: 'Sơn nội thất',
    useCase: 'Tường trong nhà dễ lau chùi'
  });
  const exterior = relevanceScore({
    query: 'sơn nội thất dễ lau chùi',
    title: 'Sơn ngoại thất Tough Shield',
    category: 'Sơn ngoại thất',
    useCase: 'Tường ngoài trời'
  });

  assert.ok(interior > exterior, `Điểm nội thất=${interior}, ngoại thất=${exterior}`);
});
