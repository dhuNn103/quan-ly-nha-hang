const zlib = require('zlib');

function canCompress(req, contentSize) {
  // Only compress if payload is greater than 1KB
  if (contentSize < 1024) return false;
  const accept = req.headers['accept-encoding'] || '';
  return accept.includes('br') || accept.includes('gzip') || accept.includes('deflate');
}

function sendCompressedJson(req, res, statusCode, obj) {
  const jsonStr = JSON.stringify(obj);
  const buffer = Buffer.from(jsonStr, 'utf8');
  const accept = req.headers['accept-encoding'] || '';

  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // 1. Brotli compression (highest priority, best compression ratio)
  if (buffer.length > 1024 && accept.includes('br') && typeof zlib.brotliCompress === 'function') {
    res.setHeader('Content-Encoding', 'br');
    res.setHeader('Vary', 'Accept-Encoding');
    res.writeHead(statusCode);
    zlib.brotliCompress(buffer, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 4, // Fast dynamic quality
        [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT
      }
    }, (err, compressed) => {
      if (err) {
        res.end(buffer);
      } else {
        res.end(compressed);
      }
    });
    return;
  }

  // 2. Gzip compression
  if (buffer.length > 1024 && accept.includes('gzip')) {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.writeHead(statusCode);
    zlib.gzip(buffer, { level: 6 }, (err, compressed) => {
      if (err) {
        res.end(buffer);
      } else {
        res.end(compressed);
      }
    });
    return;
  }

  // 3. Deflate compression
  if (buffer.length > 1024 && accept.includes('deflate')) {
    res.setHeader('Content-Encoding', 'deflate');
    res.setHeader('Vary', 'Accept-Encoding');
    res.writeHead(statusCode);
    zlib.deflate(buffer, { level: 6 }, (err, compressed) => {
      if (err) {
        res.end(buffer);
      } else {
        res.end(compressed);
      }
    });
    return;
  }

  // 4. Uncompressed fallback
  res.setHeader('Content-Length', buffer.length);
  res.writeHead(statusCode);
  res.end(buffer);
}

module.exports = {
  canCompress,
  sendCompressedJson
};
