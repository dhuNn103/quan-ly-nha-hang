# Quản lý nhà hàng (Hệ thống Máy Chủ Tối Ưu & Đồng Bộ Realtime)

Hệ thống quản lý nhà hàng đầy đủ nghiệp vụ: POS thu ngân, màn hình bếp (KDS), gọi món qua mã QR tại bàn, quản lý nhân viên, đóng/mở ca làm việc, hóa đơn và báo cáo doanh thu.

Giao diện người dùng (`public/index.html`) được **giữ nguyên 100% nguyên bản**, backend được thiết kế lại theo kiến trúc module hiện đại, bảo mật cao, tải trang nhanh hơn với gzip và hoàn toàn không phụ thuộc vào thư viện ngoài (zero npm dependencies).

---

## 🚀 Tính năng cải thiện Backend

1. **Kiến trúc phân tầng chuyên nghiệp (Modular Architecture)**:
   - Tách biệt rõ ràng: Cấu hình (`config`), Dữ liệu (`db`), Nghiệp vụ (`services`), Điều hướng (`routes`), Bộ tiền xử lý (`middleware`), Ghi nhật ký (`logger`).
   - Tách mã nguồn 90 dòng nguyên khối cũ thành cấu trúc module dễ đọc, dễ bảo trì và mở rộng.

2. **Ghi dữ liệu bất đồng bộ nguyên tử & Chống nghẽn I/O (Atomic Async Debounced I/O)**:
   - Khắc phục triệt để việc dùng `fs.writeFileSync` đồng bộ chặn Node.js event loop khi dữ liệu ảnh món/hóa đơn lớn.
   - Cơ chế gom lượt ghi (debounce 50ms) và ghi nguyên tử qua tệp `.tmp` tránh hỏng dữ liệu khi mất điện hoặc máy chủ bị tắt đột ngột.

3. **Hệ thống tự động sao lưu định kỳ (Automatic Backups & Recovery)**:
   - Tự động sao lưu định kỳ `data.json` vào thư mục `backups/` theo mốc thời gian.
   - Tự động dọn dẹp các bản sao lưu cũ theo giới hạn cấu hình (`MAX_BACKUPS`).
   - Hỗ trợ endpoint sao lưu thủ công (`POST /api/backups`) và phục hồi dữ liệu từ bản sao lưu khi có sự cố.

4. **Tối ưu hiệu năng truyền tải (HTTP Gzip / Deflate Compression)**:
   - Tích hợp nén dữ liệu luồng (`zlib gzip/deflate`) cho cả trang tĩnh (`index.html`) và các payload JSON lớn.
   - Giảm dung lượng tải xuống của `index.html` (322KB) xuống còn ~65KB (nhỏ hơn 5 lần), giúp các thiết bị di động của khách và nhân viên tải cực nhanh.

5. **Giữ kết nối Realtime ổn định (SSE Heartbeat / Keepalive)**:
   - Tự động phát nhịp tim `:ping` định kỳ 20 giây đến tất cả các máy trạm (POS, bếp, điện thoại khách).
   - Ngăn chặn triệt để tình trạng các bộ định tuyến Wi-Fi hoặc Proxy ngắt kết nối ngầm gây mất tín hiệu realtime.

6. **Bảo mật và Kiểm soát phiên làm việc**:
   - Quản lý token phiên làm việc có thời hạn linh hoạt (Sliding Window TTL).
   - Tự động dọn dẹp bộ nhớ định kỳ tránh rò rỉ RAM (garbage collection cho bảng IP rate limit và lockout).
   - Thiết lập các tiêu đề bảo mật chuẩn công nghiệp: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`,...
   - Hỗ trợ cấu hình CORS linh hoạt khi cần kết nối qua tên miền khác hoặc app di động.

7. **Tắt máy an toàn (Graceful Shutdown)**:
   - Bắt các tín hiệu dừng `SIGINT` (Ctrl+C), `SIGTERM`.
   - Đóng kết nối các luồng SSE, xả toàn bộ dữ liệu đang chờ ghi vào đĩa trước khi dừng tiến trình.

---

## 📁 Cấu trúc thư mục

```text
quan-ly-nha-hang/
├── public/
│   └── index.html               # Giao diện người dùng (Giữ nguyên 100%)
├── src/
│   ├── config.js                # Quản lý cấu hình & nạp .env
│   ├── logger.js                # Ghi log có màu và thời gian
│   ├── db/
│   │   ├── database.js          # Quản lý dữ liệu, ghi đĩa bất đồng bộ nguyên tử
│   │   └── backup.js            # Tự động sao lưu & dọn dẹp bản sao lưu cũ
│   ├── middleware/
│   │   ├── compression.js       # Nén Gzip/Deflate
│   │   ├── cors.js              # Xử lý CORS & Preflight OPTIONS
│   │   ├── security.js          # Tiêu đề bảo mật HTTP Security Headers
│   │   └── staticServer.js      # Phục vụ tệp tĩnh an toàn, ETag, chống traversal
│   ├── routes/
│   │   ├── api.router.js        # Điều hướng API (/api/login, /api/state, /api/order,...)
│   │   └── health.route.js      # Endpoint giám sát trạng thái hệ thống (/api/health)
│   └── services/
│       ├── auth.service.js      # Xác thực, khóa 15p khi nhập sai 5 lần, phân quyền
│       ├── order.service.js     # Tiếp nhận đơn QR, xác thực giá máy chủ, debounce IP
│       ├── sse.service.js       # Quản lý kết nối SSE thời gian thực, heartbeat
│       └── state.service.js     # Đồng bộ trạng thái, lọc mật khẩu, phát hiện xung đột
├── backups/                     # Thư mục lưu các bản sao lưu tự động
├── test/
│   └── backend.test.js          # Bộ kiểm thử tự động toàn diện (17 test cases)
├── .env.example                 # Mẫu cấu hình môi trường
├── package.json                 # Cấu hình gói và các lệnh chạy
├── README.md                    # Tài liệu hướng dẫn
├── server.js                    # Điểm khởi chạy máy chủ
└── server.original.js           # Bản lưu máy chủ cũ ban đầu
```

---

## 🛠️ Hướng dẫn cài đặt & Chạy

### Yêu cầu
- Node.js từ phiên bản 18 trở lên (`node -v`).
- **Không cần cài bất kỳ thư viện npm bên ngoài nào**.

### Khởi động máy chủ
```bash
# Cách 1: Sử dụng node
node server.js

# Cách 2: Sử dụng npm
npm start

# Chế độ phát triển (tự động khởi động lại khi sửa mã nguồn - Node 18+)
npm run dev
```

Mở trình duyệt truy cập: **http://localhost:3000**

---

## 🧪 Chạy kiểm thử tự động (Unit & Integration Tests)

Hệ thống đi kèm bộ 17 kịch bản kiểm thử tự động kiểm tra toàn bộ tính năng:
```bash
npm test
```

---

## ⚙️ Cấu hình biến môi trường (`.env`)

Bạn có thể tạo tệp `.env` tại thư mục gốc với các tùy chọn:

```ini
# Cổng và địa chỉ lắng nghe
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Mật khẩu tài khoản admin mặc định khi khởi tạo lần đầu
ADMIN_PASSWORD=Admin@123

# Đường dẫn tệp dữ liệu chính
DATA_FILE=data.json

# Cấu hình sao lưu tự động
BACKUP_ENABLED=true
BACKUP_INTERVAL_MIN=60
MAX_BACKUPS=24

# Giới hạn kích thước gói gửi lên (MB)
MAX_BODY_SIZE_MB=25

# Thời gian phiên đăng nhập nhân viên (giờ)
SESSION_TTL_HOURS=24

# Cấu hình CORS
CORS_ORIGIN=*
```

---

## 👤 Tài khoản mẫu ban đầu

| Tên đăng nhập | Mật khẩu | Quyền hạn |
| :--- | :--- | :--- |
| **admin** | `Admin@123` | Quản trị viên (quản lý toàn bộ nhân viên, cấu hình, thực đơn) |
| **quanly** | `Quanly@123` | Quản lý nhà hàng |
| **phucvu** | `Phucvu@123` | Nhân viên phục vụ bàn |
| **bep** | `Bep@12345` | Màn hình bếp (KDS) |

---

## 🔑 Khi Admin quên mật khẩu đăng nhập

Bạn có thể xử lý cực kỳ nhanh chóng bằng 1 trong 3 cách sau:

### Cách 1: Dùng công cụ khôi phục tự động (Khuyên dùng)
Tại thư mục dự án, chạy lệnh:
```bash
# Xem mật khẩu hiện tại trong hệ thống:
node reset-admin.js

# Hoặc đặt lại mật khẩu mới:
node reset-admin.js MatKhauMoi@123
```

### Cách 2: Thiết lập qua biến môi trường (.env)
Thêm dòng sau vào tệp `.env`:
```ini
RESET_ADMIN_PASSWORD=MatKhauMoi@123
```
Sau đó khởi động lại server (`node server.js`), mật khẩu admin sẽ tự động được cập nhật.

### Cách 3: Xem hoặc sửa trực tiếp trong tệp data.json
1. Mở tệp `data.json` bằng Notepad hoặc VS Code.
2. Tìm đến `"u": "admin"` và xem hoặc sửa giá trị `"p": "MatKhauMoi@123"`.
3. Lưu tệp và đăng nhập lại.


---

## 🧹 Tối ưu & Dọn dẹp dữ liệu (`compact-db.js`)

Khi nhà hàng hoạt động lâu dài (nhiều tháng/năm), số lượng đơn hàng cũ và nhật ký tăng lên làm tăng kích thước tệp `data.json`. Bạn có thể chạy công cụ dọn dẹp để lưu trữ các đơn đã thanh toán cũ vào tệp riêng và thu nhỏ dung lượng cơ sở dữ liệu:

```bash
# Dọn dẹp các đơn đã thanh toán quá 30 ngày (mặc định):
node compact-db.js

# Hoặc tùy chọn giữ lại số ngày mong muốn (ví dụ 60 ngày):
node compact-db.js 60
```
- Các đơn hàng thanh toán cũ sẽ được lưu trữ an toàn vào `backups/archive_orders.json`.
- Các đơn chưa thanh toán hoặc đang phục vụ luôn được giữ nguyên 100%.
- Giúp máy chủ khởi động và lưu trữ nhanh gấp nhiều lần.

---

## 📊 Giám sát hiệu năng & Sức khỏe máy chủ

Bạn có thể kiểm tra trực tiếp sức khỏe và thống kê vận hành nhà hàng thời gian thực qua endpoint:

```
GET /api/health
```

Trả về các thông số chuyên sâu:
- **Hiệu năng**: Số request/giây (RPS), độ trễ trung bình (Latency avg/min/max/p95).
- **Vận hành**: Số bàn trống/bận, số món đang bán/tạm hết, số đơn chờ xác nhận.
- **Tài nguyên**: Bộ nhớ RAM tiêu thụ (RSS/Heap), số lượng kết nối SSE realtime đang mở.
