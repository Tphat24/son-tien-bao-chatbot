import { env } from '../config/env.js';
import { retrieveAdvisorContext } from './advisor-context.service.js';
import { generateSafeReply } from './ai.service.js';
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

  const sources: WebChatSource[] = [];

  return {
    reply,
    sources,
    handoffRecommended: context.forceHuman || reply.includes(env.COMPANY_HOTLINE)
  };
}
