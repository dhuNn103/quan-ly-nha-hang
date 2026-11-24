const fs = require('fs');
const file = 'C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/brain/17b33c4e-2741-4300-b6fc-61e131670956/browser_sandbox/outputs/step_30.json';
const data = fs.readFileSync(file, 'utf8');
console.log(JSON.stringify(JSON.parse(data), null, 2));
