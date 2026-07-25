import type { ProductRow } from './catalog.service.js';

export interface PaintCalculation {
  liters: number;
  theoreticalLiters: number;
  coverageUsed: number;
  areaM2: number;
  coats: number;
  wastePercent: number;
  packages: Array<{ size: number; quantity: number }>;
  totalPackageVolume: number;
  excessVolume: number;
}

export type ProjectType =
  | 'townhouse'
  | 'villa'
  | 'apartment'
  | 'office'
  | 'factory'
  | 'other';

export type PaintScope = 'interior' | 'exterior' | 'both';
export type SurfaceCondition =
  | 'new_smooth'
  | 'new_rough'
  | 'old_good'
  | 'old_peeling'
  | 'damp_mold'
  | 'puttied';
export type ApplicationMethod = 'roller' | 'brush' | 'spray' | 'mixed';

export interface RoomDimensionInput {
  lengthM: number;
  widthM: number;
  heightM?: number;
  doorAreaM2?: number;
  windowAreaM2?: number;
  nonPaintAreaM2?: number;
}

export interface PaintSystemInput {
  enabled?: boolean;
  coats?: number;
  coverageM2PerUnitPerCoat?: number;
  packageSizes?: number[];
  label?: string;
}

export interface PuttySystemInput {
  enabled?: boolean;
  coats?: number;
  kgPerM2ForConfiguredCoats?: number;
  packageSizesKg?: number[];
  includeCeiling?: boolean;
  label?: string;
}

export interface PaintProjectInput {
  projectType?: ProjectType;
  scope?: PaintScope;
  floors?: number;
  lengthM?: number;
  widthM?: number;
  floorHeightM?: number;
  totalFloorAreaM2?: number;
  floorAreaPerFloorM2?: number;
  roomCount?: number;
  rooms?: RoomDimensionInput[];

  explicitInteriorWallAreaM2?: number;
  explicitExteriorWallAreaM2?: number;
  explicitCeilingAreaM2?: number;
  explicitPaintAreaM2?: number;

  doorAreaM2?: number;
  windowAreaM2?: number;
  glassAreaM2?: number;
  nonPaintAreaM2?: number;
  architecturalDetailAreaM2?: number;
  paintedCeilingFloors?: number;
  paintCeiling?: boolean;
  areaCoefficient?: number;

  isRepaint?: boolean;
  surfaceCondition?: SurfaceCondition;
  applicationMethod?: ApplicationMethod;
  complexDetails?: boolean;
  wastePercent?: number;

  putty?: PuttySystemInput;
  interiorPrimer?: PaintSystemInput;
  interiorFinish?: PaintSystemInput;
  exteriorPrimer?: PaintSystemInput;
  exteriorFinish?: PaintSystemInput;
  waterproof?: PaintSystemInput & { areaM2?: number; unit?: 'liter' | 'kg' };
}

export interface ProjectAreaResult {
  totalFloorAreaM2: number;
  interiorWallAreaM2: number;
  exteriorWallAreaM2: number;
  ceilingAreaM2: number;
  totalPaintAreaM2: number;
  method: 'explicit' | 'room_takeoff' | 'dimension_and_coefficient' | 'floor_coefficient';
  coefficientUsed?: number;
  estimated: boolean;
}

export interface PackagePlan {
  name: 'economy' | 'safe' | 'large_only';
  items: Array<{ size: number; quantity: number }>;
  totalQuantity: number;
  totalVolume: number;
  excess: number;
  excessPercent: number;
}

export interface MaterialEstimate {
  key:
    | 'putty'
    | 'interior_primer'
    | 'interior_finish'
    | 'exterior_primer'
    | 'exterior_finish'
    | 'waterproof';
  label: string;
  unit: 'liter' | 'kg';
  areaM2: number;
  coats: number;
  rate: number;
  rateLabel: string;
  theoreticalQuantity: number;
  wastePercent: number;
  actualQuantity: number;
  packagePlans: PackagePlan[];
}

export interface PaintProjectEstimate {
  areas: ProjectAreaResult;
  materials: MaterialEstimate[];
  assumptions: string[];
  warnings: string[];
  missingInformation: string[];
  accuracyNote: string;
}

const DEFAULT_PACKAGE_SIZES_L = [18, 10, 5, 1];
const DEFAULT_PUTTY_BAGS_KG = [40];

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return finitePositive(value) ? value : fallback;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Math.max(1, Math.round(positiveNumber(value, fallback)));
}

function nonNegative(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

function roundUp(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.ceil((value - 1e-9) * factor) / factor;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function uniqueSizes(packageSizes: number[]): number[] {
  return [...new Set(packageSizes.filter(finitePositive))].sort((a, b) => b - a);
}

function choosePackages(requiredQuantity: number, packageSizes: number[]): Array<{ size: number; quantity: number }> {
  const sizes = uniqueSizes(packageSizes);
  if (!sizes.length || requiredQuantity <= 0) return [];

  const scale = 10;
  const target = Math.ceil(requiredQuantity * scale);
  const scaled = sizes.map((size) => Math.max(1, Math.round(size * scale)));
  const maxSize = Math.max(...scaled);
  const limit = target + maxSize * 3;
  const best: Array<{ count: number; smallCount: number; prev: number; sizeIndex: number } | undefined> = new Array(limit + 1);
  best[0] = { count: 0, smallCount: 0, prev: -1, sizeIndex: -1 };

  for (let volume = 0; volume <= limit; volume += 1) {
    const state = best[volume];
    if (!state) continue;
    scaled.forEach((size, index) => {
      const next = volume + size;
      if (next > limit) return;
      const candidate = {
        count: state.count + 1,
        smallCount: state.smallCount + (index === 0 ? 0 : 1),
        prev: volume,
        sizeIndex: index
      };
      const current = best[next];
      if (
        !current ||
        candidate.count < current.count ||
        (candidate.count === current.count && candidate.smallCount < current.smallCount)
      ) {
        best[next] = candidate;
      }
    });
  }

  let selected = -1;
  for (let volume = target; volume <= limit; volume += 1) {
    const state = best[volume];
    if (!state) continue;
    if (selected === -1) {
      selected = volume;
      continue;
    }
    const selectedState = best[selected]!;
    if (
      volume < selected ||
      (volume === selected && state.count < selectedState.count) ||
      (volume === selected && state.count === selectedState.count && state.smallCount < selectedState.smallCount)
    ) {
      selected = volume;
    }
    if (selected === target) break;
  }

  if (selected < 0) return [];

  const counts = new Array<number>(sizes.length).fill(0);
  let cursor = selected;
  while (cursor > 0) {
    const state = best[cursor];
    if (!state || state.sizeIndex < 0) break;
    counts[state.sizeIndex] = (counts[state.sizeIndex] ?? 0) + 1;
    cursor = state.prev;
  }

  return sizes
    .map((size, index) => ({ size, quantity: counts[index] ?? 0 }))
    .filter((item) => item.quantity > 0);
}

function packagePlan(
  name: PackagePlan['name'],
  requiredQuantity: number,
  packageSizes: number[],
  reserveFactor = 1
): PackagePlan | null {
  const sizes = uniqueSizes(packageSizes);
  if (!sizes.length || requiredQuantity <= 0) return null;

  const target = requiredQuantity * reserveFactor;
  let items: Array<{ size: number; quantity: number }>;

  if (name === 'large_only') {
    const largest = sizes[0];
    if (largest === undefined) return null;
    items = [{ size: largest, quantity: Math.ceil(target / largest) }];
  } else {
    items = choosePackages(target, sizes);
  }

  const totalVolume = items.reduce((sum, item) => sum + item.size * item.quantity, 0);
  const excess = Math.max(0, totalVolume - requiredQuantity);
  return {
    name,
    items,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    totalVolume: round(totalVolume, 1),
    excess: round(excess, 1),
    excessPercent: requiredQuantity > 0 ? round((excess / requiredQuantity) * 100, 1) : 0
  };
}

function buildPackagePlans(requiredQuantity: number, packageSizes: number[]): PackagePlan[] {
  const candidates = [
    packagePlan('economy', requiredQuantity, packageSizes, 1),
    packagePlan('safe', requiredQuantity, packageSizes, 1.05),
    packagePlan('large_only', requiredQuantity, packageSizes, 1)
  ].filter((plan): plan is PackagePlan => Boolean(plan));

  const seen = new Set<string>();
  return candidates.filter((plan) => {
    const signature = plan.items.map((item) => `${item.quantity}x${item.size}`).join('+');
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

export function calculatePaint(input: {
  areaM2: number;
  coats: number;
  wastePercent: number;
  product: ProductRow;
}): PaintCalculation {
  if (input.areaM2 <= 0 || input.coats <= 0) throw new Error('invalid_calculation_input');
  const coverage = input.product.coverage_min ?? input.product.coverage_max;
  if (!coverage || coverage <= 0) throw new Error('missing_structured_coverage');
  const waste = Math.min(Math.max(input.wastePercent, 0), 30);
  const theoreticalLiters = input.areaM2 * input.coats / coverage;
  const liters = theoreticalLiters * (1 + waste / 100);
  const packageSizes = input.product.package_sizes ?? [];
  const packages = choosePackages(liters, packageSizes);
  const totalPackageVolume = packages.reduce((sum, item) => sum + item.size * item.quantity, 0);
  return {
    liters: roundUp(liters, 1),
    theoreticalLiters: roundUp(theoreticalLiters, 1),
    coverageUsed: coverage,
    areaM2: input.areaM2,
    coats: input.coats,
    wastePercent: waste,
    packages,
    totalPackageVolume: round(totalPackageVolume, 1),
    excessVolume: round(Math.max(0, totalPackageVolume - liters), 1)
  };
}

function defaultCoefficient(projectType: ProjectType, roomCount?: number): number {
  if (projectType === 'villa') return 4.25;
  if (projectType === 'office') return 3.2;
  if (projectType === 'factory') return 3;
  if (projectType === 'apartment') return 3.5;
  if ((roomCount ?? 0) >= 6) return 4;
  return 3.5;
}

export function suggestWastePercent(input: Pick<PaintProjectInput, 'surfaceCondition' | 'applicationMethod' | 'complexDetails'>): number {
  let waste = 8;
  switch (input.applicationMethod) {
    case 'brush':
      waste = 10;
      break;
    case 'spray':
      waste = 15;
      break;
    case 'mixed':
      waste = 12;
      break;
    default:
      waste = 8;
  }

  if (input.surfaceCondition === 'old_peeling' || input.surfaceCondition === 'damp_mold' || input.surfaceCondition === 'new_rough') {
    waste = Math.max(waste, 12);
  }
  if (input.complexDetails) waste = Math.max(waste, 15);
  return waste;
}

function calculateAreas(input: PaintProjectInput, assumptions: string[], warnings: string[], missing: string[]): ProjectAreaResult {
  const scope = input.scope ?? 'interior';
  const floors = finitePositive(input.floors) ? Math.max(1, Math.round(input.floors)) : 1;
  const height = finitePositive(input.floorHeightM) ? input.floorHeightM : 3.3;
  const openings = nonNegative(input.doorAreaM2) + nonNegative(input.windowAreaM2) + nonNegative(input.glassAreaM2);
  const nonPaint = nonNegative(input.nonPaintAreaM2);
  const detailArea = nonNegative(input.architecturalDetailAreaM2);

  if (!finitePositive(input.floors)) assumptions.push('Chưa có số tầng; tạm tính 1 tầng.');
  if (!finitePositive(input.floorHeightM) && finitePositive(input.lengthM) && finitePositive(input.widthM)) {
    assumptions.push('Chưa có chiều cao tầng; tạm tính 3,3 m/tầng.');
  }

  const baseFloorArea = finitePositive(input.totalFloorAreaM2)
    ? input.totalFloorAreaM2
    : finitePositive(input.floorAreaPerFloorM2)
      ? input.floorAreaPerFloorM2 * floors
      : finitePositive(input.lengthM) && finitePositive(input.widthM)
        ? input.lengthM * input.widthM * floors
        : 0;

  let interiorWallArea = nonNegative(input.explicitInteriorWallAreaM2);
  let exteriorWallArea = nonNegative(input.explicitExteriorWallAreaM2);
  let ceilingArea = nonNegative(input.explicitCeilingAreaM2);
  let method: ProjectAreaResult['method'] = 'explicit';
  let coefficientUsed: number | undefined;
  let estimated = false;

  if (finitePositive(input.explicitPaintAreaM2) && !interiorWallArea && !exteriorWallArea && !ceilingArea) {
    if (scope === 'exterior') exteriorWallArea = input.explicitPaintAreaM2;
    else interiorWallArea = input.explicitPaintAreaM2;
    assumptions.push('Dùng trực tiếp diện tích sơn do người dùng cung cấp.');
  }

  if ((scope === 'interior' || scope === 'both') && !interiorWallArea) {
    if (input.rooms?.length) {
      method = 'room_takeoff';
      interiorWallArea = input.rooms.reduce((sum, room) => {
        if (!finitePositive(room.lengthM) || !finitePositive(room.widthM)) return sum;
        const roomHeight = finitePositive(room.heightM) ? room.heightM : height;
        const gross = 2 * (room.lengthM + room.widthM) * roomHeight;
        return sum + Math.max(0, gross - nonNegative(room.doorAreaM2) - nonNegative(room.windowAreaM2) - nonNegative(room.nonPaintAreaM2));
      }, 0);
    } else if (baseFloorArea > 0) {
      method = finitePositive(input.lengthM) && finitePositive(input.widthM) ? 'dimension_and_coefficient' : 'floor_coefficient';
      coefficientUsed = finitePositive(input.areaCoefficient)
        ? input.areaCoefficient
        : defaultCoefficient(input.projectType ?? 'townhouse', input.roomCount);
      const estimatedInteriorTotal = Math.max(0, baseFloorArea * coefficientUsed - openings - nonPaint);
      const paintCeiling = input.paintCeiling ?? true;
      if (paintCeiling && !ceilingArea) {
        const ceilingFloors = finitePositive(input.paintedCeilingFloors)
          ? Math.min(floors, Math.max(1, Math.round(input.paintedCeilingFloors)))
          : floors;
        ceilingArea = baseFloorArea * (ceilingFloors / floors);
      }
      interiorWallArea = Math.max(0, estimatedInteriorTotal - ceilingArea);
      estimated = true;
      assumptions.push(`Diện tích nội thất ước tính theo hệ số ${coefficientUsed} × diện tích sàn.`);
      warnings.push('Phương pháp hệ số chỉ dùng để ước tính nhanh; sai số thường khoảng 10–25%.');
    } else {
      missing.push('diện tích sàn hoặc kích thước dài × rộng');
    }
  }

  if ((scope === 'exterior' || scope === 'both') && !exteriorWallArea) {
    if (finitePositive(input.lengthM) && finitePositive(input.widthM)) {
      const perimeter = 2 * (input.lengthM + input.widthM);
      const gross = perimeter * height * floors;
      exteriorWallArea = Math.max(0, gross - openings - nonPaint + detailArea);
      if (detailArea > 0) assumptions.push('Đã cộng diện tích ban công/cột/dầm/chi tiết kiến trúc do người dùng cung cấp.');
    } else if (scope === 'exterior') {
      missing.push('chiều dài và chiều rộng công trình để tính tường ngoài');
    }
  }

  if ((input.paintCeiling ?? true) && !ceilingArea && baseFloorArea > 0 && (scope === 'interior' || scope === 'both')) {
    ceilingArea = baseFloorArea;
  }

  const totalPaintArea = interiorWallArea + exteriorWallArea + ceilingArea;
  return {
    totalFloorAreaM2: round(baseFloorArea, 1),
    interiorWallAreaM2: round(interiorWallArea, 1),
    exteriorWallAreaM2: round(exteriorWallArea, 1),
    ceilingAreaM2: round(ceilingArea, 1),
    totalPaintAreaM2: round(totalPaintArea, 1),
    method,
    ...(coefficientUsed !== undefined ? { coefficientUsed } : {}),
    estimated
  };
}

function materialFromCoverage(input: {
  key: MaterialEstimate['key'];
  label: string;
  areaM2: number;
  coats: number;
  coverage: number;
  wastePercent: number;
  packageSizes: number[];
  unit?: 'liter' | 'kg';
}): MaterialEstimate | null {
  if (input.areaM2 <= 0 || input.coats <= 0 || input.coverage <= 0) return null;
  const theoretical = input.areaM2 * input.coats / input.coverage;
  const actual = theoretical * (1 + input.wastePercent / 100);
  return {
    key: input.key,
    label: input.label,
    unit: input.unit ?? 'liter',
    areaM2: round(input.areaM2, 1),
    coats: input.coats,
    rate: input.coverage,
    rateLabel: `m²/${input.unit === 'kg' ? 'kg' : 'lít'}/lớp`,
    theoreticalQuantity: roundUp(theoretical, 1),
    wastePercent: input.wastePercent,
    actualQuantity: roundUp(actual, 1),
    packagePlans: buildPackagePlans(actual, input.packageSizes)
  };
}

function puttyMaterial(input: {
  areaM2: number;
  coats: number;
  kgPerM2: number;
  wastePercent: number;
  packageSizes: number[];
  label: string;
}): MaterialEstimate | null {
  if (input.areaM2 <= 0 || input.coats <= 0 || input.kgPerM2 <= 0) return null;
  const theoretical = input.areaM2 * input.kgPerM2;
  const actual = theoretical * (1 + input.wastePercent / 100);
  return {
    key: 'putty',
    label: input.label,
    unit: 'kg',
    areaM2: round(input.areaM2, 1),
    coats: input.coats,
    rate: input.kgPerM2,
    rateLabel: `kg/m² cho ${input.coats} lớp`,
    theoreticalQuantity: roundUp(theoretical, 1),
    wastePercent: input.wastePercent,
    actualQuantity: roundUp(actual, 1),
    packagePlans: buildPackagePlans(actual, input.packageSizes)
  };
}

export function calculateProjectPaintEstimate(input: PaintProjectInput): PaintProjectEstimate {
  const assumptions: string[] = [];
  const warnings: string[] = [];
  const missingInformation: string[] = [];
  const areas = calculateAreas(input, assumptions, warnings, missingInformation);
  const scope = input.scope ?? 'interior';
  if (!input.scope) assumptions.push('Chưa xác định nội thất hay ngoại thất; tạm tính hệ nội thất.');
  if (input.paintCeiling === undefined && (scope === 'interior' || scope === 'both')) assumptions.push('Chưa xác định trần; tạm tính có sơn trần.');
  if (input.putty?.enabled === undefined) missingInformation.push('có sử dụng bột bả hay không');
  if (input.surfaceCondition === undefined) missingInformation.push('tình trạng bề mặt tường');
  if (input.applicationMethod === undefined) assumptions.push('Chưa có phương pháp thi công; tạm tính thi công bằng con lăn.');
  const wastePercent = Number.isFinite(input.wastePercent)
    ? Math.min(30, Math.max(0, input.wastePercent ?? 0))
    : suggestWastePercent(input);

  if (!Number.isFinite(input.wastePercent)) {
    assumptions.push(`Tạm dùng hao hụt ${wastePercent}% theo tình trạng bề mặt và phương pháp thi công.`);
  }

  const materials: MaterialEstimate[] = [];
  const interiorArea = areas.interiorWallAreaM2 + areas.ceilingAreaM2;
  const exteriorArea = areas.exteriorWallAreaM2;

  const usePutty = input.putty?.enabled ?? false;
  if (usePutty) {
    const puttyCoats = positiveInteger(input.putty?.coats, 2);
    const puttyRate = positiveNumber(input.putty?.kgPerM2ForConfiguredCoats, 1.2);
    const puttyArea = areas.interiorWallAreaM2 + areas.exteriorWallAreaM2 + ((input.putty?.includeCeiling ?? true) ? areas.ceilingAreaM2 : 0);
    assumptions.push(`Bột bả tạm tính ${puttyRate} kg/m² cho ${puttyCoats} lớp nếu chưa có định mức sản phẩm.`);
    const result = puttyMaterial({
      areaM2: puttyArea,
      coats: puttyCoats,
      kgPerM2: puttyRate,
      wastePercent,
      packageSizes: input.putty?.packageSizesKg ?? DEFAULT_PUTTY_BAGS_KG,
      label: input.putty?.label ?? 'Bột bả'
    });
    if (result) materials.push(result);
  }

  if (scope === 'interior' || scope === 'both') {
    if (input.interiorPrimer?.enabled ?? true) {
      const result = materialFromCoverage({
        key: 'interior_primer',
        label: input.interiorPrimer?.label ?? 'Sơn lót nội thất',
        areaM2: interiorArea,
        coats: positiveInteger(input.interiorPrimer?.coats, 1),
        coverage: positiveNumber(input.interiorPrimer?.coverageM2PerUnitPerCoat, 10),
        wastePercent,
        packageSizes: input.interiorPrimer?.packageSizes ?? DEFAULT_PACKAGE_SIZES_L
      });
      if (!finitePositive(input.interiorPrimer?.coats)) assumptions.push('Sơn lót nội thất tạm tính 1 lớp.');
      if (!finitePositive(input.interiorPrimer?.coverageM2PerUnitPerCoat)) assumptions.push('Sơn lót nội thất tạm tính 10 m²/lít/lớp.');
      if (result) materials.push(result);
    }

    const result = materialFromCoverage({
      key: 'interior_finish',
      label: input.interiorFinish?.label ?? 'Sơn phủ nội thất',
      areaM2: interiorArea,
      coats: positiveInteger(input.interiorFinish?.coats, 2),
      coverage: positiveNumber(input.interiorFinish?.coverageM2PerUnitPerCoat, 12),
      wastePercent,
      packageSizes: input.interiorFinish?.packageSizes ?? DEFAULT_PACKAGE_SIZES_L
    });
    if (!finitePositive(input.interiorFinish?.coats)) assumptions.push('Sơn phủ nội thất tạm tính 2 lớp.');
    if (!finitePositive(input.interiorFinish?.coverageM2PerUnitPerCoat)) assumptions.push('Sơn phủ nội thất tạm tính 12 m²/lít/lớp.');
    if (result) materials.push(result);
  }

  if (scope === 'exterior' || scope === 'both') {
    if (input.exteriorPrimer?.enabled ?? true) {
      const result = materialFromCoverage({
        key: 'exterior_primer',
        label: input.exteriorPrimer?.label ?? 'Sơn lót ngoại thất',
        areaM2: exteriorArea,
        coats: positiveInteger(input.exteriorPrimer?.coats, 1),
        coverage: positiveNumber(input.exteriorPrimer?.coverageM2PerUnitPerCoat, 10),
        wastePercent,
        packageSizes: input.exteriorPrimer?.packageSizes ?? DEFAULT_PACKAGE_SIZES_L
      });
      if (!finitePositive(input.exteriorPrimer?.coats)) assumptions.push('Sơn lót ngoại thất tạm tính 1 lớp.');
      if (!finitePositive(input.exteriorPrimer?.coverageM2PerUnitPerCoat)) assumptions.push('Sơn lót ngoại thất tạm tính 10 m²/lít/lớp.');
      if (result) materials.push(result);
    }

    const result = materialFromCoverage({
      key: 'exterior_finish',
      label: input.exteriorFinish?.label ?? 'Sơn phủ ngoại thất',
      areaM2: exteriorArea,
      coats: positiveInteger(input.exteriorFinish?.coats, 2),
      coverage: positiveNumber(input.exteriorFinish?.coverageM2PerUnitPerCoat, 10),
      wastePercent,
      packageSizes: input.exteriorFinish?.packageSizes ?? DEFAULT_PACKAGE_SIZES_L
    });
    if (!finitePositive(input.exteriorFinish?.coats)) assumptions.push('Sơn phủ ngoại thất tạm tính 2 lớp.');
    if (!finitePositive(input.exteriorFinish?.coverageM2PerUnitPerCoat)) assumptions.push('Sơn phủ ngoại thất tạm tính 10 m²/lít/lớp.');
    if (result) materials.push(result);
  }

  if (input.waterproof?.enabled) {
    const waterproofArea = nonNegative(input.waterproof.areaM2);
    if (waterproofArea <= 0) {
      missingInformation.push('diện tích khu vực chống thấm');
      warnings.push('Chống thấm phải tính riêng từng khu vực; chưa cộng chung vào sơn tường.');
    } else {
      const unit = input.waterproof.unit ?? 'liter';
      const coverage = positiveNumber(input.waterproof.coverageM2PerUnitPerCoat, unit === 'kg' ? 3 : 6);
      const result = materialFromCoverage({
        key: 'waterproof',
        label: input.waterproof.label ?? 'Chống thấm',
        areaM2: waterproofArea,
        coats: positiveInteger(input.waterproof.coats, 2),
        coverage,
        wastePercent,
        packageSizes: input.waterproof.packageSizes ?? (unit === 'kg' ? [20, 5] : DEFAULT_PACKAGE_SIZES_L),
        unit
      });
      if (!finitePositive(input.waterproof.coverageM2PerUnitPerCoat)) assumptions.push(`Chống thấm tạm tính ${coverage} m²/${unit === 'kg' ? 'kg' : 'lít'}/lớp.`);
      if (result) materials.push(result);
    }
  }

  if (areas.totalPaintAreaM2 <= 0) warnings.push('Chưa đủ dữ liệu để xác định diện tích sơn.');
  if (input.isRepaint && input.surfaceCondition === 'old_peeling') {
    warnings.push('Tường cũ bong tróc cần cạo bỏ lớp yếu, xử lý nứt/ẩm mốc và bả vá trước khi chốt vật tư.');
  }
  if (input.surfaceCondition === 'damp_mold') {
    warnings.push('Cần xử lý nguồn ẩm và chống thấm trước; không nên chỉ sơn phủ che bề mặt.');
  }

  return {
    areas,
    materials,
    assumptions: [...new Set(assumptions)],
    warnings: [...new Set(warnings)],
    missingInformation: [...new Set(missingInformation)],
    accuracyNote: areas.estimated
      ? 'Ước tính nhanh theo hệ số; sai số dự kiến 10–25%. Có bản vẽ/kích thước thực tế thì nên bóc tách lại từng khu vực.'
      : 'Kết quả dự toán vật tư; định mức thực tế vẫn ưu tiên tài liệu kỹ thuật của sản phẩm và tình trạng bề mặt tại công trình.'
  };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);
}

function planText(plan: PackagePlan, unit: 'liter' | 'kg'): string {
  const unitLabel = unit === 'kg' ? 'kg' : 'L';
  const items = plan.items.map((item) => `${item.quantity}×${formatNumber(item.size)}${unitLabel}`).join(' + ');
  return `${items} = ${formatNumber(plan.totalVolume)}${unitLabel}, dư ${formatNumber(plan.excess)}${unitLabel} (${formatNumber(plan.excessPercent)}%)`;
}

export function formatProjectPaintEstimate(estimate: PaintProjectEstimate): string {
  if (estimate.areas.totalPaintAreaM2 <= 0) {
    const missing = estimate.missingInformation.length
      ? ` Cần bổ sung: ${estimate.missingInformation.join(', ')}.`
      : '';
    return `Em chưa đủ dữ liệu để tính diện tích sơn.${missing}`;
  }

  const lines: string[] = [
    'DỰ TOÁN LƯỢNG SƠN SƠ BỘ',
    `Diện tích: tường trong ${formatNumber(estimate.areas.interiorWallAreaM2)}m²; trần ${formatNumber(estimate.areas.ceilingAreaM2)}m²; tường ngoài ${formatNumber(estimate.areas.exteriorWallAreaM2)}m²; tổng ${formatNumber(estimate.areas.totalPaintAreaM2)}m².`,
    '',
    'Hạng mục | Diện tích | Lớp | Định mức | Lý thuyết | Hao hụt | Thực tế'
  ];

  for (const material of estimate.materials) {
    const unit = material.unit === 'kg' ? 'kg' : 'L';
    lines.push(
      `${material.label} | ${formatNumber(material.areaM2)}m² | ${material.coats} | ${formatNumber(material.rate)} ${material.rateLabel} | ${formatNumber(material.theoreticalQuantity)}${unit} | ${material.wastePercent}% | ${formatNumber(material.actualQuantity)}${unit}`
    );
    const economy = material.packagePlans.find((plan) => plan.name === 'economy');
    const safe = material.packagePlans.find((plan) => plan.name === 'safe');
    const largeOnly = material.packagePlans.find((plan) => plan.name === 'large_only');
    if (economy) lines.push(`  Mua tiết kiệm: ${planText(economy, material.unit)}.`);
    if (safe) lines.push(`  Mua an toàn: ${planText(safe, material.unit)}.`);
    if (largeOnly) lines.push(`  Chỉ thùng/bao lớn: ${planText(largeOnly, material.unit)}.`);
  }

  if (estimate.assumptions.length) lines.push(`Giả định: ${estimate.assumptions.join(' ')}`);
  if (estimate.warnings.length) lines.push(`Lưu ý: ${estimate.warnings.join(' ')}`);
  if (estimate.missingInformation.length) lines.push(`Để chính xác hơn, vui lòng bổ sung: ${estimate.missingInformation.join(', ')}.`);
  lines.push(estimate.accuracyNote);
  return lines.join('\n');
}
