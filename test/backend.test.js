/**
 * Bộ kiểm thử tự động toàn diện cho Backend Nhà Hàng
 * Chạy độc lập với Node.js built-in modules, không cần thư viện ngoài.
 */

const http = require('http');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '3999';
process.env.DATA_FILE = 'test_data.json';
process.env.BACKUP_ENABLED = 'false';

// Clean test files if any
const testDbFile = path.join(__dirname, '..', 'test_data.json');
const testDbTmp = path.join(__dirname, '..', 'test_data.json.tmp');
try { if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile); } catch (_) {}
try { if (fs.existsSync(testDbTmp)) fs.unlinkSync(testDbTmp); } catch (_) {}

const server = require('../server');

function request(options, body = null) {
  const effectiveBody = body !== null ? body : (options && options.body);
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: 3999,
      ...options
    };
    if (opts.body) delete opts.body;

    const req = http.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data,
          json
        });
      });
    });

    req.on('error', reject);
    if (effectiveBody !== null && effectiveBody !== undefined) {
      const payload = typeof effectiveBody === 'object' ? JSON.stringify(effectiveBody) : String(effectiveBody);
      req.setHeader('Content-Type', 'application/json');
      req.setHeader('Content-Length', Buffer.byteLength(payload));
      req.write(payload);
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n=============================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ BACKEND NHÀ HÀNG');
  console.log('=============================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error('   Chi tiết:', err.message);
      failed++;
    }
  }

  // 1. Static file serving & Security headers
  await test('1. Phục vụ trang chủ index.html và Tiêu đề bảo mật', async () => {
    const res = await request({ path: '/', method: 'GET' });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(res.headers['x-frame-options'], 'SAMEORIGIN');
    assert.ok(res.data.includes('Quản lý nhà hàng'));
  });

  // 2. Health check
  await test('2. Endpoint kiểm tra sức khỏe hệ thống /api/health', async () => {
    const res = await request({ path: '/api/health', method: 'GET' });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.status, 'ok');
    assert.ok(res.json.memory && res.json.memory.heapUsedMb > 0);
  });

  // 3. Login with wrong password
  await test('3. Đăng nhập sai mật khẩu trả về 401', async () => {
    const res = await request({ path: '/api/login', method: 'POST' }, { u: 'admin', p: 'WrongPassword' });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.json.error, 'Tên đăng nhập hoặc mật khẩu không chính xác.');
  });

  // 4. Login with admin
  let adminToken = '';
  await test('4. Đăng nhập Admin thành công trả về token và thông tin người dùng', async () => {
    const res = await request({ path: '/api/login', method: 'POST' }, { u: 'admin', p: 'Admin@123' });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.json.token);
    assert.strictEqual(res.json.user.u, 'admin');
    assert.strictEqual(res.json.user.role, 'admin');
    assert.strictEqual(res.json.user.p, undefined); // Mật khẩu không bị lộ ở user payload
    adminToken = res.json.token;
  });

  // 5. State without token returns 401
  await test('5. Lấy trạng thái /api/state khi chưa đăng nhập trả về 401', async () => {
    const res = await request({ path: '/api/state', method: 'GET' });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.json.error, 'Chưa đăng nhập');
  });

  // 6. Admin can fetch full state
  let currentVer = 0;
  await test('6. Admin lấy trạng thái /api/state thành công (thấy được mật khẩu tài khoản)', async () => {
    const res = await request({
      path: '/api/state',
      method: 'GET',
      headers: { 'x-token': adminToken }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.json.state);
    assert.ok(Array.isArray(res.json.state.users));
    currentVer = res.json.v;

    // Admin should see passwords for staff administration
    const adminUser = res.json.state.users.find(x => x.u === 'admin');
    assert.strictEqual(adminUser.p, 'Admin@123');
  });

  // 7. Non-admin staff login & password masking
  let waiterToken = '';
  await test('7. Phục vụ đăng nhập và xem /api/state: Mật khẩu bị ẩn hoàn toàn', async () => {
    const loginRes = await request({ path: '/api/login', method: 'POST' }, { u: 'phucvu', p: 'Phucvu@123' });
    assert.strictEqual(loginRes.statusCode, 200);
    waiterToken = loginRes.json.token;

    const stateRes = await request({
      path: '/api/state',
      method: 'GET',
      headers: { 'x-token': waiterToken }
    });
    assert.strictEqual(stateRes.statusCode, 200);
    const users = stateRes.json.state.users;
    for (const u of users) {
      assert.strictEqual(u.p, undefined, `Tài khoản ${u.u} không được để lộ trường 'p'`);
    }
  });

  // 8. PUT /api/state initializes tables and menu
  await test('8. Cập nhật state (Khởi tạo bàn và thực đơn)', async () => {
    const newState = {
      users: [
        { name: 'Quản trị viên', u: 'admin', p: 'Admin@123', role: 'admin', ph: '0327584228', em: 'admin@gmail.com', st: 'active', t: Date.now() },
        { name: 'Nguyễn Quản Lý', u: 'quanly', p: 'Quanly@123', role: 'manager', ph: '0912345678', em: 'quanly@huongviviet.vn', st: 'active', t: Date.now() },
        { name: 'Trần Phục Vụ', u: 'phucvu', p: 'Phucvu@123', role: 'waiter', ph: '0923456789', em: 'phucvu@huongviviet.vn', st: 'active', t: Date.now() }
      ],
      tables: [
        { id: 1, name: 'Bàn 1', st: 'free', type: 'standard' },
        { id: 2, name: 'Bàn 2', st: 'free', type: 'standard' },
        { id: 3, name: 'Phòng VIP 1', st: 'free', type: 'vip' },
        { id: 4, name: 'Sân vườn 1', st: 'free', type: 'outdoor' },
        { id: 5, name: 'Sảnh tiệc 1', st: 'free', type: 'event' }
      ],
      menu: [
        { id: 'M1', name: 'Phở bò', price: 55000, cat: 'Món chính', st: 'on' },
        { id: 'M2', name: 'Bún chả', price: 50000, cat: 'Món chính', st: 'on' },
        { id: 'M3', name: 'Cà phê', price: 30000, cat: 'Đồ uống', st: 'on' }
      ],
      orders: [],
      inv: [],
      seq: 1,
      cfg: { name: 'Nhà hàng Kiểm Thử', qrAuto: false, late: 10 }
    };

    const res = await request({
      path: '/api/state',
      method: 'PUT',
      headers: { 'x-token': adminToken }
    }, {
      v: currentVer,
      state: newState
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.v, currentVer + 1);
    currentVer = res.json.v;
  });

  // 9. Version conflict detection (409)
  await test('9. Phát hiện xung đột phiên bản (Conflict 409) khi dữ liệu cũ', async () => {
    const res = await request({
      path: '/api/state',
      method: 'PUT',
      headers: { 'x-token': adminToken }
    }, {
      v: 0, // Outdated version
      state: { seq: 99 }
    });
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.json.error, 'conflict');
    assert.strictEqual(res.json.v, currentVer);
  });

  // 10. Public minimal state for QR guests
  await test('10. Khách quét QR /api/public?table=1 nhận đúng thông tin bàn và thực đơn', async () => {
    const res = await request({ path: '/api/public?table=1', method: 'GET' });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.json.state);
    assert.strictEqual(res.json.state.cfg.name, 'Nhà hàng Kiểm Thử');
    assert.strictEqual(res.json.state.tables.length, 1);
    assert.strictEqual(res.json.state.tables[0].name, 'Bàn 1');
    assert.strictEqual(res.json.state.menu.length, 3);
  });

  // 11. Guest sends QR order
  let createdOrderId = '';
  await test('11. Khách gửi order qua mã QR /api/order thành công', async () => {
    const res = await request({
      path: '/api/order',
      method: 'POST'
    }, {
      table: 1,
      by: 'Anh Tuấn',
      note: 'Ít hành',
      items: [
        { id: 'M1', qty: 2 },
        { id: 'M3', qty: 1 }
      ]
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.json.id.startsWith('DH'));
    createdOrderId = res.json.id;
    currentVer++; // Bumped by server
  });

  // 12. Verify order in state and table status updated to 'busy'
  await test('12. Kiểm tra bàn chuyển sang trạng thái "busy" và đơn lưu đúng giá từ thực đơn', async () => {
    const res = await request({
      path: '/api/state',
      method: 'GET',
      headers: { 'x-token': adminToken }
    });

    assert.strictEqual(res.statusCode, 200);
    const table1 = res.json.state.tables.find(t => t.id === 1);
    assert.strictEqual(table1.st, 'busy');

    const order = res.json.state.orders.find(o => o.id === createdOrderId);
    assert.ok(order);
    assert.strictEqual(order.by, 'Anh Tuấn');
    assert.strictEqual(order.items.length, 2);
    assert.strictEqual(order.items[0].price, 55000); // Server-enforced price
    assert.strictEqual(order.items[1].price, 30000);
  });

  // 13. QR Order rate limiting (debounce)
  await test('13. Giới hạn tần suất đặt món (429) khi gửi liên tiếp dưới 3 giây', async () => {
    const res = await request({
      path: '/api/order',
      method: 'POST'
    }, {
      table: 1,
      items: [{ id: 'M1', qty: 1 }]
    });

    assert.strictEqual(res.statusCode, 429);
    assert.strictEqual(res.json.error, 'Vui lòng đợi vài giây.');
  });

  // 14. SSE Events Connection
  await test('14. Kết nối Realtime SSE /api/events nhận handshake retry: 2000', async () => {
    await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: 3999,
        path: '/api/events',
        method: 'GET'
      }, res => {
        assert.strictEqual(res.statusCode, 200);
        assert.ok(res.headers['content-type'].includes('text/event-stream'));
        res.on('data', chunk => {
          const text = chunk.toString();
          if (text.includes('retry: 2000')) {
            req.destroy();
            resolve();
          }
        });
      });
      req.on('error', err => {
        // Destroying request will emit ECONNRESET, which is expected
        if (err.code !== 'ECONNRESET') reject(err);
      });
      req.end();
    });
  });

  // 15. Non-admin cannot modify users list
  await test('15. Nhân viên (Wait/Phục vụ) không thể chỉnh sửa danh sách người dùng qua PUT /api/state', async () => {
    const stateRes = await request({
      path: '/api/state',
      method: 'GET',
      headers: { 'x-token': waiterToken }
    });

    const modifiedState = {
      ...stateRes.json.state,
      users: [] // Trying to delete all users
    };

    const putRes = await request({
      path: '/api/state',
      method: 'PUT',
      headers: { 'x-token': waiterToken }
    }, {
      v: stateRes.json.v,
      state: modifiedState
    });

    assert.strictEqual(putRes.statusCode, 200);

    // Verify admin still exists in state
    const checkRes = await request({
      path: '/api/state',
      method: 'GET',
      headers: { 'x-token': adminToken }
    });
    assert.ok(checkRes.json.state.users.some(u => u.u === 'admin'));
  });

  // 16. Admin manual backup creation
  await test('16. Quản trị viên tạo bản sao lưu thủ công qua POST /api/backups', async () => {
    const res = await request({
      path: '/api/backups',
      method: 'POST',
      headers: { 'x-token': adminToken }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.ok(res.json.filename.startsWith('data_'));
  });

  // 17. Admin list backups
  await test('17. Quản trị viên xem danh sách các bản sao lưu qua GET /api/backups', async () => {
    const res = await request({
      path: '/api/backups',
      method: 'GET',
      headers: { 'x-token': adminToken }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.json.backups));
    assert.ok(res.json.backups.length >= 1);
  });

  // 18. In-memory static cache and ETag 304 Not Modified
  await test('18. Bộ nhớ đệm tệp tĩnh trong RAM và phản hồi ETag 304 Not Modified', async () => {
    const firstRes = await request({ path: '/', method: 'GET' });
    assert.strictEqual(firstRes.statusCode, 200);
    const etag = firstRes.headers['etag'];
    assert.ok(etag);

    const secondRes = await request({
      path: '/',
      method: 'GET',
      headers: { 'if-none-match': etag }
    });
    assert.strictEqual(secondRes.statusCode, 304);
  });

  // 19. Health check with performance metrics and operational stats
  await test('19. Endpoint /api/health trả về đầy đủ hiệu năng (RPS, latency) và trạng thái nhà hàng', async () => {
    const res = await request({ path: '/api/health', method: 'GET' });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.json.performance);
    assert.ok(res.json.performance.totalRequests > 0);
    assert.ok(res.json.restaurant);
    assert.strictEqual(res.json.restaurant.tables.total, 5);
  });

  // 20. Database compacting
  await test('20. Quản trị viên tối ưu cơ sở dữ liệu qua POST /api/compact', async () => {
    const res = await request({
      path: '/api/compact',
      method: 'POST',
      headers: { 'x-token': adminToken }
    }, { daysToKeep: 30 });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.ok(res.json.newSizeKb >= 0);
  });

  // 21. Logout endpoint immediately revokes token
  await test('21. Đăng xuất /api/logout hủy token ngay lập tức', async () => {
    const logoutRes = await request({
      path: '/api/logout',
      method: 'POST',
      headers: { 'x-token': waiterToken }
    });
    assert.strictEqual(logoutRes.statusCode, 200);
    assert.strictEqual(logoutRes.json.success, true);

    // Verify token is now invalid
    const checkRes = await request({
      path: '/api/state',
      method: 'GET',
      headers: { 'x-token': waiterToken }
    });
    assert.strictEqual(checkRes.statusCode, 401);
  });

  // 22. Online Table Reservation from Homepage
  let createdReservationId = '';
  await test('22. Khách đặt bàn từ trang chủ qua POST /api/reservation', async () => {
    const res = await request({
      path: '/api/reservation',
      method: 'POST'
    }, {
      name: 'Nguyễn Văn A',
      phone: '0988776655',
      guests: 4,
      date: '2026-11-20',
      time: '19:00',
      space: 'Bàn ngoài trời',
      note: 'Gần cửa sổ'
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.ok(res.json.id.startsWith('DB'));
    assert.strictEqual(res.json.reservation.name, 'Nguyễn Văn A');
    assert.strictEqual(res.json.reservation.status, 'pending');
    createdReservationId = res.json.id;
  });

  // 23. Reservation Rate Limit & Validation
  await test('23. Giới hạn tần suất đặt bàn (429) và kiểm tra xác thực dữ liệu', async () => {
    // Immediate second booking from same IP triggers 429
    const spamRes = await request({
      path: '/api/reservation',
      method: 'POST'
    }, {
      name: 'Spam User',
      phone: '0912345678',
      guests: 2,
      date: '2026-11-20',
      time: '19:30'
    });
    assert.strictEqual(spamRes.statusCode, 429);

    // Invalid phone
    const invalidPhoneRes = await request({
      path: '/api/reservation',
      method: 'POST',
      headers: { 'x-forwarded-for': '10.0.0.99' }
    }, {
      name: 'Test',
      phone: '123',
      guests: 2,
      date: '2026-11-20',
      time: '19:30'
    });
    assert.strictEqual(invalidPhoneRes.statusCode, 400);
  });

  // 24. List Reservations (Staff / Admin)
  await test('24. Nhân viên/Quản lý xem danh sách đặt bàn qua GET /api/reservations', async () => {
    const res = await request({
      path: '/api/reservations',
      method: 'GET',
      headers: { 'x-token': adminToken }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.json.reservations));
    assert.ok(res.json.reservations.some(r => r.id === createdReservationId));
  });

  // 25. Update Reservation Status & Assign Table
  await test('25. Cập nhật trạng thái đặt bàn (xác nhận & xếp bàn) qua PUT /api/reservations', async () => {
    const res = await request({
      path: '/api/reservations',
      method: 'PUT',
      headers: { 'x-token': adminToken }
    }, {
      id: createdReservationId,
      status: 'confirmed',
      tableId: 2,
      note: 'Đã chuẩn bị hoa tươi'
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.reservation.status, 'confirmed');
    assert.strictEqual(res.json.reservation.tableId, 2);
  });

  // 26. Newsletter Subscription from Homepage Footer
  await test('26. Đăng ký nhận ưu đãi qua POST /api/newsletter và xử lý trùng lặp', async () => {
    const res = await request({
      path: '/api/newsletter',
      method: 'POST'
    }, {
      email: 'khachhang@gmail.com'
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);

    // Registering the same email returns graceful response without duplicate
    const dupRes = await request({
      path: '/api/newsletter',
      method: 'POST',
      headers: { 'x-forwarded-for': '10.0.0.88' }
    }, {
      email: 'khachhang@gmail.com'
    });

    assert.strictEqual(dupRes.statusCode, 200);
    assert.strictEqual(dupRes.json.already, true);

    // Admin views subscribers list
    const listRes = await request({
      path: '/api/newsletter',
      method: 'GET',
      headers: { 'x-token': adminToken }
    });
    assert.strictEqual(listRes.statusCode, 200);
    assert.ok(listRes.json.subscribers.some(s => s.email === 'khachhang@gmail.com'));
  });

  // 27. Public Quick Menu Search for Homepage
  await test('27. Tìm kiếm món ăn công khai qua GET /api/menu/search?q=...', async () => {
    const res = await request({
      path: '/api/menu/search?q=ph%E1%BB%9F',
      method: 'GET'
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.json.dishes));
    assert.ok(res.json.dishes.length > 0);
    assert.ok(res.json.dishes[0].name.toLowerCase().includes('phở'));
  });

  // 28. Public Homepage State Config Integrity
  await test('28. Dữ liệu công khai trang chủ GET /api/public trả về đầy đủ cấu hình', async () => {
    const res = await request({
      path: '/api/public',
      method: 'GET'
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.json.state);
    assert.ok(res.json.state.cfg);
    assert.ok(Array.isArray(res.json.state.menu));
    assert.ok(Array.isArray(res.json.state.cfg.banners));
  });

  let adminCreatedResId = null;

  // 29. Admin creates reservation manually
  await test('29. Admin tạo đặt bàn thủ công qua POST /api/reservations kèm xếp bàn và tiền cọc', async () => {
    const res = await request({
      path: '/api/reservations',
      method: 'POST',
      headers: { 'x-token': adminToken }
    }, {
      name: 'Chị Mai Lan',
      phone: '0912345678',
      guests: 6,
      date: '2026-11-20',
      time: '18:30',
      space: 'Phòng VIP',
      tableId: 2,
      deposit: 500000,
      note: 'Tiệc sinh nhật gia đình',
      staffNote: 'Đã nhận cọc chuyển khoản 500k',
      status: 'confirmed'
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.ok(res.json.reservation);
    adminCreatedResId = res.json.reservation.id;
    assert.strictEqual(res.json.reservation.name, 'Chị Mai Lan');
    assert.strictEqual(res.json.reservation.deposit, 500000);
    assert.strictEqual(res.json.reservation.tableId, 2);
    assert.strictEqual(res.json.reservation.status, 'confirmed');
  });

  // 30. Admin filters reservations with status, search and pagination
  await test('30. Admin lọc đặt bàn theo trạng thái, tìm kiếm và phân trang', async () => {
    const res = await request({
      path: '/api/reservations?status=confirmed&search=Mai%20Lan&page=1&limit=10',
      method: 'GET',
      headers: { 'x-token': adminToken }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.json.reservations));
    assert.ok(res.json.reservations.length >= 1);
    assert.strictEqual(res.json.reservations[0].id, adminCreatedResId);
    assert.strictEqual(res.json.page, 1);
    assert.ok(res.json.summary);
  });

  // 31. Admin views reservation dashboard stats
  await test('31. Admin xem thống kê đặt bàn tổng quan qua GET /api/reservations/stats', async () => {
    const res = await request({
      path: '/api/reservations/stats',
      method: 'GET',
      headers: { 'x-token': adminToken }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.json.stats);
    assert.ok(typeof res.json.stats.totalAll === 'number');
    assert.ok(res.json.stats.today);
    assert.ok(res.json.stats.upcoming7Days);
  });

  // 32. Admin checks table availability for date/time/guests
  await test('32. Kiểm tra bàn trống theo ngày, giờ và số lượng khách', async () => {
    const res = await request({
      path: '/api/reservations/available-tables?date=2026-11-20&time=18:30&guests=6',
      method: 'GET',
      headers: { 'x-token': adminToken }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.json.tables));
    assert.ok(typeof res.json.availableCount === 'number');
  });

  // 33. Admin views single reservation detail and customer booking history
  await test('33. Xem chi tiết đặt bàn và lịch sử khách hàng qua GET /api/reservations?id=...', async () => {
    const res = await request({
      path: `/api/reservations?id=${adminCreatedResId}`,
      method: 'GET',
      headers: { 'x-token': adminToken }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.json.reservation);
    assert.strictEqual(res.json.reservation.id, adminCreatedResId);
    assert.ok(res.json.customerHistory);
  });

  // 34. Admin exports reservations to CSV (Excel compatible)
  await test('34. Xuất danh sách đặt bàn ra tệp CSV Excel qua GET /api/reservations/export', async () => {
    const res = await request({
      path: '/api/reservations/export',
      method: 'GET',
      headers: { 'x-token': adminToken }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/csv'));
    assert.ok(res.data.includes('Mã đặt bàn'));
    assert.ok(res.data.includes('Chị Mai Lan'));
  });

  // 35. Admin deletes reservation
  await test('35. Quản trị viên xóa đặt bàn qua DELETE /api/reservations', async () => {
    const delRes = await request({
      path: `/api/reservations?id=${adminCreatedResId}`,
      method: 'DELETE',
      headers: { 'x-token': adminToken }
    });

    assert.strictEqual(delRes.statusCode, 200);
    assert.strictEqual(delRes.json.success, true);

    // Verify deletion
    const checkRes = await request({
      path: `/api/reservations?id=${adminCreatedResId}`,
      method: 'GET',
      headers: { 'x-token': adminToken }
    });
    assert.strictEqual(checkRes.statusCode, 404);
  });

  // 36. Table Reservation Deposit Policy Rules
  await test('36. Kiểm tra chính sách tiền cọc đặt bàn (1-4 khách, 5-8 khách, 9-15 khách, >15 khách, VIP, Lễ Tết, Tiệc sự kiện)', async () => {
    // 1-4 khách: không cần cọc
    const p1 = await request({
      path: encodeURI('/api/reservation/policy?guests=3&space=Bàn chung&date=2026-11-20'),
      method: 'GET'
    });
    assert.strictEqual(p1.statusCode, 200);
    assert.strictEqual(p1.json.policy.level, 'none');
    assert.strictEqual(p1.json.policy.label, 'Không cần cọc');

    // 5-8 khách: không cần cọc hoặc tùy thời điểm
    const p2 = await request({
      path: encodeURI('/api/reservation/policy?guests=6&space=Bàn chung&date=2026-11-20'),
      method: 'GET'
    });
    assert.strictEqual(p2.statusCode, 200);
    assert.strictEqual(p2.json.policy.level, 'flexible');
    assert.strictEqual(p2.json.policy.label, 'Không cần cọc hoặc tùy thời điểm');

    // 9-15 khách: có thể yêu cầu cọc
    const p3 = await request({
      path: encodeURI('/api/reservation/policy?guests=12&space=Bàn chung&date=2026-11-20'),
      method: 'GET'
    });
    assert.strictEqual(p3.statusCode, 200);
    assert.strictEqual(p3.json.policy.level, 'recommended');
    assert.strictEqual(p3.json.policy.label, 'Có thể yêu cầu cọc');

    // Trên 15 khách: nên yêu cầu cọc
    const p4 = await request({
      path: encodeURI('/api/reservation/policy?guests=25&space=Bàn chung&date=2026-11-20'),
      method: 'GET'
    });
    assert.strictEqual(p4.statusCode, 200);
    assert.strictEqual(p4.json.policy.level, 'required');
    assert.strictEqual(p4.json.policy.label, 'Nên yêu cầu cọc');

    // Phòng VIP riêng: có thể yêu cầu cọc
    const p5 = await request({
      path: encodeURI('/api/reservation/policy?guests=4&space=Phòng VIP riêng&date=2026-11-20'),
      method: 'GET'
    });
    assert.strictEqual(p5.statusCode, 200);
    assert.strictEqual(p5.json.policy.level, 'recommended');
    assert.ok(p5.json.policy.title.includes('VIP'));

    // Dịp Lễ, Tết: nên yêu cầu cọc
    const p6 = await request({
      path: encodeURI('/api/reservation/policy?guests=2&space=Bàn chung&date=2026-12-25'),
      method: 'GET'
    });
    assert.strictEqual(p6.statusCode, 200);
    assert.strictEqual(p6.json.policy.level, 'required');
    assert.ok(p6.json.policy.title.includes('Lễ, Tết'));

    // Đặt tiệc, sự kiện: nên yêu cầu cọc
    const p7 = await request({
      path: encodeURI('/api/reservation/policy?guests=10&space=Đặt tiệc, sự kiện&date=2026-11-20'),
      method: 'GET'
    });
    assert.strictEqual(p7.statusCode, 200);
    assert.strictEqual(p7.json.policy.level, 'required');
    assert.ok(p7.json.policy.title.includes('tiệc'));

    // Kiểm tra có cả khoản cố định và phần trăm dự kiến
    assert.ok(p7.json.policy.amountFixed.includes('VNĐ') || p7.json.policy.amountFixed.includes('đ'));
    assert.ok(p7.json.policy.amountPercent.includes('%'));
  });

  // 37. Export subscribers to CSV
  await test('37. Xuất danh sách email đăng ký nhận ưu đãi ra CSV qua GET /api/subscribers/export', async () => {
    const res = await request({
      path: '/api/subscribers/export',
      method: 'GET',
      headers: { 'x-token': adminToken }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/csv'));
    assert.ok(res.data.includes('khachhang@gmail.com') || res.data.includes('Email'));
  });

  // 38. Delete subscriber
  await test('38. Quản trị viên xóa người đăng ký nhận ưu đãi qua DELETE /api/subscribers', async () => {
    const res = await request({
      path: '/api/subscribers?email=khachhang@gmail.com',
      method: 'DELETE',
      headers: { 'x-token': adminToken }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
  });

  // 39. Test SMTP settings validation
  await test('39. Kiểm tra endpoint xác thực cấu hình Email SMTP qua POST /api/email/test', async () => {
    const res = await request({
      path: '/api/email/test',
      method: 'POST',
      headers: { 'x-token': adminToken }
    }, {
      host: '',
      user: '',
      pass: ''
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.json.success, false);
    assert.ok(res.json.error);
  });

  // 40. Test 4 Table Types & Mapping Logic
  await test('40. Kiểm tra đồng bộ dữ liệu và Mapping Logic 4 loại bàn (Bàn tiêu chuẩn, Phòng VIP riêng, Ngoài trời, Tiệc sự kiện)', async () => {
    const res = await request({
      path: encodeURI('/api/reservations/available-tables?date=2026-11-20&time=18:30&guests=6&space=Phòng VIP riêng'),
      method: 'GET',
      headers: { 'x-token': adminToken }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.targetType, 'vip');
    assert.ok(Array.isArray(res.json.tables));
    assert.ok(res.json.tables.length > 0);

    const tables = res.json.tables;
    // Kiểm tra có đầy đủ 4 loại bàn trong hệ thống
    const hasVip = tables.some(t => t.type === 'vip' && t.typeName === 'Phòng VIP riêng');
    const hasStd = tables.some(t => t.type === 'standard' && t.typeName === 'Bàn tiêu chuẩn');
    const hasOut = tables.some(t => t.type === 'outdoor' && t.typeName === 'Khu vực ngoài trời');
    const hasEvt = tables.some(t => t.type === 'event' && t.typeName === 'Đặt tiệc, sự kiện');

    assert.ok(hasVip, 'Cần có Phòng VIP riêng');
    assert.ok(hasStd, 'Cần có Bàn tiêu chuẩn');
    assert.ok(hasOut, 'Cần có Khu vực ngoài trời');
    assert.ok(hasEvt, 'Cần có Đặt tiệc, sự kiện');

    // Kiểm tra cờ isMatchSpace với khu vực Phòng VIP riêng
    const matchedVip = tables.filter(t => t.isMatchSpace);
    assert.ok(matchedVip.length > 0);
    assert.ok(matchedVip.every(t => t.type === 'vip'));
  });

  // 41. Forgot Password: Request OTP via Email or Phone
  let savedForgotOtp = '';
  await test('41. Quên mật khẩu: Yêu cầu mã OTP qua Email (admin@gmail.com) và qua Số điện thoại (0912345678)', async () => {
    // 41a. Request by email
    const res1 = await request({
      path: '/api/auth/forgot-password',
      method: 'POST',
      body: { identifier: 'admin@gmail.com' }
    });
    assert.strictEqual(res1.statusCode, 200);
    assert.strictEqual(res1.json.success, true);
    assert.strictEqual(res1.json.username, 'admin');
    assert.strictEqual(res1.json.method, 'email');
    assert.ok(res1.json.otp);
    assert.strictEqual(res1.json.otp.length, 6);

    // 41b. Request by phone
    const res2 = await request({
      path: '/api/auth/forgot-password',
      method: 'POST',
      body: { identifier: '0912345678' }
    });
    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.json.success, true);
    assert.strictEqual(res2.json.username, 'quanly');
    assert.strictEqual(res2.json.method, 'sms');
    assert.ok(res2.json.otp);
    assert.strictEqual(res2.json.otp.length, 6);

    // 41c. Request by username (phucvu)
    const res3 = await request({
      path: '/api/auth/forgot-password',
      method: 'POST',
      body: { identifier: 'phucvu' }
    });
    assert.strictEqual(res3.statusCode, 200);
    assert.strictEqual(res3.json.success, true);
    assert.strictEqual(res3.json.username, 'phucvu');
    assert.ok(res3.json.otp);
    savedForgotOtp = res3.json.otp;
  });

  // 42. Forgot Password: Error handling for nonexistent account or empty input
  await test('42. Quên mật khẩu: Xử lý từ chối khi thông tin không tồn tại hoặc rỗng', async () => {
    const resEmpty = await request({
      path: '/api/auth/forgot-password',
      method: 'POST',
      body: { identifier: '' }
    });
    assert.strictEqual(resEmpty.statusCode, 400);

    const resNotFound = await request({
      path: '/api/auth/forgot-password',
      method: 'POST',
      body: { identifier: 'nonexistent_user_9999@gmail.com' }
    });
    assert.strictEqual(resNotFound.statusCode, 404);
  });

  // 43. Reset Password: Rejection with wrong OTP or short password
  await test('43. Đặt lại mật khẩu: Bị từ chối khi nhập sai mã OTP hoặc mật khẩu quá ngắn', async () => {
    const resWrongOtp = await request({
      path: '/api/auth/reset-password',
      method: 'POST',
      body: {
        username: 'phucvu',
        otp: '000000',
        newPassword: 'NewPassword@123'
      }
    });
    assert.strictEqual(resWrongOtp.statusCode, 400);
    assert.ok(resWrongOtp.json.error.includes('không chính xác'));

    const resShortPwd = await request({
      path: '/api/auth/reset-password',
      method: 'POST',
      body: {
        username: 'phucvu',
        otp: savedForgotOtp,
        newPassword: '123'
      }
    });
    assert.strictEqual(resShortPwd.statusCode, 400);
    assert.ok(resShortPwd.json.error.includes('tối thiểu 6 ký tự'));
  });

  // 44. Reset Password: Valid OTP resets password and allows login
  await test('44. Đặt lại mật khẩu thành công qua OTP và đăng nhập bằng mật khẩu mới', async () => {
    const resReset = await request({
      path: '/api/auth/reset-password',
      method: 'POST',
      body: {
        username: 'phucvu',
        otp: savedForgotOtp,
        newPassword: 'PhucvuNewPassword@2026'
      }
    });
    assert.strictEqual(resReset.statusCode, 200);
    assert.strictEqual(resReset.json.success, true);

    // Old password should fail now
    const resOldLogin = await request({
      path: '/api/login',
      method: 'POST',
      body: { u: 'phucvu', p: 'Phucvu@123' }
    });
    assert.strictEqual(resOldLogin.statusCode, 401);

    // New password should succeed
    const resNewLogin = await request({
      path: '/api/login',
      method: 'POST',
      body: { u: 'phucvu', p: 'PhucvuNewPassword@2026' }
    });
    assert.strictEqual(resNewLogin.statusCode, 200);
    assert.ok(resNewLogin.json.token);
    assert.strictEqual(resNewLogin.json.user.u, 'phucvu');
  });

  console.log('\n=============================================');
  console.log(`🎉 KẾT QUẢ: ${passed} PASS, ${failed} FAIL`);
  console.log('=============================================\n');

  // Close server
  server.close(() => {
    // Clean test files
    try { if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile); } catch (_) {}
    try { if (fs.existsSync(testDbTmp)) fs.unlinkSync(testDbTmp); } catch (_) {}
    process.exit(failed > 0 ? 1 : 0);
  });
}

// Allow server to listen before running tests
setTimeout(runTests, 500);
