const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const config = require('../config');
const logger = require('../logger');

class BackupManager {
  constructor() {
    this.backupDir = config.BACKUP_DIR;
    this.maxBackups = config.MAX_BACKUPS;
    this.timer = null;
    this.ensureDir();
  }

  ensureDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  formatDate(d = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  async createBackup(dbData, label = 'auto') {
    try {
      this.ensureDir();
      const filename = `data_${this.formatDate()}_${label}.json`;
      const fullPath = path.join(this.backupDir, filename);
      const jsonStr = JSON.stringify(dbData, null, 2);
      await fsp.writeFile(fullPath, jsonStr, 'utf8');
      logger.info(`Đã tạo bản sao lưu dữ liệu: ${filename}`);
      await this.pruneOldBackups();
      return { success: true, filename };
    } catch (err) {
      logger.error('Lỗi khi tạo bản sao lưu:', err.message);
      return { success: false, error: err.message };
    }
  }

  async listBackups() {
    try {
      this.ensureDir();
      const files = await fsp.readdir(this.backupDir);
      const backups = [];
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const fullPath = path.join(this.backupDir, f);
        const stats = await fsp.stat(fullPath);
        backups.push({
          filename: f,
          size: stats.size,
          createdAt: stats.mtime
        });
      }
      return backups.sort((a, b) => b.createdAt - a.createdAt);
    } catch (err) {
      logger.error('Lỗi khi liệt kê sao lưu:', err.message);
      return [];
    }
  }

  async pruneOldBackups() {
    try {
      const backups = await this.listBackups();
      if (backups.length > this.maxBackups) {
        const toDelete = backups.slice(this.maxBackups);
        for (const b of toDelete) {
          const fullPath = path.join(this.backupDir, b.filename);
          await fsp.unlink(fullPath);
          logger.info(`Đã xóa bản sao lưu cũ: ${b.filename}`);
        }
      }
    } catch (err) {
      logger.warn('Lỗi khi dọn dẹp sao lưu cũ:', err.message);
    }
  }

  async getLatestBackup() {
    const backups = await this.listBackups();
    return backups.length > 0 ? backups[0] : null;
  }

  startScheduled(getDbDataFn) {
    if (!config.BACKUP_ENABLED) return;
    this.timer = setInterval(async () => {
      const data = getDbDataFn();
      if (data && data.state) {
        await this.createBackup(data, 'scheduled');
      }
    }, config.BACKUP_INTERVAL_MS);
    if (this.timer.unref) this.timer.unref();
  }

  stopScheduled() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports = new BackupManager();
