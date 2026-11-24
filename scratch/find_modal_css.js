const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const regex = /([^{}]*#modal[^{}]*\{[^}]*\})/g;
let m;
while ((m = regex.exec(html)) !== null) {
  console.log('--- MATCH ---');
  console.log(m[1].trim());
}
