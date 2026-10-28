# Sửa tự mở Shopee và thu nhỏ icon — v6.3.0

## Kết quả chẩn đoán

Website thật đang nạp widget từ `https://son-tien-bao-chatbot-production.up.railway.app/widget.js`, đặt bên trái. Phiên bản trước có nút 48px, đã được triển khai đúng; đây không phải trường hợp vẫn dùng nút 60px do cache.

Lớp bảo vệ v6.2 chỉ ẩn một số phần tử quảng cáo khi chat mở. Nó không chặn `window.open`, liên kết hoặc deep link mở Shopee khi khách bấm vào trang. Kiểm thử hồi quy trước sửa đã thất bại cả ba ca: click sản phẩm mở Shopee, link/deep link không bị chặn và icon lớn hơn 36px.

Trong lần kiểm tra trang công khai, website còn tải script từ Histats, Optistats, Tynt, DTScout và mrktmtrcs. Chưa xác định được script cụ thể gây ra quảng cáo Shopee: không kết luận tất cả các script này đều gây quảng cáo. Mã chèn trong iTop nằm ngoài repository chatbot và cần kiểm tra riêng.

## Thay đổi

- Nút chat trên điện thoại có phần nền nhìn thấy 36px, logo 26px, vùng chạm 44px; bỏ bóng lớn. Desktop giữ kích thước cũ.
- Navigation guard chạy ngay từ đầu file widget, hoạt động cả khi chat đóng.
- Chặn đích Shopee/Lazada đã định danh, các miền popunder đã liệt kê, liên kết mở ứng dụng, một số redirect lồng/mã hóa và `window.open` trực tiếp. Chặn link động và các sự kiện click/auxclick/pointerdown/touchend/submit đến các đích này.
- Zalo, số điện thoại, email và đường dẫn sản phẩm thông thường được giữ. Không chặn mọi liên kết ngoài.
- Thêm `site-guard.js` độc lập để nạp trước script bên ngoài trong phần đầu trang. Guard được dùng chung với widget qua `npm run build`, không chỉnh bản prefix được tạo tự động trong widget.
- Header `Cache-Control: no-store`, `X-STB-Widget-Version: 6.3.0` và `data-widget-version` trên host giúp kiểm tra bản phát hành.

## Cấu hình trong iTop

Theo tài liệu chính thức, trang quản trị là `https://sontienbao.com/admin`, phần mã nhúng ở **Cấu hình website → Thẻ HTML**.

1. Sao lưu nội dung các thẻ HTML và cấu hình bộ đếm trước khi thay đổi.
2. Trong vị trí chèn mã đầu trang, đặt đoạn sau **trước các script bộ đếm/quảng cáo bên ngoài**, không thêm `async` hoặc `defer`:

   ```html
   <script src="https://son-tien-bao-chatbot-production.up.railway.app/site-guard.js?v=6.3.0"></script>
   ```

3. Giữ một mã widget ở cuối trang; có thể thay mã hiện tại bằng:

   ```html
   <script
     src="https://son-tien-bao-chatbot-production.up.railway.app/widget.js?v=6.3.0"
     data-api-base="https://son-tien-bao-chatbot-production.up.railway.app"
     data-position="left"
     defer>
   </script>
   ```

4. Kiểm tra các thẻ HTML/bộ đếm đang tải những script đã nêu. Nếu không cần, tạm tắt từng thẻ, tải lại trên điện thoại và thử cùng thao tác trước đó đã mở Shopee. Giữ bản sao để khôi phục; không xóa hàng loạt mã theo tên miền phỏng đoán. Nếu script do theme/iTop tự chèn, cần nhà cung cấp iTop hỗ trợ vô hiệu hóa hoặc thay thế.
5. Kiểm tra trên trình duyệt điện thoại thật: click sản phẩm, menu, nút chat, Zalo, gọi điện; không chỉ thử trên trang demo.

Guard là lớp phòng vệ theo các đích URL đã nhận diện, không phải công cụ gỡ toàn bộ mã quảng cáo. Không thể bảo đảm chặn mã đã giữ sẵn tham chiếu hàm mở cửa sổ trước guard, redirect bằng mã riêng không đi qua các đường đã kiểm tra, chuyển hướng HTTP, JavaScript trong iframe khác origin, hoặc quảng cáo do trình duyệt/thiết bị chèn. Vì vậy bước kiểm tra và tắt script nguồn trong iTop vẫn cần thiết. Không có thay đổi nào vào iTop nếu chưa đăng nhập và lưu cấu hình tại đó.

Các tùy chọn:

```html
<!-- Tắt riêng guard điều hướng nếu website có chủ đích liên kết tới sàn. -->
<script src="https://son-tien-bao-chatbot-production.up.railway.app/widget.js" data-block-shopping-redirects="false" defer></script>

<!-- Thêm tên miền đích quảng cáo cụ thể, phân cách bằng dấu chấm phẩy. -->
<script src="https://son-tien-bao-chatbot-production.up.railway.app/site-guard.js" data-blocked-shopping-hosts="ads.example.com;redirect.example.com"></script>
```

Nếu đã nạp `site-guard.js` riêng thì cấu hình tùy chọn tại chính thẻ đó. `data-suppress-ads="false"` của widget chỉ tắt việc ẩn phần tử quảng cáo, độc lập với guard điều hướng.

## Kiểm thử

```bash
npm run build
npm run check
npm test
npm run test:ads
npm run test:widget
```

Hai bộ browser test cần Playwright/Chromium như hướng dẫn v6.2. Bộ test quảng cáo mô phỏng hành vi mở Shopee, không truy cập hoặc mở ứng dụng Shopee thật. Kiểm tra head guard bao gồm trường hợp mã bên ngoài lưu `window.open` trước khi widget khởi tạo. Kiểm tra giao diện vẫn bao gồm 320/390/520/844/1440px, phản hồi dài, popup, form liên hệ và trình duyệt cũ.

## Tài liệu iTop đã đối chiếu

- [Đăng nhập trang quản trị](https://itop.website/help/account/huong-dan-dang-nhap-website-itop-lan-dau.html).
- [Chèn mã công cụ ngoài tại Cấu hình website → Thẻ HTML](https://itop.website/help/tools/cai-dat-tawkto-cho-website-itop.html).
