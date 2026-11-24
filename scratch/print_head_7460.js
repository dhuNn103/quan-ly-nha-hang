const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const lines = html.split('\n');

console.log('=== CSS IN HEAD (7460-7510) ===');
for (let i = 7459; i < 7510; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
