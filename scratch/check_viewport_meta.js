const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const idx = html.indexOf('<meta name="viewport"');
console.log('viewport meta:', html.substring(idx, idx + 200));
