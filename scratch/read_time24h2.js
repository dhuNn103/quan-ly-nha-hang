const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const t24Idx = html.indexOf('time24h:');
console.log(html.substring(t24Idx + 1800, t24Idx + 2800));
