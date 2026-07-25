-- ============================================================
-- SƠN TIẾN BẢO - SMART ADVISOR DATABASE SETUP
-- Chỉ cần chạy file này một lần trong Supabase SQL Editor.
-- File có thể chạy lại an toàn, không xóa dữ liệu hiện có.
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- 1. Sản phẩm có cấu trúc.
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  brand text,
  category text,
  description text,
  use_case text,
  coverage_text text,
  coverage_min numeric(10,2),
  coverage_max numeric(10,2),
  recommended_coats integer,
  package_text text,
  package_sizes jsonb not null default '[]'::jsonb,
  price numeric(14,2),
  stock_quantity numeric(14,2),
  image_url text,
  source_url text,
  status text not null default 'active',
  approval_status text not null default 'pending',
  source_updated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.products add column if not exists source_updated_at timestamptz;

alter table public.products drop constraint if exists products_status_check;
alter table public.products add constraint products_status_check check (status in ('active','inactive'));
alter table public.products drop constraint if exists products_approval_status_check;
alter table public.products add constraint products_approval_status_check check (approval_status in ('pending','approved','rejected'));
alter table public.products drop constraint if exists coverage_positive;
alter table public.products add constraint coverage_positive check (coverage_min is null or coverage_min > 0);
alter table public.products drop constraint if exists coats_positive;
alter table public.products add constraint coats_positive check (recommended_coats is null or recommended_coats > 0);
create index if not exists products_search_idx on public.products(status,approval_status,brand,category);

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();

-- 2. Kho tri thức lấy trực tiếp từ sontienbao.com.
create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  source_url text unique,
  content_hash text,
  approval_status text not null default 'pending',
  page_type text not null default 'website',
  last_crawled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.knowledge_documents add column if not exists page_type text not null default 'website';
alter table public.knowledge_documents add column if not exists last_crawled_at timestamptz;
alter table public.knowledge_documents drop constraint if exists knowledge_documents_approval_status_check;
alter table public.knowledge_documents add constraint knowledge_documents_approval_status_check check (approval_status in ('pending','approved','rejected'));
create index if not exists knowledge_status_idx on public.knowledge_documents(approval_status,updated_at desc);
create index if not exists knowledge_source_idx on public.knowledge_documents(source_url);

drop trigger if exists knowledge_touch on public.knowledge_documents;
create trigger knowledge_touch before update on public.knowledge_documents for each row execute function public.touch_updated_at();

-- 3. Lead khách hàng.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  zalo_chatbot_user_id text,
  name text,
  phone text,
  area text,
  budget text,
  need text not null,
  source text not null default 'zalo_chatbot',
  priority text not null default 'normal',
  status text not null default 'new',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.leads drop constraint if exists leads_priority_check;
alter table public.leads add constraint leads_priority_check check (priority in ('low','normal','high','urgent'));
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check check (status in ('new','contacted','consulting','quoted','won','lost','follow_up'));
create index if not exists leads_status_idx on public.leads(status,priority,created_at desc);

drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads for each row execute function public.touch_updated_at();

-- 4. Log Dynamic API.
create table if not exists public.dynamic_api_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  zalo_chatbot_user_id text,
  request_payload jsonb,
  response_payload jsonb,
  duration_ms integer not null default 0,
  status text not null,
  error_message text,
  created_at timestamptz default now()
);
alter table public.dynamic_api_logs drop constraint if exists dynamic_api_logs_status_check;
alter table public.dynamic_api_logs add constraint dynamic_api_logs_status_check check (status in ('success','fallback','failed'));
create index if not exists dynamic_api_logs_created_idx on public.dynamic_api_logs(created_at desc,status,action);

-- 5. Cache câu trả lời.
create table if not exists public.ai_response_cache (
  cache_key text primary key,
  normalized_question text not null,
  response text not null,
  expires_at timestamptz not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists ai_response_cache_expiry_idx on public.ai_response_cache(expires_at);
drop trigger if exists cache_touch on public.ai_response_cache;
create trigger cache_touch before update on public.ai_response_cache for each row execute function public.touch_updated_at();

-- 6. AI chạy nền để đáp ứng giới hạn thời gian của Zalo Dynamic API.
create table if not exists public.ai_jobs (
  id uuid primary key,
  user_id text not null,
  question text not null,
  status text not null default 'pending',
  answer text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_jobs drop constraint if exists ai_jobs_status_check;
alter table public.ai_jobs add constraint ai_jobs_status_check check (status in ('pending','processing','completed','failed'));
create index if not exists ai_jobs_user_created_idx on public.ai_jobs(user_id, created_at desc);

-- 7. Ghi nhớ hội thoại để bot hiểu câu hỏi nối tiếp.
create table if not exists public.chat_sessions (
  user_id text primary key,
  user_name text,
  last_messages jsonb not null default '[]'::jsonb,
  customer_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_sessions_updated_idx on public.chat_sessions(updated_at desc);
drop trigger if exists chat_sessions_touch on public.chat_sessions;
create trigger chat_sessions_touch before update on public.chat_sessions for each row execute function public.touch_updated_at();

-- Backend dùng service role. Không mở dữ liệu trực tiếp ra frontend/Zalo Flow.
alter table public.products enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.leads enable row level security;
alter table public.dynamic_api_logs enable row level security;
alter table public.ai_response_cache enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.chat_sessions enable row level security;

-- Xóa cache thử cũ để retrieval mới được áp dụng ngay.
delete from public.ai_response_cache;

select 'SMART_ADVISOR_SETUP_OK' as result;
