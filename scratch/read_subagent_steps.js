const fs = require('fs');
const lines = fs.readFileSync('C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/brain/74f4c78a-55af-4fb2-8dfa-de70370f248b/.system_generated/logs/transcript.jsonl', 'utf8').split('\n');

lines.forEach((l, i) => {
  if (!l.trim()) return;
  const j = JSON.parse(l);
  if (j.tool_calls) {
    console.log(`Step ${j.step_index}:`, JSON.stringify(j.tool_calls, null, 2));
  }
  if (j.content && typeof j.content === 'string' && j.content.includes('getBoundingClientRect')) {
    console.log(`Content ${j.step_index}:`, j.content);
  }
});
