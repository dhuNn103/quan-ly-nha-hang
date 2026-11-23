const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'public', 'index.html');
const content = fs.readFileSync(file, 'utf8');

const footerIdx = content.indexOf('uikit-cat-modal-footer');
console.log('--- uikit-cat-modal-footer HTML ---');
console.log(content.slice(footerIdx - 50, footerIdx + 600));

const cssIdx = content.indexOf('.uikit-cat-modal-footer');
console.log('--- uikit-cat-modal-footer CSS ---');
console.log(content.slice(cssIdx - 50, cssIdx + 800));
