const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const lines = html.split('\n');
lines.forEach((l, i) => {
  if (l.includes('#modal') && (l.includes('.style.') || l.includes('querySelector') || l.includes('getElementById') || l.includes('$('))) {
    console.log(`${i+1}: ${l.trim().slice(0, 150)}`);
  }
});
