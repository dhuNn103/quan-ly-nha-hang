const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const lines = html.split('\n');

const b1 = lines.slice(7510, 7735).join('\n');
const b2 = lines.slice(20043, 20268).join('\n');

console.log('Block 1 length:', b1.length, 'Block 2 length:', b2.length);
if (b1 === b2) {
  console.log('Block 1 and Block 2 are IDENTICAL!');
} else {
  console.log('Blocks differ!');
  const l1 = b1.split('\n');
  const l2 = b2.split('\n');
  for (let i = 0; i < Math.max(l1.length, l2.length); i++) {
    if (l1[i] !== l2[i]) {
      console.log(`Diff at ${i}:`);
      console.log('B1:', l1[i]);
      console.log('B2:', l2[i]);
      break;
    }
  }
}
