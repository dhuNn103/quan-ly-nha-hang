const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const m = 1041671;
console.log(html.substring(m - 800, m + 400));
