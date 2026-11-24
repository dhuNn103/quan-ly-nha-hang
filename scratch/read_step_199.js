const fs = require('fs');
const transcriptPath = 'C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/brain/7ca38729-210b-4a58-943a-dcea42776072/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');

const step198 = JSON.parse(lines[198]);
console.log('Step 198 tool call args:', JSON.stringify(step198.tool_calls[0].args, null, 2));

const step199 = JSON.parse(lines[199]);
console.log('Step 199 content:', JSON.stringify(step199.content, null, 2));
