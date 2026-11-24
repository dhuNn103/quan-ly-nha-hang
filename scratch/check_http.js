const http = require('http');
http.get('http://localhost:3000', res => {
  console.log('HTTP Status:', res.statusCode);
  process.exit(0);
}).on('error', err => {
  console.error('HTTP Error:', err.message);
  process.exit(1);
});
