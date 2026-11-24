const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const m = 1041671;
const start = html.lastIndexOf('<style>', m);
const scriptStart = html.lastIndexOf('<script', m);
console.log('style start at:', start);
console.log('script start at:', scriptStart);
console.log(html.substring(Math.max(0, start - 200), start + 200));
