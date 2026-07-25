import type { Request } from 'express';
import type { DynamicRequestInput } from '../types/zalo-chatbot.js';
import { asFiniteNumber } from './text.js';

const aliases = {
  action: ['action', 'intent', 'mode', 'task'],
  message: ['message', 'text', 'query', 'question', 'user_message', 'content'],
  userId: ['user_id', 'uid', 'zalo_user_id', 'sender_id'],
  userName: ['user_name', 'name', 'display_name', 'customer_name'],
  phone: ['phone', 'mobile', 'telephone'],
  area: ['area', 'location', 'region', 'address'],
  budget: ['budget', 'price_range'],
  sku: ['sku', 'product_sku', 'product_code'],
  surfaceAreaM2: ['surface_area_m2', 'area_m2', 'paint_area', 'dien_tich'],
  coats: ['coats', 'layers', 'so_lop'],
  wastePercent: ['waste_percent', 'waste', 'hao_hut']
} as const;

type Source = Record<string, unknown>;

function flatten(source: unknown, output: Source = {}, depth = 0): Source {
  if (!source || typeof source !== 'object' || depth > 4) return output;
  for (const [key, value] of Object.entries(source as Source)) {
    const normalizedKey = key.toLowerCase();
    if (!(normalizedKey in output) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
      output[normalizedKey] = value;
    }
    if (value && typeof value === 'object') flatten(value, output, depth + 1);
  }
  return output;
}

function first(source: Source, names: readonly string[]): unknown {
  for (const name of names) {
    const value = source[name];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return undefined;
}

export function parseDynamicRequest(req: Request): DynamicRequestInput {
  const merged = flatten({ body: req.body ?? {}, query: req.query ?? {}, params: req.params ?? {} });
  const actionValue = first(merged, aliases.action);
  const messageValue = first(merged, aliases.message);
  for (const secretKey of ['key', 'api_key', 'dynamic_api_key', 'x-stb-chatbot-key']) delete merged[secretKey];
  return {
    action: String(actionValue ?? 'ai').trim().toLowerCase(),
    message: String(messageValue ?? '').trim(),
    userId: first(merged, aliases.userId)?.toString(),
    userName: first(merged, aliases.userName)?.toString(),
    phone: first(merged, aliases.phone)?.toString(),
    area: first(merged, aliases.area)?.toString(),
    budget: first(merged, aliases.budget)?.toString(),
    sku: first(merged, aliases.sku)?.toString(),
    surfaceAreaM2: asFiniteNumber(first(merged, aliases.surfaceAreaM2)),
    coats: asFiniteNumber(first(merged, aliases.coats)),
    wastePercent: asFiniteNumber(first(merged, aliases.wastePercent)),
    raw: merged
  };
}
