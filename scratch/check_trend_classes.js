const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const matches = [];
let p = 0;
while ((p = html.indexOf('.ov-trend-', p)) !== -1) {
  matches.push(p);
  p += 1;
}
console.log('Matches for .ov-trend-:', matches);
matches.slice(0, 10).forEach(m => {
  console.log('--- Context around ' + m + ' ---');
  console.log(html.substring(m - 20, m + 250));
});
