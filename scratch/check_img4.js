const fs = require('fs');
const p = 'C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/brain/276e6b71-e58b-462e-a7ca-625030450842/.user_uploaded/media_1795447197131_c9e97a24.png';
const stats = fs.statSync(p);
console.log('Size:', stats.size);
