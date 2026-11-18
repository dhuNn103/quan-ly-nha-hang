const os = require('os');
const fs = require('fs');
const db = require('../db/database');
const sseService = require('../services/sse.service');
const backupManager = require('../db/backup');
const metrics = require('../metrics');
const config = require('../config');

async function handleHealth(req, res, sendJson) {
  const backups = await backupManager.listBackups();
  const mem = process.memoryUsage();
  const perfMetrics = metrics.getStats();

  let dataFileSizeKb = 0;
  try {
    dataFileSizeKb = Math.round(fs.statSync(config.DATA_FILE).size / 1024);
  } catch (_) {}

  const state = db.state || {};
  const tables = Array.isArray(state.tables) ? state.tables : [];
  const menu = Array.isArray(state.menu) ? state.menu : [];
  const orders = Array.isArray(state.orders) ? state.orders : [];

  const healthData = {
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    dataVersion: db.v,
    dataFileSizeKb,
    connectedSseClients: sseService.getClientCount(),
    totalBackups: backups.length,
    performance: perfMetrics,
    restaurant: {
      tables: {
        total: tables.length,
        active: tables.filter(t => !t.off).length,
        busy: tables.filter(t => t.st === 'busy').length,
        free: tables.filter(t => t.st === 'free' && !t.off).length,
        disabled: tables.filter(t => t.off).length
      },
      menu: {
        totalItems: menu.length,
        available: menu.filter(m => m.st === 'on').length,
        outOfStock: menu.filter(m => m.st === 'out').length
      },
      orders: {
        total: orders.length,
        pending: orders.filter(o => o.status === 'pending').length,
        active: orders.filter(o => o.pay !== 'paid').length
      }
    },
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024)
    }
  };

  sendJson(200, healthData);
}

module.exports = handleHealth;
