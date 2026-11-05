const config = require('../config');
const db = require('../db/database');
const logger = require('../logger');

class SseService {
  constructor() {
    // Map: res -> { ip, connectedAt, userAgent }
    this.clients = new Map();
    this.heartbeatTimer = null;
    this.pingBuffer = Buffer.from(':ping\n\n');

    // Listen for database version bumps
    db.on('bump', version => {
      this.broadcastVersion(version);
    });

    this.startHeartbeat();
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, config.SSE_HEARTBEAT_MS);
    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
  }

  sendHeartbeat() {
    for (const [client] of this.clients.entries()) {
      try {
        client.write(this.pingBuffer);
      } catch (_) {
        this.removeClient(client);
      }
    }
  }

  addClient(req, res) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown';

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    res.write('retry: 2000\n\n');
    this.clients.set(res, {
      ip,
      connectedAt: Date.now(),
      userAgent
    });

    const onEnd = () => this.removeClient(res);
    req.on('close', onEnd);
    req.on('error', onEnd);
    res.on('error', onEnd);
  }

  removeClient(res) {
    if (this.clients.has(res)) {
      this.clients.delete(res);
      try {
        if (!res.writableEnded) res.end();
      } catch (_) {}
    }
  }

  broadcastVersion(version) {
    // Pre-allocated Buffer for high-performance broadcast
    const buffer = Buffer.from(`data: ${version}\n\n`);
    for (const [client] of this.clients.entries()) {
      try {
        const canWrite = client.write(buffer);
        // Handle client TCP buffer backpressure
        if (!canWrite && client.once) {
          client.once('drain', () => {});
        }
      } catch (_) {
        this.removeClient(client);
      }
    }
  }

  getClientCount() {
    return this.clients.size;
  }

  getClientDetails() {
    const list = [];
    const now = Date.now();
    for (const [, meta] of this.clients.entries()) {
      list.push({
        ip: meta.ip,
        connectedSeconds: Math.floor((now - meta.connectedAt) / 1000),
        userAgent: meta.userAgent
      });
    }
    return list;
  }

  closeAll() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    const shutdownBuffer = Buffer.from('event: shutdown\ndata: Server shutting down\n\n');
    for (const [client] of this.clients.entries()) {
      try {
        client.write(shutdownBuffer);
        client.end();
      } catch (_) {}
    }
    this.clients.clear();
  }
}

module.exports = new SseService();
