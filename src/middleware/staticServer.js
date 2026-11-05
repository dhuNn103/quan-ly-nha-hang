const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const config = require('../config');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm'
};

const COMPRESSIBLE_EXTS = new Set(['.html', '.js', '.css', '.json', '.svg']);

// In-Memory Warm Cache for Static Assets (Zero Disk I/O & Pre-compressed Gzip)
const assetCache = new Map();

function getCachedAsset(fullPath, stat) {
  const cached = assetCache.get(fullPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached;
  }

  const rawBuffer = fs.readFileSync(fullPath);
  const ext = path.extname(fullPath).toLowerCase();
  const isCompressible = rawBuffer.length > 1024 && COMPRESSIBLE_EXTS.has(ext);

  let gzipBuffer = null;
  let deflateBuffer = null;

  if (isCompressible) {
    try {
      gzipBuffer = zlib.gzipSync(rawBuffer, { level: 6 });
      deflateBuffer = zlib.deflateSync(rawBuffer, { level: 6 });
    } catch (_) {}
  }

  const etag = `W/"${stat.size}-${stat.mtimeMs.toString(16)}"`;
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const entry = {
    mtimeMs: stat.mtimeMs,
    rawBuffer,
    gzipBuffer,
    deflateBuffer,
    etag,
    contentType,
    isHtml: ext === '.html'
  };

  // Only cache files smaller than 10MB in RAM
  if (rawBuffer.length <= 10 * 1024 * 1024) {
    assetCache.set(fullPath, entry);
  }

  return entry;
}

function serveStatic(req, res, pathname) {
  const reqPath = pathname === '/' ? 'index.html' : pathname;
  // Prevent null byte injections and normalize path
  const sanitizedPath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const fullPath = path.join(config.PUBLIC_DIR, sanitizedPath);

  // Security check: must reside inside PUBLIC_DIR
  if (!fullPath.startsWith(config.PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }

  // Check if file exists
  if (!fs.existsSync(fullPath)) {
    return false; // Not a static file, let router handle 404
  }

  let stat;
  try {
    stat = fs.statSync(fullPath);
  } catch (_) {
    return false;
  }

  if (stat.isDirectory()) {
    // If directory, check for index.html inside
    const indexPath = path.join(fullPath, 'index.html');
    if (fs.existsSync(indexPath) && !fs.statSync(indexPath).isDirectory()) {
      return serveStatic(req, res, path.join(pathname, 'index.html'));
    }
    return false;
  }

  const asset = getCachedAsset(fullPath, stat);

  // HTTP ETag for caching
  if (req.headers['if-none-match'] === asset.etag) {
    res.writeHead(304);
    res.end();
    return true;
  }

  const cacheControl = asset.isHtml
    ? 'no-cache, must-revalidate'
    : 'public, max-age=86400, immutable';

  const accept = req.headers['accept-encoding'] || '';

  res.setHeader('Content-Type', asset.contentType);
  res.setHeader('ETag', asset.etag);
  res.setHeader('Cache-Control', cacheControl);

  // Serve pre-compressed buffer directly from RAM
  if (asset.gzipBuffer && accept.includes('gzip')) {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Content-Length', asset.gzipBuffer.length);
    res.writeHead(200);
    res.end(asset.gzipBuffer);
  } else if (asset.deflateBuffer && accept.includes('deflate')) {
    res.setHeader('Content-Encoding', 'deflate');
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Content-Length', asset.deflateBuffer.length);
    res.writeHead(200);
    res.end(asset.deflateBuffer);
  } else {
    res.setHeader('Content-Length', asset.rawBuffer.length);
    res.writeHead(200);
    res.end(asset.rawBuffer);
  }

  return true;
}

module.exports = serveStatic;
