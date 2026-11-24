const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const lines = html.split('\n');
lines.forEach((l, i) => {
  if (l.includes('function devType()')) {
    console.log('Line for devType:', i + 1, l.trim());
  }
});
