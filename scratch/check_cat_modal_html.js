const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'public', 'index.html');
const content = fs.readFileSync(file, 'utf8');

const modalIdx = content.indexOf('uikit-cat-modal-dialog');
console.log('--- uikit-cat-modal-dialog HTML ---');
console.log(content.slice(modalIdx - 100, modalIdx + 1800));
