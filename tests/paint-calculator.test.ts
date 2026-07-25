import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePaint,
  calculateProjectPaintEstimate,
  formatProjectPaintEstimate
} from '../src/services/paint-calculator.service.js';
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


test('ước tính nhà ở theo diện tích sàn không lấy trực tiếp diện tích sàn làm diện tích sơn', () => {
  const result = calculateProjectPaintEstimate({
    projectType: 'townhouse',
    scope: 'interior',
    totalFloorAreaM2: 200,
    floors: 2,
    paintCeiling: true,
    putty: { enabled: true },
    wastePercent: 10
  });
  assert.equal(result.areas.totalFloorAreaM2, 200);
  assert.equal(result.areas.totalPaintAreaM2, 700);
  assert.equal(result.areas.ceilingAreaM2, 200);
  assert.equal(result.areas.interiorWallAreaM2, 500);
  assert.ok(result.warnings.some((warning) => warning.includes('10–25%')));
});

test('bóc tách tường ngoài theo chu vi × tổng chiều cao và trừ cửa', () => {
  const result = calculateProjectPaintEstimate({
    scope: 'exterior',
    lengthM: 20,
    widthM: 5,
    floors: 2,
    floorHeightM: 3.5,
    doorAreaM2: 10,
    windowAreaM2: 20,
    architecturalDetailAreaM2: 5,
    wastePercent: 10
  });
  // Chu vi 50 × cao 7 = 350; trừ 30; cộng 5 = 325m².
  assert.equal(result.areas.exteriorWallAreaM2, 325);
});

test('tính riêng bột bả theo kg và không quy đổi sang lít', () => {
  const result = calculateProjectPaintEstimate({
    scope: 'interior',
    explicitPaintAreaM2: 300,
    paintCeiling: false,
    putty: {
      enabled: true,
      coats: 2,
      kgPerM2ForConfiguredCoats: 1.2,
      packageSizesKg: [40]
    },
    interiorPrimer: { enabled: false },
    interiorFinish: { coats: 2, coverageM2PerUnitPerCoat: 12, packageSizes: [18, 5, 1] },
    wastePercent: 10
  });
  const putty = result.materials.find((item) => item.key === 'putty');
  assert.ok(putty);
  assert.equal(putty.unit, 'kg');
  assert.equal(putty.actualQuantity, 396);
  assert.equal(putty.packagePlans[0]?.items[0]?.quantity, 10);
});

test('đưa ra tối đa ba phương án mua và không làm tròn xuống', () => {
  const result = calculateProjectPaintEstimate({
    scope: 'interior',
    explicitPaintAreaM2: 700,
    paintCeiling: false,
    interiorPrimer: { enabled: true, coats: 1, coverageM2PerUnitPerCoat: 10, packageSizes: [18, 10, 5, 1] },
    interiorFinish: { coats: 2, coverageM2PerUnitPerCoat: 12, packageSizes: [18, 10, 5, 1] },
    wastePercent: 10
  });
  const finish = result.materials.find((item) => item.key === 'interior_finish');
  assert.ok(finish);
  assert.equal(finish.actualQuantity, 128.4);
  assert.ok(finish.packagePlans.length <= 3);
  for (const plan of finish.packagePlans) assert.ok(plan.totalVolume >= finish.actualQuantity);
});

test('định dạng kết quả có công thức, giả định và phương án mua', () => {
  const result = calculateProjectPaintEstimate({
    scope: 'interior',
    totalFloorAreaM2: 100,
    putty: { enabled: true },
    wastePercent: 10
  });
  const text = formatProjectPaintEstimate(result);
  assert.match(text, /DỰ TOÁN LƯỢNG SƠN/);
  assert.match(text, /Mua tiết kiệm/);
  assert.match(text, /Giả định/);
});
