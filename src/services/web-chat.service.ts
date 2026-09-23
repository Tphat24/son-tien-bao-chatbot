import { env } from '../config/env.js';
import { retrieveAdvisorContext } from './advisor-context.service.js';
import { generateSafeReply } from './ai.service.js';
import type { AiGenerationTelemetry } from './ai.service.js';
import { appendConversationTurn, getConversationHistory } from './conversation.service.js';
import { answerPaintCalculationMessage } from './paint-calculator-chat.service.js';

export type WebChatSource = {
  title: string;
  url: string;
  type: 'product' | 'document';
};

function uniqueSources(sources: WebChatSource[]): WebChatSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (!source.url || seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  }).slice(0, 4);
}

export async function answerWebMessage(input: {
  sessionId: string;
  message: string;
  userName?: string;
}): Promise<{
  reply: string;
  sources: WebChatSource[];
  handoffRecommended: boolean;
  telemetry: {
    retrievalMode: string;
    vectorMatches: number;
    lexicalMatches: number;
    liveMatches: number;
    topSimilarity: number | null;
    vectorError?: string;
    generation: AiGenerationTelemetry;
  };
}> {
  const history = await getConversationHistory(input.sessionId);
  const retrievalQuery = [
    ...history.slice(-4).map((turn) => turn.content),
    input.message
  ].join(' | ');

  await appendConversationTurn({
    userId: input.sessionId,
    userName: input.userName,
    role: 'user',
    content: input.message
  });

  const calculator = answerPaintCalculationMessage({
    message: input.message,
    history
  });
  if (calculator.handled && calculator.reply) {
    await appendConversationTurn({
      userId: input.sessionId,
      userName: input.userName,
      role: 'assistant',
      content: calculator.reply
    });
    return {
      reply: calculator.reply,
      sources: [],
      handoffRecommended: Boolean(calculator.handoffRecommended),
      telemetry: {
        retrievalMode: 'calculator',
        vectorMatches: 0,
        lexicalMatches: 0,
        liveMatches: 0,
        topSimilarity: null,
        generation: { model: null, attempts: 0, failovers: 0, durationMs: 0, noData: false }
      }
    };
  }

  const context = await retrieveAdvisorContext(retrievalQuery);
  let generation: AiGenerationTelemetry = { model: null, attempts: 0, failovers: 0, durationMs: 0, noData: false };

  const reply = await generateSafeReply({
    userText: input.message,
    userName: input.userName,
    products: context.products,
    knowledge: context.knowledge,
    history,
    forceHuman: context.forceHuman,
    handoffReason: context.handoffReason,
    usedLiveWebsite: context.usedLiveWebsite,
    channel: 'website',
    onTelemetry: (value) => { generation = value; }
  });

  await appendConversationTurn({
    userId: input.sessionId,
    userName: input.userName,
    role: 'assistant',
    content: reply
  });

  const sources = uniqueSources([
    ...context.products
      .filter((product) => Boolean(product.source_url))
      .map((product) => ({ title: product.name, url: product.source_url!, type: 'product' as const })),
    ...context.knowledge
      .filter((document) => Boolean(document.source_url))
      .map((document) => ({ title: document.title, url: document.source_url!, type: 'document' as const }))
  ]);

  return {
    reply,
    sources,
    handoffRecommended: context.forceHuman || reply.includes(env.COMPANY_HOTLINE),
    telemetry: {
      retrievalMode: context.retrieval.mode,
      vectorMatches: context.retrieval.vectorMatches,
      lexicalMatches: context.retrieval.lexicalMatches,
      liveMatches: context.retrieval.liveMatches,
      topSimilarity: context.retrieval.topSimilarity,
      ...(context.retrieval.vectorError ? { vectorError: context.retrieval.vectorError } : {}),
      generation
    }
  };
}
