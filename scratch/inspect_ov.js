const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const p = 1057830;
console.log(html.substring(p - 1500, p + 1500));
