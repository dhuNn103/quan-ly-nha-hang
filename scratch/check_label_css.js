const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const matches = [];
let p = 0;
while ((p = html.indexOf('.uikit-label {', p)) !== -1) {
  matches.push(p);
  p += 1;
}
console.log('Matches for .uikit-label {:', matches);
matches.forEach(m => {
  console.log(html.substring(m - 30, m + 250));
});
