const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const setMarker = "PAGES.set=()=>";
const idx = html.lastIndexOf(setMarker);
console.log(html.substring(idx, idx + 1000));
