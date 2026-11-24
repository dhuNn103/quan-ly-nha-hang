const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const m = html.indexOf('.ov-header {');
console.log('ov-header { at:', m);
console.log(html.substring(m - 50, m + 600));

const ma = html.indexOf('.ov-header-actions {');
console.log('ov-header-actions { at:', ma);
console.log(html.substring(ma - 50, ma + 600));
