const zlib = require('zlib');

function canCompress(req, contentSize) {
  // Only compress if payload is greater than 1KB
  if (contentSize < 1024) return false;
  const accept = req.headers['accept-encoding'] || '';
  return accept.includes('gzip') || accept.includes('deflate');
}

function sendCompressedJson(req, res, statusCode, obj) {
  const jsonStr = JSON.stringify(obj);
  const buffer = Buffer.from(jsonStr, 'utf8');
  const accept = req.headers['accept-encoding'] || '';

  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (buffer.length > 1024 && accept.includes('gzip')) {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.writeHead(statusCode);
    zlib.gzip(buffer, (err, compressed) => {
      if (err) {
        res.end(buffer);
      } else {
        res.end(compressed);
      }
    });
  } else if (buffer.length > 1024 && accept.includes('deflate')) {
    res.setHeader('Content-Encoding', 'deflate');
    res.setHeader('Vary', 'Accept-Encoding');
    res.writeHead(statusCode);
    zlib.deflate(buffer, (err, compressed) => {
      if (err) {
        res.end(buffer);
      } else {
        res.end(compressed);
      }
    });
  } else {
    res.setHeader('Content-Length', buffer.length);
    res.writeHead(statusCode);
    res.end(buffer);
  }
}

module.exports = {
  canCompress,
  sendCompressedJson
};
