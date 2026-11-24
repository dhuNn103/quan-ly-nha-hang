try {
  const pw = require('playwright');
  console.log('Playwright is installed!');
} catch (e) {
  console.log('Playwright not installed in root:', e.message);
}
