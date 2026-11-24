const fs = require('fs');
const transcriptPath = 'C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/brain/17b33c4e-2741-4300-b6fc-61e131670956/.system_generated/logs/transcript.jsonl';
if (fs.existsSync(transcriptPath)) {
  const content = fs.readFileSync(transcriptPath, 'utf8');
  const lines = content.trim().split('\n');
  console.log('Total transcript lines:', lines.length);
  // print last 5 lines
  lines.slice(-5).forEach(l => {
    try {
      const obj = JSON.parse(l);
      console.log('Type:', obj.type, 'Content:', (obj.content || '').slice(0, 300));
    } catch(e) {}
  });
} else {
  console.log('Transcript not found');
}
