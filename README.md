# Sơn Tiến Bảo Web Smart Advisor v6.2

## Nâng cấp giao diện và RAG (29/10/2026)

Xem [hướng dẫn nâng cấp](docs/UPGRADE_CHAT_RAG_V2.md) để áp dụng migration 04, lập lại chỉ mục và cấu hình popup trên website. Bản này hỗ trợ Gemini Embedding 2, tìm kiếm tiếng Việt có/không dấu, hợp nhất thứ hạng RRF, icon điện thoại 48px và khung chat dễ đọc hơn.

Chatbot AI gắn trực tiếp vào `sontienbao.com`. Hệ thống dùng Railway làm backend, Supabase lưu dữ liệu/hội thoại/lead và Gemini để trả lời dựa trên dữ liệu sản phẩm, tài liệu đã duyệt và nội dung website.

## Chức năng

- Widget chat nổi, responsive, không phụ thuộc framework của website.
- Tư vấn chọn sơn theo mục đích: nội thất, ngoại thất, chống thấm, sân thể thao, công nghiệp.
- Tìm dữ liệu từ bảng `products`, `knowledge_documents` và website Sơn Tiến Bảo.
- RAG lai (vector + full-text tiếng Việt + RRF) bằng Gemini Embedding 2/001 và Supabase `pgvector`, có lọc tenant/model, giới hạn context và lexical fallback.
- Ghi nhớ tối đa 8 lượt gần nhất theo phiên trình duyệt.
- Dùng nguồn sản phẩm/tài liệu để kiểm tra nội bộ; không hiển thị mục nguồn tham khảo trong widget.
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

## Khởi tạo RAG doanh nghiệp

1. Chạy lần lượt các migration 00–04 trong `supabase/` bằng Supabase SQL Editor.
2. Bảo đảm các tài liệu cần dùng có `approval_status = 'approved'`.
3. Tạo embedding và lập chỉ mục:

```bash
npm run rag:index
```

Có thể truyền tenant khác bằng `npm run rag:index -- TENANT_ID`. Khi chat, hệ thống ưu tiên các đoạn có độ tương đồng vector cao, hợp nhất với kết quả từ khóa hiện có và tự quay về retrieval cũ nếu vector store chưa sẵn sàng.

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
# Sơn Tiến Bảo Enterprise Chatbot

Hệ thống tư vấn doanh nghiệp đa kênh (Website và Zalo) sử dụng Hybrid RAG trên Supabase pgvector, Gemini model failover, quản trị tài liệu và quan sát vận hành.

## Lệnh vận hành chính

```bash
npm run check       # kiểm tra TypeScript
npm test            # unit/integration tests cục bộ
npm run sync:web    # crawl website và tự động index phần RAG thay đổi
npm run rag:index   # index RAG thủ công, có resume theo content hash
npm run rag:eval    # đánh giá retrieval bằng bộ câu hỏi tiếng Việt
```

Áp dụng lần lượt các migration trong `supabase/`. Migration `03_OPERATIONS_UPGRADE.sql` bật rate-limit dùng chung giữa nhiều replica, cache query embedding và lịch sử tác vụ index.
