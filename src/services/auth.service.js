const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const config = require('../config');
const db = require('../db/database');
const logger = require('../logger');

// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Run dummy comparison of same length to prevent timing leaks based on string length
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function normalizePhone(ph) {
  if (!ph) return '';
  return String(ph).replace(/[\s\.\-\(\)]/g, '').replace(/^\+84/, '0');
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [name, domain] = email.split('@');
  if (name.length <= 2) return `${name[0]}*@${domain}`;
  return `${name[0]}${'*'.repeat(Math.max(1, name.length - 2))}${name.slice(-1)}@${domain}`;
}

function maskPhone(phone) {
  if (!phone) return '';
  const clean = normalizePhone(phone);
  if (clean.length < 6) return clean;
  return `${clean.slice(0, 3)}****${clean.slice(-3)}`;
}

class AuthService {
  constructor() {
    this.sessionFile = path.join(__dirname, '..', '.sessions.json');
    // Map: token -> { username, role, expiresAt }
    this.tokens = new Map();
    // Map: username -> { n: number, until: number }
    this.fails = new Map();
    // Map: username -> { otp, expiresAt, attempts, method, maskedTarget, createdAt }
    this.resetOtps = new Map();
    this.saveTimer = null;

    this.loadSessions();

    // Periodic cleanup of expired tokens and old lockout records every 5 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  // Load persistent sessions from disk on startup
  loadSessions() {
    if (!fs.existsSync(this.sessionFile)) return;
    try {
      const content = fs.readFileSync(this.sessionFile, 'utf8');
      const parsed = JSON.parse(content);
      const now = Date.now();
      if (Array.isArray(parsed)) {
        let loadedCount = 0;
        for (const item of parsed) {
          if (item && item.token && item.expiresAt > now) {
            this.tokens.set(item.token, {
              username: item.username,
              role: item.role,
              expiresAt: item.expiresAt
            });
            loadedCount++;
          }
        }
        if (loadedCount > 0) {
          logger.info(`Đã khôi phục ${loadedCount} phiên đăng nhập hợp lệ từ đĩa.`);
        }
      }
    } catch (_) {}
  }

  // Debounced session persistence
  scheduleSaveSessions() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      try {
        const list = [];
        for (const [token, data] of this.tokens.entries()) {
          list.push({ token, ...data });
        }
        await fsp.writeFile(this.sessionFile, JSON.stringify(list), 'utf8');
      } catch (_) {}
    }, 150);
  }

  // Generate cryptographically secure session token
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Cleanup expired tokens, old lockout records and expired reset OTPs
  cleanup() {
    const now = Date.now();
    let changed = false;
    for (const [token, data] of this.tokens.entries()) {
      if (data.expiresAt && data.expiresAt < now) {
        this.tokens.delete(token);
        changed = true;
      }
    }
    for (const [username, failData] of this.fails.entries()) {
      if (failData.until < now && failData.n === 0) {
        this.fails.delete(username);
      }
    }
    for (const [username, otpData] of this.resetOtps.entries()) {
      if (otpData.expiresAt < now) {
        this.resetOtps.delete(username);
      }
    }
    if (changed) {
      this.scheduleSaveSessions();
    }
  }

  // Authenticate user with credentials using constant-time check
  login(username, password) {
    const users = (db.state && Array.isArray(db.state.users)) ? db.state.users : [];
    const user = users.find(x => x.u === username);
    const failRecord = this.fails.get(username) || { n: 0, until: 0 };
    const now = Date.now();

    // Check account lockout (Admin is never locked out)
    if (user && user.role !== 'admin' && failRecord.until > now) {
      return {
        success: false,
        status: 429,
        error: 'Tài khoản bị khóa 15 phút do nhập sai quá 5 lần.'
      };
    }

    // Verify username and password using timingSafeEqual
    const passwordMatches = user && timingSafeEqual(user.p, password);

    if (!user || !passwordMatches) {
      if (user && user.role !== 'admin') {
        failRecord.n++;
        if (failRecord.n >= config.LOGIN_MAX_FAILURES) {
          failRecord.until = now + config.LOGIN_LOCKOUT_TIME_MS;
          failRecord.n = 0;
          logger.warn(`Tài khoản ${username} bị tạm khóa 15 phút do 5 lần đăng nhập sai.`);
        }
        this.fails.set(username, failRecord);
      }
      return {
        success: false,
        status: 401,
        error: 'Tên đăng nhập hoặc mật khẩu không chính xác.'
      };
    }

    // Check if account is active
    if (user.st !== 'active') {
      return {
        success: false,
        status: 403,
        error: 'Tài khoản đã bị khóa hoặc vô hiệu hóa.'
      };
    }

    // Reset failure counter on successful login
    this.fails.delete(username);

    // Create session token with sliding TTL
    const token = this.generateToken();
    const expiresAt = now + config.SESSION_TTL_MS;
    this.tokens.set(token, {
      username: user.u,
      role: user.role,
      expiresAt
    });

    this.scheduleSaveSessions();

    logger.info(`Người dùng '${user.name}' (${user.u} - ${user.role}) đăng nhập thành công.`);

    // Return user info without password
    const { p: _password, ...publicUser } = user;
    return {
      success: true,
      status: 200,
      token,
      user: publicUser
    };
  }

  // Validate request token and return user object
  getUserFromToken(token) {
    if (!token) return null;
    const session = this.tokens.get(token);
    if (!session) return null;

    const now = Date.now();
    if (session.expiresAt && session.expiresAt < now) {
      this.tokens.delete(token);
      this.scheduleSaveSessions();
      return null;
    }

    // Refresh sliding session TTL
    session.expiresAt = now + config.SESSION_TTL_MS;

    const users = (db.state && Array.isArray(db.state.users)) ? db.state.users : [];
    const user = users.find(x => x.u === session.username && x.st === 'active');
    return user || null;
  }

  // Invalidate token on logout
  logout(token) {
    if (token && this.tokens.has(token)) {
      this.tokens.delete(token);
      this.scheduleSaveSessions();
      return true;
    }
    return false;
  }

  // State filtering: admin sees full state including passwords; non-admin has passwords stripped
  viewFor(user) {
    if (!db.state) return {};
    if (user && user.role === 'admin') {
      return db.state;
    }
    const stateUsers = Array.isArray(db.state.users) ? db.state.users : [];
    return {
      ...db.state,
      users: stateUsers.map(({ p: _pwd, ...u }) => u)
    };
  }

  // Find user by username, email or phone
  findUserByIdentifier(rawIdentifier) {
    if (!rawIdentifier) return null;
    const q = String(rawIdentifier).trim();
    if (!q) return null;
    const qLower = q.toLowerCase();
    const qPhone = normalizePhone(q);

    const users = (db.state && Array.isArray(db.state.users)) ? db.state.users : [];

    // 1. Check exact/case-insensitive username match
    let found = users.find(u => u && u.u && u.u.toLowerCase() === qLower);
    if (found) return { user: found, matchedBy: 'username' };

    // 2. Check email match
    if (q.includes('@')) {
      found = users.find(u => u && u.em && u.em.toLowerCase() === qLower);
      if (found) return { user: found, matchedBy: 'email' };
    }

    // 3. Check phone match
    if (qPhone && qPhone.length >= 8) {
      found = users.find(u => u && u.ph && normalizePhone(u.ph) === qPhone);
      if (found) return { user: found, matchedBy: 'phone' };
    }

    // 4. Fallback search (match email or phone anywhere)
    found = users.find(u => {
      if (!u) return false;
      if (u.em && u.em.toLowerCase() === qLower) return true;
      if (u.ph && qPhone && normalizePhone(u.ph) === qPhone) return true;
      return false;
    });
    if (found) return { user: found, matchedBy: 'identifier' };

    return null;
  }

  // Request password reset OTP via Email or Phone / SMS
  async requestPasswordReset(rawIdentifier) {
    const q = String(rawIdentifier || '').trim();
    if (!q) {
      return {
        success: false,
        status: 400,
        error: 'Vui lòng nhập email, số điện thoại hoặc tên đăng nhập của bạn.'
      };
    }

    const match = this.findUserByIdentifier(q);
    if (!match || !match.user) {
      return {
        success: false,
        status: 404,
        error: 'Không tìm thấy tài khoản nhân viên nào khớp với thông tin đã nhập.'
      };
    }

    const user = match.user;
    if (user.st !== 'active') {
      return {
        success: false,
        status: 403,
        error: 'Tài khoản này đã bị khóa hoặc ngừng hoạt động. Vui lòng liên hệ Quản trị viên.'
      };
    }

    // Check if user has email or phone
    const hasEmail = Boolean(user.em && user.em.trim());
    const hasPhone = Boolean(user.ph && user.ph.trim());

    if (!hasEmail && !hasPhone) {
      return {
        success: false,
        status: 400,
        error: 'Tài khoản này chưa cập nhật email hoặc số điện thoại. Vui lòng liên hệ Quản trị viên.'
      };
    }

    // Determine target method and masked target
    let method = 'email';
    let maskedTarget = '';

    if (match.matchedBy === 'phone' || (!hasEmail && hasPhone)) {
      method = 'sms';
      maskedTarget = maskPhone(user.ph);
    } else if (match.matchedBy === 'email' || (hasEmail && !hasPhone)) {
      method = 'email';
      maskedTarget = maskEmail(user.em);
    } else {
      // User matched by username, and has both email & phone
      method = 'both';
      maskedTarget = `${maskEmail(user.em)} và SĐT ${maskPhone(user.ph)}`;
    }

    // Generate 6-digit cryptographic numeric OTP
    const otp = String(crypto.randomInt(100000, 999999));
    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes

    this.resetOtps.set(user.u, {
      otp,
      expiresAt,
      attempts: 0,
      createdAt: now,
      method,
      maskedTarget
    });

    // Send via email if applicable
    if (hasEmail && (method === 'email' || method === 'both')) {
      try {
        const emailService = require('./email.service');
        await emailService.sendPasswordResetOtp(user, otp, user.em);
      } catch (err) {
        logger.error(`[AuthService] Lỗi khi gửi OTP qua email: ${err.message}`);
      }
    }

    // Send/log via SMS if applicable
    if (hasPhone && (method === 'sms' || method === 'both')) {
      logger.info(`[AuthService/SMS] Gửi mã OTP [${otp}] tới số điện thoại: ${user.ph} (Tài khoản: ${user.u})`);
    }

    let message = '';
    if (method === 'email') {
      message = `Mã xác thực OTP đã được gửi đến email ${maskedTarget}.`;
    } else if (method === 'sms') {
      message = `Mã xác thực OTP đã được gửi đến số điện thoại ${maskedTarget}.`;
    } else {
      message = `Mã xác thực OTP đã được gửi đến email ${maskedTarget}.`;
    }

    return {
      success: true,
      status: 200,
      username: user.u,
      name: user.name,
      method,
      maskedTarget,
      otp, // Provided for fast fill / local environment verification
      message
    };
  }

  // Verify OTP and reset password
  verifyAndResetPassword(rawUsername, rawOtp, rawNewPassword) {
    const u = String(rawUsername || '').trim();
    const otp = String(rawOtp || '').trim();
    const p = String(rawNewPassword || '');

    if (!u) {
      return { success: false, status: 400, error: 'Thiếu tên tài khoản cần đặt lại.' };
    }
    if (!otp) {
      return { success: false, status: 400, error: 'Vui lòng nhập mã xác thực OTP 6 số.' };
    }
    if (!p || p.length < 6) {
      return { success: false, status: 400, error: 'Mật khẩu mới phải có tối thiểu 6 ký tự.' };
    }

    const record = this.resetOtps.get(u);
    const now = Date.now();

    if (!record || record.expiresAt < now) {
      if (record) this.resetOtps.delete(u);
      return {
        success: false,
        status: 400,
        error: 'Mã OTP đã hết hạn hoặc không tồn tại. Vui lòng bấm "Gửi lại mã".'
      };
    }

    if (record.attempts >= 5) {
      this.resetOtps.delete(u);
      return {
        success: false,
        status: 429,
        error: 'Bạn đã nhập sai mã OTP quá 5 lần. Vui lòng yêu cầu mã xác thực mới.'
      };
    }

    if (!timingSafeEqual(String(record.otp), otp)) {
      record.attempts++;
      const left = 5 - record.attempts;
      return {
        success: false,
        status: 400,
        error: `Mã OTP không chính xác. Bạn còn ${left} lần thử.`
      };
    }

    // OTP is valid! Find user in database state
    const users = (db.state && Array.isArray(db.state.users)) ? db.state.users : [];
    const user = users.find(x => x.u === u);
    if (!user) {
      return { success: false, status: 404, error: 'Tài khoản không tồn tại trong hệ thống.' };
    }

    // Update password
    user.p = p;
    // Clear lockout
    this.fails.delete(u);
    // Clear reset OTP record
    this.resetOtps.delete(u);

    // Persist changes
    db.bump();

    logger.info(`[AuthService] Người dùng '${user.name}' (${user.u}) đã đổi mật khẩu thành công qua OTP.`);

    return {
      success: true,
      status: 200,
      username: user.u,
      message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập ngay bằng mật khẩu mới.'
    };
  }
}

module.exports = new AuthService();
