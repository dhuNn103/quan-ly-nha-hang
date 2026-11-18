const config = require('../config');
const logger = require('../logger');
const db = require('../db/database');
const backupManager = require('../db/backup');
const authService = require('../services/auth.service');
const sseService = require('../services/sse.service');
const stateService = require('../services/state.service');
const orderService = require('../services/order.service');
const homepageService = require('../services/homepage.service');
const ReservationService = require('../services/reservation.service');
const reservationService = new ReservationService();
const { sendCompressedJson } = require('../middleware/compression');
const handleHealth = require('./health.route');

// Safe JSON body reader with strict size limit
function readBody(req, limit = config.MAX_BODY_SIZE_BYTES) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let bytesRead = 0;

    req.on('data', chunk => {
      bytesRead += chunk.length;
      if (bytesRead > limit) {
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      raw += chunk;
    });

    req.on('end', () => {
      if (!raw || !raw.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed);
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });

    req.on('error', err => reject(err));
  });
}

function extractToken(req) {
  const xToken = req.headers['x-token'];
  if (xToken) return xToken;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

async function handleApiRequest(req, res, url) {
  const pathname = url.pathname;
  const send = (code, obj) => sendCompressedJson(req, res, code, obj);

  // 1. Real-time events SSE
  if (pathname === '/api/events' && req.method === 'GET') {
    sseService.addClient(req, res);
    return true;
  }

  // 2. Login
  if (pathname === '/api/login' && req.method === 'POST') {
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      send(400, { error: 'Yêu cầu không hợp lệ' });
      return true;
    }

    const username = String(body.u || '').trim();
    const password = String(body.p || '');
    const result = authService.login(username, password);

    if (!result.success) {
      send(result.status, { error: result.error });
      return true;
    }

    send(200, { token: result.token, user: result.user });
    return true;
  }

  // 2b. Logout
  if (pathname === '/api/logout' && req.method === 'POST') {
    const token = extractToken(req);
    authService.logout(token);
    send(200, { success: true });
    return true;
  }

  // 2c. Forgot Password (Request OTP via Email or Phone)
  if ((pathname === '/api/auth/forgot-password' || pathname === '/api/forgot-password') && req.method === 'POST') {
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      send(400, { error: 'Yêu cầu không hợp lệ' });
      return true;
    }

    const identifier = String(body.identifier || body.email || body.phone || body.username || body.u || '').trim();
    const result = await authService.requestPasswordReset(identifier);
    if (!result.success) {
      send(result.status || 400, { error: result.error });
      return true;
    }

    send(200, result);
    return true;
  }

  // 2d. Reset Password (Verify OTP and update password)
  if ((pathname === '/api/auth/reset-password' || pathname === '/api/reset-password') && req.method === 'POST') {
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      send(400, { error: 'Yêu cầu không hợp lệ' });
      return true;
    }

    const username = String(body.username || body.u || '').trim();
    const otp = String(body.otp || '').trim();
    const newPassword = String(body.newPassword || body.p || '');

    const result = authService.verifyAndResetPassword(username, otp, newPassword);
    if (!result.success) {
      send(result.status || 400, { error: result.error });
      return true;
    }

    send(200, result);
    return true;
  }

  // 3. State sync (Staff / POS / Kitchen / Admin)
  if (pathname === '/api/state') {
    const token = extractToken(req);
    const user = authService.getUserFromToken(token);

    if (!user) {
      send(401, { error: 'Chưa đăng nhập' });
      return true;
    }

    if (req.method === 'GET') {
      const stateData = stateService.getState(user);
      send(200, stateData);
      return true;
    }

    if (req.method === 'PUT') {
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        send(400, { error: 'Dữ liệu không hợp lệ' });
        return true;
      }

      const updateResult = stateService.updateState(user, body);
      send(updateResult.status, updateResult.data);
      return true;
    }

    send(405, { error: 'Phương thức không được hỗ trợ' });
    return true;
  }

  // 4. Public minimal state for QR order customer
  if (pathname === '/api/public' && req.method === 'GET') {
    const tableId = url.searchParams.get('table');
    const pubState = stateService.getPublicState(tableId);
    send(200, pubState);
    return true;
  }

  // 5. Place QR Order
  if (pathname === '/api/order' && req.method === 'POST') {
    const ip = getClientIp(req);
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      send(400, { error: 'Yêu cầu không hợp lệ' });
      return true;
    }

    const orderResult = orderService.createOrder(ip, body);
    send(orderResult.status, orderResult.data);
    return true;
  }

  // 5b-policy. Deposit policy inquiry endpoint (Public & Admin)
  if ((pathname === '/api/reservation/policy' || pathname === '/api/reservations/deposit-policy') && (req.method === 'GET' || req.method === 'POST')) {
    let params = {};
    if (req.method === 'POST') {
      try { params = await readBody(req); } catch (_) {}
    } else {
      params = Object.fromEntries(url.searchParams.entries());
    }
    const policy = reservationService.calculateDepositPolicy(params);
    send(200, { success: true, policy });
    return true;
  }

  // 5b. Table Reservation (Homepage Public Booking or Admin/Staff Creation)
  if ((pathname === '/api/reservation' || pathname === '/api/booking' || pathname === '/api/reservations') && req.method === 'POST') {
    const ip = getClientIp(req);
    let body;
    try {
      body = await readBody(req);
    } catch (_) {
      send(400, { error: 'Yêu cầu không hợp lệ' });
      return true;
    }

    const token = extractToken(req);
    const user = token ? authService.getUserFromToken(token) : null;

    // If an authenticated staff/admin creates a reservation via /api/reservations
    if (user && pathname === '/api/reservations') {
      const adminResResult = reservationService.createAdminReservation(user, body);
      send(adminResResult.status, adminResResult.data);
      return true;
    }

    // Otherwise, public reservation from homepage
    const resResult = reservationService.createPublicReservation(ip, body);
    send(resResult.status, resResult.data);
    return true;
  }

  // 5c. List, Detail, Stats, Available Tables, and Export Reservations (Staff / Manager / Admin)
  if ((pathname === '/api/reservations' || pathname === '/api/reservation' || pathname.startsWith('/api/reservations/')) && req.method === 'GET') {
    const token = extractToken(req);
    const user = authService.getUserFromToken(token);
    if (!user) {
      send(401, { error: 'Chưa đăng nhập' });
      return true;
    }

    const action = url.searchParams.get('action');

    // 5c-1. Reservation Dashboard Stats
    if (pathname === '/api/reservations/stats' || action === 'stats') {
      const statsResult = reservationService.getStats(user);
      send(statsResult.status, statsResult.data);
      return true;
    }

    // 5c-2. Export to CSV (Excel compatible with UTF-8 BOM)
    if (pathname === '/api/reservations/export' || action === 'export') {
      const exportResult = reservationService.exportCsv(user, url.searchParams);
      res.writeHead(200, {
        'Content-Type': exportResult.contentType,
        'Content-Disposition': `attachment; filename="${exportResult.fileName}"`,
        'Cache-Control': 'no-cache'
      });
      res.end(exportResult.data);
      return true;
    }

    // 5c-3. Check Available Tables for Date/Time/Guests
    if (pathname === '/api/reservations/available-tables' || action === 'available-tables') {
      const date = url.searchParams.get('date');
      const time = url.searchParams.get('time');
      const guests = url.searchParams.get('guests');
      const space = url.searchParams.get('space');
      const availResult = reservationService.checkAvailability(date, time, guests, space);
      send(availResult.status, availResult.data);
      return true;
    }

    // 5c-4. Single Reservation Detail
    const id = url.searchParams.get('id');
    if (id && !url.searchParams.has('page') && !url.searchParams.has('status') && !url.searchParams.has('search')) {
      const detailResult = reservationService.getReservationById(id);
      send(detailResult.status, detailResult.data);
      return true;
    }

    // 5c-5. List Reservations with advanced filters, search, pagination
    const listResult = reservationService.listReservations(user, url.searchParams);
    send(listResult.status, listResult.data);
    return true;
  }

  // 5d. Update Reservation Details, Status or Table Assignment (Staff / Manager / Admin)
  if ((pathname === '/api/reservations' || pathname === '/api/reservation') && (req.method === 'PUT' || req.method === 'PATCH')) {
    const token = extractToken(req);
    const user = authService.getUserFromToken(token);
    if (!user) {
      send(401, { error: 'Chưa đăng nhập' });
      return true;
    }

    let body;
    try {
      body = await readBody(req);
    } catch (_) {
      send(400, { error: 'Dữ liệu không hợp lệ' });
      return true;
    }

    const id = body.id || url.searchParams.get('id');
    const updateResult = reservationService.updateReservation(user, id, body);
    send(updateResult.status, updateResult.data);
    return true;
  }

  // 5e. Delete Reservation (Admin / Manager only)
  if ((pathname === '/api/reservations' || pathname === '/api/reservation') && req.method === 'DELETE') {
    const token = extractToken(req);
    const user = authService.getUserFromToken(token);
    if (!user) {
      send(401, { error: 'Chưa đăng nhập' });
      return true;
    }
    if (user.role !== 'admin' && user.role !== 'manager') {
      send(403, { error: 'Chỉ Quản trị viên và Quản lý mới có quyền xóa đặt bàn.' });
      return true;
    }

    let body = {};
    try {
      body = await readBody(req);
    } catch (_) {}

    const id = body.id || url.searchParams.get('id');
    if (!id) {
      send(400, { error: 'Vui lòng cung cấp mã đặt bàn cần xóa.' });
      return true;
    }

    const delResult = reservationService.deleteReservation(user, id);
    send(delResult.status, delResult.data);
    return true;
  }

  // 5e. Newsletter Subscription from Homepage Footer
  if ((pathname === '/api/newsletter' || pathname === '/api/subscribe') && req.method === 'POST') {
    const ip = getClientIp(req);
    let body;
    try {
      body = await readBody(req);
    } catch (_) {
      send(400, { error: 'Yêu cầu không hợp lệ' });
      return true;
    }

    const subResult = homepageService.subscribeNewsletter(ip, body);
    send(subResult.status, subResult.data);
    return true;
  }

  // 5f. List Subscribers (Admin / Manager)
  if ((pathname === '/api/newsletter' || pathname === '/api/subscribers') && req.method === 'GET') {
    const token = extractToken(req);
    const user = authService.getUserFromToken(token);
    if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
      send(403, { error: 'Chỉ Quản trị viên và Quản lý mới có quyền truy cập.' });
      return true;
    }

    const subList = homepageService.listSubscribers(user);
    send(subList.status, subList.data);
    return true;
  }

  // 5f-2. Export Subscribers to CSV
  if (pathname === '/api/subscribers/export' && req.method === 'GET') {
    const token = extractToken(req);
    const user = authService.getUserFromToken(token);
    if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
      send(403, { error: 'Chỉ Quản trị viên và Quản lý mới có quyền truy cập.' });
      return true;
    }

    const csv = homepageService.exportSubscribersCsv(user);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="danh_sach_nhan_uu_dai.csv"'
    });
    res.end(csv);
    return true;
  }

  // 5f-3. Delete Subscriber (Admin only)
  if ((pathname === '/api/subscribers' || pathname === '/api/newsletter') && req.method === 'DELETE') {
    const token = extractToken(req);
    const user = authService.getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      send(403, { error: 'Chỉ Quản trị viên mới có quyền xóa người đăng ký.' });
      return true;
    }

    const emailOrId = url.searchParams.get('id') || url.searchParams.get('email') || '';
    const result = homepageService.deleteSubscriber(user, emailOrId);
    send(result.status, result.data);
    return true;
  }

  // 5h. Test SMTP Email Configuration (Admin only)
  if (pathname === '/api/email/test' && req.method === 'POST') {
    const token = extractToken(req);
    const user = authService.getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      send(403, { error: 'Chỉ Quản trị viên mới có quyền kiểm tra cấu hình email.' });
      return true;
    }

    let body = {};
    try {
      body = await readBody(req);
    } catch (_) {}

    const emailService = require('../services/email.service');
    const testResult = await emailService.testSmtpConnection(body.smtp || body, body.targetEmail);
    send(testResult.success ? 200 : 400, testResult);
    return true;
  }

  // 5g. Public Quick Menu Search for Homepage
  if (pathname === '/api/menu/search' && req.method === 'GET') {
    const q = url.searchParams.get('q') || '';
    const searchResult = homepageService.searchDishes(q);
    send(searchResult.status, searchResult.data);
    return true;
  }

  // 6. System Health Check
  if (pathname === '/api/health' && req.method === 'GET') {
    await handleHealth(req, res, send);
    return true;
  }

  // 7. Backups Management (Admin only)
  if (pathname === '/api/backups') {
    const token = extractToken(req);
    const user = authService.getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      send(403, { error: 'Chỉ Quản trị viên (Admin) mới có quyền truy cập.' });
      return true;
    }

    if (req.method === 'GET') {
      const list = await backupManager.listBackups();
      send(200, { backups: list });
      return true;
    }

    if (req.method === 'POST') {
      const result = await backupManager.createBackup(db.data, 'manual');
      send(result.success ? 200 : 500, result);
      return true;
    }
  }

  // 8. Database Compacting (Admin only)
  if (pathname === '/api/compact' && req.method === 'POST') {
    const token = extractToken(req);
    const user = authService.getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      send(403, { error: 'Chỉ Quản trị viên (Admin) mới có quyền truy cập.' });
      return true;
    }

    let body = {};
    try { body = await readBody(req); } catch (_) {}
    const daysToKeep = parseInt(body.daysToKeep, 10) || 30;
    const compactResult = await db.compact(daysToKeep);
    send(compactResult.success ? 200 : 500, compactResult);
    return true;
  }

  // 9. SSE Connected Clients List (Admin only)
  if (pathname === '/api/sse/clients' && req.method === 'GET') {
    const token = extractToken(req);
    const user = authService.getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      send(403, { error: 'Chỉ Quản trị viên (Admin) mới có quyền truy cập.' });
      return true;
    }

    const clientList = sseService.getClientDetails();
    send(200, { total: clientList.length, clients: clientList });
    return true;
  }

  // Fallback for unknown /api/* routes
  send(404, { error: 'Endpoint không tồn tại' });
  return true;
}

module.exports = handleApiRequest;
