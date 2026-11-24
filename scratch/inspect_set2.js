const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const matches = [];
let pos = 0;
while ((pos = html.indexOf('Thông tin nhà hàng & Thiết lập hệ thống', pos)) !== -1) {
  matches.push(pos);
  pos += 1;
}
console.log('Matches for Thông tin nhà hàng:', matches);
matches.forEach(m => {
  console.log('--- Context around ' + m + ' ---');
  console.log(html.substring(Math.max(0, m - 200), Math.min(html.length, m + 800)));
});
