const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'public', 'index.html');
const content = fs.readFileSync(file, 'utf8');

const sIdx = content.indexOf('uikit-cat-chips-section');
console.log(content.slice(sIdx - 50, sIdx + 1200));
