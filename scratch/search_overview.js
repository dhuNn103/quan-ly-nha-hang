const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

let p = 0;
while ((p = html.indexOf('overview', p)) !== -1) {
  console.log('overview at', p, ':', html.substring(Math.max(0, p - 40), Math.min(html.length, p + 100)));
  p += 8;
}
