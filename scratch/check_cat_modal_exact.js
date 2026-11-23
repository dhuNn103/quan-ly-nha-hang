const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'public', 'index.html');
const content = fs.readFileSync(file, 'utf8');

const sIdx = content.indexOf('function openNewCategoryModal()');
console.log('--- openNewCategoryModal JS ---');
console.log(content.slice(sIdx, sIdx + 1800));

const cIdx = content.indexOf('.uikit-btn-modal-cancel {');
console.log('--- .uikit-btn-modal-cancel CSS ---');
console.log(content.slice(cIdx - 100, cIdx + 400));
