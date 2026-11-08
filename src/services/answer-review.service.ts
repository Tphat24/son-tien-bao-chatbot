import { randomUUID } from 'node:crypto';
import { db } from '../db/supabase.js';
import { env } from '../config/env.js';

export type ReviewStatus = 'open' | 'draft' | 'resolved' | 'dismissed';
export function redactFaqQuestion(question: string): string {
  return question.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email đã ẩn]')
    .replace(/(?:\+?84|0)(?:[ .()-]*\d){8,10}/g, '[SĐT đã ẩn]');
}
export async function recordAnswer(input: { sessionId: string; question: string; answer: string; reason?: 'no_data' | 'system_fallback' }): Promise<string | null> {
  const id = randomUUID();
  try {
    const { error } = await db.from('chat_answer_reviews').insert({
      id, tenant_id: env.RAG_TENANT_ID, session_id: input.sessionId,
      question: input.question, answer: input.answer, faq_question: redactFaqQuestion(input.question),
      reason: input.reason ?? null, needs_review: Boolean(input.reason)
    }).abortSignal(AbortSignal.timeout(2500));
    if (error) throw error;
    return id;
  } catch {
    console.warn('Answer review recording unavailable; chat response is preserved. Check migration 05.');
    return null;
  }
}
export async function submitAnswerFeedback(input: { sessionId: string; answerId: string; rating: 'helpful' | 'not_helpful'; comment?: string }) {
  const { data, error } = await db.from('chat_answer_reviews').update({
    customer_rating: input.rating,
    ...(input.comment !== undefined ? { customer_comment: input.comment || null } : {}),
    ...(input.rating === 'not_helpful' ? { needs_review: true } : {})
  }).eq('id', input.answerId).eq('session_id', input.sessionId).eq('tenant_id', env.RAG_TENANT_ID).select('id').maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
export async function listAnswerReviews(input: { status?: ReviewStatus; page: number }) {
  let query = db.from('chat_answer_reviews')
    .select('id,question,answer,reason,customer_rating,customer_comment,status,faq_question,corrected_answer,knowledge_document_id,created_at', { count: 'exact' })
    .eq('tenant_id', env.RAG_TENANT_ID).eq('needs_review', true);
  if (input.status) query = query.eq('status', input.status);
  const { data, error, count } = await query.order('created_at', { ascending: false }).range((input.page - 1) * 25, input.page * 25 - 1);
  if (error) throw error;
  return { items: data ?? [], total: count ?? 0, page: input.page, pageSize: 25 };
}
export async function updateAnswerReview(id: string, input: { status?: 'open' | 'draft' | 'dismissed'; faqQuestion?: string; correctedAnswer?: string }) {
  const { data, error } = await db.from('chat_answer_reviews').update({
    ...(input.status ? { status: input.status } : {}),
    ...(input.faqQuestion !== undefined ? { faq_question: input.faqQuestion } : {}),
    ...(input.correctedAnswer !== undefined ? { corrected_answer: input.correctedAnswer } : {})
  }).eq('id', id).eq('tenant_id', env.RAG_TENANT_ID).neq('status', 'resolved').select('id').maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
export async function publishAnswerReview(id: string, actorId: string) {
  const { data, error } = await db.rpc('publish_chat_answer_review', { review_id: id, filter_tenant_id: env.RAG_TENANT_ID, actor_id: actorId });
  if (error) throw error;
  return data as string;
}
