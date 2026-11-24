const fs = require('fs');
const path = require('path');

const srcDir = 'C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/brain/7ca38729-210b-4a58-943a-dcea42776072/browser_sandbox/screenshots';
const destDir = 'C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/brain/276e6b71-e58b-462e-a7ca-625030450842/evidence';

if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

if (fs.existsSync(srcDir)) {
  fs.readdirSync(srcDir).forEach(f => {
    fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f));
    console.log('Copied:', f);
  });
} else {
  console.log('Source dir does not exist');
}
