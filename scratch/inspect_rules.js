const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

// Check line 7511-7735
const lines = html.split('\n');
console.log('--- Lines 7511 to 7550 ---');
for (let i = 7510; i < 7550; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
console.log('--- Lines 20044 to 20085 ---');
for (let i = 20043; i < 20085; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
