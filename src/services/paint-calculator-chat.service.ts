import type { ConversationTurn } from './conversation.service.js';
import {
  calculateProjectPaintEstimate,
  formatProjectPaintEstimate,
  type ApplicationMethod,
  type PaintProjectInput,
  type PaintScope,
  type ProjectType,
  type SurfaceCondition
} from './paint-calculator.service.js';
import { normalizeText } from '../utils/text.js';

export type PaintCalculatorChatResult = {
  handled: boolean;
  reply?: string;
  handoffRecommended?: boolean;
};

function numberValue(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : undefined;
}

function firstNumber(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = numberValue(match?.[1]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function has(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

export function isPaintCalculationIntent(text: string): boolean {
  const value = normalizeText(text);
  return /tinh (?:luong|so luong|dinh muc).*son|bao nhieu (?:lit|l|thung|lon|bao).*son|du tru.*son|boc tach.*son|vat tu son|dien tich son/.test(value);
}

function detectProjectType(value: string): ProjectType | undefined {
  if (/biet thu/.test(value)) return 'villa';
  if (/chung cu|can ho/.test(value)) return 'apartment';
  if (/van phong/.test(value)) return 'office';
  if (/nha xuong|xuong/.test(value)) return 'factory';
  if (/nha pho|nha o/.test(value)) return 'townhouse';
  return undefined;
}

function detectScope(value: string): PaintScope | undefined {
  const interior = /noi that|trong nha|tuong trong|phong|tran/.test(value);
  const exterior = /ngoai that|ngoai troi|tuong ngoai|mat tien/.test(value);
  if (interior && exterior) return 'both';
  if (exterior) return 'exterior';
  if (interior) return 'interior';
  return undefined;
}

function detectSurfaceCondition(value: string): SurfaceCondition | undefined {
  if (/am moc|reu moc|bi tham/.test(value)) return 'damp_mold';
  if (/bong troc|phan hoa|tuong cu xuong cap/.test(value)) return 'old_peeling';
  if (/son lai|tuong cu/.test(value)) return 'old_good';
  if (/da ba|da bot tret|tuong da tret/.test(value)) return 'puttied';
  if (/tuong moi.*tho|be mat nham/.test(value)) return 'new_rough';
  if (/tuong moi|nha moi/.test(value)) return 'new_smooth';
  return undefined;
}

function detectMethod(value: string): ApplicationMethod | undefined {
  if (/may phun|phun son/.test(value)) return 'spray';
  if (/co son|quet co/.test(value)) return 'brush';
  if (/con lan|lan son/.test(value)) return 'roller';
  if (/ket hop|hon hop/.test(value)) return 'mixed';
  return undefined;
}

function parsePackageSizes(text: string, unit: 'liter' | 'kg'): number[] {
  const pattern = unit === 'liter'
    ? /(?:thung|lon|quy cach)?\s*(\d+(?:[.,]\d+)?)\s*(?:lit|l)\b/gi
    : /(?:bao|quy cach)?\s*(\d+(?:[.,]\d+)?)\s*kg\b/gi;
  const values: number[] = [];
  for (const match of text.matchAll(pattern)) {
    const value = numberValue(match[1]);
    if (value !== undefined && value > 0 && value <= (unit === 'liter' ? 100 : 100)) values.push(value);
  }
  return [...new Set(values)].sort((a, b) => b - a);
}

function parsePaintProjectInput(text: string): PaintProjectInput {
  const value = normalizeText(text);
  const floors = firstNumber(value, [/(\d+(?:[.,]\d+)?)\s*tang\b/]);
  const floorHeightM = firstNumber(value, [/(?:cao|chieu cao)(?: moi tang| tang)?\s*(\d+(?:[.,]\d+)?)\s*m\b/]);

  const dimensionMatch = /(?:nha|cong trinh|kich thuoc)?\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*m?\b/i.exec(text);
  const lengthByWord = firstNumber(value, [/(?:dai|chieu dai)\s*(\d+(?:[.,]\d+)?)\s*m\b/]);
  const widthByWord = firstNumber(value, [/(?:rong|chieu rong)\s*(\d+(?:[.,]\d+)?)\s*m\b/]);
  const lengthM = numberValue(dimensionMatch?.[1]) ?? lengthByWord;
  const widthM = numberValue(dimensionMatch?.[2]) ?? widthByWord;

  const totalFloorAreaM2 = firstNumber(value, [
    /tong dien tich san\s*(?:la|:)?\s*(\d+(?:[.,]\d+)?)\s*m2\b/,
    /dien tich san tong\s*(?:la|:)?\s*(\d+(?:[.,]\d+)?)\s*m2\b/
  ]);
  let floorAreaPerFloorM2 = firstNumber(value, [
    /dien tich san(?: moi tang)?\s*(?:la|:)?\s*(\d+(?:[.,]\d+)?)\s*m2\s*(?:\/\s*tang|moi tang|mot tang)/,
    /(\d+(?:[.,]\d+)?)\s*m2\s*(?:\/\s*tang|moi tang|mot tang)/
  ]);

  const explicitPaintAreaM2 = firstNumber(value, [
    /(?:tong )?dien tich (?:can )?son\s*(?:la|:)?\s*(\d+(?:[.,]\d+)?)\s*m2\b/,
    /dien tich tuong\s*(?:la|:)?\s*(\d+(?:[.,]\d+)?)\s*m2\b/
  ]);

  if (!totalFloorAreaM2 && !floorAreaPerFloorM2 && !explicitPaintAreaM2) {
    const genericArea = firstNumber(value, [/(?:nha|can ho|biet thu|van phong|nha xuong)\s*(\d+(?:[.,]\d+)?)\s*m2\b/]);
    if (genericArea !== undefined) floorAreaPerFloorM2 = genericArea;
  }

  const roomCount = firstNumber(value, [/(\d+(?:[.,]\d+)?)\s*(?:phong|phong ngu)\b/]);
  const doorAreaM2 = firstNumber(value, [/dien tich cua(?: di)?\s*(?:la|:)?\s*(\d+(?:[.,]\d+)?)\s*m2\b/]);
  const windowAreaM2 = firstNumber(value, [/dien tich cua so\s*(?:la|:)?\s*(\d+(?:[.,]\d+)?)\s*m2\b/]);
  const glassAreaM2 = firstNumber(value, [/dien tich kinh\s*(?:la|:)?\s*(\d+(?:[.,]\d+)?)\s*m2\b/]);
  const nonPaintAreaM2 = firstNumber(value, [/dien tich khong son\s*(?:la|:)?\s*(\d+(?:[.,]\d+)?)\s*m2\b/]);
  const architecturalDetailAreaM2 = firstNumber(value, [/(?:ban cong|cot dam|chi tiet kien truc).*?(\d+(?:[.,]\d+)?)\s*m2\b/]);
  const waterproofAreaM2 = firstNumber(value, [/(?:dien tich )?(?:chong tham|san thuong|ban cong|nha ve sinh)\s*(?:la|:)?\s*(\d+(?:[.,]\d+)?)\s*m2\b/]);

  const wastePercent = firstNumber(value, [/(?:hao hut|du phong)\s*(\d+(?:[.,]\d+)?)\s*%/]);
  const areaCoefficient = firstNumber(value, [/(?:he so|nhan he so)\s*(\d+(?:[.,]\d+)?)/]);

  const primerCoats = firstNumber(value, [/(\d+(?:[.,]\d+)?)\s*lop\s*(?:son )?lot\b/, /son lot\s*(\d+(?:[.,]\d+)?)\s*lop/]);
  const finishCoats = firstNumber(value, [/(\d+(?:[.,]\d+)?)\s*lop\s*(?:son )?phu\b/, /son phu\s*(\d+(?:[.,]\d+)?)\s*lop/]);
  const puttyCoats = firstNumber(value, [/(\d+(?:[.,]\d+)?)\s*lop\s*(?:bot )?(?:ba|tret)\b/, /(?:ba|tret)\s*(\d+(?:[.,]\d+)?)\s*lop/]);
  const waterproofCoats = firstNumber(value, [/(\d+(?:[.,]\d+)?)\s*lop\s*chong tham\b/, /chong tham\s*(\d+(?:[.,]\d+)?)\s*lop/]);

  const genericCoverage = firstNumber(value, [/(?:dinh muc|do phu)\s*(\d+(?:[.,]\d+)?)\s*m2\s*\/\s*(?:lit|l)\s*\/\s*lop/]);
  const primerCoverage = firstNumber(value, [/(?:lot|son lot).*?(\d+(?:[.,]\d+)?)\s*m2\s*\/\s*(?:lit|l)\s*\/\s*lop/]);
  const finishCoverage = firstNumber(value, [/(?:phu|son phu).*?(\d+(?:[.,]\d+)?)\s*m2\s*\/\s*(?:lit|l)\s*\/\s*lop/]);
  const waterproofCoverage = firstNumber(value, [/(?:chong tham).*?(\d+(?:[.,]\d+)?)\s*m2\s*\/\s*(?:lit|l|kg)\s*\/\s*lop/]);
  const puttyRate = firstNumber(value, [/(?:bot ba|bot tret|ba tuong).*?(\d+(?:[.,]\d+)?)\s*kg\s*\/\s*m2/]);

  const packageSizesL = parsePackageSizes(text, 'liter');
  const packageSizesKg = parsePackageSizes(text, 'kg');

  const paintCeiling = /khong (?:son )?tran/.test(value) ? false : /son tran|co tran/.test(value) ? true : undefined;
  const puttyEnabled = /khong (?:dung )?(?:bot )?(?:ba|tret)/.test(value) ? false : /bot ba|bot tret|ba tuong|tret tuong|co ba/.test(value) ? true : undefined;
  const primerEnabled = /khong (?:dung )?(?:son )?lot/.test(value) ? false : /son lot|co lot|lot khang kiem/.test(value) ? true : undefined;
  const waterproofEnabled = /chong tham|san thuong|nha ve sinh|tuong bi tham/.test(value);

  const scope = detectScope(value);
  const isRepaint = /son lai|tuong cu|cai tao/.test(value) ? true : /son moi|nha moi|tuong moi/.test(value) ? false : undefined;

  const commonPackages = packageSizesL.length ? packageSizesL : undefined;
  return {
    projectType: detectProjectType(value),
    scope,
    floors,
    lengthM,
    widthM,
    floorHeightM,
    totalFloorAreaM2,
    floorAreaPerFloorM2,
    roomCount,
    explicitPaintAreaM2,
    doorAreaM2,
    windowAreaM2,
    glassAreaM2,
    nonPaintAreaM2,
    architecturalDetailAreaM2,
    paintCeiling,
    areaCoefficient,
    isRepaint,
    surfaceCondition: detectSurfaceCondition(value),
    applicationMethod: detectMethod(value),
    complexDetails: /nhieu goc canh|nhieu cot|nhieu chi tiet|phao chi/.test(value) || undefined,
    wastePercent,
    putty: {
      enabled: puttyEnabled,
      coats: puttyCoats,
      kgPerM2ForConfiguredCoats: puttyRate,
      packageSizesKg: packageSizesKg.length ? packageSizesKg : undefined
    },
    interiorPrimer: {
      enabled: primerEnabled,
      coats: primerCoats,
      coverageM2PerUnitPerCoat: primerCoverage ?? genericCoverage,
      packageSizes: commonPackages
    },
    interiorFinish: {
      coats: finishCoats,
      coverageM2PerUnitPerCoat: finishCoverage ?? genericCoverage,
      packageSizes: commonPackages
    },
    exteriorPrimer: {
      enabled: primerEnabled,
      coats: primerCoats,
      coverageM2PerUnitPerCoat: primerCoverage ?? genericCoverage,
      packageSizes: commonPackages
    },
    exteriorFinish: {
      coats: finishCoats,
      coverageM2PerUnitPerCoat: finishCoverage ?? genericCoverage,
      packageSizes: commonPackages
    },
    waterproof: {
      enabled: waterproofEnabled,
      areaM2: waterproofAreaM2,
      coats: waterproofCoats,
      coverageM2PerUnitPerCoat: waterproofCoverage,
      packageSizes: commonPackages,
      unit: /chong tham.*kg|kg.*chong tham/.test(value) ? 'kg' : 'liter'
    }
  };
}

function missingQuestion(input: PaintProjectInput): string | null {
  const hasArea = Boolean(
    input.explicitPaintAreaM2 ||
    input.explicitInteriorWallAreaM2 ||
    input.explicitExteriorWallAreaM2 ||
    input.totalFloorAreaM2 ||
    input.floorAreaPerFloorM2 ||
    (input.lengthM && input.widthM)
  );
  if (!hasArea) {
    return 'Để tính lượng sơn, Anh/Chị cho em diện tích sàn hoặc kích thước dài × rộng, số tầng và cần sơn nội thất hay ngoại thất. Ví dụ: “Nhà 5×20m, 2 tầng, cao 3,3m, sơn cả trong và ngoài”.';
  }
  return null;
}

export function answerPaintCalculationMessage(input: {
  message: string;
  history?: ConversationTurn[];
}): PaintCalculatorChatResult {
  const history = input.history ?? [];
  const lastAssistant = [...history].reverse().find((turn) => turn.role === 'assistant')?.content ?? '';
  const currentIntent = isPaintCalculationIntent(input.message);
  const continuingCalculator = /để tính lượng sơn|cần bổ sung|để chính xác hơn/i.test(lastAssistant) &&
    /\d|tầng|m²|m2|nội thất|ngoại thất|sơn trần|bột bả|sơn lót|lớp phủ/i.test(input.message);
  if (!currentIntent && !continuingCalculator) return { handled: false };

  const userHistory = history
    .filter((turn) => turn.role === 'user')
    .slice(-6)
    .map((turn) => turn.content);
  const combined = [...userHistory, input.message].join(' | ');

  const parsed = parsePaintProjectInput(combined);
  const question = missingQuestion(parsed);
  if (question) return { handled: true, reply: question, handoffRecommended: false };

  const estimate = calculateProjectPaintEstimate(parsed);
  return {
    handled: true,
    reply: formatProjectPaintEstimate(estimate),
    handoffRecommended: estimate.warnings.some((warning) => /ẩm|thấm|bong tróc|nứt/i.test(warning))
  };
}
