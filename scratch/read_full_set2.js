const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const idx = html.lastIndexOf('PAGES.set');
console.log(html.substring(idx + 3500, idx + 8000));
