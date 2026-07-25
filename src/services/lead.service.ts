import { db } from '../db/supabase.js';
import { sendLeadEmail } from './mail.service.js';
import { sendOwnerZaloNotification } from './zalo-api.service.js';

export type LeadPriority = 'low' | 'normal' | 'high' | 'urgent';

function sourceLabel(source: string): string {
  if (source === 'website_chatbot') return 'Website sontienbao.com';
  if (source === 'zalo_bot_creator') return 'Zalo Bot';
  return source;
}

function buildLeadNotification(input: {
  code: string;
  source: string;
  name?: string;
  phone?: string;
  need: string;
  area?: string;
  budget?: string;
  priority: LeadPriority;
}): string {
  return [
    '🔔 KHÁCH HÀNG MỚI • SƠN TIẾN BẢO',
    '',
    `Mã yêu cầu: ${input.code}`,
    `Nguồn: ${sourceLabel(input.source)}`,
    `Khách: ${input.name ?? 'Chưa cung cấp'}`,
    `SĐT: ${input.phone ?? 'Chưa cung cấp'}`,
    `Nhu cầu: ${input.need}`,
    input.area ? `Khu vực: ${input.area}` : undefined,
    input.budget ? `Ngân sách: ${input.budget}` : undefined,
    `Ưu tiên: ${input.priority}`,
    `Thời gian: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
  ].filter((line): line is string => Boolean(line)).join('\n');
}

export async function createLead(input: {
  userId?: string;
  name?: string;
  phone?: string;
  need: string;
  area?: string;
  budget?: string;
  priority?: LeadPriority;
  source?: string;
}) {
  const recentSince = new Date(Date.now() - 5 * 60_000).toISOString();

  if (input.userId || input.phone) {
    let duplicateQuery = db
      .from('leads')
      .select('*')
      .eq('need', input.need)
      .gte('created_at', recentSince)
      .order('created_at', { ascending: false })
      .limit(1);

    duplicateQuery = input.userId
      ? duplicateQuery.eq('zalo_chatbot_user_id', input.userId)
      : duplicateQuery.eq('phone', input.phone!);

    const { data: duplicates } = await duplicateQuery;
    if (duplicates?.[0]) return duplicates[0];
  }

  const code = `STB-${Date.now().toString(36).toUpperCase()}`;
  const source = input.source ?? 'zalo_chatbot';
  const priority = input.priority ?? 'normal';

  const { data, error } = await db
    .from('leads')
    .insert({
      code,
      zalo_chatbot_user_id: input.userId ?? null,
      name: input.name ?? null,
      phone: input.phone ?? null,
      need: input.need,
      area: input.area ?? null,
      budget: input.budget ?? null,
      priority,
      source,
      status: 'new'
    })
    .select()
    .single();

  if (error) throw error;

  const notification = buildLeadNotification({
    code,
    source,
    name: input.name,
    phone: input.phone,
    need: input.need,
    area: input.area,
    budget: input.budget,
    priority
  });

  void sendLeadEmail(`[Sơn Tiến Bảo] Lead mới ${code}`, notification)
    .catch((mailError) => console.error('lead_email_failed', mailError));

  void sendOwnerZaloNotification(notification)
    .then((sent) => {
      if (sent) console.log('lead_zalo_notification_sent', { code });
    })
    .catch((notifyError) => console.error('lead_zalo_notification_failed', notifyError));

  return data;
}
