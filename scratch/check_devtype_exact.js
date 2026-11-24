const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const idx = html.indexOf('function devType()');
console.log(html.substring(idx - 30, idx + 350));
