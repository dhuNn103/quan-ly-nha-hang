const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const p = 1050032;
console.log(html.substring(p - 300, p + 400));
