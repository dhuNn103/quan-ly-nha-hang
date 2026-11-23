const fs = require('fs');
const lines = fs.readFileSync('public/index.html', 'utf8').split('\n');
console.log('--- Line 17420 to 17430 ---');
console.log(lines.slice(17420, 17430).map((l, i) => (17421 + i) + ': ' + l).join('\n'));
console.log('--- Line 17590 to 17600 ---');
console.log(lines.slice(17590, 17600).map((l, i) => (17591 + i) + ': ' + l).join('\n'));
