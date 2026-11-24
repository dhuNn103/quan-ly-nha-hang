const fs = require('fs');
const dir = 'C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/brain/17b33c4e-2741-4300-b6fc-61e131670956/browser_sandbox/outputs';
if (fs.existsSync(dir)) {
  fs.readdirSync(dir).forEach(f => {
    if (f.endsWith('.json')) {
      const data = fs.readFileSync(dir + '/' + f, 'utf8');
      console.log('--- ' + f + ' ---');
      console.log(data.slice(0, 400));
    }
  });
}
