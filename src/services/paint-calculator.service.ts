import type { ProductRow } from './catalog.service.js';

export interface PaintCalculation {
  liters: number;
  coverageUsed: number;
  areaM2: number;
  coats: number;
  wastePercent: number;
  packages: Array<{ size: number; quantity: number }>;
  totalPackageVolume: number;
}

function choosePackages(requiredLiters: number, packageSizes: number[]): Array<{ size: number; quantity: number }> {
  const sizes = [...new Set(packageSizes.filter((size) => Number.isFinite(size) && size > 0))].sort((a, b) => b - a);
  if (!sizes.length) return [];

  const scale = 10;
  const target = Math.ceil(requiredLiters * scale);
  const scaled = sizes.map((size) => Math.round(size * scale));
  const maxSize = Math.max(...scaled);
  const limit = target + maxSize * 2;
  const best: Array<{ count: number; prev: number; sizeIndex: number } | undefined> = new Array(limit + 1);
  best[0] = { count: 0, prev: -1, sizeIndex: -1 };

  for (let volume = 0; volume <= limit; volume += 1) {
    const state = best[volume];
    if (!state) continue;
    scaled.forEach((size, index) => {
      const next = volume + size;
      if (next > limit) return;
      const count = state.count + 1;
      if (!best[next] || count < best[next]!.count) best[next] = { count, prev: volume, sizeIndex: index };
    });
  }

  let selected = -1;
  for (let volume = target; volume <= limit; volume += 1) {
    if (!best[volume]) continue;
    if (selected === -1 || volume < selected || (volume === selected && best[volume]!.count < best[selected]!.count)) selected = volume;
    if (selected === target) break;
  }
  if (selected < 0) return [];

  const counts = new Array(sizes.length).fill(0) as number[];
  let cursor = selected;
  while (cursor > 0) {
    const state = best[cursor];
    if (!state || state.sizeIndex < 0) break;
    counts[state.sizeIndex] = (counts[state.sizeIndex] ?? 0) + 1;
    cursor = state.prev;
  }
  return sizes.map((size, index) => ({ size, quantity: counts[index] ?? 0 })).filter((item) => item.quantity > 0);
}

export function calculatePaint(input: { areaM2: number; coats: number; wastePercent: number; product: ProductRow }): PaintCalculation {
  if (input.areaM2 <= 0 || input.coats <= 0) throw new Error('invalid_calculation_input');
  const coverage = input.product.coverage_min ?? input.product.coverage_max;
  if (!coverage || coverage <= 0) throw new Error('missing_structured_coverage');
  const waste = Math.min(Math.max(input.wastePercent, 0), 30);
  const liters = (input.areaM2 * input.coats / coverage) * (1 + waste / 100);
  const packageSizes = input.product.package_sizes ?? [];
  const packages = choosePackages(liters, packageSizes);
  const totalPackageVolume = packages.reduce((sum, item) => sum + item.size * item.quantity, 0);
  return {
    liters: Math.ceil(liters * 10) / 10,
    coverageUsed: coverage,
    areaM2: input.areaM2,
    coats: input.coats,
    wastePercent: waste,
    packages,
    totalPackageVolume
  };
}
