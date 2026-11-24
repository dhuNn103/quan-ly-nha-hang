const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const headStyleStart = html.indexOf('<style>\n:root');
const headStyleEnd = html.indexOf('</style>', headStyleStart);
const headStyle = html.substring(headStyleStart + 7, headStyleEnd);

let depth = 0;
let badLines = [];
headStyle.split('\n').forEach((l, i) => {
  for (let ch of l) {
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth < 0) badLines.push({ line: i + 1, content: l, depth });
    }
  }
});
console.log('Head <style> final depth:', depth, 'Bad lines count:', badLines.length);
if (badLines.length > 0) {
  console.log('First 5 bad lines:', badLines.slice(0, 5));
}
