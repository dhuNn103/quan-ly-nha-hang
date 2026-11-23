const fs = require('fs');
const content = fs.readFileSync('C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/scratch/quan-ly-nha-hang/public/index.html', 'utf8');
const lines = content.split('\n');

lines.forEach((l, idx) => {
  if (l.includes('addEventListener')) {
    console.log(`L${idx+1}: ${l.trim()}`);
  }
});
