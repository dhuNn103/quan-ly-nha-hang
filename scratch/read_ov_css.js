const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const start = html.indexOf('.ov-container');
const end = html.indexOf('PAGES.overview = () => {');
console.log(html.substring(start, end));
