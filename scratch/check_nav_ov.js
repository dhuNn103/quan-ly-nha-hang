const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

['NAV.ov', 'NAV.overview', 'PAGES.ov', 'PAGES.overview'].forEach(k => {
  const idx = html.indexOf(k);
  console.log(k, 'idx:', idx);
  if (idx !== -1) {
    console.log(html.substring(idx - 50, idx + 200));
  }
});
