const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const start = html.indexOf('.ov-trend-card');
console.log(html.substring(start, start + 3000));
