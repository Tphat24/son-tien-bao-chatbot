import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { db } from '../db/supabase.js';
import { queryTerms, type KnowledgeRow } from './catalog.service.js';
import { embeddingInput, EMBEDDING_INPUT_VERSION, normalizeEmbedding } from './embedding-input.js';

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
let embeddingUnavailableUntil = 0;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryableEmbeddingError(error: unknown): boolean {
  const candidate = error as { status?: number; message?: string };
  return candidate?.status === 429 || candidate?.status === 503 || /RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(candidate?.message ?? '');
}

function isQuotaEmbeddingError(error: unknown): boolean {
  const candidate = error as { status?: number; message?: string };
  return candidate?.status === 429 || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(candidate?.message ?? '');
}

type KnowledgeDocument = {
  id: string;
  tenant_id: string | null;
  title: string;
  content: string;
  source_url: string | null;
  content_hash: string | null;
};

type VectorMatch = {
  chunk_id: string;
  document_id: string;
  title: string;
  content: string;
  source_url: string | null;
  similarity: number;
  metadata: Record<string, unknown> | null;
};

export type RagIndexResult = {
  documents: number;
  chunks: number;
  skipped: number;
  pruned: number;
};

export type RagIndexStatus = {
  approvedDocuments: number;
  indexedDocuments: number;
  chunks: number;
  missingDocuments: number;
  coveragePercent: number;
};

type CachedEmbedding = { values: number[]; expiresAt: number };
const queryEmbeddingCache = new Map<string, CachedEmbedding>();
let databaseEmbeddingCacheUnavailableUntil = 0;

function embeddingCacheKey(content: string): string {
  return crypto.createHash('sha256').update(`${env.RAG_EMBEDDING_MODEL}\n${EMBEDDING_INPUT_VERSION}\n768\n${content}`).digest('hex');
}

function rememberQueryEmbedding(key: string, values: number[], expiresAt: number): void {
  if (queryEmbeddingCache.size >= 500) {
    const oldest = queryEmbeddingCache.keys().next().value as string | undefined;
    if (oldest) queryEmbeddingCache.delete(oldest);
  }
  queryEmbeddingCache.set(key, { values, expiresAt });
}

async function getCachedQueryEmbedding(content: string): Promise<number[] | null> {
  const key = embeddingCacheKey(content);
  const now = Date.now();
  const local = queryEmbeddingCache.get(key);
  if (local && local.expiresAt > now) return local.values;
  if (local) queryEmbeddingCache.delete(key);

  if (now < databaseEmbeddingCacheUnavailableUntil) return null;
  const { data, error } = await db
    .from('rag_embedding_cache')
    .select('embedding,expires_at')
    .eq('cache_key', key)
    .eq('embedding_model', env.RAG_EMBEDDING_MODEL)
    .gt('expires_at', new Date(now).toISOString())
    .maybeSingle();
  if (error) {
    databaseEmbeddingCacheUnavailableUntil = now + 60_000;
    return null;
  }
  const values = Array.isArray(data?.embedding) ? data.embedding.map(Number) : [];
  if (values.length !== 768 || !values.every(Number.isFinite) || Math.hypot(...values) === 0) return null;
  const expiresAt = new Date(data!.expires_at as string).getTime();
  rememberQueryEmbedding(key, values, expiresAt);
  return values;
}

async function saveQueryEmbedding(content: string, values: number[]): Promise<void> {
  const key = embeddingCacheKey(content);
  const expiresAt = Date.now() + env.RAG_QUERY_CACHE_TTL_MINUTES * 60_000;
  rememberQueryEmbedding(key, values, expiresAt);
  if (Date.now() < databaseEmbeddingCacheUnavailableUntil) return;
  const { error } = await db.from('rag_embedding_cache').upsert({
    cache_key: key,
    embedding_model: env.RAG_EMBEDDING_MODEL,
    embedding: values,
    expires_at: new Date(expiresAt).toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'cache_key' });
  if (error) databaseEmbeddingCacheUnavailableUntil = Date.now() + 60_000;
}

function compactWhitespace(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Character-based chunking keeps Vietnamese text intact and avoids tokenizer coupling. */
export function chunkText(
  value: string,
  maxChars = env.RAG_CHUNK_SIZE,
  overlapChars = env.RAG_CHUNK_OVERLAP
): string[] {
  const text = compactWhitespace(value);
  if (!Number.isInteger(maxChars) || maxChars < 2) throw new Error('Chunk size must be an integer greater than one');
  const safeOverlap = Math.min(Math.max(overlapChars, 0), maxChars - 1);
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf('\n\n', end);
      const sentenceBreak = Math.max(text.lastIndexOf('. ', end), text.lastIndexOf('? ', end), text.lastIndexOf('! ', end));
      const wordBreak = text.lastIndexOf(' ', end);
      const preferred = Math.max(paragraphBreak, sentenceBreak, wordBreak);
      if (preferred > start + Math.floor(maxChars * 0.6)) end = preferred + 1;
    }

    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - safeOverlap);
  }
  return chunks;
}

async function embedContents(
  contents: string[],
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY',
  title?: string
): Promise<number[][]> {
  if (!contents.length) return [];
  if (taskType === 'RETRIEVAL_QUERY' && Date.now() < embeddingUnavailableUntil) {
    throw new Error('Embedding quota circuit breaker is open; lexical retrieval is active');
  }
  let response: Awaited<ReturnType<typeof ai.models.embedContent>> | undefined;
  const maxAttempts = taskType === 'RETRIEVAL_QUERY' ? 1 : 5;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const request = embeddingInput(env.RAG_EMBEDDING_MODEL, contents, taskType, title);
      response = await ai.models.embedContent({
        model: env.RAG_EMBEDDING_MODEL,
        contents: request.contents,
        config: {
          abortSignal: AbortSignal.timeout(taskType === 'RETRIEVAL_QUERY' ? env.RAG_QUERY_TIMEOUT_MS : env.RAG_EMBED_TIMEOUT_MS),
          ...request.config
        }
      });
      break;
    } catch (error) {
      if (taskType === 'RETRIEVAL_QUERY' && isQuotaEmbeddingError(error)) {
        embeddingUnavailableUntil = Date.now() + 5 * 60_000;
        throw error;
      }
      if (!retryableEmbeddingError(error) || attempt === maxAttempts - 1) throw error;
      await wait(1_500 * 2 ** attempt + Math.floor(Math.random() * 500));
    }
  }
  if (!response) throw new Error('Gemini embedding request did not return a response');
  const embeddings = response.embeddings ?? [];
  if (embeddings.length !== contents.length) {
    throw new Error(`Embedding count mismatch: expected ${contents.length}, received ${embeddings.length}`);
  }
  return embeddings.map((embedding) => {
    return normalizeEmbedding(embedding.values);
  });
}

export async function searchKnowledgeVector(
  query: string,
  options: { tenantId?: string; limit?: number; threshold?: number } = {}
): Promise<KnowledgeRow[]> {
  if (!env.RAG_ENABLED || !query.trim()) return [];
  const normalizedQuery = compactWhitespace(query);
  let embedding = await getCachedQueryEmbedding(normalizedQuery);
  if (!embedding) {
    const generated = await embedContents([normalizedQuery], 'RETRIEVAL_QUERY');
    embedding = generated[0] ?? null;
    if (embedding) await saveQueryEmbedding(normalizedQuery, embedding);
  }
  if (!embedding) return [];

  const { data, error } = await db.rpc('match_knowledge_chunks_v2', {
    query_embedding: embedding,
    match_threshold: options.threshold ?? env.RAG_MATCH_THRESHOLD,
    match_count: options.limit ?? env.RAG_TOP_K,
    filter_tenant_id: options.tenantId ?? env.RAG_TENANT_ID,
    filter_embedding_model: env.RAG_EMBEDDING_MODEL,
    filter_input_version: EMBEDDING_INPUT_VERSION
  });
  if (error) throw error;

  return ((data ?? []) as VectorMatch[]).map((match) => ({
    id: match.document_id,
    title: match.title,
    content: match.content,
    source_url: match.source_url,
    approval_status: 'approved',
    retrieval_score: Number(match.similarity),
    chunk_id: match.chunk_id
  }));
}

/** Indexed full-text search for Vietnamese (accent-insensitive), independent of Gemini availability. */
export async function searchKnowledgeLexical(query: string): Promise<KnowledgeRow[]> {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const { data, error } = await db.rpc('search_knowledge_chunks_lexical', {
    query_text: terms.join(' '),
    match_count: env.RAG_TOP_K,
    filter_tenant_id: env.RAG_TENANT_ID,
    filter_embedding_model: env.RAG_EMBEDDING_MODEL,
    filter_input_version: EMBEDDING_INPUT_VERSION
  });
  if (error) throw error;
  return ((data ?? []) as VectorMatch[]).map((match) => ({
    id: match.document_id, title: match.title, content: match.content,
    source_url: match.source_url, approval_status: 'approved', chunk_id: match.chunk_id
  }));
}

export async function indexApprovedKnowledge(tenantId = env.RAG_TENANT_ID): Promise<RagIndexResult> {
  const { data, error } = await db
    .from('knowledge_documents')
    .select('id,tenant_id,title,content,source_url,content_hash')
    .eq('approval_status', 'approved')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: true });
  if (error) throw error;

  let chunksIndexed = 0;
  let skipped = 0;
  const approvedIds = new Set((data ?? []).map((document) => document.id));
  const { data: existingChunkDocuments, error: existingError } = await db
    .from('knowledge_chunks')
    .select('knowledge_document_id')
    .eq('tenant_id', tenantId);
  if (existingError) throw existingError;
  const staleDocumentIds = [...new Set((existingChunkDocuments ?? [])
    .map((row) => row.knowledge_document_id as string)
    .filter((id) => !approvedIds.has(id)))];
  let pruned = 0;
  for (const documentId of staleDocumentIds) {
    const { count, error: pruneError } = await db
      .from('knowledge_chunks')
      .delete({ count: 'exact' })
      .eq('knowledge_document_id', documentId)
      .eq('tenant_id', tenantId);
    if (pruneError) throw pruneError;
    pruned += count ?? 0;
  }

  for (const document of (data ?? []) as KnowledgeDocument[]) {
    const contentHash = document.content_hash || crypto.createHash('sha256').update(document.content).digest('hex');
    const chunks = chunkText(document.content);
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({
      title: document.title, chunks, model: env.RAG_EMBEDDING_MODEL, version: EMBEDDING_INPUT_VERSION
    })).digest('hex');
    const { count: currentChunkCount, error: countError } = await db
      .from('knowledge_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('knowledge_document_id', document.id)
      .eq('tenant_id', tenantId)
      .eq('content_hash', contentHash)
      .eq('metadata->>index_fingerprint', fingerprint)
      .eq('embedding_model', env.RAG_EMBEDDING_MODEL);
    if (countError) throw countError;
    if (chunks.length > 0 && currentChunkCount === chunks.length) {
      skipped += 1;
      continue;
    }

    const records: Array<Record<string, unknown>> = [];
    for (let offset = 0; offset < chunks.length; offset += env.RAG_EMBED_BATCH_SIZE) {
      const batch = chunks.slice(offset, offset + env.RAG_EMBED_BATCH_SIZE);
      const embeddings = await embedContents(batch, 'RETRIEVAL_DOCUMENT', document.title);
      batch.forEach((content, index) => {
        records.push({
          tenant_id: document.tenant_id || tenantId,
          knowledge_document_id: document.id,
          chunk_index: offset + index,
          title: document.title,
          content,
          source_url: document.source_url,
          content_hash: contentHash,
          embedding_model: env.RAG_EMBEDDING_MODEL,
          embedding: embeddings[index],
          metadata: { source: 'knowledge_documents', input_version: EMBEDDING_INPUT_VERSION, index_fingerprint: fingerprint }
        });
      });
      if (offset + env.RAG_EMBED_BATCH_SIZE < chunks.length && env.RAG_EMBED_DELAY_MS > 0) {
        await wait(env.RAG_EMBED_DELAY_MS);
      }
    }

    // Replace a document in one DB transaction; failed inserts preserve its existing index.
    const { error: replaceError } = await db.rpc('replace_knowledge_document_chunks', {
      document_id: document.id, filter_tenant_id: tenantId,
      filter_embedding_model: env.RAG_EMBEDDING_MODEL,
      expected_content: document.content, expected_title: document.title,
      chunks: records
    });
    if (replaceError) throw replaceError;
    chunksIndexed += records.length;
  }

  return { documents: (data ?? []).length, chunks: chunksIndexed, skipped, pruned };
}

export async function getRagIndexStatus(tenantId = env.RAG_TENANT_ID): Promise<RagIndexStatus> {
  const [documentsResult, chunksResult] = await Promise.all([
    db.from('knowledge_documents').select('id', { count: 'exact' })
      .eq('approval_status', 'approved').eq('tenant_id', tenantId).limit(5000),
    db.from('knowledge_chunks').select('knowledge_document_id', { count: 'exact' })
      .eq('tenant_id', tenantId).eq('embedding_model', env.RAG_EMBEDDING_MODEL)
      .eq('metadata->>input_version', EMBEDDING_INPUT_VERSION).limit(10000)
  ]);
  if (documentsResult.error) throw documentsResult.error;
  if (chunksResult.error) throw chunksResult.error;
  const approvedDocuments = documentsResult.count ?? 0;
  const indexedDocuments = new Set((chunksResult.data ?? []).map((row) => row.knowledge_document_id)).size;
  const missingDocuments = Math.max(approvedDocuments - indexedDocuments, 0);
  return {
    approvedDocuments,
    indexedDocuments,
    chunks: chunksResult.count ?? 0,
    missingDocuments,
    coveragePercent: approvedDocuments ? Math.round((indexedDocuments / approvedDocuments) * 1000) / 10 : 100
  };
}
