const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const lines = html.split('\n');
lines.forEach((line, i) => {
  if (line.includes('.ov-header {') && i > 15000) {
    console.log(`Line ${i + 1}: ${line.trim()}`);
  }
});
