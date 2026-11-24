const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const lines = html.split('\n');

// Let's print lines 7511 to 7735 with line numbers
console.log('=== CSS IN HEAD (7511-7735) ===');
for (let i = 7510; i < 7735; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
