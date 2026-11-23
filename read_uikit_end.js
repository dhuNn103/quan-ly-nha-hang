const fs = require('fs');
const lines = fs.readFileSync('public/index.html', 'utf8').split('\n');
console.log(lines.slice(9968, 9982).map((l, i) => (9969 + i) + ': ' + l).join('\n'));
