# Sơn Tiến Bảo — Bản nâng cấp Zalo OA (v6)

Bản này nâng cấp hệ thống v5.0.1 (Zalo Bot) lên hướng **Zalo Official Account (OA)**, bổ sung:
quản lý sản phẩm & màu sắc, báo giá chính thức + in PDF, trang quản trị đầy đủ có phân quyền (RBAC),
xác thực JWT, audit log, và cấu hình động (không hard-code thông tin doanh nghiệp).

Toàn bộ được xây **trên nền v5**, giữ nguyên bộ não AI (Gemini + RAG website) và các cơ chế
chống trùng tin, AI chạy nền, tính lượng sơn đã có.

---

## 1. Yêu cầu môi trường

- Node.js 24 (xem `.nvmrc`).
- Tài khoản Supabase (Postgres) — gói miễn phí đủ cho doanh nghiệp nhỏ.
- Gemini API key (Google AI Studio) — gói miễn phí đủ dưới 1000 tin/tháng.
- (Tùy chọn) SMTP Gmail để gửi email thông báo lead.
- (Khi dùng OA) Zalo Official Account đã xác thực + ứng dụng trên Zalo Developers.

## 2. Cài đặt

```bash
npm install
cp .env.example .env      # điền giá trị thật vào .env
```

Sinh 2 khóa bí mật ngẫu nhiên (>= 32 ký tự) cho `ADMIN_API_KEY` và `DYNAMIC_API_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> `ADMIN_API_KEY` vừa là khóa admin cũ, vừa là khóa ký JWT cho trang quản trị mới.
> Đổi khóa này sẽ khiến mọi phiên đăng nhập admin hết hiệu lực (đây là hành vi mong muốn).

## 3. Cơ sở dữ liệu

Chạy lần lượt trong Supabase SQL Editor:

1. `supabase/00_SMART_ADVISOR_SETUP.sql` — bảng gốc (products, leads, knowledge...). Có thể đã chạy ở v5.
2. `supabase/01_OA_UPGRADE.sql` — bảng nâng cấp (staff, quotations, paint_colors, notifications, audit_logs...).

Cả hai file **idempotent** — chạy lại nhiều lần an toàn, không xóa dữ liệu cũ.

## 4. Tạo tài khoản quản trị đầu tiên (bắt buộc)

Không có bước này sẽ không đăng nhập được trang admin.

```bash
# đặt tạm trong .env hoặc truyền trực tiếp:
SEED_ADMIN_EMAIL=admin@sontienbao.com \
SEED_ADMIN_PASSWORD='mat_khau_manh_toi_thieu_10_ky_tu' \
SEED_ADMIN_NAME='Quản trị viên' \
npm run seed:admin
```

Sau khi tạo xong, **xóa** `SEED_ADMIN_PASSWORD` khỏi `.env`.

## 5. Chạy thử

```bash
npm run check     # kiểm tra kiểu TypeScript
npm run dev       # chạy dev (tsx watch)
# hoặc
npm run build && npm start
```

- Trang quản trị: `http://localhost:3000/admin.html`
- Health check: `http://localhost:3000/health`

## 6. Chọn kênh Zalo

Biến `ZALO_CHANNEL` quyết định kênh đang dùng:

- `ZALO_CHANNEL=bot` — dùng Zalo Bot (nền tảng cũ, gần như miễn phí). Webhook: `/api/zalo-bot/...`
- `ZALO_CHANNEL=oa` — dùng Zalo Official Account. Webhook: `POST /api/zalo-oa/webhook`

Hai kênh chạy song song được; chuyển đổi không mất dữ liệu vì nghiệp vụ dùng chung.

### 6.1. Kết nối Zalo OA

1. Tạo ứng dụng tại https://developers.zalo.me → liên kết Official Account.
2. Lấy `App ID`, `App Secret`, `OA ID` → điền vào `.env` (`ZALO_OA_APP_ID`, `ZALO_OA_APP_SECRET`, `ZALO_OA_ID`).
3. Cấu hình Webhook URL trỏ về `https://TEN_MIEN/api/zalo-oa/webhook`.
4. Lấy `refresh_token` lần đầu (qua Zalo OA Explorer hoặc luồng OAuth) → điền `ZALO_OA_REFRESH_TOKEN`.
   Hệ thống sẽ tự làm mới access token (sống 25h) và lưu vào bảng `system_settings`.
5. Điền `ZALO_OA_ADMIN_USER_ID` (user OA của quản trị viên) để nhận thông báo lead qua OA.

> **Lưu ý chi phí (OA):** Zalo OA miễn phí khi trả lời khách trong cửa sổ 48h kể từ tin cuối của khách.
> Tin chủ động ngoài 48h hoặc ZNS mới tính phí. Hệ thống ưu tiên trả lời trong phiên nên chi phí gần như bằng 0
> với lượng dưới 1000 tin/tháng.

## 7. Triển khai production (gợi ý tiết kiệm)

Phù hợp doanh nghiệp nhỏ:

- **Backend:** Railway hoặc Render (gói thấp/Hobby). Đặt biến môi trường trong dashboard, KHÔNG commit `.env`.
- **Database:** Supabase (gói free).
- **Domain + SSL:** dùng domain của nền tảng (đã có HTTPS) hoặc trỏ subdomain riêng.
- **Build lệnh:** `npm run build` — **Start lệnh:** `npm start`.

Sau deploy:

1. Chạy 2 file SQL trong Supabase.
2. Chạy `npm run seed:admin` một lần (từ máy local trỏ vào Supabase production, hoặc chạy tạm trên server).
3. Cấu hình Webhook OA/Bot trỏ về domain thật.
4. Vào `/admin.html` đăng nhập và cập nhật thông tin doanh nghiệp trong mục **Cấu hình**.

## 8. Bảo mật đã áp dụng

- Mật khẩu băm bằng **scrypt** (`node:crypto`, không thêm dependency).
- JWT ký **HMAC-SHA256**, hết hạn 12h; đổi `ADMIN_API_KEY` để thu hồi toàn bộ phiên.
- **RBAC** 5 vai trò: super_admin, manager, sales, technician, viewer.
- Khóa tài khoản tạm thời sau 5 lần đăng nhập sai.
- Xác minh chữ ký webhook OA + chống trùng sự kiện (bảng `webhook_events`).
- **Audit log** mọi thao tác ghi/sửa trong admin.
- Không ghi access token / khóa bí mật vào log (pino redact).
- Giới hạn kích thước body 1MB, validate đầu vào bằng zod.

## 9. Danh sách API mới

| Nhóm | Endpoint | Quyền |
|---|---|---|
| Auth | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/change-password` | — / đăng nhập |
| Nhân viên | `GET/POST /api/auth/staff`, `POST /api/auth/staff/:id/active` | staff.manage |
| Sản phẩm | `GET/POST/PUT/DELETE /api/admin/products...` | product.view / product.edit |
| Màu sắc | `GET /api/colors/search`, `POST /api/colors/suggest`, `GET /api/colors/:code` | công khai (chatbot) |
| Khách hàng | `GET /api/admin/leads`, `/stats`, `/export`, `GET/PATCH /:id`, `GET /:id/images` | leads:read / leads:write |
| Báo giá | `GET/POST /api/admin/quotations`, `POST /:id/status`, `GET /:id/print` | quotation.view / quotation.manage |
| Cấu hình | `GET/PUT /api/admin/settings` | settings:read / settings:write |
| Zalo OA | `POST /api/zalo-oa/webhook`, `GET /api/zalo-oa/oauth/...` | webhook (chữ ký) |

## 10. Ghi chú xuất PDF báo giá

Để tối ưu chi phí (không thêm thư viện nặng như Puppeteer), báo giá được sinh dưới dạng
**HTML chuẩn in A4** tại `GET /api/admin/quotations/:id/print`. Admin bấm "In / Lưu PDF" trên trình duyệt
để xuất file PDF. Cách này không tốn RAM server và không cần dependency thêm.

## 11. Nhận diện ảnh hiện trạng bề mặt (mục 7)

Khi khách gửi ảnh qua Zalo OA (sự kiện `user_send_image`), hệ thống:

1. Tạo lead ưu tiên cao để nhân viên kỹ thuật theo dõi.
2. Gọi Gemini vision phân tích **sơ bộ** tình trạng bề mặt (bong tróc, thấm nước, nấm mốc, rỉ sét, nứt, phấn hóa...).
3. Lưu ảnh + nhận định vào bảng `surface_images`, gắn với lead.
4. Trả lời khách kèm cảnh báo bắt buộc: đây chỉ là quan sát sơ bộ, nhân viên sẽ kiểm tra thực tế.

Nhân viên xem lại ảnh + nhận định qua `GET /api/admin/leads/:id/images`.

**Guardrail an toàn (bắt buộc):** AI chỉ mô tả những gì thấy rõ, dùng danh sách nhãn đóng (không bịa),
không kết luận nguyên nhân, không đề xuất sản phẩm/giá từ ảnh, và luôn khuyến nghị nhân viên kiểm tra thực tế.
Nếu ảnh mờ hoặc lỗi tải/API, hệ thống tự fallback về câu trả lời an toàn, không bao giờ báo lỗi cho khách.

Không cần dịch vụ lưu ảnh trả phí: hệ thống dùng URL ảnh tạm do Zalo cung cấp. Nếu muốn lưu vĩnh viễn,
có thể tích hợp Supabase Storage (miễn phí theo hạn mức) sau này — module đã tách riêng nên dễ mở rộng.

## 12. Kiểm thử (mục 23)

Bộ test dùng test runner tích hợp của Node (`node:test`) — **không thêm dependency**, chạy qua `tsx`:

```bash
npm test
```

Các file test trong `tests/`:

| File | Kiểm gì |
|---|---|
| `paint-calculator.test.ts` | Tính lượng sơn, chọn tổ hợp thùng/lon, từ chối khi thiếu định mức |
| `auth.test.ts` | Hash mật khẩu (scrypt), JWT ký/verify, hết hạn token, ma trận RBAC |
| `oa-menu.test.ts` | Nhận diện menu: nút bấm, từ khóa không dấu, sai chính tả, câu dài rơi vào AI |
| `conversation-scenarios.test.ts` | 31 kịch bản hội thoại (không dấu, một từ, đòi gặp nhân viên, thử moi prompt/API key) |
| `guardrail.test.ts` | AI trả "chưa có dữ liệu" khi rỗng; nhận diện ảnh luôn kèm cảnh báo; lọc nhãn bịa |
| `text.test.ts`, `security.test.ts`, `http-params.test.ts` | Chuẩn hóa text, so sánh an toàn, ép kiểu tham số HTTP |

Các test cần biến môi trường tự nạp env giả (`tests/_setup-env.ts`), không cần cấu hình `.env` để chạy.
Đã chạy thật: **85/85 test pass**. Guardrail chống lộ prompt/API key và chống bịa dữ liệu đều được kiểm.
