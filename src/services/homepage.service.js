const config = require('../config');
const db = require('../db/database');
const logger = require('../logger');
const ReservationService = require('./reservation.service');
const emailService = require('./email.service');

class HomepageService {
  constructor() {
    this.rateLimits = new Map(); // ip -> timestamp for reservation & newsletter
    this.reservationService = new ReservationService();

    // Clean up old rate limit entries every 10 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 10 * 60 * 1000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  cleanup() {
    const now = Date.now();
    for (const [ip, time] of this.rateLimits.entries()) {
      if (now - time > 60 * 1000) {
        this.rateLimits.delete(ip);
      }
    }
  }

  // 1. Create table reservation from homepage (Delegated to ReservationService)
  createReservation(clientIp, body) {
    return this.reservationService.createPublicReservation(clientIp, body);
  }

  // 2. Staff/Manager: List reservations (Delegated to ReservationService)
  listReservations(user, query = {}) {
    return this.reservationService.listReservations(user, query);
  }

  // 3. Staff/Manager: Update reservation status or assign table (Delegated to ReservationService)
  updateReservation(user, id, body) {
    return this.reservationService.updateReservation(user, id, body);
  }

  // 4. Newsletter Subscription (Footer)
  subscribeNewsletter(clientIp, body) {
    const now = Date.now();
    const lastTime = this.rateLimits.get('sub_' + clientIp) || 0;

    if (now - lastTime < 3000) {
      return {
        status: 429,
        data: { error: 'Vui lòng đợi vài giây trước khi đăng ký lại.' }
      };
    }
    this.rateLimits.set('sub_' + clientIp, now);

    const s = db.state;
    if (!s) {
      return { status: 500, data: { error: 'Hệ thống đang bận, vui lòng thử lại sau.' } };
    }

    const email = String(body.email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email || !emailRegex.test(email) || email.length > 100) {
      return {
        status: 400,
        data: { error: 'Quý khách vui lòng nhập địa chỉ email hợp lệ.' }
      };
    }

    if (!Array.isArray(s.subscribers)) {
      s.subscribers = [];
    }

    const existing = s.subscribers.find(sub => sub.email === email);
    if (existing) {
      return {
        status: 200,
        data: {
          success: true,
          already: true,
          message: 'Email này đã đăng ký nhận ưu đãi trước đó!'
        }
      };
    }

    if (typeof s.seq !== 'number' || isNaN(s.seq)) {
      s.seq = 1;
    }

    const subObj = {
      id: 'SUB' + (s.seq++),
      email,
      t: now,
      ip: clientIp
    };

    s.subscribers.unshift(subObj);
    if (s.subscribers.length > 1000) {
      s.subscribers = s.subscribers.slice(0, 1000);
    }

    if (!Array.isArray(s.log)) s.log = [];
    s.log.push({
      t: now,
      by: 'Khách (Trang chủ)',
      a: 'Đăng ký nhận ưu đãi',
      d: email
    });

    db.bump();
    logger.info(`Đăng ký nhận ưu đãi mới: ${email}`);

    // Asynchronously send email alert to Admin
    Promise.resolve(
      emailService.sendNewsletterAlertToAdmin({ subscriberEmail: email, time: now, ip: clientIp })
    ).catch(err => {
      logger.error(`[Newsletter] Gửi email thông báo thất bại: ${err.message}`);
    });

    return {
      status: 200,
      data: {
        success: true,
        message: 'Đăng ký nhận ưu đãi thành công! Cảm ơn Quý khách.',
        subscriber: subObj
      }
    };
  }

  // 5. Staff/Admin: List newsletter subscribers
  listSubscribers(user) {
    const s = db.state || {};
    const list = Array.isArray(s.subscribers) ? s.subscribers : [];
    return {
      status: 200,
      data: {
        total: list.length,
        subscribers: list
      }
    };
  }

  // 5b. Admin: Delete subscriber
  deleteSubscriber(user, emailOrId) {
    const s = db.state || {};
    if (!Array.isArray(s.subscribers)) s.subscribers = [];
    const key = String(emailOrId || '').trim().toLowerCase();
    const idx = s.subscribers.findIndex(x => x.id === emailOrId || (x.email && x.email.toLowerCase() === key));
    if (idx === -1) {
      return { status: 404, data: { error: 'Không tìm thấy người đăng ký này.' } };
    }
    const removed = s.subscribers.splice(idx, 1)[0];
    if (!Array.isArray(s.log)) s.log = [];
    s.log.push({
      t: Date.now(),
      by: user ? user.name : 'Quản trị viên',
      a: 'Xóa người đăng ký ưu đãi',
      d: removed.email
    });
    db.bump();
    return { status: 200, data: { success: true, message: 'Đã xóa người đăng ký.', subscriber: removed } };
  }

  // 5c. Admin: Export subscribers to CSV (Excel UTF-8 BOM compatible)
  exportSubscribersCsv(user) {
    const s = db.state || {};
    const list = Array.isArray(s.subscribers) ? s.subscribers : [];
    const headers = ['Mã', 'Email', 'Thời gian đăng ký', 'Địa chỉ IP'];
    const rows = list.map((item, idx) => {
      const d = item.t ? new Date(item.t).toLocaleString('vi-VN') : '';
      return [
        `"${item.id || ('SUB' + (idx + 1))}"`,
        `"${(item.email || '').replace(/"/g, '""')}"`,
        `"${d}"`,
        `"${item.ip || ''}"`
      ].join(',');
    });
    return '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  }

  // 6. Public quick dish search
  searchDishes(query) {
    const s = db.state || {};
    const q = String(query || '').trim().toLowerCase();
    const menu = Array.isArray(s.menu) ? s.menu : [];

    if (!q) {
      return {
        status: 200,
        data: {
          total: 0,
          dishes: []
        }
      };
    }

    const matched = menu
      .filter(m => m.st !== 'hide' && (
        (m.name && m.name.toLowerCase().includes(q)) ||
        (m.cat && m.cat.toLowerCase().includes(q)) ||
        (m.id && m.id.toLowerCase().includes(q))
      ))
      .map(({ id, name, price, cat, img, area, st }) => ({ id, name, price, cat, img, area, st }));

    return {
      status: 200,
      data: {
        total: matched.length,
        dishes: matched
      }
    };
  }
}

module.exports = new HomepageService();
