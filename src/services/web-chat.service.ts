import { env } from '../config/env.js';
import { retrieveAdvisorContext } from './advisor-context.service.js';
import { generateSafeReply } from './ai.service.js';
import { appendConversationTurn, getConversationHistory } from './conversation.service.js';
import { answerPaintCalculationMessage } from './paint-calculator-chat.service.js';
import { normalizeText } from '../utils/text.js';

export type WebChatSource = {
  title: string;
  url: string;
  type: 'product' | 'document';
};

function buildFocusedRetrievalQuery(message: string, history: Awaited<ReturnType<typeof getConversationHistory>>): string {
  const current = message.trim();
  const normalized = normalizeText(current);
  const isFollowUp =
    current.length < 55 ||
    /loai nao|san pham nao|cai nay|loai nay|gia bao nhieu|quy cach|xem them|con loai khac|loai tot hon|loai re hon|so sanh/.test(normalized);

  if (!isFollowUp) return current;

  const previousUserTurn = [...history]
    .reverse()
    .find((turn) => turn.role === 'user' && turn.content.trim());

  return previousUserTurn ? `${previousUserTurn.content} | ${current}` : current;
}

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
}> {
  const history = await getConversationHistory(input.sessionId);
  const retrievalQuery = buildFocusedRetrievalQuery(input.message, history);

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
      handoffRecommended: Boolean(calculator.handoffRecommended)
    };
  }

  const context = await retrieveAdvisorContext(retrievalQuery);

  const reply = await generateSafeReply({
    userText: input.message,
    userName: input.userName,
    products: context.products,
    knowledge: context.knowledge,
    history,
    forceHuman: context.forceHuman,
    handoffReason: context.handoffReason,
    usedLiveWebsite: context.usedLiveWebsite,
    channel: 'website'
  });

  await appendConversationTurn({
    userId: input.sessionId,
    userName: input.userName,
    role: 'assistant',
    content: reply
  });

  return {
  reply,
  sources: [],
  handoffRecommended:
    context.forceHuman ||
    reply.includes(env.COMPANY_HOTLINE)
  };
}
