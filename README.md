# Sơn Tiến Bảo Web Smart Advisor v4

Chatbot AI gắn trực tiếp vào `sontienbao.com`. Hệ thống dùng Railway làm backend, Supabase lưu dữ liệu/hội thoại/lead và Gemini để trả lời dựa trên dữ liệu sản phẩm, tài liệu đã duyệt và nội dung website.

## Chức năng

- Widget chat nổi, responsive, không phụ thuộc framework của website.
- Tư vấn chọn sơn theo mục đích: nội thất, ngoại thất, chống thấm, sân thể thao, công nghiệp.
- Tìm dữ liệu từ bảng `products`, `knowledge_documents` và website Sơn Tiến Bảo.
- Ghi nhớ tối đa 8 lượt gần nhất theo phiên trình duyệt.
- Trả kèm liên kết nguồn sản phẩm/tài liệu.
- Thu tên, số điện thoại và nhu cầu; lưu vào `leads` với nguồn `website_chatbot`.
- Gửi email lead nếu SMTP đã cấu hình.
- Chuyển sang nhân viên khi thiếu dữ liệu, báo giá chính thức, đơn hàng hoặc vấn đề cần kiểm tra thực tế.
- Giới hạn tần suất, giới hạn độ dài và không đưa khóa Gemini/Supabase ra trình duyệt.

## Endpoint website

- `GET /api/web-chat/config`
- `POST /api/web-chat/session`
- `POST /api/web-chat/message`
- `POST /api/web-chat/lead`
- `GET /health`

Endpoint Zalo cũ vẫn được giữ để không làm hỏng hệ thống hiện tại, nhưng không cần dùng nếu doanh nghiệp chưa có OA.

## Chạy local

```bash
cp .env.example .env
npm install
npm run check
npm run dev
```

Mở `http://localhost:3000` để thử widget.

## Deploy Railway

Dự án có sẵn `Dockerfile` Node.js 24. Trong thư mục dự án:

```powershell
railway.cmd link
railway.cmd up
```

Không cần đặt Custom Build Command hoặc Custom Start Command khi Railway dùng Dockerfile.

## Mã gắn website

Dán trước thẻ `</body>` trên website:

```html
<script
  src="https://TEN-MIEN-RAILWAY/widget.js"
  data-api-base="https://TEN-MIEN-RAILWAY"
  data-position="right"
  defer>
</script>
```

Không đặt API key, Gemini key hoặc Supabase key trong đoạn mã nhúng.

Xem hướng dẫn chi tiết tại `INSTALL_ON_SONTIENBAO.md`.
