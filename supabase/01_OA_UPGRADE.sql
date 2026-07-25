-- ============================================================
-- SƠN TIẾN BẢO — NÂNG CẤP OA (v6)
-- Bổ sung các bảng còn thiếu so với yêu cầu nghiệp vụ đầy đủ.
-- An toàn chạy lại nhiều lần (idempotent). KHÔNG xóa dữ liệu cũ.
-- Chạy SAU file 00_SMART_ADVISOR_SETUP.sql trong Supabase SQL Editor.
-- ============================================================

create extension if not exists pgcrypto;

-- Hàm cập nhật updated_at (an toàn nếu đã tồn tại).
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ------------------------------------------------------------
-- 1. system_settings — cấu hình động (thông tin DN, token OA, giờ làm việc...)
--    Quản trị viên sửa qua trang admin, KHÔNG sửa mã nguồn.
-- ------------------------------------------------------------
create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_at timestamptz default now()
);

-- Seed thông tin doanh nghiệp mặc định (chỉ chèn nếu chưa có).
insert into public.system_settings (key, value, description) values
  ('company_profile', jsonb_build_object(
      'name','Công ty TNHH Tư vấn Xây dựng Tiến Bảo',
      'oa_name','Sơn Tiến Bảo',
      'website','https://sontienbao.com/',
      'hotline','0913712195',
      'email','ctytienbao@gmail.com',
      'address','',
      'service_area','',
      'working_hours','07:30 - 17:30, Thứ 2 - Thứ 7',
      'admin_zalo','https://zalo.me/0913712195',
      'brands', jsonb_build_array()
   ), 'Thông tin doanh nghiệp hiển thị trong hội thoại')
on conflict (key) do nothing;

insert into public.system_settings (key, value, description) values
  ('greeting', jsonb_build_object(
      'text','Xin chào Anh/Chị! Em là trợ lý tư vấn của Sơn Tiến Bảo. Em có thể hỗ trợ Anh/Chị chọn loại sơn, tính lượng sơn, tham khảo giá và gửi yêu cầu cho nhân viên tư vấn. Anh/Chị đang cần hỗ trợ nội dung nào ạ?'
   ), 'Lời chào đầu tiên của chatbot')
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 2. staff — nhân viên / tài khoản quản trị (RBAC)
-- ------------------------------------------------------------
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null,
  password_hash text not null,
  role text not null default 'sales',
  is_active boolean not null default true,
  failed_login_count integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff add constraint staff_role_check
  check (role in ('super_admin','manager','sales','technician','viewer'));
drop trigger if exists staff_touch on public.staff;
create trigger staff_touch before update on public.staff
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 3. zalo_users — hồ sơ người dùng Zalo (OA + Bot)
-- ------------------------------------------------------------
create table if not exists public.zalo_users (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'oa',
  zalo_user_id text not null,
  display_name text,
  avatar_url text,
  phone text,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (channel, zalo_user_id)
);
drop trigger if exists zalo_users_touch on public.zalo_users;
create trigger zalo_users_touch before update on public.zalo_users
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 4. webhook_events — chống xử lý trùng sự kiện webhook
-- ------------------------------------------------------------
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'zalo_oa',
  event_id text not null,
  event_name text,
  payload jsonb,
  created_at timestamptz default now(),
  unique (provider, event_id)
);
create index if not exists webhook_events_created_idx on public.webhook_events(created_at);

-- ------------------------------------------------------------
-- 5. paint_colors — bảng màu sơn
-- ------------------------------------------------------------
create table if not exists public.paint_colors (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text,
  brand text,
  hex text,
  collection text,
  room_tags text[] default '{}',
  style_tags text[] default '{}',
  image_url text,
  status text not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (brand, code)
);
alter table public.paint_colors drop constraint if exists paint_colors_status_check;
alter table public.paint_colors add constraint paint_colors_status_check
  check (status in ('active','inactive'));
create index if not exists paint_colors_search_idx on public.paint_colors(status, brand);
create index if not exists paint_colors_room_idx on public.paint_colors using gin (room_tags);
create index if not exists paint_colors_style_idx on public.paint_colors using gin (style_tags);
drop trigger if exists paint_colors_touch on public.paint_colors;
create trigger paint_colors_touch before update on public.paint_colors
  for each row execute function public.touch_updated_at();

-- 5b. color_favorites — màu khách yêu thích (lưu theo Zalo user).
create table if not exists public.color_favorites (
  id uuid primary key default gen_random_uuid(),
  zalo_user_id text not null,
  color_id uuid references public.paint_colors(id) on delete cascade,
  color_code text,
  color_name text,
  created_at timestamptz default now(),
  unique (zalo_user_id, color_id)
);
create index if not exists color_favorites_user_idx on public.color_favorites(zalo_user_id);

-- ------------------------------------------------------------
-- 6. quotations + quotation_items — báo giá chính thức
-- ------------------------------------------------------------
create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  lead_id uuid references public.leads(id) on delete set null,
  customer_name text,
  customer_phone text,
  customer_area text,
  project_type text,
  area_m2 numeric(12,2),
  need_construction boolean default false,
  note text,
  subtotal numeric(14,2) default 0,
  discount numeric(14,2) default 0,
  shipping_fee numeric(14,2) default 0,
  total numeric(14,2) default 0,
  status text not null default 'draft',
  valid_until date,
  created_by uuid references public.staff(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.quotations drop constraint if exists quotations_status_check;
alter table public.quotations add constraint quotations_status_check
  check (status in ('draft','sent','accepted','rejected','expired'));
create index if not exists quotations_status_idx on public.quotations(status, created_at);
drop trigger if exists quotations_touch on public.quotations;
create trigger quotations_touch before update on public.quotations
  for each row execute function public.touch_updated_at();

create table if not exists public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  package_text text,
  unit_price numeric(14,2) not null default 0,
  quantity numeric(12,2) not null default 1,
  line_total numeric(14,2) not null default 0,
  sort_order integer default 0
);
create index if not exists quotation_items_qid_idx on public.quotation_items(quotation_id);

-- ------------------------------------------------------------
-- 7. notifications — thông báo cho quản trị viên (chống gửi lặp)
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  body text,
  ref_table text,
  ref_id uuid,
  dedupe_key text unique,
  channels text[] default '{}',
  is_read boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists notifications_unread_idx on public.notifications(is_read, created_at);

-- ------------------------------------------------------------
-- 8. faq_entries — câu hỏi thường gặp (do admin phê duyệt)
-- ------------------------------------------------------------
create table if not exists public.faq_entries (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  keywords text[] default '{}',
  category text,
  is_active boolean not null default true,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
drop trigger if exists faq_touch on public.faq_entries;
create trigger faq_touch before update on public.faq_entries
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 9. audit_logs — nhật ký thao tác quản trị
-- ------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.staff(id) on delete set null,
  actor_email text,
  action text not null,
  entity text,
  entity_id text,
  metadata jsonb,
  ip text,
  created_at timestamptz default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at);

-- ------------------------------------------------------------
-- 10. Bổ sung cột cho leads (nếu bảng đã tồn tại từ file 00)
-- ------------------------------------------------------------
alter table public.leads add column if not exists assigned_to uuid references public.staff(id) on delete set null;
alter table public.leads add column if not exists status text default 'new';
alter table public.leads add column if not exists potential text;
alter table public.leads add column if not exists channel text default 'oa';
alter table public.leads add column if not exists zalo_user_id text;
alter table public.leads add column if not exists note text;
alter table public.leads add column if not exists tags text[] default '{}';
alter table public.leads add column if not exists product_interest text;
alter table public.leads add column if not exists area_m2 numeric(12,2);
alter table public.leads add column if not exists buy_time text;

-- Cho phép thêm các trạng thái lead đầy đủ theo yêu cầu (mục 10).
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('new','uncontacted','contacted','consulting','quoted','negotiating','won','lost','follow_up'));

-- ------------------------------------------------------------
-- 11. surface_images — ảnh hiện trạng bề mặt khách gửi (mục 7)
--     Gắn với lead để nhân viên xem lại. Lưu URL + nhận định sơ bộ của AI.
-- ------------------------------------------------------------
create table if not exists public.surface_images (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  zalo_user_id text,
  image_url text not null,
  channel text default 'oa',
  -- Nhận định sơ bộ của AI (KHÔNG phải kết luận kỹ thuật chắc chắn).
  ai_observation text,
  ai_conditions text[] default '{}',
  ai_confidence text,
  reviewed_by uuid references public.staff(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists surface_images_lead_idx on public.surface_images(lead_id, created_at desc);
create index if not exists surface_images_user_idx on public.surface_images(zalo_user_id);

-- ============================================================
-- Ghi chú RLS: các bảng trên chỉ được truy cập qua service role
-- (backend). KHÔNG bật quyền anon. Nếu đã bật RLS ở file 00,
-- giữ nguyên; service role bỏ qua RLS.
-- ============================================================
