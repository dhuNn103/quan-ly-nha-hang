const config = require('../config');
const logger = require('../logger');
const db = require('../db/database');
const backupManager = require('../db/backup');
const authService = require('../services/auth.service');
const sseService = require('../services/sse.service');
const stateService = require('../services/state.service');
const orderService = require('../services/order.service');
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
