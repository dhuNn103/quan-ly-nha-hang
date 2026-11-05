/**
 * Máy chủ quản lý nhà hàng:
 * - Đồng bộ thời gian thực SSE (Server-Sent Events)
 * - Xác thực nhân viên và phân quyền bảo mật (Admin, Quản lý, Phục vụ, Bếp)
 * - Tiếp nhận và xử lý Order từ khách quét QR tại bàn
 * - Ghi dữ liệu bất đồng bộ nguyên tử (Atomic debounced persistence) & Tự động sao lưu (Backups)
 * - Nén dữ liệu HTTP (Gzip/Deflate) & Tiêu đề bảo mật HTTP Security Headers
 */

const http = require('http');
const config = require('./src/config');
const logger = require('./src/logger');
const metrics = require('./src/metrics');
const db = require('./src/db/database');
const sseService = require('./src/services/sse.service');
const applySecurityHeaders = require('./src/middleware/security');
const handleCors = require('./src/middleware/cors');
const serveStatic = require('./src/middleware/staticServer');
const handleApiRequest = require('./src/routes/api.router');

const server = http.createServer(async (req, res) => {
  const startTime = process.hrtime.bigint();
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';

  // Log request completion & record metrics
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;
    metrics.recordRequest(req.method, req.url, res.statusCode, durationMs);
    // Skip logging repetitive SSE ping or event streams to keep terminal clean
    if (req.url === '/api/events') return;
    logger.http(req.method, req.url, res.statusCode, durationMs, clientIp);
  });

  try {
    // 1. Security Headers
    applySecurityHeaders(res);

    // 2. CORS handling (returns true if preflight OPTIONS was answered)
    if (handleCors(req, res)) {
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // 3. API Routes
    if (url.pathname.startsWith('/api/')) {
      await handleApiRequest(req, res, url);
      return;
    }

    // 4. Static Files (public directory)
    const served = serveStatic(req, res, url.pathname);
    if (served) {
      return;
    }

    // 5. 404 Not Found fallback
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (err) {
    logger.error('Lỗi xử lý yêu cầu:', err);
    try {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Lỗi máy chủ nội bộ' }));
      }
    } catch (_) {}
  }
});

// Server HTTP connection timeouts (Slowloris & Keep-Alive tuning)
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 30000;

// Start listening
server.listen(config.PORT, config.HOST, () => {
  logger.info(`====================================================`);
  logger.info(`Nhà hàng đang chạy tại http://localhost:${config.PORT}`);
  logger.info(`Môi trường: ${config.NODE_ENV} | Node: ${process.version}`);
  logger.info(`Tệp dữ liệu: ${config.DATA_FILE}`);
  logger.info(`Tự động sao lưu: ${config.BACKUP_ENABLED ? 'BẬT' : 'TẮT'} (${config.BACKUP_INTERVAL_MS / 60000} phút/lần)`);
  logger.info(`====================================================`);
});

// Graceful shutdown
async function gracefulShutdown(signal) {
  logger.info(`\nNhận tín hiệu ${signal}. Đang tiến hành đóng máy chủ an toàn...`);

  // Close SSE connections
  sseService.closeAll();

  // Stop accepting new connections
  server.close(async () => {
    logger.info('Đã dừng nhận kết nối HTTP mới.');
    // Flush pending database writes
    await db.flush();
    logger.info('Máy chủ đã tắt an toàn. Tạm biệt!');
    process.exit(0);
  });

  // Force exit after 5 seconds if not closed
  setTimeout(() => {
    logger.error('Quá thời gian tắt máy an toàn, buộc dừng tiến trình.');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = server;
