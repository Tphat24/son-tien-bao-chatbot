import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { db } from '../db/supabase.js';
import type { KnowledgeRow } from './catalog.service.js';

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryableEmbeddingError(error: unknown): boolean {
  const candidate = error as { status?: number; message?: string };
  return candidate?.status === 429 || candidate?.status === 503 || /RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(candidate?.message ?? '');
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
};

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
  let response: Awaited<ReturnType<typeof ai.models.embedContent>> | undefined;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      response = await ai.models.embedContent({
        model: env.RAG_EMBEDDING_MODEL,
        contents,
        config: {
          abortSignal: AbortSignal.timeout(env.RAG_EMBED_TIMEOUT_MS),
          outputDimensionality: 768,
          taskType,
          ...(taskType === 'RETRIEVAL_DOCUMENT' && title ? { title } : {})
        }
      });
      break;
    } catch (error) {
      if (!retryableEmbeddingError(error) || attempt === 4) throw error;
      await wait(1_500 * 2 ** attempt + Math.floor(Math.random() * 500));
    }
  }
  if (!response) throw new Error('Gemini embedding request did not return a response');
  const embeddings = response.embeddings ?? [];
  if (embeddings.length !== contents.length) {
    throw new Error(`Embedding count mismatch: expected ${contents.length}, received ${embeddings.length}`);
  }
  return embeddings.map((embedding) => {
    if (!embedding.values?.length) throw new Error('Gemini returned an empty embedding');
    return embedding.values;
  });
}

export async function searchKnowledgeVector(
  query: string,
  options: { tenantId?: string; limit?: number; threshold?: number } = {}
): Promise<KnowledgeRow[]> {
  if (!env.RAG_ENABLED || !query.trim()) return [];
  const [embedding] = await embedContents([query.trim()], 'RETRIEVAL_QUERY');
  if (!embedding) return [];

  const { data, error } = await db.rpc('match_knowledge_chunks', {
    query_embedding: embedding,
    match_threshold: options.threshold ?? env.RAG_MATCH_THRESHOLD,
    match_count: options.limit ?? env.RAG_TOP_K,
    filter_tenant_id: options.tenantId ?? env.RAG_TENANT_ID
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
  for (const document of (data ?? []) as KnowledgeDocument[]) {
    const contentHash = document.content_hash || crypto.createHash('sha256').update(document.content).digest('hex');
    const chunks = chunkText(document.content);
    const { count: currentChunkCount, error: countError } = await db
      .from('knowledge_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('knowledge_document_id', document.id)
      .eq('content_hash', contentHash)
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
          metadata: { source: 'knowledge_documents' }
        });
      });
      if (offset + env.RAG_EMBED_BATCH_SIZE < chunks.length && env.RAG_EMBED_DELAY_MS > 0) {
        await wait(env.RAG_EMBED_DELAY_MS);
      }
    }

    const { error: deleteError } = await db.from('knowledge_chunks').delete().eq('knowledge_document_id', document.id);
    if (deleteError) throw deleteError;
    for (let offset = 0; offset < records.length; offset += 100) {
      const { error: insertError } = await db.from('knowledge_chunks').insert(records.slice(offset, offset + 100));
      if (insertError) throw insertError;
    }
    chunksIndexed += records.length;
  }

  return { documents: (data ?? []).length, chunks: chunksIndexed, skipped };
}
