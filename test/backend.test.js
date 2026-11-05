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
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: 3999,
      ...options
    };

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
    if (body) {
      const payload = typeof body === 'object' ? JSON.stringify(body) : body;
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
        { name: 'Quản trị viên', u: 'admin', p: 'Admin@123', role: 'admin', st: 'active', t: Date.now() },
        { name: 'Trần Phục Vụ', u: 'phucvu', p: 'Phucvu@123', role: 'waiter', st: 'active', t: Date.now() }
      ],
      tables: [
        { id: 1, name: 'Bàn 1', st: 'free' },
        { id: 2, name: 'Bàn 2', st: 'free' }
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
    assert.strictEqual(res.json.restaurant.tables.total, 2);
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
