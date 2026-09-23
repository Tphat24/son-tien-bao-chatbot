-- Production operations upgrade: shared rate limiting, embedding cache and RAG index jobs.
-- Run after 02_ENTERPRISE_RAG.sql.

create table if not exists public.api_rate_limits (
  bucket_key text primary key,
  request_count integer not null default 0 check (request_count >= 0),
  window_started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists api_rate_limits_expiry_idx on public.api_rate_limits(expires_at);
alter table public.api_rate_limits enable row level security;

create or replace function public.consume_api_rate_limit(
  rate_key text,
  rate_limit integer,
  window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.api_rate_limits%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if rate_limit < 1 or window_seconds < 1 then
    raise exception 'Invalid rate limit configuration';
  end if;

  insert into public.api_rate_limits(bucket_key, request_count, window_started_at, expires_at, updated_at)
  values (rate_key, 1, v_now, v_now + make_interval(secs => window_seconds), v_now)
  on conflict (bucket_key) do update
  set request_count = case
        when public.api_rate_limits.expires_at <= v_now then 1
        else public.api_rate_limits.request_count + 1
      end,
      window_started_at = case
        when public.api_rate_limits.expires_at <= v_now then v_now
        else public.api_rate_limits.window_started_at
      end,
      expires_at = case
        when public.api_rate_limits.expires_at <= v_now then v_now + make_interval(secs => window_seconds)
        else public.api_rate_limits.expires_at
      end,
      updated_at = v_now
  returning * into current_row;

  return query select
    current_row.request_count <= rate_limit,
    greatest(rate_limit - current_row.request_count, 0),
    greatest(ceil(extract(epoch from (current_row.expires_at - v_now)))::integer, 0);
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role;

create table if not exists public.rag_embedding_cache (
  cache_key text primary key,
  embedding_model text not null,
  embedding jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rag_embedding_cache_expiry_idx on public.rag_embedding_cache(expires_at);
alter table public.rag_embedding_cache enable row level security;

create table if not exists public.rag_index_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  documents integer not null default 0,
  chunks integer not null default 0,
  skipped integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists rag_index_jobs_created_idx on public.rag_index_jobs(created_at desc);
create unique index if not exists rag_index_jobs_one_active_idx on public.rag_index_jobs(tenant_id)
  where status in ('pending', 'processing');
alter table public.rag_index_jobs enable row level security;

-- Keep operational tables bounded. This function can also be called by a scheduler.
create or replace function public.cleanup_chatbot_operational_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.api_rate_limits where expires_at < now() - interval '1 day';
  delete from public.rag_embedding_cache where expires_at < now();
  delete from public.ai_response_cache where expires_at < now();
  delete from public.rag_index_jobs where created_at < now() - interval '90 days';
end;
$$;

revoke all on function public.cleanup_chatbot_operational_data() from public;
grant execute on function public.cleanup_chatbot_operational_data() to service_role;

notify pgrst, 'reload schema';

select 'OPERATIONS_UPGRADE_OK' as result;
