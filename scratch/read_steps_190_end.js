const fs = require('fs');
const transcriptPath = 'C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/brain/7ca38729-210b-4a58-943a-dcea42776072/.system_generated/logs/transcript.jsonl';
const content = fs.readFileSync(transcriptPath, 'utf8');
const lines = content.trim().split('\n');

for (let i = 190; i < lines.length; i++) {
  const obj = JSON.parse(lines[i]);
  console.log(`=== Line ${i} ===`);
  console.log('Action:', obj.tool_calls ? obj.tool_calls[0].name : obj.type);
  if (obj.tool_calls && obj.tool_calls[0].args) {
    console.log('Args:', JSON.stringify(obj.tool_calls[0].args).slice(0, 300));
  }
  if (obj.content) {
    console.log('Content:', obj.content.slice(0, 300));
  }
}
