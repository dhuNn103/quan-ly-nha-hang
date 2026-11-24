const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const start = 158000;
console.log(html.substring(start, start + 4000));
