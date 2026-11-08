# v6.4 — So sánh sơn, tiếp nhận nhu cầu và cải thiện câu trả lời

## Khách sử dụng

Trong khung chat có hai nút thường trực:

- **So sánh sơn**: tìm theo tên/mã, chọn 2–3 sản phẩm, mở bảng so sánh. Trên điện thoại có thể cuộn ngang bảng. Chỉ sản phẩm `active` và `approved` được tìm/chọn; sản phẩm hết duyệt giữa lúc chọn và so sánh sẽ yêu cầu chọn lại.
- **Nhờ nhân viên**: điền tên, điện thoại, nhu cầu; khu vực/ngân sách là tùy chọn. Biểu mẫu nói rõ trao đổi gần đây và sản phẩm đã so sánh được gửi kèm. Đây là yêu cầu tiếp nhận lưu trong trang quản trị; không giả lập nhân viên đang chat trực tiếp.

Sau câu trả lời có ID được backend lưu thành công, khách thấy **Hữu ích / Chưa hữu ích**. Góp ý “Chưa hữu ích” cho phép thêm lời giải thích tùy chọn. Góp ý chỉ gắn với câu trả lời và phiên tương ứng, không được dùng để gửi một đáp án mới vào RAG.

Bảng so sánh lấy từ dữ liệu có cấu trúc, không gọi AI suy diễn. Nếu thiếu định mức hoặc quy cách sẽ ghi “Chưa có dữ liệu đã xác minh”. Không suy ra đơn vị từ số coverage riêng lẻ, không đưa giá bán lên bảng. Bộ tìm kiếm dùng tối đa 500 sản phẩm hoạt động đã duyệt và trả tối đa 12 ứng viên mỗi lần; với catalog lớn hơn cần chuyển tìm kiếm sang truy vấn chỉ mục chuyên dụng.

## Nhân viên sử dụng

Trong **Khách hàng → Chi tiết**, nhân viên thấy:

- Nhu cầu khách nhập; khu vực/ngân sách nếu có.
- Tóm tắt bằng lời khách trong tối đa 8 lượt hội thoại đang được lưu; các sản phẩm khách đã so sánh được server kiểm tra lại.
- Lịch sử gần đây, phân biệt “Khách” và “Bot (chưa được nhân viên xác nhận)”.

Tóm tắt không dùng câu trả lời của bot để khẳng định đặc tính hay cam kết thương mại. Khi khách gửi trùng nhu cầu trong 5 phút, yêu cầu cũ được cập nhật tóm tắt mới thay vì mất phần trao đổi mới. Các email/Zalo thông báo lead hiện có, khi được cấu hình, nhận thêm tóm tắt.

Mục **Câu trả lời cần xem lại** bao gồm:

1. Câu thiếu dữ liệu (`no_data`).
2. Câu gặp lỗi xử lý (`system_fallback`).
3. Câu khách đánh giá chưa hữu ích.

Nhân viên có quyền `knowledge.read` được xem hàng chờ. Chỉ quản lý/super admin (`knowledge.write`) được lưu bản sửa, bỏ qua, mở lại hoặc duyệt. Trước khi duyệt, người quản lý phải kiểm tra tài liệu và tích xác nhận loại bỏ thông tin riêng của khách. Bản nháp tự che số điện thoại/email phổ biến nhưng vẫn cần người duyệt kiểm tra tên, địa chỉ và dữ liệu khác.

**Lưu bản sửa** chưa đưa nội dung vào RAG. **Duyệt vào kho tri thức** tạo một FAQ đã duyệt và đóng hàng chờ trong một transaction; gọi lại không tạo FAQ trùng. Sau đó hệ thống yêu cầu lập chỉ mục. Nếu không thể bắt đầu index, trang quản trị báo rõ cần vào Kho tri thức thực hiện thủ công. Không tự huấn luyện bot từ góp ý khách.

Đáp án đã duyệt có thể được chỉnh tiếp trong **Kho tri thức** theo luồng hiện có. Bản gốc câu hỏi/đáp án, đánh giá và FAQ được giữ tách biệt cho việc kiểm tra.

## Triển khai

1. Sao lưu database và chạy `supabase/05_SALES_ASSISTANCE.sql` **sau migration 00–04**, trước khi deploy mã v6.4. Migration thêm hai cột tiếp nhận vào `leads` và bảng riêng `chat_answer_reviews`; không xóa dữ liệu kinh doanh cũ.
2. Chạy:

   ```bash
   npm ci
   npm run check
   npm test
   npm run build
   ```

3. Deploy backend với cấu hình Gemini/Supabase hiện có. Không cần model/secret mới cho ba tính năng này. `npm run build` đồng bộ navigation guard vào widget.
4. Kiểm tra `/health`, `/version`, endpoint `/api/web-chat/products`, đăng nhập quản trị và thử cả ba luồng với dữ liệu thử.
5. Cập nhật URL widget hoặc cache; header no-store đã có từ v6.3. Chỉ xác nhận tính năng hoạt động trên website sau khi backend thật trả đúng phiên bản và migration đã áp dụng.

Tại lần kiểm tra ngày 08/11/2026, URL Railway cũ `https://son-tien-bao-chatbot-production.up.railway.app/version` trả 404 “Application not found”, CLI Railway chưa đăng nhập được. Vì vậy việc hoàn tất mã/GitHub không đồng nghĩa đã đưa tính năng lên website. Cần khôi phục kết nối Railway và xác định deployment đang dùng.

Nếu rollback backend về v6.3, có thể giữ migration 05; hai cột mới và bảng hàng chờ không làm thay đổi schema cũ. Không xóa bảng/cột để rollback.

## Quyền truy cập và lưu trữ

- Bảng đánh giá bật RLS, không cấp quyền trực tiếp cho `anon`/`authenticated`; chỉ backend service role truy cập qua các route đã phân quyền.
- API feedback yêu cầu đúng cặp `sessionId`/`answerId` và tenant. Session ID vẫn là định danh khó đoán đang được dùng cho widget hiện tại, không phải tài khoản khách hàng; không công khai hoặc chia sẻ ID này. Nếu cần tài khoản khách và đồng bộ đa thiết bị, phải bổ sung xác thực riêng.
- Nếu ghi đánh giá lỗi/chưa có migration, backend vẫn trả lời chat và không hiển thị nút đánh giá giả có ID chưa lưu. Lead/tóm tắt và trang quản trị mới cần migration đầy đủ.
- `cleanup_unflagged_chat_answers()` là hàm dọn các câu bình thường không cần xem lại sau 90 ngày. **Chưa tự lên lịch**; quản trị có thể gọi hoặc lên lịch bằng service role. Các câu cần xử lý và FAQ không bị hàm này xóa.

## API mới

```text
GET   /api/web-chat/products?q=...
POST  /api/web-chat/compare             {productIds: [uuid, uuid, ...]}
POST  /api/web-chat/feedback            {sessionId, answerId, rating, comment?}
POST  /api/web-chat/lead                thêm area?, budget?, productIds?
GET   /api/admin/answer-reviews         ?status=open&page=1
PATCH /api/admin/answer-reviews/:id     {status?, faqQuestion?, correctedAnswer?}
POST  /api/admin/answer-reviews/:id/publish  {confirmed: true}
```

## Kiểm thử bổ sung

Theo hướng dẫn browser/PGlite ở v6.2, cài công cụ QA tùy chọn rồi chạy:

```bash
npm run test:sales
npm run test:sales-db
npm run test:widget
npm run test:ads
```

Kiểm thử dùng dữ liệu giả lập và PostgreSQL WASM, không gửi email/Zalo thực, không gọi Gemini/Supabase sản xuất. Browser QA kiểm tra so sánh trên điện thoại, thiếu dữ liệu, nội dung chứa HTML, giới hạn lựa chọn, feedback, yêu cầu tư vấn, hàng chờ quản trị, xác nhận duyệt và tóm tắt tiếp nhận. SQL QA kiểm tra migration chạy lại, cô lập tenant, quyền đọc, điều kiện duyệt, idempotency, rollback transaction và retention.
