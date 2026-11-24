const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const matches = [];
let p = 0;
while ((p = html.indexOf('.ov-header', p)) !== -1) {
  matches.push(p);
  p += 1;
}
console.log('Matches for .ov-header:', matches);
matches.forEach(m => {
  console.log('--- Context around ' + m + ' ---');
  console.log(html.substring(m - 100, m + 400));
});
