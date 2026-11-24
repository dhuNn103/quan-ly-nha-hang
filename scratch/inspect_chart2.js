const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const m = 1068684;
console.log(html.substring(m + 1200, m + 3500));
