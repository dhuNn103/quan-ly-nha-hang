const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes("id: 'adb-time'") || l.includes("id: 'edb-time'")) {
    console.log((i+1) + ': ' + l.trim());
  }
});
