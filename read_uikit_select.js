const fs = require('fs');
const lines = fs.readFileSync('public/index.html', 'utf8').split('\n');
console.log(lines.slice(9940, 9975).map((l, i) => (9941 + i) + ': ' + l).join('\n'));
