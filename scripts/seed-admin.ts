import 'dotenv/config';
import { db } from '../src/db/supabase.js';
import { hashPassword, type StaffRole } from '../src/services/auth.service.js';

/**
 * Tạo (hoặc cập nhật) tài khoản super admin đầu tiên.
 *
 * Chạy MỘT LẦN sau khi đã áp dụng migration:
 *   npm run seed:admin
 *
 * Đọc thông tin từ biến môi trường:
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME
 *
 * Nếu email đã tồn tại: chỉ đặt lại mật khẩu + kích hoạt (không tạo trùng).
 * KHÔNG in mật khẩu ra log.
 */

async function main(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? '';
  const name = (process.env.SEED_ADMIN_NAME ?? 'Quản trị viên').trim();

  if (!email || !password) {
    console.error('Thiếu SEED_ADMIN_EMAIL hoặc SEED_ADMIN_PASSWORD trong .env');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error('SEED_ADMIN_PASSWORD phải dài tối thiểu 10 ký tự.');
    process.exit(1);
  }

  const password_hash = await hashPassword(password);
  const role: StaffRole = 'super_admin';

  const { data: existing } = await db
    .from('staff')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await db
      .from('staff')
      .update({ password_hash, role, is_active: true, failed_login_count: 0, locked_until: null })
      .eq('id', existing.id);
    if (error) {
      console.error('Không cập nhật được tài khoản:', error.message);
      process.exit(1);
    }
    console.log(`Đã cập nhật super admin: ${email}`);
    return;
  }

  const { error } = await db
    .from('staff')
    .insert({ email, full_name: name, password_hash, role, is_active: true });
  if (error) {
    console.error('Không tạo được tài khoản:', error.message);
    process.exit(1);
  }
  console.log(`Đã tạo super admin: ${email}`);
}

main().then(() => process.exit(0));
