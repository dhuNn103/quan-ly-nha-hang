const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const m = 1039766;
console.log(html.substring(m - 50, m + 2200));
