const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'public', 'index.html');
const content = fs.readFileSync(file, 'utf8');

const regex = /(\.uikit-btn-modal|\.uikit-cat-modal|button\s*\{|\.mx|button\.x)[\s\S]*?\{[^}]*\}/g;
let m;
while ((m = regex.exec(content)) !== null) {
  console.log(m[0]);
  console.log('---');
}
