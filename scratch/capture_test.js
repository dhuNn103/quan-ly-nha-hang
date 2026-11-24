const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  let browser;
  try {
    // Check if puppeteer is installed or can be launched
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto('http://localhost:3000/#set', { waitUntil: 'networkidle0' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'scratch/desktop_set.png', fullPage: true });
    console.log('Desktop screenshot saved');
    await browser.close();
  } catch (e) {
    console.error('Puppeteer error:', e.message);
  }
})();
