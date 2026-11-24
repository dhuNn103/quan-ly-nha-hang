const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const start = 162000;
console.log(html.substring(start, start + 3000));
