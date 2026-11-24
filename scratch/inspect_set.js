const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const setIdx = html.indexOf('PAGES.set');
console.log('setIdx:', setIdx);
if (setIdx !== -1) {
  console.log(html.substring(setIdx, setIdx + 3000));
}
