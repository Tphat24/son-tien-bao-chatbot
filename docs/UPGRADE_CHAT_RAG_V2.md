# Nâng cấp chat và RAG — 29/10/2026

## Thay đổi

- Icon chat trên điện thoại giảm từ 60 × 60 xuống 48 × 48 px; bỏ hiệu ứng nhấp nháy và badge không phản ánh tin nhắn thực tế.
- Khung chat dùng một bộ CSS, font tin nhắn 15 px, ô nhập 16 px, bong bóng bot rộng hơn. Giữ đoạn văn, hiển thị danh sách theo từng dòng và không làm hỏng số đo.
- Khung chat điều chỉnh theo visual viewport khi bàn phím điện thoại mở. Nút đóng và nút gửi có vùng bấm 44 px. Mở chat trên điện thoại không tự bật bàn phím.
- Bỏ mục “Nguồn tham khảo” trên giao diện theo yêu cầu. Bot vẫn dùng tài liệu để tìm và tổng hợp câu trả lời; các nguồn được backend lưu trong log phục vụ kiểm tra nội bộ.
- Câu trả lời website không còn bị ép vào 650 ký tự hoặc cắt ở 760 ký tự: mặc định có ngân sách 2048 output tokens và giới hạn bảo vệ 12000 ký tự. Bot trả lời lần lượt các ý khách hỏi, trình bày theo đoạn/bước, phân biệt thông tin đã xác minh với giả định và phần còn thiếu. Câu hỏi đơn giản vẫn được trả lời gọn. Giới hạn tin nhắn Zalo được giữ riêng.
- Lịch sử hội thoại giữ các đoạn và câu trả lời dài thay vì cắt ở 900 ký tự. Nếu phản hồi website chạm giới hạn token/ký tự, bot nói rõ để khách có thể yêu cầu trình bày tiếp.
- Thêm lựa chọn “Để lại yêu cầu” để mở form liên hệ đang có sẵn. “Tư vấn trực tiếp” vẫn mở Zalo.
- Dùng Popover API đưa icon và khung chat lên top layer trên trình duyệt hỗ trợ; có fallback fixed/z-index. Không can thiệp cửa sổ hay ứng dụng khác.
- RAG hỗ trợ Gemini Embedding 2 với tiền tố truy vấn/tài liệu đúng định dạng và mỗi chunk là một Content riêng; tiếp tục hỗ trợ `gemini-embedding-001`.
- Tìm kiếm toàn văn PostgreSQL có trọng số tiêu đề, bỏ dấu tiếng Việt, kết hợp kết quả vector bằng Reciprocal Rank Fusion (RRF). Giữ tối đa ba đoạn liên quan cho mỗi nguồn và giới hạn tổng nội dung đưa vào model.
- Câu hỏi tiếp nối ngắn được bổ sung các câu trước của khách; câu hỏi đổi chủ đề không bị lẫn câu trả lời cũ của bot.
- Lọc tenant, tài liệu đã duyệt, model và phiên bản đầu vào. Không so sánh vector của hai model khác nhau.
- Thay chỉ mục từng tài liệu trong một transaction. Nếu insert lỗi, chỉ mục cũ được giữ. Đổi model vẫn giữ chỉ mục model trước để quay lại khi cần.
- Fingerprint chỉ mục gồm tiêu đề, nội dung chunk, model và phiên bản đầu vào; thay cấu hình chunk hoặc tiêu đề sẽ được index lại.
- Truy vấn embedding có timeout riêng 5 giây và dùng lexical fallback khi lỗi/quota; tác vụ index vẫn có retry riêng.

## Áp dụng vào hệ thống đang chạy

1. Sao lưu database và ghi lại giá trị `RAG_EMBEDDING_MODEL` đang chạy.
2. Áp dụng `supabase/04_RETRIEVAL_V2.sql` sau các migration 00–03. Migration không xóa tài liệu, không đổi kích thước vector 768 chiều và có thể chạy lại.
3. Trên một máy/tác vụ index dùng **mã nguồn mới** và các secret Gemini/Supabase hiện có, đặt `RAG_EMBEDDING_MODEL=gemini-embedding-2`, rồi chạy:

   ```bash
   npm ci
   npm run check
   npm test
   npm run build
   npm run rag:index
   npm run rag:eval
   ```

   Có thể thêm tenant vào lệnh index: `npm run rag:index -- TENANT_ID`. Không đưa secret vào mã nhúng website.

4. Kiểm tra kết quả index và bộ câu hỏi trên dữ liệu thật. `rag:eval` hiện là kiểm tra độ phù hợp retrieval bằng từ khóa mong đợi; không thay thế đánh giá câu trả lời và dẫn nguồn của người vận hành. Không khẳng định chất lượng sản xuất chỉ dựa trên unit test.
5. Sau khi index và đánh giá đạt yêu cầu, triển khai mã nguồn mới lên Railway và đặt `RAG_EMBEDDING_MODEL=gemini-embedding-2` cho backend. Giá trị Railway đang là `gemini-embedding-001` sẽ tiếp tục dùng model đó nếu chưa đổi.
6. Cập nhật URL widget để làm mới cache, ví dụ `widget.js?v=20261029`. Kiểm tra trên website thật với popup đang dùng.

Nếu tài khoản Gemini chưa có quyền/quota cho Embedding 2, dùng `gemini-embedding-001`, chạy lại `rag:index` bằng mã nguồn mới rồi kiểm tra `rag:eval`. Backend mới chỉ nhận chunk có metadata `input_version=retrieval-v2`; trước khi index xong sẽ dùng lexical fallback. Không tự quay sang vector của model khác.

Gemini Embedding 2 và 001 dùng không gian vector không tương thích, vì vậy phải lập lại chỉ mục khi chuyển model. Quy trình trên giữ index model cũ trong database. Migration cũng giới hạn RPC cũ `match_knowledge_chunks` vào 001 để backend cũ đang dùng 001 không đọc nhầm vector mới. Nếu cần quay lại backend cũ, khôi phục phiên bản deploy dùng 001; nếu quay về 001 trên backend mới thì index 001 bằng mã mới trước. Backend cũ cấu hình model khác 001 cần dùng phiên bản RPC có lọc đúng model trước khi triển khai song song.

## Popup/quảng cáo trên website

Mặc định, khi mở chat, widget tạm ẩn `.adsbygoogle`, hai loại iframe quảng cáo Google đã xác định trong mã và phần tử có `data-stb-chat-suppress`. Các phần tử này xuất hiện muộn cũng được xử lý; khi đóng chat, chúng được khôi phục. Đây là ẩn phần tử trong trang, không chặn tải quảng cáo ở cấp mạng hay chặn quảng cáo của mọi ứng dụng.

Đối với popup khuyến mại hoặc plugin riêng, chỉ định **selector chính xác của popup và backdrop của nó** trong `data-hide-selectors`, phân cách bằng dấu `;`:

```html
<script
  src="https://TEN-MIEN-RAILWAY/widget.js?v=20261029"
  data-api-base="https://TEN-MIEN-RAILWAY"
  data-position="right"
  data-hide-selectors="#promotion-popup;#promotion-backdrop"
  defer>
</script>
```

Hai ID trên là ví dụ; thay bằng ID thật từ plugin của website. Hoặc đánh dấu trực tiếp:

```html
<aside data-stb-chat-suppress>Popup khuyến mại của website</aside>
```

Widget không tự chọn mọi `.popup`, `.modal`, form đăng nhập hoặc bảng đồng ý cookie. Cần chọn đúng cả backdrop nếu plugin có nó. Việc ẩn bằng CSS không gỡ khóa cuộn/focus trap do plugin áp đặt; với popup có focus trap hoặc modal native, nên dùng cấu hình/API tắt popup của plugin trong lúc chat mở. Top layer hỗ trợ tránh các overlay CSS thông thường, không đảm bảo vượt lên một modal native được mở sau đó hoặc nội dung bên ngoài iframe chứa widget.

Để giữ mọi quảng cáo nhưng vẫn sử dụng giao diện mới, thêm `data-suppress-ads="false"`.

## Cấu hình thêm

```dotenv
RAG_QUERY_TIMEOUT_MS=5000
RAG_CONTEXT_MAX_CHARS=12000
AI_WEBSITE_MAX_OUTPUT_TOKENS=2048
AI_WEBSITE_MAX_REPLY_CHARS=12000
```

Giữ nguyên key Gemini/Supabase hiện có ở backend. Không cần OpenAI API key.

## Kiểm thử có thể chạy lại

```bash
npm run check
npm test
npm run build
```

Browser QA và PostgreSQL QA sử dụng công cụ tùy chọn, không thêm phụ thuộc cho runtime production:

```bash
npm install --no-save --package-lock=false playwright @electric-sql/pglite @electric-sql/pglite-pgvector
npx playwright install chromium
npm run test:widget
npm run test:rag-db
```

`test:widget` mở server cục bộ với dữ liệu giả lập, kiểm tra màn hình 320, 390, 520, 844 và 1440 px; popup tải muộn, đóng/mở, opt-out, không hiển thị nguồn trong phản hồi mới và lịch sử cũ, lịch sử, form liên hệ và mô phỏng visual viewport khi bàn phím mở. Ảnh kiểm thử nằm trong `artifacts/` (được gitignore). Đây là kiểm thử Chromium, chưa thay thế thao tác trên iPhone/Android thật.

`test:rag-db` chạy PostgreSQL WASM với pgvector/unaccent: migration chạy lại, FTS có/không dấu, cô lập tenant/model, tài liệu chưa duyệt, content hash cũ, quyền gọi RPC và rollback transaction khi insert lỗi. Không kết nối database sản xuất.

## Nguồn kỹ thuật đã đối chiếu

- [Google: embeddings và chuyển từ 001 sang Embedding 2](https://ai.google.dev/gemini-api/docs/embeddings) — định dạng task prefix, Content riêng cho từng đầu vào, 768 chiều và yêu cầu re-embed.
- [Supabase: Hybrid Search và RRF](https://supabase.com/docs/guides/ai/hybrid-search) — hợp nhất thứ hạng giữa lexical và vector.
- [MDN: Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API) — hiển thị nội dung trên top layer của trình duyệt.
