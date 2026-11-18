const fs = require('fs');
const path = require('path');

// Simple zero-dependency .env loader
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    } catch (_) {}
  }
}

loadEnv();

const rootDir = path.resolve(__dirname, '..');

const config = {
  PORT: parseInt(process.env.PORT, 10) || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin@123',
  DATA_FILE: process.env.DATA_FILE ? path.resolve(rootDir, process.env.DATA_FILE) : path.join(rootDir, 'data.json'),
  PUBLIC_DIR: path.join(rootDir, 'public'),
  BACKUP_DIR: path.join(rootDir, 'backups'),
  BACKUP_ENABLED: process.env.BACKUP_ENABLED !== 'false',
  BACKUP_INTERVAL_MS: (parseInt(process.env.BACKUP_INTERVAL_MIN, 10) || 60) * 60 * 1000,
  MAX_BACKUPS: parseInt(process.env.MAX_BACKUPS, 10) || 24,
  MAX_BODY_SIZE_BYTES: (parseInt(process.env.MAX_BODY_SIZE_MB, 10) || 25) * 1024 * 1024,
  SESSION_TTL_MS: (parseInt(process.env.SESSION_TTL_HOURS, 10) || 24) * 60 * 60 * 1000,
  LOGIN_LOCKOUT_TIME_MS: 15 * 60 * 1000, // 15 minutes lockout
  LOGIN_MAX_FAILURES: 5,
  ORDER_DEBOUNCE_MS: 3000, // 3s per IP
  SSE_HEARTBEAT_MS: 20000, // 20s keepalive ping
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  NODE_ENV: process.env.NODE_ENV || 'production'
};

module.exports = config;
