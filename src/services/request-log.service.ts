import { db } from '../db/supabase.js';

export async function writeDynamicLog(input: {
  action: string;
  userId?: string;
  requestPayload: Record<string, unknown>;
  responsePayload?: unknown;
  durationMs: number;
  status: 'success' | 'fallback' | 'failed';
  errorMessage?: string;
}): Promise<void> {
  await db.from('dynamic_api_logs').insert({
    action: input.action,
    zalo_chatbot_user_id: input.userId ?? null,
    request_payload: input.requestPayload,
    response_payload: input.responsePayload ?? null,
    duration_ms: input.durationMs,
    status: input.status,
    error_message: input.errorMessage ?? null
  });
}
