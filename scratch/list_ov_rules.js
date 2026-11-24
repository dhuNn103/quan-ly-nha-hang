const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

// Let's inspect all CSS rules for .ov-trend, .ov-space, .ov-card, .ov-header
const lines = html.split('\n');
const ovRules = [];
let capture = false;
let cur = [];
lines.forEach((l, i) => {
  if (l.includes('.ov-') && l.includes('{')) {
    ovRules.push(`${i+1}: ${l.trim()}`);
  }
});

console.log('Total .ov- rules found:', ovRules.length);
ovRules.forEach(r => console.log(r));
