export type ChatbotButton =
  | { name: string; type: 'url'; url: string }
  | { name: string; type: 'phone'; payload: string }
  | { name: string; type: 'query'; payload: string };

export type ChatbotMessage =
  | { type: 'text'; text: string; buttons?: ChatbotButton[] }
  | { type: 'image'; image_url: string; caption?: string }
  | {
      type: 'list';
      elements: Array<{
        title: string;
        subtitle?: string;
        image_url?: string;
        action?: { type: 'url'; url: string } | { type: 'query'; payload: string };
      }>;
    };

export interface ChatbotResponse {
  version: 'chatbot';
  content: { messages: ChatbotMessage[] };
}

export interface DynamicRequestInput {
  action: string;
  message: string;
  userId?: string;
  userName?: string;
  phone?: string;
  area?: string;
  budget?: string;
  sku?: string;
  surfaceAreaM2?: number;
  coats?: number;
  wastePercent?: number;
  raw: Record<string, unknown>;
}
