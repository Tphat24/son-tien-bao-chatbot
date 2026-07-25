import { db } from '../db/supabase.js';
import { clip } from '../utils/text.js';

export type ConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

export async function getConversationHistory(userId: string): Promise<ConversationTurn[]> {
  try {
    const { data, error } = await db
      .from('chat_sessions')
      .select('last_messages')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !Array.isArray(data?.last_messages)) return [];
    return (data.last_messages as ConversationTurn[]).slice(-8);
  } catch {
    return [];
  }
}

export async function appendConversationTurn(input: {
  userId: string;
  userName?: string;
  role: 'user' | 'assistant';
  content: string;
}): Promise<void> {
  try {
    const current = await getConversationHistory(input.userId);
    const next: ConversationTurn[] = [
      ...current,
      {
        role: input.role,
        content: clip(input.content, 900),
        created_at: new Date().toISOString()
      }
    ].slice(-8);

    await db.from('chat_sessions').upsert({
      user_id: input.userId,
      user_name: input.userName ?? null,
      last_messages: next,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
  } catch (error) {
    console.warn('Could not store conversation memory:', String(error));
  }
}
