const fs = require('fs');
const readline = require('readline');

const fileStream = fs.createReadStream('C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/brain/74f4c78a-55af-4fb2-8dfa-de70370f248b/.system_generated/logs/transcript.jsonl');

const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  try {
    const json = JSON.parse(line);
    if (json.type === 'PLANNER_RESPONSE') {
      console.log('--- Step', json.step_index, '---');
      if (json.tool_calls) {
        json.tool_calls.forEach(tc => {
          console.log('Tool call:', tc.name, JSON.stringify(tc.arguments));
        });
      }
    }
  } catch (e) {}
});
