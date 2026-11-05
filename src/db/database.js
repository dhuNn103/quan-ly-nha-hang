const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');
const config = require('../config');
const logger = require('../logger');
const backupManager = require('./backup');

class Database extends EventEmitter {
  constructor() {
    super();
    this.dataFile = config.DATA_FILE;
    this.tmpFile = config.DATA_FILE + '.tmp';
    this.data = { v: 0, state: null };
    this.saveTimer = null;
    this.isWriting = false;
    this.hasPendingWrite = false;
    this.writePromise = null;
    this.resolveWrite = null;
    this.cachedJson = null;

    this.init();
  }

  createDefaultUser(name, u, p, role) {
    return { name, u, p, role, st: 'active', t: Date.now() };
  }

  getDefaultUsers() {
    return [
      this.createDefaultUser('Quản trị viên', 'admin', config.ADMIN_PASSWORD, 'admin'),
      this.createDefaultUser('Nguyễn Quản Lý', 'quanly', 'Quanly@123', 'manager'),
      this.createDefaultUser('Trần Phục Vụ', 'phucvu', 'Phucvu@123', 'waiter'),
      this.createDefaultUser('Lê Bếp', 'bep', 'Bep@12345', 'kitchen')
    ];
  }

  init() {
    let loaded = false;

    // 1. Try reading the main data file
    if (fs.existsSync(this.dataFile)) {
      try {
        const raw = fs.readFileSync(this.dataFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.data = parsed;
          this.cachedJson = raw;
          loaded = true;
          logger.info(`Đã nạp dữ liệu từ ${path.basename(this.dataFile)} (phiên bản v${this.data.v || 0})`);
        }
      } catch (err) {
        logger.error(`Tệp dữ liệu ${this.dataFile} bị hỏng hoặc không đọc được:`, err.message);
      }
    }

    // 2. If main file failed, try reading .tmp file
    if (!loaded && fs.existsSync(this.tmpFile)) {
      try {
        const raw = fs.readFileSync(this.tmpFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.data = parsed;
          this.cachedJson = raw;
          loaded = true;
          logger.warn(`Đã khôi phục dữ liệu từ tệp tạm ${path.basename(this.tmpFile)}`);
          fs.copyFileSync(this.tmpFile, this.dataFile);
        }
      } catch (_) {}
    }

    // 3. Fallback: default state
    if (!loaded || !this.data || !this.data.state) {
      if (!this.data) this.data = { v: 0, state: null };
      if (!this.data.state) {
        this.data.state = { users: this.getDefaultUsers() };
      }
      logger.info('Khởi tạo dữ liệu người dùng mặc định (admin/quanly/phucvu/bep).');
    }

    // Ensure version and sequence number integrity
    this.data.v = Number.isInteger(this.data.v) ? this.data.v : 0;
    if (this.data.state && typeof this.data.state === 'object') {
      if (typeof this.data.state.seq !== 'number') {
        this.data.state.seq = 1;
      }

      // Check if RESET_ADMIN_PASSWORD environment variable is set
      const resetPwd = process.env.RESET_ADMIN_PASSWORD;
      if (resetPwd && Array.isArray(this.data.state.users)) {
        const adminUser = this.data.state.users.find(u => u.u === 'admin' || u.role === 'admin');
        if (adminUser) {
          adminUser.p = String(resetPwd);
          adminUser.st = 'active';
          logger.info(`Đã đặt lại mật khẩu cho tài khoản Admin từ biến môi trường RESET_ADMIN_PASSWORD.`);
          this.bump();
        }
      }
    }

    // Start scheduled backups
    backupManager.startScheduled(() => this.data);
  }

  get v() {
    return this.data.v;
  }

  set v(val) {
    this.data.v = val;
    this.cachedJson = null;
  }

  get state() {
    return this.data.state;
  }

  set state(val) {
    this.data.state = val;
    this.cachedJson = null;
  }

  // Validate candidate state structure to prevent data loss
  validateState(candidate) {
    if (!candidate || typeof candidate !== 'object') {
      return { valid: false, reason: 'Dữ liệu state phải là một đối tượng JSON.' };
    }
    // If database already had tables/menu, ensure incoming state doesn't wipe them to null/empty without purpose
    if (this.data.state && this.data.state.menu && Array.isArray(this.data.state.menu)) {
      if (candidate.menu !== undefined && !Array.isArray(candidate.menu)) {
        return { valid: false, reason: 'Danh sách thực đơn (menu) không hợp lệ.' };
      }
    }
    return { valid: true };
  }

  // Debounced, async atomic write
  scheduleSave() {
    this.cachedJson = null; // Invalidate serialized cache
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.executeSave();
    }, 50); // 50ms debounce
  }

  async executeSave() {
    if (this.isWriting) {
      this.hasPendingWrite = true;
      return;
    }

    this.isWriting = true;
    this.hasPendingWrite = false;

    try {
      const jsonStr = JSON.stringify(this.data);
      this.cachedJson = jsonStr;
      await fsp.writeFile(this.tmpFile, jsonStr, 'utf8');
      await fsp.rename(this.tmpFile, this.dataFile);
    } catch (err) {
      logger.error('Lỗi khi ghi tệp dữ liệu:', err.message);
    } finally {
      this.isWriting = false;
      if (this.hasPendingWrite) {
        this.executeSave();
      } else if (this.resolveWrite) {
        const res = this.resolveWrite;
        this.resolveWrite = null;
        this.writePromise = null;
        res();
      }
    }
  }

  // Bump version, schedule atomic save, emit event
  bump() {
    this.data.v++;
    this.cachedJson = null;
    this.scheduleSave();
    this.emit('bump', this.data.v);
    return this.data.v;
  }

  // Compact database: archive old paid orders and trim excessive logs
  async compact(daysToKeep = 30) {
    if (!this.data || !this.data.state) return { success: false, reason: 'No state' };

    const state = this.data.state;
    const now = Date.now();
    const cutoffTime = now - (daysToKeep * 24 * 60 * 60 * 1000);

    const originalOrdersCount = Array.isArray(state.orders) ? state.orders.length : 0;
    const originalLogsCount = Array.isArray(state.log) ? state.log.length : 0;

    const toKeepOrders = [];
    const archivedOrders = [];

    if (Array.isArray(state.orders)) {
      for (const order of state.orders) {
        // Keep active / unpaid orders, and paid orders within retention window
        if (order.pay !== 'paid' || (order.t && order.t > cutoffTime)) {
          toKeepOrders.push(order);
        } else {
          archivedOrders.push(order);
        }
      }
    }

    // Save archived orders to backups/archive_orders.json
    if (archivedOrders.length > 0) {
      try {
        const archiveFile = path.join(config.BACKUP_DIR, 'archive_orders.json');
        let existingArchive = [];
        if (fs.existsSync(archiveFile)) {
          existingArchive = JSON.parse(await fsp.readFile(archiveFile, 'utf8'));
        }
        existingArchive.push(...archivedOrders);
        await fsp.writeFile(archiveFile, JSON.stringify(existingArchive, null, 2), 'utf8');
        logger.info(`Đã lưu trữ ${archivedOrders.length} đơn hàng cũ vào archive_orders.json`);
      } catch (err) {
        logger.warn('Lỗi khi lưu tệp lưu trữ đơn hàng:', err.message);
      }
    }

    state.orders = toKeepOrders;

    // Trim logs: retain only the latest 2000 logs
    let trimmedLogs = 0;
    if (Array.isArray(state.log) && state.log.length > 2000) {
      trimmedLogs = state.log.length - 2000;
      state.log = state.log.slice(-2000);
    }

    this.bump();
    await this.flush();

    let newSize = 0;
    try {
      newSize = fs.statSync(this.dataFile).size;
    } catch (_) {}

    return {
      success: true,
      removedOrders: archivedOrders.length,
      remainingOrders: state.orders.length,
      removedLogs: trimmedLogs,
      newSizeKb: Math.round(newSize / 1024)
    };
  }

  // Flush writes synchronously/asynchronously on shutdown
  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      const jsonStr = JSON.stringify(this.data);
      this.cachedJson = jsonStr;
      fs.writeFileSync(this.tmpFile, jsonStr, 'utf8');
      fs.renameSync(this.tmpFile, this.dataFile);
      logger.info('Đã lưu dữ liệu vào đĩa hoàn tất.');
    } catch (err) {
      logger.error('Lỗi khi lưu dữ liệu trước khi thoát:', err.message);
    }
  }
}

module.exports = new Database();
