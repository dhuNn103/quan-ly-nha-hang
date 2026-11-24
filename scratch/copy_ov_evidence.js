const fs = require('fs');
const path = require('path');

const srcDir = 'C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/brain/3da6ae17-e293-4e17-b477-fa73f4023c6c/browser_sandbox/screenshots';
const destDir = 'C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/brain/276e6b71-e58b-462e-a7ca-625030450842/evidence';

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

if (fs.existsSync(srcDir)) {
  const files = fs.readdirSync(srcDir);
  files.forEach(f => {
    fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f));
    console.log('Copied:', f);
  });
}
