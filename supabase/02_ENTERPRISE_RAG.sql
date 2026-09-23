-- Enterprise RAG: multi-tenant chunk store and cosine similarity retrieval.
-- Run after 00_SMART_ADVISOR_SETUP.sql in Supabase SQL Editor.

create extension if not exists vector with schema extensions;

alter table public.knowledge_documents
  add column if not exists tenant_id text not null default 'default';
create index if not exists knowledge_documents_tenant_idx
  on public.knowledge_documents(tenant_id, approval_status, updated_at desc);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  knowledge_document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  title text not null,
  content text not null,
  source_url text,
  content_hash text not null,
  embedding_model text not null,
  embedding extensions.vector(768) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (knowledge_document_id, chunk_index, embedding_model)
);

create index if not exists knowledge_chunks_document_idx
  on public.knowledge_chunks(knowledge_document_id, chunk_index);
create index if not exists knowledge_chunks_tenant_idx
  on public.knowledge_chunks(tenant_id);
create index if not exists knowledge_chunks_embedding_hnsw_idx
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

alter table public.knowledge_chunks enable row level security;

create or replace function public.match_knowledge_chunks(
  query_embedding extensions.vector(768),
  match_threshold double precision default 0.62,
  match_count integer default 8,
  filter_tenant_id text default 'default'
)
returns table (
  chunk_id uuid,
  document_id uuid,
  title text,
  content text,
  source_url text,
  similarity double precision,
  metadata jsonb
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    kc.id,
    kd.id,
    kc.title,
    kc.content,
    kc.source_url,
    1 - (kc.embedding <=> query_embedding) as similarity,
    kc.metadata
  from public.knowledge_chunks kc
  join public.knowledge_documents kd on kd.id = kc.knowledge_document_id
  where kc.tenant_id = filter_tenant_id
    and kd.tenant_id = filter_tenant_id
    and kd.approval_status = 'approved'
    and 1 - (kc.embedding <=> query_embedding) >= match_threshold
  order by kc.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke all on function public.match_knowledge_chunks(extensions.vector, double precision, integer, text) from public;
grant execute on function public.match_knowledge_chunks(extensions.vector, double precision, integer, text) to service_role;

notify pgrst, 'reload schema';

select 'ENTERPRISE_RAG_SETUP_OK' as result;
