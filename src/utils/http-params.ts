/**
 * Chuẩn hoá tham số HTTP về string.
 *
 * Express 5 định kiểu `req.params[x]` và `req.query[x]` là
 * `string | string[] | undefined` (một key có thể xuất hiện nhiều lần trên
 * query string). Các hàm dưới đây ép về một string an toàn để truyền vào
 * service layer, tránh lỗi type `string[] not assignable to string`.
 */

/** Lấy giá trị string đầu tiên; nếu là mảng lấy phần tử đầu; nếu rỗng trả ''. */
export function firstStr(value: unknown): string {
  if (Array.isArray(value)) return value.length ? String(value[0] ?? '') : '';
  if (value === null || value === undefined) return '';
  return String(value);
}

/** Như firstStr nhưng trả undefined khi rỗng (dùng cho tham số optional). */
export function optStr(value: unknown): string | undefined {
  const result = firstStr(value).trim();
  return result ? result : undefined;
}
