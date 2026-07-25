import { db } from '../db/supabase.js';
import { env } from '../config/env.js';
import { hashText } from '../utils/security.js';
import { normalizeText } from '../utils/text.js';

export async function getCachedReply(question: string): Promise<string | null> {
  const cacheKey = hashText(normalizeText(question));
  const { data, error } = await db
    .from('ai_response_cache')
    .select('response,expires_at')
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) return null;
  return data?.response ?? null;
}

export async function saveCachedReply(question: string, response: string): Promise<void> {
  const cacheKey = hashText(normalizeText(question));
  const expiresAt = new Date(Date.now() + env.AI_CACHE_TTL_MINUTES * 60_000).toISOString();
  await db.from('ai_response_cache').upsert({ cache_key: cacheKey, normalized_question: normalizeText(question), response, expires_at: expiresAt }, { onConflict: 'cache_key' });
}
