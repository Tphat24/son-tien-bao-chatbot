-- Run after 00–04, before deploying v6.4. No existing business data is deleted.
alter table public.leads add column if not exists handoff_summary text;
alter table public.leads add column if not exists handoff_transcript jsonb not null default '[]'::jsonb;

create table if not exists public.chat_answer_reviews (
  id uuid primary key,
  tenant_id text not null default 'default',
  session_id text not null,
  question text not null check (length(question) between 1 and 1200),
  answer text not null check (length(answer) between 1 and 24000),
  reason text check (reason in ('no_data', 'system_fallback')),
  needs_review boolean not null default false,
  customer_rating text check (customer_rating in ('helpful', 'not_helpful')),
  customer_comment text check (length(customer_comment) <= 1000),
  status text not null default 'open' check (status in ('open', 'draft', 'resolved', 'dismissed')),
  faq_question text,
  corrected_answer text,
  knowledge_document_id uuid references public.knowledge_documents(id) on delete set null,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_answer_reviews_queue_idx on public.chat_answer_reviews(tenant_id, status, created_at desc) where needs_review;
alter table public.chat_answer_reviews enable row level security;
revoke all on public.chat_answer_reviews from public, anon, authenticated;
grant select, insert, update, delete on public.chat_answer_reviews to service_role;
drop trigger if exists chat_answer_reviews_touch on public.chat_answer_reviews;
create trigger chat_answer_reviews_touch before update on public.chat_answer_reviews for each row execute function public.touch_updated_at();

create or replace function public.publish_chat_answer_review(review_id uuid, filter_tenant_id text, actor_id uuid)
returns uuid language plpgsql security invoker set search_path = public
as $$
declare item public.chat_answer_reviews%rowtype;
begin
  select * into item from public.chat_answer_reviews where id = review_id and tenant_id = filter_tenant_id for update;
  if not found then raise exception 'Review not found'; end if;
  if item.status = 'resolved' and item.knowledge_document_id is not null then return item.knowledge_document_id; end if;
  if item.status not in ('open', 'draft') or length(trim(coalesce(item.faq_question,''))) < 10
    or length(trim(coalesce(item.corrected_answer,''))) < 20 then raise exception 'Review is not ready for approval'; end if;
  insert into public.knowledge_documents(id, tenant_id, title, content, content_hash, approval_status, page_type)
  values (item.id, filter_tenant_id, left(item.faq_question, 200),
    'Câu hỏi: ' || item.faq_question || E'\n\nTrả lời đã duyệt: ' || item.corrected_answer,
    null, 'approved', 'reviewed_faq');
  update public.chat_answer_reviews set status = 'resolved', knowledge_document_id = item.id, resolved_by = actor_id where id = item.id;
  return item.id;
end;
$$;
revoke all on function public.publish_chat_answer_review(uuid,text,uuid) from public;
grant execute on function public.publish_chat_answer_review(uuid,text,uuid) to service_role;

-- Bound stored chat content. Resolved/dismissed work and approved FAQs are retained.
create or replace function public.cleanup_unflagged_chat_answers()
returns bigint language plpgsql security invoker set search_path = public as $$
declare removed bigint;
begin
  delete from public.chat_answer_reviews where needs_review = false and created_at < now() - interval '90 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.cleanup_unflagged_chat_answers() from public;
grant execute on function public.cleanup_unflagged_chat_answers() to service_role;
notify pgrst, 'reload schema';
