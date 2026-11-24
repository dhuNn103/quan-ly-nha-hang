const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const lines = html.split('\n');
lines.forEach((line, i) => {
  if (line.includes('uikit-grid-settings-tax')) {
    console.log(`Line ${i + 1}: ${line.trim()}`);
  }
});
