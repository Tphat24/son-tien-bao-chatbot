import type { KnowledgeRow } from './catalog.service.js';
import { normalizeText } from '../utils/text.js';
import type { ConversationTurn } from './conversation.service.js';

/** Keep the current question in charge. Only short follow-ups inherit user context. */
export function buildRetrievalQuery(message: string, history: ConversationTurn[]): string {
  const current = message.trim();
  const normalized = normalizeText(current);
  const followUp = /\b(loai nay|loai do|san pham nay|san pham do|con no|no co|vay|the con|bao nhieu|may lop|dinh muc|mau nao)\b/.test(normalized);
  if (!followUp || current.length > 180) return current;
  const previous = history.filter((turn) => turn.role === 'user').slice(-2)
    .map((turn) => turn.content.slice(0, 250));
  return [...previous, current].join(' | ');
}

export function knowledgeIdentity(document: KnowledgeRow): string {
  return document.source_url || document.id || `${document.title}:${document.content.slice(0, 120)}`;
}

/** Rank fusion compares ranks rather than incompatible cosine and keyword scores.
 * Each document votes once per retriever; distinct matching passages are retained.
 */
export function fuseKnowledge(
  lists: KnowledgeRow[][],
  maxDocuments: number,
  contextMaxChars: number
): KnowledgeRow[] {
  const candidates = new Map<string, { document: KnowledgeRow; score: number; passages: Set<string> }>();
  for (const list of lists) {
    const seen = new Set<string>();
    let rank = 0;
    for (const document of list) {
      const key = knowledgeIdentity(document);
      let entry = candidates.get(key);
      if (!entry) {
        entry = { document: { ...document }, score: 0, passages: new Set() };
        candidates.set(key, entry);
      }
      if (!seen.has(key)) {
        rank += 1;
        entry.score += 1 / (60 + rank);
        seen.add(key);
      }
      if (entry.passages.size < 3 && ![...entry.passages].some((passage) => passage.includes(document.content) || document.content.includes(passage))) {
        // Keep selected vector passages ahead of a possibly much longer full document.
        entry.passages.add(document.content);
      }
    }
  }
  let remaining = contextMaxChars;
  const result: KnowledgeRow[] = [];
  for (const candidate of [...candidates.values()].sort((a, b) => b.score - a.score)) {
    if (result.length >= maxDocuments || remaining < 200) break;
    const content = [...candidate.passages].join('\n\n').slice(0, Math.min(4200, remaining));
    if (!content) continue;
    result.push({ ...candidate.document, content });
    remaining -= content.length;
  }
  return result;
}
