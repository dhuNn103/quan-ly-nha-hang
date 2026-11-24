const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const matches = [];
let p = 0;
while ((p = html.indexOf('body.col aside', p)) !== -1) {
  matches.push(p);
  p += 1;
}
console.log('Matches for body.col aside:', matches);
matches.forEach(m => {
  console.log(html.substring(m - 40, m + 200));
});
