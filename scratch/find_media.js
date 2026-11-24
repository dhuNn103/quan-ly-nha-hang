const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

// Find all occurrences of #app, aside, main, .ov-
console.log('--- Search for #app, aside, main, .ov- in public/index.html ---');
const lines = html.split('\n');
lines.forEach((l, i) => {
  if (l.includes('.ov-container') || l.includes('ov-main-grid') || l.includes('ov-card-trend')) {
    console.log(`L${i+1}: ${l.trim().slice(0, 100)}`);
  }
});
