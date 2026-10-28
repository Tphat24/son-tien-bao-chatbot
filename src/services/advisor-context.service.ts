import { env } from '../config/env.js';
import { normalizeText } from '../utils/text.js';
import { detectQueryIntent, searchKnowledge, searchProducts, type KnowledgeRow, type ProductRow } from './catalog.service.js';
import { searchWebsiteLive } from './website-retrieval.service.js';
import { searchKnowledgeVector, searchKnowledgeLexical } from './rag.service.js';
import { fuseKnowledge } from './retrieval-ranking.js';

export type AdvisorContext = {
  products: ProductRow[];
  knowledge: KnowledgeRow[];
  usedLiveWebsite: boolean;
  forceHuman: boolean;
  handoffReason?: string;
  retrieval: {
    mode: 'hybrid' | 'vector' | 'lexical' | 'live' | 'none';
    vectorMatches: number;
    lexicalMatches: number;
    liveMatches: number;
    topSimilarity: number | null;
    vectorError?: string;
  };
};

function policyHandoff(query: string): { forceHuman: boolean; reason?: string } {
  const value = normalizeText(query);
  if (/khieu nai|phan nan|don hang cua toi|ma don|tra cuu don/.test(value)) {
    return { forceHuman: true, reason: 'Yêu cầu cần kiểm tra hồ sơ hoặc xử lý trực tiếp.' };
  }
  if (/bao gia chinh thuc|gia si|du an lon|hop dong/.test(value)) {
    return { forceHuman: true, reason: 'Yêu cầu báo giá hoặc dự án cần nhân viên xác nhận.' };
  }
  return { forceHuman: false };
}

export async function retrieveAdvisorContext(query: string): Promise<AdvisorContext> {
  let vectorError: string | undefined;
  const [products, indexedKnowledge, vectorKnowledge] = await Promise.all([
    searchProducts(query),
    searchKnowledgeLexical(query)
      .catch(() => [] as KnowledgeRow[])
      .then((matches) => matches.length ? matches : searchKnowledge(query, env.RAG_TOP_K)),
    searchKnowledgeVector(query, { limit: env.RAG_TOP_K }).catch((error) => {
      vectorError = error instanceof Error ? error.message : String(error);
      console.warn('RAG vector retrieval unavailable; using lexical fallback:', vectorError);
      return [];
    })
  ]);

  let liveKnowledge: KnowledgeRow[] = [];
  if (indexedKnowledge.length + vectorKnowledge.length < Math.min(2, env.AI_MAX_KNOWLEDGE_DOCS)) {
    liveKnowledge = await searchWebsiteLive(query);
  }

  const knowledge = fuseKnowledge([vectorKnowledge, indexedKnowledge, liveKnowledge], env.AI_MAX_KNOWLEDGE_DOCS, env.RAG_CONTEXT_MAX_CHARS);
  const policy = policyHandoff(query);
  const intent = detectQueryIntent(query);
  const hasEvidence = products.length > 0 || knowledge.length > 0;
  const mode = vectorKnowledge.length && indexedKnowledge.length
    ? 'hybrid'
    : vectorKnowledge.length
      ? 'vector'
      : indexedKnowledge.length
        ? 'lexical'
        : liveKnowledge.length
          ? 'live'
          : 'none';

  return {
    products,
    knowledge,
    usedLiveWebsite: liveKnowledge.length > 0,
    forceHuman: policy.forceHuman || (!hasEvidence && intent !== 'general'),
    handoffReason: policy.reason || (!hasEvidence ? 'Không tìm thấy thông tin xác thực trên website Sơn Tiến Bảo.' : undefined),
    retrieval: {
      mode,
      vectorMatches: vectorKnowledge.length,
      lexicalMatches: indexedKnowledge.length,
      liveMatches: liveKnowledge.length,
      topSimilarity: vectorKnowledge.length ? Math.max(...vectorKnowledge.map((item) => item.retrieval_score ?? 0)) : null,
      ...(vectorError ? { vectorError: vectorError.slice(0, 300) } : {})
    }
  };
}
