const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const matches = [];
let p = 0;
while ((p = html.indexOf('Xu hướng doanh thu 7 ngày', p)) !== -1) {
  matches.push(p);
  p += 1;
}
console.log('Matches for Xu hướng doanh thu 7 ngày:', matches);
matches.forEach(m => {
  console.log('--- Context around ' + m + ' ---');
  console.log(html.substring(Math.max(0, m - 100), Math.min(html.length, m + 1500)));
});
