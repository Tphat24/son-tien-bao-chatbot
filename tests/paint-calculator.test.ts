import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePaint } from '../src/services/paint-calculator.service.js';
import type { ProductRow } from '../src/services/catalog.service.js';

/**
 * Unit test cho máy tính lượng sơn (mục 3.2 + 23).
 *
 * Nguyên tắc kiểm thử:
 *  - Công thức: liters = areaM2 * coats / coverage * (1 + waste/100).
 *  - KHÔNG được tự tạo định mức: sản phẩm thiếu coverage phải ném lỗi.
 *  - Hao hụt bị chặn ở 0..30%.
 *  - Chọn quy cách đóng gói tối thiểu số thùng/lon mà vẫn đủ.
 */

function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'p1',
    sku: 'TEST-SKU',
    name: 'Sơn test',
    brand: 'BrandX',
    category: 'noi that',
    description: null,
    use_case: null,
    coverage_text: null,
    coverage_min: 10, // 1 lít phủ 10 m²/lớp
    coverage_max: 12,
    recommended_coats: 2,
    package_text: null,
    package_sizes: [18, 5, 1],
    price: 100000,
    image_url: null,
    source_url: null,
    ...overrides
  };
}

test('tính đúng số lít theo công thức cơ bản (không hao hụt)', () => {
  const result = calculatePaint({ areaM2: 100, coats: 2, wastePercent: 0, product: makeProduct() });
  // 100 * 2 / 10 = 20 lít
  assert.equal(result.coverageUsed, 10);
  assert.equal(result.liters, 20);
});

test('áp dụng đúng tỷ lệ hao hụt', () => {
  const result = calculatePaint({ areaM2: 100, coats: 2, wastePercent: 10, product: makeProduct() });
  // 20 * 1.1 = 22 lít
  assert.equal(result.liters, 22);
  assert.equal(result.wastePercent, 10);
});

test('hao hụt bị chặn tối đa 30%', () => {
  const result = calculatePaint({ areaM2: 100, coats: 2, wastePercent: 99, product: makeProduct() });
  assert.equal(result.wastePercent, 30);
});

test('hao hụt âm được đưa về 0', () => {
  const result = calculatePaint({ areaM2: 100, coats: 2, wastePercent: -5, product: makeProduct() });
  assert.equal(result.wastePercent, 0);
});

test('ưu tiên coverage_min làm định mức', () => {
  const result = calculatePaint({
    areaM2: 60,
    coats: 1,
    wastePercent: 0,
    product: makeProduct({ coverage_min: 12, coverage_max: 20 })
  });
  assert.equal(result.coverageUsed, 12);
  assert.equal(result.liters, 5);
});

test('KHÔNG tự tạo định mức: sản phẩm thiếu coverage phải ném lỗi', () => {
  assert.throws(
    () => calculatePaint({ areaM2: 100, coats: 2, wastePercent: 0, product: makeProduct({ coverage_min: null, coverage_max: null }) }),
    /missing_structured_coverage/
  );
});

test('diện tích <= 0 ném lỗi', () => {
  assert.throws(
    () => calculatePaint({ areaM2: 0, coats: 2, wastePercent: 0, product: makeProduct() }),
    /invalid_calculation_input/
  );
});

test('số lớp <= 0 ném lỗi', () => {
  assert.throws(
    () => calculatePaint({ areaM2: 100, coats: 0, wastePercent: 0, product: makeProduct() }),
    /invalid_calculation_input/
  );
});

test('chọn quy cách đóng gói đủ lượng cần', () => {
  const result = calculatePaint({ areaM2: 100, coats: 2, wastePercent: 0, product: makeProduct() });
  // cần 20 lít, có thùng 18 + 5 + 1 → tổng phải >= 20
  assert.ok(result.totalPackageVolume >= result.liters, 'tổng quy cách phải đủ lượng cần');
});

test('không có quy cách đóng gói thì trả mảng rỗng', () => {
  const result = calculatePaint({ areaM2: 100, coats: 2, wastePercent: 0, product: makeProduct({ package_sizes: [] }) });
  assert.deepEqual(result.packages, []);
});

test('làm tròn lít lên 1 chữ số thập phân', () => {
  const result = calculatePaint({
    areaM2: 33,
    coats: 1,
    wastePercent: 0,
    product: makeProduct({ coverage_min: 7 })
  });
  // 33/7 = 4.714... → ceil tới 0.1 = 4.8
  assert.equal(result.liters, 4.8);
});
