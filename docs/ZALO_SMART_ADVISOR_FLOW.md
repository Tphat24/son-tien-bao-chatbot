# Flow Zalo Smart Advisor

## Nguyên tắc quan trọng

Mọi tin nhắn tự do không khớp menu phải đi vào Dynamic API với `action=ai`. Không tạo Rule chỉ nhận vài từ khóa cố định, vì bot cần tiếp nhận mọi câu hỏi của khách.

## Flow 1 — AI_TU_VAN

### Bước A: Nhận nội dung khách

Lưu tin nhắn khách vào biến:

```text
customer_question
```

### Bước B: Gọi Dynamic API

```json
{
  "action": "ai",
  "message": "((customer_question))",
  "user_id": "((user_id))",
  "user_name": "((user_name))"
}
```

### Bước C: Lấy kết quả

Phương án tốt nhất:

1. Hiển thị câu “Em đang kiểm tra dữ liệu trên website”.
2. Đợi khoảng 7–10 giây trong Flow.
3. Gọi lại Dynamic API:

```json
{
  "action": "ai_result",
  "user_id": "((user_id))"
}
```

Nếu trình tạo Flow không có bước chờ, dùng nút `Xem kết quả` do backend trả về.

## Flow 2 — GẶP NHÂN VIÊN

Gọi:

```json
{
  "action": "human_support",
  "message": "((customer_question))",
  "user_id": "((user_id))",
  "user_name": "((user_name))",
  "phone": "((phone))",
  "area": "((area))",
  "budget": "((budget))"
}
```

## Rule mặc định

- Tin nhắn chào → Flow MENU_CHINH.
- Nút menu → Flow tương ứng.
- Tất cả nội dung khác → Flow AI_TU_VAN.
- Khiếu nại, tra cứu đơn, giá sỉ, báo giá chính thức, dự án lớn → AI vẫn trả phần xác thực được rồi mời nhân viên.

## Hành vi mong muốn

- Khách hỏi chung nhưng thiếu thông tin: bot hỏi đúng một câu làm rõ.
- Có dữ liệu website: bot trả lời và đề xuất tối đa ba lựa chọn.
- Không có dữ liệu website: bot cung cấp hotline, email và website.
- Không đề xuất sản phẩm sai mục đích.
