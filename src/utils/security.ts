import crypto from 'node:crypto';

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function hashText(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
