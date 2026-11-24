const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

// Check the style tag injected at 19110
const start = html.indexOf("document.head.insertAdjacentHTML('beforeend', `<style>\n.ov-container");
const end = html.indexOf("PAGES.overview =", start);
const styleContent = html.substring(start, end);

// Let's check if there are any syntax errors in this CSS string!
// E.g., unclosed braces or invalid CSS
let depth = 0;
let errors = [];
const lines = styleContent.split('\n');
lines.forEach((line, idx) => {
  for (let ch of line) {
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth < 0) errors.push(`Extra } at line ${idx+1}: ${line}`);
    }
  }
});
console.log('CSS block lines:', lines.length, 'Final depth:', depth);
if (errors.length) console.log('Errors:', errors);

// Also check the static style in head between line 7200 and 7800
const headLines = html.split('\n').slice(7200, 7750);
let headDepth = 0;
headLines.forEach((line, idx) => {
  for (let ch of line) {
    if (ch === '{') headDepth++;
    if (ch === '}') headDepth--;
  }
});
console.log('Head slice depth:', headDepth);
