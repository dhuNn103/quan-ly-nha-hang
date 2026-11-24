const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const lines = html.split('\n');
lines.forEach((line, i) => {
  if (line.includes('Mobile responsive') && line.includes('ov-kpi-grid')) {
    console.log(`Line ${i + 1}: ${line.trim()}`);
  }
  if (line.includes('@media(max-width: 540px)')) {
    console.log(`Line ${i + 1}: ${line.trim()}`);
  }
});
