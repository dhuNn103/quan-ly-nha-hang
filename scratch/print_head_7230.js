const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const lines = html.split('\n');

console.log('=== CSS IN HEAD (7230-7275) ===');
for (let i = 7229; i < 7275; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
