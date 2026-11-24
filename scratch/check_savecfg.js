const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const sIdx = html.lastIndexOf('function saveCfg()');
console.log(html.substring(sIdx, sIdx + 1000));
