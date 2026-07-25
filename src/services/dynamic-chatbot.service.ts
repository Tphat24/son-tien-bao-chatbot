import { env } from '../config/env.js';
import type { ChatbotResponse, DynamicRequestInput } from '../types/zalo-chatbot.js';
import { chatbotResponse, textMessage } from '../utils/chatbot-response.js';
import { clip } from '../utils/text.js';
import { createAiJob, getLatestAiJob, isJobExpired } from './ai-job.service.js';
import { getProductBySku, searchProducts } from './catalog.service.js';
import { createLead } from './lead.service.js';
import { calculatePaint } from './paint-calculator.service.js';

const menuButtons = [
  { name: 'Tư vấn chọn sơn', type: 'query' as const, payload: 'TU_VAN_SAN_PHAM' },
  { name: 'Tính lượng sơn', type: 'query' as const, payload: 'TINH_LUONG_SON' },
  { name: 'Nhận báo giá', type: 'query' as const, payload: 'NHAN_BAO_GIA' },
  { name: 'Gặp nhân viên', type: 'query' as const, payload: 'GAP_NHAN_VIEN' }
];

const resultButtons = [
  { name: 'Xem kết quả', type: 'query' as const, payload: 'AI_RESULT' },
  { name: 'Gặp nhân viên', type: 'query' as const, payload: 'GAP_NHAN_VIEN' }
];

function formatMoney(value: number | null): string {
  return value === null ? 'Liên hệ' : `${new Intl.NumberFormat('vi-VN').format(value)}đ`;
}

function productResponse(products: Awaited<ReturnType<typeof searchProducts>>): ChatbotResponse {
  if (!products.length) {
    return chatbotResponse([
      textMessage('Em chưa tìm thấy sản phẩm đã được duyệt phù hợp. Anh/Chị vui lòng nhập rõ hãng, loại sơn hoặc bề mặt cần sơn.', [
        { name: 'Gặp nhân viên', type: 'query', payload: 'GAP_NHAN_VIEN' }
      ])
    ]);
  }
  const elements = products.slice(0, 5).map((product) => ({
    title: product.name,
    subtitle: clip(`${product.brand ?? 'Sơn Tiến Bảo'} · ${product.category ?? 'Sản phẩm sơn'} · Giá tham khảo: ${formatMoney(product.price)}`, 160),
    ...(product.image_url ? { image_url: product.image_url } : {}),
    ...(product.source_url ? { action: { type: 'url' as const, url: product.source_url } } : {})
  }));
  return chatbotResponse([
    { type: 'list', elements },
    textMessage('Giá và tồn kho có thể thay đổi. Anh/Chị chọn sản phẩm hoặc để lại nhu cầu để nhân viên xác nhận.', [
      { name: 'Nhận báo giá', type: 'query', payload: 'NHAN_BAO_GIA' },
      { name: 'Gặp nhân viên', type: 'query', payload: 'GAP_NHAN_VIEN' }
    ])
  ]);
}

async function aiStartResponse(input: DynamicRequestInput): Promise<ChatbotResponse> {
  if (!input.message) {
    return chatbotResponse([textMessage('Anh/Chị hãy gửi câu hỏi hoặc mô tả nhu cầu. Ví dụ: “Em cần sơn phòng ngủ nhẹ mùi, dễ lau chùi” hoặc “Tường ngoài trời bị thấm nên xử lý thế nào?”.', menuButtons)]);
  }

  if (!input.userId) {
    return chatbotResponse([
      textMessage('Kịch bản Zalo cần truyền user_id để em ghi nhớ cuộc trò chuyện và trả đúng kết quả tư vấn. Anh/Chị vui lòng thử lại từ luồng tư vấn.', menuButtons)
    ]);
  }

  const latest = await getLatestAiJob(input.userId);
  if (latest && !isJobExpired(latest) && latest.question === input.message) {
    if (latest.status === 'completed' && latest.answer) {
      return chatbotResponse([textMessage(latest.answer, [
        { name: 'Hỏi tiếp', type: 'query', payload: 'TU_VAN_SAN_PHAM' },
        { name: 'Gặp nhân viên', type: 'query', payload: 'GAP_NHAN_VIEN' }
      ])]);
    }
    if (latest.status === 'pending' || latest.status === 'processing') {
      return chatbotResponse([textMessage('Em đang kiểm tra sản phẩm và tài liệu trên website Sơn Tiến Bảo. Anh/Chị bấm “Xem kết quả” sau vài giây.', resultButtons)]);
    }
  }

  await createAiJob({
    userId: input.userId,
    question: input.message,
    userName: input.userName
  });

  return chatbotResponse([
    textMessage('Em đã nhận câu hỏi và đang đối chiếu dữ liệu trên sontienbao.com. Anh/Chị bấm “Xem kết quả” sau khoảng 5–15 giây.', resultButtons)
  ]);
}

async function aiResultResponse(input: DynamicRequestInput): Promise<ChatbotResponse> {
  if (!input.userId) {
    return chatbotResponse([textMessage('Kịch bản chưa truyền user_id nên em chưa thể lấy đúng kết quả. Anh/Chị vui lòng thử lại từ luồng tư vấn.', menuButtons)]);
  }
  const job = await getLatestAiJob(input.userId);
  if (!job || isJobExpired(job)) {
    return chatbotResponse([textMessage('Em chưa thấy yêu cầu AI gần đây. Anh/Chị vui lòng gửi lại nhu cầu tư vấn.', menuButtons)]);
  }
  if (job.status === 'completed' && job.answer) {
    return chatbotResponse([
      textMessage(job.answer, [
        { name: 'Nhận báo giá', type: 'query', payload: 'NHAN_BAO_GIA' },
        { name: 'Gặp nhân viên', type: 'query', payload: 'GAP_NHAN_VIEN' }
      ])
    ]);
  }
  if (job.status === 'failed') {
    console.error('Latest AI job failed:', job.error_message);
    return chatbotResponse([textMessage(`Em chưa xử lý được câu hỏi này. Anh/Chị vui lòng liên hệ nhân viên qua hotline ${env.COMPANY_HOTLINE} hoặc email ${env.COMPANY_EMAIL}.`, [
      { name: 'Gọi hotline', type: 'phone', payload: env.COMPANY_HOTLINE },
      { name: 'Gặp nhân viên', type: 'query', payload: 'GAP_NHAN_VIEN' }
    ])]);
  }
  return chatbotResponse([textMessage('Em vẫn đang kiểm tra website. Anh/Chị chờ thêm vài giây rồi bấm lại “Xem kết quả”.', resultButtons)]);
}

export async function handleDynamicRequest(input: DynamicRequestInput): Promise<ChatbotResponse> {
  switch (input.action) {
    case 'welcome':
    case 'menu':
      return chatbotResponse([
        textMessage(`Xin chào Anh/Chị! Em là trợ lý tư vấn của ${env.COMPANY_NAME}. Em hỗ trợ chọn sơn, tính lượng sơn, xem sản phẩm và ghi nhận báo giá.`, menuButtons)
      ]);

    case 'product_search':
    case 'products': {
      const products = await searchProducts(input.message || input.sku || 'sơn');
      return products.length ? productResponse(products) : aiStartResponse(input);
    }

    case 'paint_calculator':
    case 'calculator': {
      if (!input.sku || input.surfaceAreaM2 === undefined) {
        return chatbotResponse([
          textMessage('Để tính lượng sơn, kịch bản cần truyền: mã sản phẩm (sku), diện tích m², số lớp và tỷ lệ hao hụt. Anh/Chị vui lòng chọn lại luồng “Tính lượng sơn”.', [
            { name: 'Tính lượng sơn', type: 'query', payload: 'TINH_LUONG_SON' }
          ])
        ]);
      }
      const product = await getProductBySku(input.sku);
      if (!product) return chatbotResponse([textMessage('Sản phẩm không tồn tại hoặc chưa được duyệt. Anh/Chị vui lòng chọn sản phẩm khác.')]);
      try {
        const calculation = calculatePaint({
          areaM2: input.surfaceAreaM2,
          coats: input.coats ?? product.recommended_coats ?? 2,
          wastePercent: input.wastePercent ?? 10,
          product
        });
        const packageText = calculation.packages.length
          ? calculation.packages.map((item) => `${item.quantity} × ${item.size}L`).join(' + ')
          : 'Chưa có quy cách đóng gói dạng số trong hệ thống';
        return chatbotResponse([
          textMessage(`Ước tính cho ${product.name}: ${calculation.areaM2}m² × ${calculation.coats} lớp, định mức an toàn ${calculation.coverageUsed}m²/L/lớp, hao hụt ${calculation.wastePercent}% → cần khoảng ${calculation.liters}L. Quy cách gợi ý: ${packageText}. Đây là kết quả tham khảo; bề mặt thực tế có thể làm thay đổi lượng sơn.`, [
            { name: 'Nhân viên kiểm tra', type: 'query', payload: 'GAP_NHAN_VIEN' },
            { name: 'Nhận báo giá', type: 'query', payload: 'NHAN_BAO_GIA' }
          ])
        ]);
      } catch {
        return chatbotResponse([textMessage('Sản phẩm này chưa có định mức phủ dạng cấu trúc nên hệ thống không tự đoán. Anh/Chị vui lòng chọn nhân viên kiểm tra.', [{ name: 'Gặp nhân viên', type: 'query', payload: 'GAP_NHAN_VIEN' }])]);
      }
    }

    case 'lead':
    case 'quotation':
    case 'human_support': {
      const need = input.message || 'Khách yêu cầu nhân viên tư vấn';
      const lead = await createLead({
        userId: input.userId,
        name: input.userName,
        phone: input.phone,
        need,
        area: input.area,
        budget: input.budget,
        priority: input.action === 'human_support' ? 'high' : 'normal'
      });
      return chatbotResponse([
        textMessage(`Em đã ghi nhận yêu cầu ${lead.code}. Thông tin đã được lưu để nhân viên kiểm tra. Em chưa thể khẳng định nhân viên đã tiếp nhận ngay lúc này. Hotline hỗ trợ: ${env.COMPANY_HOTLINE}.`, [
          { name: 'Gọi hotline', type: 'phone', payload: env.COMPANY_HOTLINE },
          { name: 'Về menu', type: 'query', payload: 'MENU_CHINH' }
        ])
      ]);
    }

    case 'contact':
      return chatbotResponse([
        textMessage(`Hotline: ${env.COMPANY_HOTLINE}\nEmail: ${env.COMPANY_EMAIL}\nWebsite: ${env.COMPANY_WEBSITE}`, [
          { name: 'Gọi hotline', type: 'phone', payload: env.COMPANY_HOTLINE },
          { name: 'Mở website', type: 'url', url: env.COMPANY_WEBSITE }
        ])
      ]);

    case 'ai_result':
    case 'result':
      return aiResultResponse(input);

    case 'ai':
    default:
      return aiStartResponse(input);
  }
}
