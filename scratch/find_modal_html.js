const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const lines = html.split('\n');
lines.forEach((l, i) => {
  if (l.includes('id="modal"') || l.includes('id=modal') || l.includes('id="dlg"') || l.includes('id=dlg')) {
    console.log(`${i+1}: ${l.trim().slice(0, 150)}`);
  }
});
