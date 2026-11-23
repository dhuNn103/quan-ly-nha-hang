const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes("type: 'time'") || l.includes('type: "time"') || l.includes('type="time"') || l.includes("type='time'")) {
    console.log((i+1) + ': ' + l.trim().slice(0, 140));
  }
});
