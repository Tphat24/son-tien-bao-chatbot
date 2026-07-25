import type { ChatbotButton, ChatbotMessage, ChatbotResponse } from '../types/zalo-chatbot.js';
import { clip } from './text.js';

export function textMessage(text: string, buttons?: ChatbotButton[]): ChatbotMessage {
  const safeButtons = buttons?.slice(0, 5);
  return { type: 'text', text: clip(text, 900), ...(safeButtons?.length ? { buttons: safeButtons } : {}) };
}

export function chatbotResponse(messages: ChatbotMessage[]): ChatbotResponse {
  return { version: 'chatbot', content: { messages: messages.slice(0, 5) } };
}

export function fallbackResponse(): ChatbotResponse {
  return chatbotResponse([
    textMessage('Hệ thống đang bận hoặc phản hồi chậm. Anh/Chị vui lòng chọn lại nội dung hoặc để lại số điện thoại để nhân viên hỗ trợ.', [
      { name: 'Tư vấn sản phẩm', type: 'query', payload: 'TU_VAN_SAN_PHAM' },
      { name: 'Gặp nhân viên', type: 'query', payload: 'GAP_NHAN_VIEN' }
    ])
  ]);
}
