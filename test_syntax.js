const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('public/index.html', 'utf8');
const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi) || [];

console.log('Found script tags:', scriptMatches.length);
let hasError = false;

scriptMatches.forEach((scriptTag, idx) => {
  const content = scriptTag.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
  if (!content.trim()) return;
  try {
    new vm.Script(content, { filename: `inline-script-${idx}.js` });
    console.log(`Script ${idx}: Syntax OK (${content.length} chars)`);
  } catch (err) {
    hasError = true;
    console.error(`Script ${idx} Syntax ERROR:`, err.message);
  }
});

if (!hasError) {
  console.log('ALL SCRIPTS SYNTAX CHECK PASSED!');
} else {
  process.exit(1);
}
