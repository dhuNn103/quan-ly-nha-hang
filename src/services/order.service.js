const config = require('../config');
const db = require('../db/database');
const logger = require('../logger');

class OrderService {
  constructor() {
    this.rateLimits = new Map(); // ip -> timestamp

    // Periodically clean up old IP rate limit entries every 10 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 10 * 60 * 1000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  cleanup() {
    const now = Date.now();
    for (const [ip, time] of this.rateLimits.entries()) {
      if (now - time > config.ORDER_DEBOUNCE_MS * 5) {
        this.rateLimits.delete(ip);
      }
    }
  }

  createOrder(clientIp, body) {
    const now = Date.now();
    const lastTime = this.rateLimits.get(clientIp) || 0;

    // Debounce order submission by IP
    if (now - lastTime < config.ORDER_DEBOUNCE_MS) {
      return {
        status: 429,
        data: { error: 'Vui lòng đợi vài giây.' }
      };
    }
    this.rateLimits.set(clientIp, now);

    const s = db.state;
    if (!s || !s.menu || !s.orders) {
      return {
        status: 400,
        data: { error: 'Hệ thống chưa được khởi tạo. Hãy đăng nhập Admin một lần.' }
      };
    }

    const tableId = Number(body.table);
    const table = (s.tables || []).find(x => x.id === tableId);
    if (!table || table.off) {
      return {
        status: 400,
        data: { error: 'Bàn không hợp lệ hoặc đang tạm ngừng phục vụ.' }
      };
    }

    // Ensure sequence counter exists
    if (typeof s.seq !== 'number' || isNaN(s.seq)) {
      s.seq = 1;
    }

    const note = String(body.note || '').slice(0, 200);
    const items = [];
    const rawItems = Array.isArray(body.items) ? body.items : [];

    for (const item of rawItems) {
      const menuItem = s.menu.find(x => x.id === item.id);
      const qty = Math.floor(+item.qty);

      if (!menuItem || menuItem.st !== 'on' || !(qty > 0 && qty <= 50)) {
        return {
          status: 400,
          data: { error: 'Có món không hợp lệ hoặc đã hết.' }
        };
      }

      // Always retrieve verified price directly from server-side menu
      items.push({
        id: 'i' + (s.seq++),
        name: menuItem.name,
        price: menuItem.price,
        qty,
        note,
        st: 'wait'
      });
    }

    if (!items.length) {
      return {
        status: 400,
        data: { error: 'Chưa chọn món.' }
      };
    }

    const orderId = 'DH' + (s.seq++);
    const order = {
      id: orderId,
      table: table.id,
      src: 'Khách qua QR',
      by: String(body.by || 'Khách').slice(0, 60),
      t: now,
      status: (s.cfg && s.cfg.qrAuto) ? 'confirmed' : 'pending',
      pay: 'unpaid',
      note,
      items
    };

    s.orders.push(order);

    if (table.st !== 'busy') {
      table.st = 'busy';
    }

    if (!Array.isArray(s.log)) {
      s.log = [];
    }
    s.log.push({
      t: now,
      by: 'Khách (QR)',
      a: 'Khách gửi order QR',
      d: 'Bàn ' + table.name
    });

    db.bump();
    logger.info(`Đơn hàng mới ${orderId} tại bàn ${table.name} (${items.length} món)`);

    return {
      status: 200,
      data: { id: orderId }
    };
  }
}

module.exports = new OrderService();
