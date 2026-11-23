const fs = require('fs');
const content = fs.readFileSync('C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/scratch/quan-ly-nha-hang/public/index.html', 'utf8');
const lines = content.split('\n');

console.log('--- FOCUS LISTENERS ---');
lines.forEach((l, idx) => {
  if (l.includes('onfocus') || l.includes('focus(') || l.includes('focusin') || l.includes("'focus'") || l.includes('"focus"')) {
    console.log('L' + (idx+1) + ': ' + l.trim().substring(0, 130));
  }
});

console.log('--- CLICK LISTENERS ---');
lines.forEach((l, idx) => {
  if (l.includes("addEventListener('click'") || l.includes('addEventListener("click"')) {
    console.log('L' + (idx+1) + ': ' + l.trim().substring(0, 130));
  }
});

console.log('--- MOUSEDOWN / POINTERDOWN LISTENERS ---');
lines.forEach((l, idx) => {
  if (l.includes('mousedown') || l.includes('pointerdown')) {
    console.log('L' + (idx+1) + ': ' + l.trim().substring(0, 130));
  }
});
