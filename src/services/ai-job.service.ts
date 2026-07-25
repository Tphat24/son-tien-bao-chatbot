import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { db } from '../db/supabase.js';
import { generateSafeReply } from './ai.service.js';
import { saveCachedReply } from './cache.service.js';
import { appendConversationTurn, getConversationHistory } from './conversation.service.js';

export type AiJobRow = {
  id: string;
  user_id: string;
  question: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  answer: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export async function getLatestAiJob(userId: string): Promise<AiJobRow | null> {
  const { data, error } = await db
    .from('ai_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as AiJobRow | null) ?? null;
}

export async function createAiJob(input: {
  userId: string;
  question: string;
  userName?: string;
}): Promise<AiJobRow> {
  const now = new Date().toISOString();
  const row: AiJobRow = {
    id: randomUUID(),
    user_id: input.userId,
    question: input.question,
    status: 'pending',
    answer: null,
    error_message: null,
    created_at: now,
    updated_at: now
  };

  const { error } = await db.from('ai_jobs').insert(row);
  if (error) throw error;

  void processAiJob(row.id, input).catch((jobError) => {
    console.error('AI background job failed:', jobError);
  });

  return row;
}

async function processAiJob(
  jobId: string,
  input: { userId: string; question: string; userName?: string }
): Promise<void> {
  await db
    .from('ai_jobs')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', jobId);

  try {
    const history = await getConversationHistory(input.userId);
    const retrievalQuery = [
      ...history.slice(-4).map((turn) => turn.content),
      input.question
    ].join(' | ');
    const advisorContextModule = (await import('./advisor-context.service.js')) as Record<string, any>;
    const retrieveAdvisorContext =
      advisorContextModule.retrieveAdvisorContext ?? advisorContextModule.default;
    if (typeof retrieveAdvisorContext !== 'function') {
      throw new Error('Advisor context service is unavailable');
    }
    const context = await retrieveAdvisorContext(retrievalQuery);

    await appendConversationTurn({
      userId: input.userId,
      userName: input.userName,
      role: 'user',
      content: input.question
    });

    const answer = await generateSafeReply({
      userText: input.question,
      userName: input.userName,
      products: context.products,
      knowledge: context.knowledge,
      history,
      forceHuman: context.forceHuman,
      handoffReason: context.handoffReason,
      usedLiveWebsite: context.usedLiveWebsite
    });

    await Promise.all([
      db
        .from('ai_jobs')
        .update({ status: 'completed', answer, error_message: null, updated_at: new Date().toISOString() })
        .eq('id', jobId),
      saveCachedReply(input.question, answer),
      appendConversationTurn({
        userId: input.userId,
        userName: input.userName,
        role: 'assistant',
        content: answer
      })
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .from('ai_jobs')
      .update({ status: 'failed', error_message: message.slice(0, 1000), updated_at: new Date().toISOString() })
      .eq('id', jobId);
    throw error;
  }
}

export function isJobExpired(job: AiJobRow): boolean {
  const ageMs = Date.now() - new Date(job.created_at).getTime();
  return ageMs > env.AI_JOB_TTL_MINUTES * 60_000;
}
