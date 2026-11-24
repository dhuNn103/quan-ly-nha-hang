const fs = require('fs');
const dir = 'C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/brain/276e6b71-e58b-462e-a7ca-625030450842/evidence';
if (fs.existsSync(dir)) {
  const files = fs.readdirSync(dir);
  console.log('Evidence files:', files);
}
