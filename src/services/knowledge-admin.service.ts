import crypto, { randomUUID } from 'node:crypto';
import { db } from '../db/supabase.js';
import { env } from '../config/env.js';
import { getRagIndexStatus, indexApprovedKnowledge, type RagIndexResult } from './rag.service.js';

export type KnowledgeApproval = 'pending' | 'approved' | 'rejected';

const COLUMNS = 'id,tenant_id,title,content,source_url,page_type,approval_status,content_hash,last_crawled_at,created_at,updated_at';

function contentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function listKnowledgeDocuments(input: {
  search?: string;
  approval?: KnowledgeApproval;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
  let query = db.from('knowledge_documents').select(COLUMNS, { count: 'exact' })
    .eq('tenant_id', env.RAG_TENANT_ID);
  if (input.search) query = query.ilike('title', `%${input.search.replace(/[%_]/g, '')}%`);
  if (input.approval) query = query.eq('approval_status', input.approval);
  const { data, error, count } = await query.order('updated_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw error;
  return { items: data ?? [], total: count ?? 0, page, pageSize };
}

export async function getKnowledgeDocument(id: string) {
  const { data, error } = await db.from('knowledge_documents').select(COLUMNS)
    .eq('id', id).eq('tenant_id', env.RAG_TENANT_ID).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createKnowledgeDocument(input: {
  title: string;
  content: string;
  sourceUrl?: string;
  pageType?: string;
  approvalStatus?: KnowledgeApproval;
}) {
  const { data, error } = await db.from('knowledge_documents').insert({
    tenant_id: env.RAG_TENANT_ID,
    title: input.title,
    content: input.content,
    source_url: input.sourceUrl || null,
    page_type: input.pageType || 'manual',
    approval_status: input.approvalStatus ?? 'pending',
    content_hash: contentHash(input.content)
  }).select(COLUMNS).single();
  if (error) throw error;
  return data;
}

export async function updateKnowledgeDocument(id: string, input: {
  title?: string;
  content?: string;
  sourceUrl?: string | null;
  pageType?: string;
  approvalStatus?: KnowledgeApproval;
}) {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.content !== undefined) {
    patch.content = input.content;
    patch.content_hash = contentHash(input.content);
  }
  if (input.sourceUrl !== undefined) patch.source_url = input.sourceUrl || null;
  if (input.pageType !== undefined) patch.page_type = input.pageType;
  if (input.approvalStatus !== undefined) patch.approval_status = input.approvalStatus;
  const { data, error } = await db.from('knowledge_documents').update(patch)
    .eq('id', id).eq('tenant_id', env.RAG_TENANT_ID).select(COLUMNS).single();
  if (error) throw error;
  return data;
}

export async function deleteKnowledgeDocument(id: string): Promise<void> {
  const { error } = await db.from('knowledge_documents').delete()
    .eq('id', id).eq('tenant_id', env.RAG_TENANT_ID);
  if (error) throw error;
}

let activeIndexJob: { id: string; startedAt: string } | null = null;

async function updateIndexJob(id: string, patch: Record<string, unknown>): Promise<void> {
  await db.from('rag_index_jobs').update(patch).eq('id', id);
}

export function getActiveIndexJob(): { id: string; startedAt: string } | null {
  return activeIndexJob;
}

export async function startKnowledgeReindex(): Promise<{ id: string; startedAt: string; alreadyRunning: boolean }> {
  if (activeIndexJob) return { ...activeIndexJob, alreadyRunning: true };
  const id = randomUUID();
  const startedAt = new Date().toISOString();
  const { error: insertError } = await db.from('rag_index_jobs').insert({ id, tenant_id: env.RAG_TENANT_ID, status: 'pending' });
  if (insertError?.code === '23505') {
    const { data } = await db.from('rag_index_jobs').select('id,started_at,created_at')
      .eq('tenant_id', env.RAG_TENANT_ID).in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    return { id: data?.id ?? 'running', startedAt: data?.started_at ?? data?.created_at ?? startedAt, alreadyRunning: true };
  }
  activeIndexJob = { id, startedAt };

  void (async () => {
    try {
      await updateIndexJob(id, { status: 'processing', started_at: startedAt });
      const result: RagIndexResult = await indexApprovedKnowledge();
      await updateIndexJob(id, {
        status: 'completed', documents: result.documents, chunks: result.chunks,
        skipped: result.skipped, completed_at: new Date().toISOString()
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('RAG indexing job failed:', message);
      await updateIndexJob(id, { status: 'failed', error_message: message.slice(0, 1000), completed_at: new Date().toISOString() });
    } finally {
      activeIndexJob = null;
    }
  })();
  return { id, startedAt, alreadyRunning: false };
}

export async function getKnowledgeOperationsSummary() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const [rag, logsResult, latestJobResult] = await Promise.all([
    getRagIndexStatus(),
    db.from('dynamic_api_logs').select('status,duration_ms,response_payload,created_at')
      .eq('action', 'web_chat_message').gte('created_at', since).order('created_at', { ascending: false }).limit(1000),
    db.from('rag_index_jobs').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle()
  ]);
  if (logsResult.error) throw logsResult.error;
  const rows = logsResult.data ?? [];
  const durations = rows.map((row) => Number(row.duration_ms)).filter(Number.isFinite).sort((a, b) => a - b);
  const statuses: Record<string, number> = {};
  const models: Record<string, number> = {};
  const retrievalModes: Record<string, number> = {};
  let failovers = 0;
  for (const row of rows) {
    statuses[row.status] = (statuses[row.status] ?? 0) + 1;
    const payload = row.response_payload as { telemetry?: { retrievalMode?: string; generation?: { model?: string; failovers?: number } } } | null;
    const model = payload?.telemetry?.generation?.model;
    const mode = payload?.telemetry?.retrievalMode;
    if (model) models[model] = (models[model] ?? 0) + 1;
    if (mode) retrievalModes[mode] = (retrievalModes[mode] ?? 0) + 1;
    failovers += Number(payload?.telemetry?.generation?.failovers ?? 0);
  }
  return {
    rag,
    chat7d: {
      requests: rows.length,
      statuses,
      models,
      retrievalModes,
      failovers,
      averageDurationMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
      p95DurationMs: durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] : null
    },
    activeIndexJob,
    latestIndexJob: latestJobResult.error ? null : latestJobResult.data
  };
}
