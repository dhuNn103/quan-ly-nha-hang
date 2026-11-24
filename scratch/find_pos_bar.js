const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const matches = [];
let p = 0;
while ((p = html.indexOf('Mở Bàn & POS', p)) !== -1) {
  matches.push(p);
  p += 1;
}
console.log('Matches for Mở Bàn & POS:', matches);
matches.forEach(m => {
  console.log('--- Context around ' + m + ' ---');
  console.log(html.substring(Math.max(0, m - 300), Math.min(html.length, m + 500)));
});
