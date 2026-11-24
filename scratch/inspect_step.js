const fs = require('fs');
const transcriptPath = 'C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/brain/17b33c4e-2741-4300-b6fc-61e131670956/.system_generated/logs/transcript.jsonl';
const content = fs.readFileSync(transcriptPath, 'utf8');
const lines = content.trim().split('\n');
lines.forEach((l, i) => {
  if (l.includes('"scrollWidth"') || l.includes('766.4') || l.includes('746.4')) {
    const obj = JSON.parse(l);
    console.log(`--- Step line ${i} ---`);
    console.log((obj.thinking || '').slice(0, 200));
    console.log(JSON.stringify(obj.tool_calls || obj.content, null, 2).slice(0, 500));
  }
});
