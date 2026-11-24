const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const start = 1039490;
const end = 1055703;
console.log('Total length of style block:', end - start);
const content = html.substring(start, end);

// Let's check if there are syntax errors in this CSS block (unclosed braces, etc.)
let openBraces = 0;
let lastUnclosed = 0;
for (let i = 0; i < content.length; i++) {
  if (content[i] === '{') openBraces++;
  if (content[i] === '}') {
    openBraces--;
    if (openBraces < 0) console.log('Extra closing brace at', i);
  }
}
console.log('Final open braces:', openBraces);
