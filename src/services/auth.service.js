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

class AuthService {
  constructor() {
    this.sessionFile = path.join(__dirname, '..', '.sessions.json');
    // Map: token -> { username, role, expiresAt }
    this.tokens = new Map();
    // Map: username -> { n: number, until: number }
    this.fails = new Map();
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

  // Cleanup expired tokens and old lockout records to avoid memory leaks
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
}

module.exports = new AuthService();
