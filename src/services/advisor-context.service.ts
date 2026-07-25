import { env } from '../config/env.js';
import { normalizeText } from '../utils/text.js';
import { detectQueryIntent, searchKnowledge, searchProducts, type KnowledgeRow, type ProductRow } from './catalog.service.js';
import { searchWebsiteLive } from './website-retrieval.service.js';

export type AdvisorContext = {
  products: ProductRow[];
  knowledge: KnowledgeRow[];
  usedLiveWebsite: boolean;
  forceHuman: boolean;
  handoffReason?: string;
};

function uniqueKnowledge(documents: KnowledgeRow[]): KnowledgeRow[] {
  const seen = new Set<string>();
  const result: KnowledgeRow[] = [];
  for (const document of documents) {
    const key = document.source_url || `${document.title}:${document.content.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(document);
  }
  return result.slice(0, env.AI_MAX_KNOWLEDGE_DOCS);
}

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
  const [products, indexedKnowledge] = await Promise.all([
    searchProducts(query),
    searchKnowledge(query, env.AI_MAX_KNOWLEDGE_DOCS)
  ]);

  let liveKnowledge: KnowledgeRow[] = [];
  if (indexedKnowledge.length < Math.min(2, env.AI_MAX_KNOWLEDGE_DOCS)) {
    liveKnowledge = await searchWebsiteLive(query);
  }

  const knowledge = uniqueKnowledge([...indexedKnowledge, ...liveKnowledge]);
  const policy = policyHandoff(query);
  const intent = detectQueryIntent(query);
  const hasEvidence = products.length > 0 || knowledge.length > 0;

  return {
    products,
    knowledge,
    usedLiveWebsite: liveKnowledge.length > 0,
    forceHuman: policy.forceHuman || (!hasEvidence && intent !== 'general'),
    handoffReason: policy.reason || (!hasEvidence ? 'Không tìm thấy thông tin xác thực trên website Sơn Tiến Bảo.' : undefined)
  };
}
