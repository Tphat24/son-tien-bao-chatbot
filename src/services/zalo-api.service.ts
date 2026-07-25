import { env } from '../config/env.js';

const API_BASE = 'https://bot-api.zaloplatforms.com';
const MAX_TEXT_LENGTH = 2000;
const ZALO_API_TIMEOUT_MS = 15_000;

function splitText(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= MAX_TEXT_LENGTH) return [normalized];

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > MAX_TEXT_LENGTH) {
    let cut = remaining.lastIndexOf('\n', MAX_TEXT_LENGTH);
    if (cut < MAX_TEXT_LENGTH * 0.6) cut = remaining.lastIndexOf(' ', MAX_TEXT_LENGTH);
    if (cut < MAX_TEXT_LENGTH * 0.6) cut = MAX_TEXT_LENGTH;

    const chunk = remaining.slice(0, cut).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export async function callZaloBotApi(
  method: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  if (!env.ZALO_BOT_TOKEN) {
    throw new Error('ZALO_BOT_TOKEN is not configured');
  }

  const response = await fetch(`${API_BASE}/bot${env.ZALO_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(ZALO_API_TIMEOUT_MS)
  });

  const raw = await response.text();
  let data: unknown = {};

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw_response: raw };
    }
  }

  const result = data && typeof data === 'object'
    ? (data as { ok?: boolean })
    : {};

  if (!response.ok || result.ok === false) {
    throw new Error(
      `Zalo Bot API ${method} failed: ${response.status} ${JSON.stringify(data)}`
    );
  }

  return data;
}

export async function sendZaloText(chatId: string, text: string): Promise<void> {
  const chunks = splitText(text);
  if (!chunks.length) return;

  for (const chunk of chunks) {
    await callZaloBotApi('sendMessage', {
      chat_id: chatId,
      text: chunk
    });
  }
}

export async function sendOwnerZaloNotification(text: string): Promise<boolean> {
  if (!env.ZALO_ADMIN_CHAT_ID || !env.ZALO_BOT_TOKEN) return false;
  await sendZaloText(env.ZALO_ADMIN_CHAT_ID, text);
  return true;
}
