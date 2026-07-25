import { env } from '../config/env.js';
import { normalizeText } from '../utils/text.js';

/**
 * Menu chatbot cho Zalo OA (yêu cầu mục 4).
 *
 * Hỗ trợ:
 *  - Nút bấm (payload).
 *  - Tin nhắn văn bản tự nhiên.
 *  - Từ khóa gần đúng, không dấu, lỗi chính tả phổ biến.
 *
 * Nội dung câu trả lời mặc định lấy từ ENV (thông tin doanh nghiệp) để
 * quản trị viên đổi được mà không sửa mã nguồn. Các câu trả lời chi tiết
 * (chính sách, hướng dẫn) sẽ được bộ não AI (RAG) trả lời khi khách hỏi tự do.
 */

export type MenuButton = { title: string; payload: string };

export type MenuResolution = {
  reply?: string;
  buttons?: MenuButton[];
  buttonsHeader?: string;
  handoff?: boolean;
  handoffReason?: string;
};

/** Menu chính hiển thị tối đa 5 nút (giới hạn template list của Zalo OA). */
export function buildMainMenuButtons(): MenuButton[] {
  return [
    { title: 'Tư vấn chọn sơn', payload: 'MENU_ADVISE' },
    { title: 'Tính lượng sơn', payload: 'MENU_CALC' },
    { title: 'Nhận báo giá', payload: 'MENU_QUOTE' },
    { title: 'Xem sản phẩm', payload: 'MENU_PRODUCTS' },
    { title: 'Gặp nhân viên', payload: 'MENU_HUMAN' }
  ];
}

/** Menu mở rộng (khi khách hỏi "xem thêm"). */
export function buildExtendedMenuButtons(): MenuButton[] {
  return [
    { title: 'Chọn màu sơn', payload: 'MENU_COLOR' },
    { title: 'Chống thấm & xử lý tường', payload: 'MENU_WATERPROOF' },
    { title: 'Chính sách giao hàng', payload: 'MENU_DELIVERY' },
    { title: 'Hướng dẫn thi công', payload: 'MENU_GUIDE' },
    { title: 'Tra cứu đơn hàng', payload: 'MENU_ORDER' }
  ];
}

type MenuKey =
  | 'MENU_MAIN'
  | 'MENU_ADVISE'
  | 'MENU_CALC'
  | 'MENU_QUOTE'
  | 'MENU_PRODUCTS'
  | 'MENU_COLOR'
  | 'MENU_WATERPROOF'
  | 'MENU_DELIVERY'
  | 'MENU_GUIDE'
  | 'MENU_ORDER'
  | 'MENU_HUMAN';

/** Từ khóa (dạng đã normalize không dấu) map tới menu. */
const KEYWORD_MAP: Array<{ key: MenuKey; keywords: string[] }> = [
  { key: 'MENU_MAIN', keywords: ['menu', 'bat dau', 'quay lai', 've menu'] },
  { key: 'MENU_ADVISE', keywords: ['tu van', 'chon son', 'tu van chon son', 'son loai nao', 'nen dung son gi'] },
  { key: 'MENU_CALC', keywords: ['tinh luong son', 'tinh son', 'can bao nhieu son', 'may thung son', 'tinh dinh muc'] },
  { key: 'MENU_QUOTE', keywords: ['bao gia', 'nhan bao gia', 'gia bao nhieu', 'xin gia', 'gia ca'] },
  { key: 'MENU_PRODUCTS', keywords: ['xem san pham', 'san pham', 'danh muc', 'cac loai son', 'catalog'] },
  { key: 'MENU_COLOR', keywords: ['chon mau', 'mau son', 'bang mau', 'ma mau', 'phoi mau'] },
  { key: 'MENU_WATERPROOF', keywords: ['chong tham', 'xu ly tuong', 'tuong tham', 'chong am', 'nam moc'] },
  { key: 'MENU_DELIVERY', keywords: ['giao hang', 'ship', 'van chuyen', 'chinh sach giao'] },
  { key: 'MENU_GUIDE', keywords: ['huong dan thi cong', 'thi cong', 'cach son', 'huong dan son'] },
  { key: 'MENU_ORDER', keywords: ['tra cuu don', 'don hang', 'kiem tra don', 'trang thai don'] },
  { key: 'MENU_HUMAN', keywords: ['gap nhan vien', 'nhan vien', 'nguoi that', 'tu van truc tiep', 'goi dien', 'lien he'] }
];

/**
 * Nhận diện menu từ payload nút hoặc văn bản.
 * Trả về undefined nếu không khớp menu nào (khi đó route sẽ đưa vào AI).
 */
export function resolveMenuPayload(input: string): MenuResolution | undefined {
  const raw = input.trim();

  // 1. Payload nút bấm (chính xác).
  const directKey = raw.toUpperCase().startsWith('MENU_') ? (raw.toUpperCase() as MenuKey) : undefined;
  if (directKey) return buildMenuResolution(directKey);

  // 2. Từ khóa văn bản (đã normalize không dấu).
  const normalized = normalizeText(raw);
  if (!normalized) return undefined;

  // Chỉ khớp menu khi câu ngắn hoặc khớp cụm rõ ràng; câu dài để AI xử lý.
  const isShort = normalized.split(' ').length <= 5;

  for (const entry of KEYWORD_MAP) {
    for (const keyword of entry.keywords) {
      if (normalized === keyword) return buildMenuResolution(entry.key);
      if (isShort && normalized.includes(keyword)) return buildMenuResolution(entry.key);
    }
  }

  return undefined;
}

function buildMenuResolution(key: MenuKey): MenuResolution {
  switch (key) {
    case 'MENU_MAIN':
      return {
        reply: 'Anh/Chị cần em hỗ trợ nội dung nào ạ?',
        buttonsHeader: 'Menu chính:',
        buttons: buildMainMenuButtons()
      };

    case 'MENU_ADVISE':
      return {
        reply:
          'Dạ để tư vấn đúng loại sơn, Anh/Chị cho em hỏi nhanh vài ý ạ:\n' +
          '1) Sơn nội thất hay ngoại thất?\n' +
          '2) Sơn mới hay sơn lại?\n' +
          '3) Bề mặt là tường, gỗ, kim loại hay sàn?\n' +
          'Anh/Chị nhắn giúp em, em sẽ đề xuất phương án phù hợp ạ.'
      };

    case 'MENU_CALC':
      return {
        reply:
          'Dạ để tính lượng sơn, Anh/Chị cho em biết:\n' +
          '1) Diện tích cần sơn (m²)?\n' +
          '2) Sơn mấy lớp phủ (thường 2 lớp)?\n' +
          '3) Có cần sơn lót không?\n' +
          'Em sẽ tính số thùng/lon ước tính và chi phí tham khảo. Lưu ý đây chỉ là ước tính, nhân viên sẽ kiểm tra lại ạ.'
      };

    case 'MENU_QUOTE':
      return {
        reply:
          'Dạ để gửi báo giá chính xác, Anh/Chị để lại giúp em:\n' +
          '• Họ tên\n• Số điện thoại\n• Khu vực công trình\n• Sản phẩm quan tâm và diện tích\n' +
          'Em sẽ chuyển nhân viên báo giá và liên hệ lại trong giờ làm việc ạ.',
        handoff: true,
        handoffReason: 'Khách yêu cầu báo giá'
      };

    case 'MENU_PRODUCTS':
      return {
        reply:
          `Anh/Chị có thể xem danh mục sản phẩm tại website ${env.COMPANY_WEBSITE} ạ. ` +
          'Hoặc cho em biết Anh/Chị cần loại nào (sơn nội thất, ngoại thất, chống thấm, sơn lót, bột trét...), em gợi ý sản phẩm phù hợp.'
      };

    case 'MENU_COLOR':
      return {
        reply:
          'Dạ về màu sơn, Anh/Chị cho em biết phòng nào và phong cách mong muốn, em gợi ý màu phù hợp ạ.\n' +
          'Lưu ý: màu hiển thị trên màn hình có thể khác màu thực tế; ánh sáng và bề mặt cũng ảnh hưởng cảm nhận màu. ' +
          'Anh/Chị nên xem mẫu màu thực tế trước khi thi công toàn bộ ạ.'
      };

    case 'MENU_WATERPROOF':
      return {
        reply:
          'Dạ về chống thấm và xử lý tường, Anh/Chị mô tả giúp em tình trạng hiện tại (thấm, nứt, bong tróc, nấm mốc) ' +
          'và vị trí (tường ngoài, nhà vệ sinh, sân thượng...). Nếu có thể, Anh/Chị gửi ảnh để nhân viên kỹ thuật xem giúp ạ.'
      };

    case 'MENU_DELIVERY':
      return {
        reply:
          `Dạ về chính sách giao hàng, Anh/Chị vui lòng xem tại ${env.COMPANY_WEBSITE} ` +
          `hoặc gọi hotline ${env.COMPANY_HOTLINE} để em hỗ trợ chi tiết theo khu vực ạ.`
      };

    case 'MENU_GUIDE':
      return {
        reply:
          'Dạ Anh/Chị cho em biết đang cần hướng dẫn thi công cho sản phẩm/bề mặt nào, ' +
          'em sẽ gửi các bước cơ bản theo tài liệu kỹ thuật của hãng ạ.'
      };

    case 'MENU_ORDER':
      return {
        reply:
          'Dạ Anh/Chị cho em xin mã đơn hàng hoặc số điện thoại đặt hàng để em tra cứu giúp ạ. ' +
          'Nếu cần gấp, Anh/Chị gọi hotline ' + env.COMPANY_HOTLINE + ' nhé.'
      };

    case 'MENU_HUMAN':
      return {
        reply:
          'Dạ em kết nối nhân viên tư vấn giúp Anh/Chị ngay ạ. ' +
          'Anh/Chị để lại số điện thoại và khung giờ tiện liên hệ, nhân viên sẽ gọi lại trong giờ làm việc. ' +
          `Cần gấp, Anh/Chị gọi hotline ${env.COMPANY_HOTLINE} ạ.`,
        handoff: true,
        handoffReason: 'Khách yêu cầu gặp nhân viên'
      };

    default:
      return { reply: 'Anh/Chị cần em hỗ trợ nội dung nào ạ?', buttons: buildMainMenuButtons() };
  }
}
