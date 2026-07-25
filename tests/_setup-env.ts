/**
 * Nạp biến môi trường giả cho test TRƯỚC khi bất kỳ module nào import `env`.
 * Dùng qua: node --import ./tests/_setup-env.ts (hoặc tsx --import).
 *
 * Không chứa secret thật — chỉ giá trị đủ để schema zod trong config/env.ts
 * parse thành công, phục vụ unit test các hàm thuần (JWT, RBAC, menu...).
 */

const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3000',
  PUBLIC_BASE_URL: 'http://localhost:3000',
  ALLOWED_ORIGINS: 'http://localhost:3000',
  // Khóa đủ dài để zod (min 24) và để ký JWT trong test.
  ADMIN_API_KEY: 'test_admin_key_at_least_32_characters_long_000',
  DYNAMIC_API_KEY: 'test_dynamic_key_at_least_32_characters_long_00',
  SUPABASE_URL: 'https://test-project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test_service_role_key_placeholder_value_000',
  GEMINI_API_KEY: 'test_gemini_key',
  COMPANY_NAME: 'Công ty TNHH Tư vấn Xây dựng Tiến Bảo',
  COMPANY_WEBSITE: 'https://sontienbao.com/',
  COMPANY_HOTLINE: '0913712195',
  COMPANY_EMAIL: 'ctytienbao@gmail.com'
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) process.env[key] = value;
}
