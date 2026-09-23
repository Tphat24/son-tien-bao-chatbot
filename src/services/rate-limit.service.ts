import { db } from '../db/supabase.js';

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  backend: 'database' | 'memory';
};

type MemoryEntry = { count: number; resetAt: number };
const memoryStore = new Map<string, MemoryEntry>();
let databaseUnavailableUntil = 0;

function consumeMemory(key: string, limit: number, windowSeconds: number): RateLimitDecision {
  const now = Date.now();
  const existing = memoryStore.get(key);
  if (!existing || existing.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: Math.max(limit - 1, 0), retryAfterSeconds: windowSeconds, backend: 'memory' };
  }

  existing.count += 1;
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(limit - existing.count, 0),
    retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 0),
    backend: 'memory'
  };
}

export async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitDecision> {
  if (Date.now() >= databaseUnavailableUntil) {
    const { data, error } = await db.rpc('consume_api_rate_limit', {
      rate_key: key,
      rate_limit: limit,
      window_seconds: windowSeconds
    });
    if (!error) {
      const row = (data?.[0] ?? {}) as { allowed?: boolean; remaining?: number; retry_after_seconds?: number };
      return {
        allowed: Boolean(row.allowed),
        remaining: Number(row.remaining ?? 0),
        retryAfterSeconds: Number(row.retry_after_seconds ?? windowSeconds),
        backend: 'database'
      };
    }
    databaseUnavailableUntil = Date.now() + 60_000;
    console.warn('Shared rate limiter unavailable; using memory fallback:', error.message);
  }
  return consumeMemory(key, limit, windowSeconds);
}

export function resetMemoryRateLimits(): void {
  memoryStore.clear();
}
