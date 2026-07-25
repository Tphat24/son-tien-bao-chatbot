import { env } from '../config/env.js';
import { normalizeText } from '../utils/text.js';
import { createLead, type LeadPriority } from './lead.service.js';
import { answerWebMessage, type WebChatSource } from './web-chat.service.js';
import {
  catalogMenuMessage,
  detectCatalogCategory,
  formatCatalogPage,
  listCatalogProducts,
  type CatalogBrowseRequest,
  type CatalogCategoryKey
} from './catalog-browser.service.js';


type CreatedLead = Awaited<ReturnType<typeof createLead>>;


const API_BASE = 'https://bot-api.zaloplatforms.com';
const MAX_TEXT_LENGTH = 2000;
const MESSAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const CONTACT_FLOW_TTL_MS = 30 * 60 * 1000;
const CATALOG_FLOW_TTL_MS = 60 * 60 * 1000;
const ZALO_API_TIMEOUT_MS = 15_000;
const DIRECTOR_PHONE = '0913712195';
const DIRECTOR_ZALO_URL = 'https://zalo.me/0913712195';
const MAX_ZALO_SOURCES = 2;


const seenMessageIds = new Map<string, number>();
const contactFlowUsers = new Map<string, number>();
const catalogSessions = new Map<string, CatalogSession>();


type ZaloId = string | number;


type ZaloUser = {
  id?: ZaloId;
  display_name?: string;
  name?: string;
  is_bot?: boolean;
};


type ZaloChat = {
  id?: ZaloId;
  chat_type?: string;
};


type ZaloMessageContent = {
  text?: string;
};


type ZaloMessage = {
  from?: ZaloUser;
  sender?: ZaloUser;
  chat?: ZaloChat;
  chat_id?: ZaloId;
  user_id?: ZaloId;
  text?: string;
  caption?: string;
  content?: string | ZaloMessageContent;
  message_id?: ZaloId;
  date?: number;
};


type ZaloEventPayload = {
  event_name?: string;
  event?: string;
  message?: ZaloMessage | string;
  from?: ZaloUser;
  sender?: ZaloUser;
  chat?: ZaloChat;
  chat_id?: ZaloId;
  user_id?: ZaloId;
  text?: string;
  message_id?: ZaloId;
  date?: number;
};


export type ZaloWebhookBody = ZaloEventPayload & {
  ok?: boolean;
  result?: ZaloEventPayload;
  data?: ZaloEventPayload;
};


type NormalizedZaloMessage = {
  eventName?: string;
  chatId?: string;
  userId?: string;
  userName?: string;
  messageId?: string;
  text?: string;
  isBot: boolean;
};


type ContactDetails = {
  phone?: string;
  rawPhone?: string;
  name?: string;
  area?: string;
  budget?: string;
  need: string;
  priority: LeadPriority;
};


type CatalogMode = 'menu' | 'browse' | 'brand_prompt' | 'search_prompt';


type CatalogSession = {
  mode: CatalogMode;
  category: CatalogCategoryKey;
  page: number;
  brand?: string;
  query?: string;
  updatedAt: number;
};


const GREETING_PATTERN = /^(?:\/start|start|menu|\/menu|help|xin chào|chào|hello|hi|alo)[!.\s]*$/i;
const CONTACT_INTENT_PATTERN = /(?:báo\s*giá|nhận\s*báo\s*giá|gặp\s*nhân\s*viên|nhân\s*viên\s*tư\s*vấn|liên\s*hệ|gọi\s*lại|tư\s*vấn\s*trực\s*tiếp|chat\s*zalo|gặp\s*giám\s*đốc|để\s*lại\s*(?:số|sđt)|mua\s*sơn|đặt\s*hàng)/i;
const DIRECT_CONTACT_PATTERN = /(?:tư\s*vấn\s*trực\s*tiếp|chat\s*zalo|gặp\s*giám\s*đốc|gặp\s*nhân\s*viên)/i;
const URGENT_PATTERN = /(?:gấp|ngay|hôm nay|càng sớm càng tốt|khẩn)/i;
const PHONE_CANDIDATE_PATTERN = /(?:\+?84|0)(?:[\s.\-()]?\d){8,10}/g;
const LIST_CATALOG_PATTERN = /(?:cac dong|danh sach|liet ke|gom nhung|co nhung|nhung dong nao|nhung loai nao|xem san pham|tat ca san pham)/;


function toStringValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }


  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}


function cleanSeenMessages(): void {
  const cutoff = Date.now() - MESSAGE_CACHE_TTL_MS;
  for (const [id, timestamp] of seenMessageIds) {
    if (timestamp < cutoff) seenMessageIds.delete(id);
  }
}


function isDuplicate(messageId?: string): boolean {
  if (!messageId) return false;
  cleanSeenMessages();
  if (seenMessageIds.has(messageId)) return true;
  seenMessageIds.set(messageId, Date.now());
  return false;
}


function markContactFlow(userId: string): void {
  contactFlowUsers.set(userId, Date.now());
}


function clearContactFlow(userId: string): void {
  contactFlowUsers.delete(userId);
}


function isWaitingForContact(userId: string): boolean {
  const startedAt = contactFlowUsers.get(userId);
  if (!startedAt) return false;


  if (Date.now() - startedAt > CONTACT_FLOW_TTL_MS) {
    contactFlowUsers.delete(userId);
    return false;
  }


  return true;
}


function getCatalogSession(userId: string): CatalogSession | undefined {
  const session = catalogSessions.get(userId);
  if (!session) return undefined;


  if (Date.now() - session.updatedAt > CATALOG_FLOW_TTL_MS) {
    catalogSessions.delete(userId);
    return undefined;
  }


  return session;
}


function setCatalogSession(userId: string, session: CatalogSession): void {
  catalogSessions.set(userId, { ...session, updatedAt: Date.now() });
}


function clearCatalogSession(userId: string): void {
  catalogSessions.delete(userId);
}


function splitText(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= MAX_TEXT_LENGTH) return [normalized];


  const chunks: string[] = [];
  let remaining = normalized;


  while (remaining.length > MAX_TEXT_LENGTH) {
    let cutPosition = remaining.lastIndexOf('\n', MAX_TEXT_LENGTH);
    if (cutPosition < MAX_TEXT_LENGTH * 0.6) cutPosition = remaining.lastIndexOf(' ', MAX_TEXT_LENGTH);
    if (cutPosition < MAX_TEXT_LENGTH * 0.6) cutPosition = MAX_TEXT_LENGTH;


    const chunk = remaining.slice(0, cutPosition).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(cutPosition).trim();
  }


  if (remaining) chunks.push(remaining);
  return chunks;
}


function extractMessageText(
  rawMessage: ZaloMessage | string | undefined,
  payload: ZaloEventPayload
): string | undefined {
  if (typeof rawMessage === 'string') return toStringValue(rawMessage);
  if (!rawMessage) return toStringValue(payload.text);


  const directText = toStringValue(rawMessage.text) ?? toStringValue(rawMessage.caption);
  if (directText) return directText;


  if (typeof rawMessage.content === 'string') return toStringValue(rawMessage.content);
  if (rawMessage.content && typeof rawMessage.content === 'object') {
    return toStringValue(rawMessage.content.text);
  }


  return toStringValue(payload.text);
}


function normalizeWebhookBody(body: ZaloWebhookBody): NormalizedZaloMessage {
  const payload = body.result ?? body.data ?? body;
  const rawMessage = payload.message;
  const messageObject = rawMessage && typeof rawMessage === 'object' ? rawMessage : undefined;
  const sender = messageObject?.from ?? messageObject?.sender ?? payload.from ?? payload.sender;
  const chat = messageObject?.chat ?? payload.chat;


  return {
    eventName:
      toStringValue(payload.event_name) ??
      toStringValue(payload.event) ??
      toStringValue(body.event_name) ??
      toStringValue(body.event),
    chatId:
      toStringValue(chat?.id) ??
      toStringValue(messageObject?.chat_id) ??
      toStringValue(payload.chat_id),
    userId:
      toStringValue(sender?.id) ??
      toStringValue(messageObject?.user_id) ??
      toStringValue(payload.user_id),
    userName: toStringValue(sender?.display_name) ?? toStringValue(sender?.name),
    messageId:
      toStringValue(messageObject?.message_id) ??
      toStringValue(payload.message_id),
    text: extractMessageText(rawMessage, payload),
    isBot: sender?.is_bot === true
  };
}


function isSupportedTextEvent(eventName: string | undefined, text: string | undefined): boolean {
  if (!text) return false;
  if (!eventName) return true;


  const normalizedEventName = eventName.toLowerCase();
  if (normalizedEventName === 'message.text.received') return true;


  return (
    normalizedEventName.includes('message') &&
    (normalizedEventName.includes('received') || normalizedEventName.includes('receive'))
  );
}


function normalizeVietnamPhone(raw: string): string | undefined {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('84')) digits = `0${digits.slice(2)}`;
  if (!digits.startsWith('0')) return undefined;
  if (digits.length < 9 || digits.length > 11) return undefined;
  return digits;
}


function findPhone(text: string): { phone?: string; rawPhone?: string } {
  const candidates = text.match(PHONE_CANDIDATE_PATTERN) ?? [];
  for (const candidate of candidates) {
    const phone = normalizeVietnamPhone(candidate);
    if (phone) return { phone, rawPhone: candidate };
  }
  return {};
}


function cleanField(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(/^[\s,:;|\-–—]+|[\s,:;|\-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 2 ? cleaned : undefined;
}


function extractContactDetails(text: string, userName?: string): ContactDetails {
  const { phone, rawPhone } = findPhone(text);
  const segments = text
    .split(/\s*(?:\||;|\n|\r|\s[-–—]\s)\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);


  const phoneIndex = rawPhone ? segments.findIndex((segment) => segment.includes(rawPhone)) : -1;
  const nameFromSegments = phoneIndex > 0 ? cleanField(segments[phoneIndex - 1]) : undefined;
  const needFromSegments = phoneIndex >= 0 ? cleanField(segments[phoneIndex + 1]) : undefined;
  const areaFromSegments = phoneIndex >= 0 ? cleanField(segments[phoneIndex + 2]) : undefined;
  const labeledName = text.match(
    /(?:họ\s*tên|tên(?:\s*(?:tôi|em|anh|chị))?|tôi\s*là|mình\s*là|em\s*là|anh\s*là|chị\s*là)\s*[:\-]?\s*([^\n,;|]{2,50})/i
  )?.[1];
  const area = text.match(/(?:khu\s*vực|địa\s*chỉ|ở)\s*[:\-]?\s*([^\n,;|]{2,80})/i)?.[1];
  const budget = text.match(/(?:ngân\s*sách|chi\s*phí|tầm\s*giá)\s*[:\-]?\s*([^\n,;|]{2,60})/i)?.[1];
  const name = nameFromSegments ?? cleanField(labeledName) ?? cleanField(userName);


  let need = needFromSegments ?? text;
  if (rawPhone) need = need.replace(rawPhone, ' ');
  if (name) need = need.replace(name, ' ');
  need = need
    .replace(/(?:họ\s*tên|tên|số\s*điện\s*thoại|sđt|phone|liên\s*hệ)\s*[:\-]?/gi, ' ')
    .replace(/[|;]+/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,:;|\-–—]+|[\s,:;|\-–—]+$/g, '')
    .trim();


  if (need.length < 8) need = 'Khách yêu cầu nhân viên Sơn Tiến Bảo liên hệ tư vấn và báo giá.';


  return {
    phone,
    rawPhone,
    name,
    area: areaFromSegments ?? cleanField(area),
    budget: cleanField(budget),
    need: need.slice(0, 1000),
    priority: URGENT_PATTERN.test(text) ? 'urgent' : 'high'
  };
}


function mainMenuMessage(userName?: string): string {
  const greeting = userName ? `Xin chào Anh/Chị ${userName}!` : 'Xin chào Anh/Chị!';
  return [
    '🎨 SƠN TIẾN BẢO',
    '',
    greeting,
    'Anh/Chị cần hỗ trợ nội dung nào?',
    '',
    '1. Xem danh mục sản phẩm',
    '2. Tư vấn chọn loại sơn',
    '3. Tìm sản phẩm theo tên',
    '4. Tính lượng sơn cần dùng',
    '5. Nhận báo giá',
    '6. Xử lý thấm, mốc, bong tróc',
    '7. Tư vấn trực tiếp',
    '',
    'Anh/Chị có thể nhập số hoặc đặt câu hỏi tự do.'
  ].join('\n');
}


function contactPrompt(): string {
  return [
    '📋 NHẬN TƯ VẤN / BÁO GIÁ',
    '',
    'Anh/Chị gửi theo mẫu:',
    'Tên - Số điện thoại - Nhu cầu - Khu vực',
    '',
    'Ví dụ:',
    'Minh - 0912345678 - Sơn ngoại thất nhà 2 tầng - Thủ Đức',
    '',
    'Khi nhận được số điện thoại, hệ thống sẽ lưu yêu cầu và thông báo ngay cho nhân viên Sơn Tiến Bảo.'
  ].join('\n');
}


function directContactMessage(): string {
  return [
    '👤 TƯ VẤN TRỰC TIẾP',
    '',
    'Anh/Chị có thể trao đổi trực tiếp với Giám đốc Sơn Tiến Bảo:',
    '',
    `Zalo: ${DIRECTOR_ZALO_URL}`,
    `Hotline: ${DIRECTOR_PHONE}`,
    `Email: ${env.COMPANY_EMAIL}`
  ].join('\n');
}


function mapMainMenuSelection(text: string): string | undefined {
  const selections: Record<string, string> = {
    '1': '__CATALOG__',
    '2': 'Tôi cần tư vấn chọn loại sơn phù hợp. Hãy hỏi ngắn gọn về vị trí sơn, diện tích, tình trạng bề mặt và ngân sách.',
    '3': '__SEARCH_PRODUCT__',
    '4': 'Tôi muốn tính lượng sơn cần dùng. Hãy hỏi diện tích, loại bề mặt, số lớp sơn và sản phẩm dự kiến.',
    '5': '__CONTACT_FORM__',
    '6': 'Tường nhà tôi bị thấm, mốc hoặc bong tróc. Hãy hướng dẫn kiểm tra nguyên nhân và cách xử lý sơ bộ an toàn.',
    '7': '__DIRECT_CONTACT__'
  };
  return selections[text.trim()];
}


function categoryFromMenuNumber(value: string): CatalogCategoryKey | undefined {
  const categories: Record<string, CatalogCategoryKey> = {
    '1': 'interior',
    '2': 'exterior',
    '3': 'primer',
    '4': 'waterproof',
    '5': 'putty',
    '6': 'industrial',
    '7': 'floor_sport',
    '9': 'all'
  };
  return categories[value];
}


function formatZaloReply(text: string): string {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/[ \t]+(?=\d{1,2}[.)]\s+)/g, '\n\n')
    .replace(/[ \t]+(?=[•✓]\s+)/g, '\n')
    .replace(/\s+(?=(?:Hotline|Email|Website|Nguồn tham khảo|Sản phẩm liên quan):)/gi, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}


function formatSources(sources: WebChatSource[]): string {
  const selected = sources.filter((source) => source?.url).slice(0, MAX_ZALO_SOURCES);
  if (!selected.length) return '';


  return [
    '',
    '',
    '🔗 SẢN PHẨM / TÀI LIỆU LIÊN QUAN',
    '',
    ...selected.flatMap((source, index) => [
      `${index + 1}. ${source.title || 'Xem thông tin sản phẩm'}`,
      source.url
    ])
  ].join('\n');
}


async function callZaloBotApi(method: string, payload: Record<string, unknown>): Promise<unknown> {
  if (!env.ZALO_BOT_TOKEN) throw new Error('ZALO_BOT_TOKEN is not configured');


  const url = `${API_BASE}/bot${env.ZALO_BOT_TOKEN}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(ZALO_API_TIMEOUT_MS)
  });


  const responseText = await response.text();
  let data: unknown = {};
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw_response: responseText };
    }
  }


  const apiResult = data && typeof data === 'object' ? (data as { ok?: boolean }) : {};
  if (!response.ok || apiResult.ok === false) {
    throw new Error(`Zalo Bot API ${method} failed: ${response.status} ${JSON.stringify(data)}`);
  }


  return data;
}


export async function sendZaloText(chatId: string, text: string): Promise<void> {
  const chunks = splitText(text);
  if (!chunks.length) throw new Error('Cannot send an empty Zalo message');


  for (const chunk of chunks) {
    await callZaloBotApi('sendMessage', {
      chat_id: chatId,
      text: chunk
    });
  }
}


async function openCatalogMenu(chatId: string, userId: string): Promise<void> {
  setCatalogSession(userId, {
    mode: 'menu',
    category: 'all',
    page: 1,
    updatedAt: Date.now()
  });
  await sendZaloText(chatId, catalogMenuMessage());
}


async function sendCatalogPage(
  chatId: string,
  userId: string,
  session: CatalogSession
): Promise<void> {
  const request: CatalogBrowseRequest = {
    category: session.category,
    page: session.page,
    pageSize: 5,
    ...(session.brand ? { brand: session.brand } : {}),
    ...(session.query ? { query: session.query } : {})
  };


  const result = await listCatalogProducts(request);
  setCatalogSession(userId, {
    ...session,
    mode: 'browse',
    page: result.page,
    updatedAt: Date.now()
  });
  await sendZaloText(chatId, formatCatalogPage(result));
}


async function openCategory(
  chatId: string,
  userId: string,
  category: CatalogCategoryKey,
  page = 1
): Promise<void> {
  await sendCatalogPage(chatId, userId, {
    mode: 'browse',
    category,
    page,
    updatedAt: Date.now()
  });
}


async function openBrand(chatId: string, userId: string, brand: string, page = 1): Promise<void> {
  await sendCatalogPage(chatId, userId, {
    mode: 'browse',
    category: 'all',
    brand: brand.trim(),
    page,
    updatedAt: Date.now()
  });
}


async function openSearch(chatId: string, userId: string, query: string, page = 1): Promise<void> {
  await sendCatalogPage(chatId, userId, {
    mode: 'browse',
    category: 'all',
    query: query.trim(),
    page,
    updatedAt: Date.now()
  });
}


async function handleCatalogMessage(input: {
  chatId: string;
  userId: string;
  text: string;
}): Promise<boolean> {
  const raw = input.text.trim();
  const normalized = normalizeText(raw);
  const session = getCatalogSession(input.userId);


  if (/^(danh muc|xem danh muc|xem san pham|tat ca san pham)$/.test(normalized)) {
    await openCatalogMenu(input.chatId, input.userId);
    return true;
  }


  const brandMatch = raw.match(/^(?:hãng|hang|thương hiệu|thuong hieu)\s+(.+)$/i);
  const brand = brandMatch?.[1]?.trim();
  if (brand) {
    await openBrand(input.chatId, input.userId, brand);
    return true;
  }


  const searchMatch = raw.match(/^(?:tìm|tim|tìm sản phẩm|tim san pham)\s+(.+)$/i);
  const searchQuery = searchMatch?.[1]?.trim();
  if (searchQuery) {
    await openSearch(input.chatId, input.userId, searchQuery);
    return true;
  }


  const listCategory = detectCatalogCategory(normalized);
  if (!session && listCategory !== 'all' && LIST_CATALOG_PATTERN.test(normalized)) {
    await openCategory(input.chatId, input.userId, listCategory);
    return true;
  }


  if (!session) return false;


  if (/^(0|quay lai|tro lai|menu chinh)$/.test(normalized)) {
    clearCatalogSession(input.userId);
    await sendZaloText(input.chatId, mainMenuMessage());
    return true;
  }


  if (session.mode === 'brand_prompt') {
    if (raw.length < 2) {
      await sendZaloText(input.chatId, 'Anh/Chị nhập tên hãng, ví dụ: Jotun, Nippon hoặc Terraco.');
      return true;
    }
    await openBrand(input.chatId, input.userId, raw);
    return true;
  }


  if (session.mode === 'search_prompt') {
    if (raw.length < 2) {
      await sendZaloText(input.chatId, 'Anh/Chị nhập tên sản phẩm cần tìm, ví dụ: Jotashield.');
      return true;
    }
    await openSearch(input.chatId, input.userId, raw);
    return true;
  }


  if (session.mode === 'menu') {
    if (normalized === '8') {
      setCatalogSession(input.userId, {
        mode: 'brand_prompt',
        category: 'all',
        page: 1,
        updatedAt: Date.now()
      });
      await sendZaloText(input.chatId, '🏷️ Anh/Chị nhập tên hãng cần xem, ví dụ: Jotun, Nippon hoặc Terraco.');
      return true;
    }


    const numberedCategory = categoryFromMenuNumber(normalized);
    if (numberedCategory) {
      await openCategory(input.chatId, input.userId, numberedCategory);
      return true;
    }


    const detectedCategory = detectCatalogCategory(normalized);
    if (detectedCategory !== 'all') {
      await openCategory(input.chatId, input.userId, detectedCategory);
      return true;
    }


    await sendZaloText(input.chatId, 'Anh/Chị nhập số từ 1 đến 9 hoặc gõ tên nhóm sản phẩm.');
    return true;
  }


  if (/^(xem them|tiep|trang tiep|tiep theo)$/.test(normalized)) {
    await sendCatalogPage(input.chatId, input.userId, {
      ...session,
      page: session.page + 1,
      updatedAt: Date.now()
    });
    return true;
  }


  if (/^(trang truoc|quay lai trang|lui)$/.test(normalized)) {
    await sendCatalogPage(input.chatId, input.userId, {
      ...session,
      page: Math.max(1, session.page - 1),
      updatedAt: Date.now()
    });
    return true;
  }


  const explicitPage = normalized.match(/^trang\s+(\d{1,3})$/);
  const explicitPageText = explicitPage?.[1];
  if (explicitPageText) {
    await sendCatalogPage(input.chatId, input.userId, {
      ...session,
      page: Math.max(1, Number(explicitPageText)),
      updatedAt: Date.now()
    });
    return true;
  }


  const categoryWithPage = normalized.match(/^(.*?)\s+(\d{1,3})$/);
  const categoryText = categoryWithPage?.[1]?.trim();
  const categoryPageText = categoryWithPage?.[2];
  if (categoryText && categoryPageText) {
    const category = detectCatalogCategory(categoryText);
    if (category !== 'all') {
      await openCategory(input.chatId, input.userId, category, Math.max(1, Number(categoryPageText)));
      return true;
    }
  }


  const detectedCategory = detectCatalogCategory(normalized);
  if (detectedCategory !== 'all') {
    await openCategory(input.chatId, input.userId, detectedCategory);
    return true;
  }


  return false;
}


async function notifyOwnerOnZalo(
  lead: CreatedLead,
  input: {
    customerChatId: string;
    userId: string;
    userName?: string;
    phone?: string;
    need: string;
    area?: string;
  }
): Promise<void> {
  if (!env.ZALO_ADMIN_CHAT_ID || !lead.isNew) return;


  const message = [
    '🔔 KHÁCH HÀNG MỚI TỪ ZALO BOT',
    '',
    `Mã yêu cầu: ${lead.code}`,
    `Tên: ${input.userName ?? 'Chưa có'}`,
    `SĐT: ${input.phone ?? 'Chưa có'}`,
    `Nhu cầu: ${input.need}`,
    `Khu vực: ${input.area ?? 'Chưa có'}`,
    `Zalo User ID: ${input.userId}`,
    `Chat ID: ${input.customerChatId}`,
    `Thời gian: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
  ].join('\n');


  await sendZaloText(env.ZALO_ADMIN_CHAT_ID, message);
}


async function captureLeadFromMessage(input: {
  chatId: string;
  userId: string;
  userName?: string;
  details: ContactDetails;
}): Promise<boolean> {
  if (!input.details.phone) return false;


  const lead = await createLead({
    userId: input.userId,
    name: input.details.name ?? input.userName,
    phone: input.details.phone,
    need: input.details.need,
    area: input.details.area,
    budget: input.details.budget,
    priority: input.details.priority,
    source: 'zalo_bot_creator'
  });


  clearContactFlow(input.userId);


  const confirmation = [
    '✅ ĐÃ TIẾP NHẬN YÊU CẦU',
    '',
    `Mã yêu cầu: ${lead.code}`,
    `Tên: ${input.details.name ?? input.userName ?? 'Chưa cung cấp'}`,
    `SĐT: ${input.details.phone}`,
    `Nhu cầu: ${input.details.need}`,
    input.details.area ? `Khu vực: ${input.details.area}` : undefined,
    '',
    lead.isNew
      ? 'Thông tin đã được chuyển đến nhân viên Sơn Tiến Bảo. Nhân viên sẽ liên hệ lại sớm.'
      : 'Yêu cầu này đã được ghi nhận trước đó và đang được xử lý.',
    '',
    `Tư vấn trực tiếp: ${DIRECTOR_ZALO_URL}`,
    `Hotline: ${DIRECTOR_PHONE}`
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');


  await sendZaloText(input.chatId, confirmation);
  await notifyOwnerOnZalo(lead, {
    customerChatId: input.chatId,
    userId: input.userId,
    userName: input.details.name ?? input.userName,
    phone: input.details.phone,
    need: input.details.need,
    area: input.details.area
  }).catch((error) => console.error('zalo_owner_lead_notification_failed', error));


  return true;
}


export async function processZaloWebhook(body: ZaloWebhookBody): Promise<void> {
  const normalized = normalizeWebhookBody(body);


  console.log('zalo_bot_webhook_parsed', {
    eventName: normalized.eventName,
    chatId: normalized.chatId,
    userId: normalized.userId,
    userName: normalized.userName,
    isBot: normalized.isBot,
    messageId: normalized.messageId,
    hasText: Boolean(normalized.text)
  });


  if (normalized.isBot) return;
  if (!isSupportedTextEvent(normalized.eventName, normalized.text)) return;
  if (isDuplicate(normalized.messageId)) return;


  const { chatId, userId, userName } = normalized;
  let text = normalized.text?.trim();
  if (!chatId || !userId || !text) return;


  try {
    if (/^\/myid$/i.test(text)) {
      await sendZaloText(
        chatId,
        [
          '🔐 THÔNG TIN QUẢN TRỊ',
          '',
          `Chat ID: ${chatId}`,
          '',
          'Thêm vào Railway Variables:',
          `ZALO_ADMIN_CHAT_ID=${chatId}`
        ].join('\n')
      );
      return;
    }


    if (GREETING_PATTERN.test(text)) {
      clearCatalogSession(userId);
      await sendZaloText(chatId, mainMenuMessage(userName));
      return;
    }


    if (await handleCatalogMessage({ chatId, userId, text })) return;


    const menuSelection = mapMainMenuSelection(text);
    if (menuSelection === '__CATALOG__') {
      await openCatalogMenu(chatId, userId);
      return;
    }


    if (menuSelection === '__SEARCH_PRODUCT__') {
      setCatalogSession(userId, {
        mode: 'search_prompt',
        category: 'all',
        page: 1,
        updatedAt: Date.now()
      });
      await sendZaloText(chatId, '🔎 Anh/Chị nhập tên sản phẩm cần tìm, ví dụ: Jotashield hoặc Majestic.');
      return;
    }


    if (menuSelection === '__DIRECT_CONTACT__') {
      await sendZaloText(chatId, directContactMessage());
      return;
    }


    if (menuSelection === '__CONTACT_FORM__') {
      markContactFlow(userId);
      await sendZaloText(chatId, contactPrompt());
      return;
    }


    if (menuSelection) text = menuSelection;


    if (DIRECT_CONTACT_PATTERN.test(text)) {
      await sendZaloText(chatId, directContactMessage());
      return;
    }


    const contactDetails = extractContactDetails(text, userName);
    if (contactDetails.phone) {
      const captured = await captureLeadFromMessage({
        chatId,
        userId,
        userName,
        details: contactDetails
      });
      if (captured) return;
    }


    if (CONTACT_INTENT_PATTERN.test(text) || isWaitingForContact(userId)) {
      markContactFlow(userId);
      await sendZaloText(chatId, contactPrompt());
      return;
    }


    await callZaloBotApi('sendChatAction', {
      chat_id: chatId,
      action: 'typing'
    }).catch(() => undefined);


    const result = await answerWebMessage({
      sessionId: `zalo-bot:${userId}`,
      message: text,
      userName
    });


    const reply = `${formatZaloReply(result.reply)}${formatSources(result.sources)}`;
    await sendZaloText(chatId, reply);
  } catch (error) {
    console.error('zalo_bot_webhook_processing_failed', error);


    await sendZaloText(
      chatId,
      [
        '⚠️ HỆ THỐNG ĐANG TẠM GIÁN ĐOẠN',
        '',
        'Anh/Chị có thể để lại Tên - SĐT - Nhu cầu để nhân viên liên hệ.',
        `Zalo tư vấn trực tiếp: ${DIRECTOR_ZALO_URL}`,
        `Hotline: ${DIRECTOR_PHONE}`
      ].join('\n')
    ).catch((sendError) => console.error('zalo_bot_fallback_send_failed', sendError));
  }
}


export async function setZaloWebhook(): Promise<unknown> {
  if (!env.ZALO_WEBHOOK_SECRET_TOKEN) {
    throw new Error('ZALO_WEBHOOK_SECRET_TOKEN is not configured');
  }


  return callZaloBotApi('setWebhook', {
    url: `${env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/api/zalo-bot/webhook`,
    secret_token: env.ZALO_WEBHOOK_SECRET_TOKEN
  });
}


export async function getZaloWebhookInfo(): Promise<unknown> {
  return callZaloBotApi('getWebhookInfo', {});
}