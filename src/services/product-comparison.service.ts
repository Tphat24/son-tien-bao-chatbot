import { db } from '../db/supabase.js';
import { relevanceScore } from './catalog.service.js';

const COLUMNS = 'id,sku,name,brand,category,use_case,coverage_text,coverage_min,coverage_max,recommended_coats,package_text';
export type ComparisonProduct = {
  id: string; sku: string; name: string; brand: string | null; category: string | null;
  use_case: string | null; coverage_text: string | null; coverage_min: number | null;
  coverage_max: number | null; recommended_coats: number | null; package_text: string | null;
};
export function comparisonRows(products: ComparisonProduct[]) {
  const text = (value: string | null) => value?.trim() || 'Chưa có dữ liệu đã xác minh';
  return [
    { label: 'Thương hiệu', values: products.map((p) => text(p.brand)) },
    { label: 'Nhóm sản phẩm', values: products.map((p) => text(p.category)) },
    { label: 'Công dụng / bề mặt', values: products.map((p) => text(p.use_case)) },
    // Numeric coverage alone has no declared unit: never invent m²/L or kg.
    { label: 'Định mức', values: products.map((p) => text(p.coverage_text)) },
    { label: 'Số lớp khuyến nghị', values: products.map((p) => p.recommended_coats == null ? 'Chưa có dữ liệu đã xác minh' : String(p.recommended_coats)) },
    { label: 'Quy cách', values: products.map((p) => text(p.package_text)) }
  ];
}
export async function searchComparisonProducts(query: string) {
  const { data, error } = await db.from('products').select(COLUMNS)
    .eq('status', 'active').eq('approval_status', 'approved').order('name').limit(500);
  if (error) throw error;
  return ((data ?? []) as ComparisonProduct[]).map((product) => ({ product, score: relevanceScore({ query, title: `${product.sku} ${product.name}`, category: product.category, useCase: product.use_case }) }))
    .filter((item) => !query.trim() || item.score >= 6)
    .sort((a, b) => b.score - a.score).slice(0, 12).map(({ product }) => ({ id: product.id, sku: product.sku, name: product.name, brand: product.brand, category: product.category }));
}
export async function getComparisonProducts(ids: string[]): Promise<ComparisonProduct[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const { data, error } = await db.from('products').select(COLUMNS)
    .in('id', unique).eq('status', 'active').eq('approval_status', 'approved');
  if (error) throw error;
  const byId = new Map(((data ?? []) as ComparisonProduct[]).map((p) => [p.id, p]));
  return unique.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
}
