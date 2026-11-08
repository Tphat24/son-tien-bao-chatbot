import type { ConversationTurn } from './conversation.service.js';
import type { ComparisonProduct } from './product-comparison.service.js';

export function buildHandoff(input: { need: string; area?: string; budget?: string; history: ConversationTurn[]; products?: ComparisonProduct[] }) {
  const transcript = input.history.slice(-8).map((turn) => ({ role: turn.role, content: turn.content.slice(0, 12000), created_at: turn.created_at }));
  const customerTurns = transcript.filter((turn) => turn.role === 'user').map((turn) => turn.content.slice(0, 900));
  const summary = [
    `Nhu cầu khách xác nhận: ${input.need.trim()}`,
    `Khu vực khách cung cấp: ${input.area?.trim() || 'Chưa cung cấp'}`,
    `Ngân sách khách cung cấp: ${input.budget?.trim() || 'Chưa cung cấp'}`,
    `Sản phẩm khách chọn so sánh: ${input.products?.length ? input.products.map((p) => `${p.name} (${p.sku})`).join('; ') : 'Chưa chọn'}`,
    customerTurns.length ? `Lời khách trong trao đổi gần đây:\n${customerTurns.map((text) => `- ${text}`).join('\n')}` : 'Chưa có trao đổi trước biểu mẫu.',
    'Nhân viên cần xác nhận: diện tích thực tế, tình trạng bề mặt, định mức và phương án sản phẩm phù hợp. Câu trả lời của bot trong lịch sử chưa thay thế xác nhận của nhân viên.'
  ].join('\n\n');
  return { summary, transcript };
}
