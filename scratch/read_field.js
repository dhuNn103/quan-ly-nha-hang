const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const fIdx = html.indexOf('field: ({');
console.log(html.substring(fIdx, fIdx + 1200));
