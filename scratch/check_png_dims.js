const fs = require('fs');

function getPngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.toString('ascii', 1, 4) !== 'PNG') throw new Error('Not PNG');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

const dir = 'C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/brain/276e6b71-e58b-462e-a7ca-625030450842/evidence';
['step_199_shot_1.png', 'step_199_shot_2.png', 'step_199_shot_3.png', 'step_203.png'].forEach(f => {
  try {
    const p = dir + '/' + f;
    const dims = getPngDimensions(p);
    console.log(f, dims);
  } catch(e) {
    console.log(f, e.message);
  }
});
