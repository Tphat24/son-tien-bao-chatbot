-- Run after 03_OPERATIONS_UPGRADE.sql. Reindex before enabling the new embedding model.
create extension if not exists unaccent with schema extensions;

create or replace function public.rag_search_text(value text)
returns tsvector language sql immutable parallel safe
set search_path = public, extensions
as $$
  select to_tsvector('simple'::regconfig, extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(value, '')));
$$;

alter table public.knowledge_chunks add column if not exists search_vector tsvector
  generated always as (setweight(public.rag_search_text(title), 'A') || setweight(public.rag_search_text(content), 'B')) stored;
create index if not exists knowledge_chunks_search_idx on public.knowledge_chunks using gin(search_vector);
create index if not exists knowledge_chunks_model_idx on public.knowledge_chunks(tenant_id, embedding_model);

-- The legacy deployment used 001. Keep its old RPC isolated while 2 is indexed
-- alongside it, including during a rollback to that deployment.
create or replace function public.match_knowledge_chunks(
  query_embedding extensions.vector(768),
  match_threshold double precision default 0.62,
  match_count integer default 8,
  filter_tenant_id text default 'default'
)
returns table(chunk_id uuid, document_id uuid, title text, content text, source_url text, similarity double precision, metadata jsonb)
language sql stable security invoker set search_path = public, extensions
as $$
  select kc.id, kd.id, kc.title, kc.content, kd.source_url,
    1 - (kc.embedding <=> query_embedding), kc.metadata
  from public.knowledge_chunks kc
  join public.knowledge_documents kd on kd.id = kc.knowledge_document_id
  where kc.tenant_id = filter_tenant_id and kd.tenant_id = filter_tenant_id
    and kd.approval_status = 'approved'
    and kc.embedding_model = 'gemini-embedding-001'
    and (kd.content_hash is null or kd.content_hash = kc.content_hash)
    and 1 - (kc.embedding <=> query_embedding) >= match_threshold
  order by kc.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

create or replace function public.match_knowledge_chunks_v2(
  query_embedding extensions.vector(768),
  match_threshold double precision default 0.62,
  match_count integer default 8,
  filter_tenant_id text default 'default',
  filter_embedding_model text default 'gemini-embedding-2',
  filter_input_version text default 'retrieval-v2'
)
returns table(chunk_id uuid, document_id uuid, title text, content text, source_url text, similarity double precision, metadata jsonb)
language sql stable security invoker set search_path = public, extensions
as $$
  select kc.id, kd.id, kc.title, kc.content, kd.source_url,
    1 - (kc.embedding <=> query_embedding), kc.metadata
  from public.knowledge_chunks kc
  join public.knowledge_documents kd on kd.id = kc.knowledge_document_id
  where kc.tenant_id = filter_tenant_id and kd.tenant_id = filter_tenant_id
    and kd.approval_status = 'approved'
    and kc.embedding_model = filter_embedding_model
    and kc.metadata->>'input_version' = filter_input_version
    and (kd.content_hash is null or kd.content_hash = kc.content_hash)
    and 1 - (kc.embedding <=> query_embedding) >= match_threshold
  order by kc.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

create or replace function public.search_knowledge_chunks_lexical(
  query_text text,
  match_count integer default 8,
  filter_tenant_id text default 'default',
  filter_embedding_model text default 'gemini-embedding-2',
  filter_input_version text default 'retrieval-v2'
)
returns table(chunk_id uuid, document_id uuid, title text, content text, source_url text, similarity double precision, metadata jsonb)
language sql stable security invoker set search_path = public, extensions
as $$
  -- OR between lexemes tolerates conversational filler words without losing exact product terms.
  with terms as (
    select plainto_tsquery('simple', extensions.unaccent('extensions.unaccent'::regdictionary, left(query_text, 1200)))::text as query
  ), search as (
    select replace(query, ' & ', ' | ')::tsquery as query from terms
  )
  select kc.id, kd.id, kc.title, kc.content, kd.source_url,
    ts_rank_cd(kc.search_vector, search.query)::double precision, kc.metadata
  from public.knowledge_chunks kc
  join public.knowledge_documents kd on kd.id = kc.knowledge_document_id
  cross join search
  where kc.tenant_id = filter_tenant_id and kd.tenant_id = filter_tenant_id
    and kd.approval_status = 'approved'
    and kc.embedding_model = filter_embedding_model
    and kc.metadata->>'input_version' = filter_input_version
    and (kd.content_hash is null or kd.content_hash = kc.content_hash)
    and kc.search_vector @@ search.query
  order by ts_rank_cd(kc.search_vector, search.query) desc, kc.id
  limit least(greatest(match_count, 1), 20);
$$;

create or replace function public.replace_knowledge_document_chunks(
  document_id uuid,
  filter_tenant_id text,
  filter_embedding_model text,
  expected_content text,
  expected_title text,
  chunks jsonb
)
returns void language plpgsql security invoker set search_path = public, extensions
as $$
declare
  document public.knowledge_documents%rowtype;
begin
  -- Lock also serializes overlapping indexing runs for the same document.
  select * into document from public.knowledge_documents
    where id = document_id and tenant_id = filter_tenant_id for update;
  if not found or document.approval_status <> 'approved'
    or document.content is distinct from expected_content
    or document.title is distinct from expected_title then
    raise exception 'Document changed or is no longer approved; retry indexing';
  end if;
  if jsonb_typeof(chunks) is distinct from 'array' then
    raise exception 'Chunks must be an array';
  end if;
  if exists(select 1 from jsonb_array_elements(chunks) entry
    where entry->>'tenant_id' is distinct from filter_tenant_id
      or entry->>'knowledge_document_id' is distinct from document_id::text
      or entry->>'embedding_model' is distinct from filter_embedding_model
      or entry->'metadata'->>'input_version' is distinct from 'retrieval-v2') then
    raise exception 'Chunk scope or input version mismatch';
  end if;

  -- Keep the previous model available for rollback. Any insert failure rolls back this delete.
  delete from public.knowledge_chunks where knowledge_document_id = document_id
    and tenant_id = filter_tenant_id and embedding_model = filter_embedding_model;
  insert into public.knowledge_chunks(tenant_id, knowledge_document_id, chunk_index, title, content,
    source_url, content_hash, embedding_model, embedding, metadata)
  select filter_tenant_id, document_id, (entry->>'chunk_index')::integer, document.title,
    entry->>'content', document.source_url, entry->>'content_hash', filter_embedding_model,
    (entry->'embedding')::text::extensions.vector(768), entry->'metadata'
  from jsonb_array_elements(chunks) entry;
end;
$$;

revoke all on function public.match_knowledge_chunks_v2(extensions.vector, double precision, integer, text, text, text) from public;
revoke all on function public.search_knowledge_chunks_lexical(text, integer, text, text, text) from public;
revoke all on function public.replace_knowledge_document_chunks(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.match_knowledge_chunks_v2(extensions.vector, double precision, integer, text, text, text) to service_role;
grant execute on function public.search_knowledge_chunks_lexical(text, integer, text, text, text) to service_role;
grant execute on function public.replace_knowledge_document_chunks(uuid, text, text, text, text, jsonb) to service_role;

notify pgrst, 'reload schema';
