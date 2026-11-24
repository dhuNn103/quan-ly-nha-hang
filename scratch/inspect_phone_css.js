const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const p = 250950;
console.log(html.substring(p - 600, p + 1000));
