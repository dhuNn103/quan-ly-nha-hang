const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const matches = [];
let p = 0;
while ((p = html.indexOf('uikit-grid-settings-tax', p)) !== -1) {
  matches.push(p);
  p += 1;
}
console.log('Matches for uikit-grid-settings-tax:', matches);
matches.forEach(m => {
  console.log(html.substring(m - 100, m + 400));
});
