const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

// Find the UI Kit PAGES.set definition
const marker = 'PAGES.set';
let idx = html.lastIndexOf(marker);
console.log('Last index of PAGES.set:', idx);

// Find where this function ends (look for next PAGES. or function or return)
console.log(html.substring(idx - 100, idx + 4000));
