const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const matches = [];
let p = 0;
while ((p = html.indexOf('@media (max-width: 768px)', p)) !== -1) {
  matches.push(p);
  p += 1;
}
console.log('Matches for @media (max-width: 768px):', matches);
matches.forEach(m => {
  console.log('--- Context around ' + m + ' ---');
  console.log(html.substring(m, m + 400));
});
