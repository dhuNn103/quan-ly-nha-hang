const fs = require('fs');
const modules = ['playwright', 'puppeteer', 'selenium-webdriver'];
modules.forEach(m => {
  try {
    require(m);
    console.log(m + ' is available');
  } catch(_) {
    console.log(m + ' NOT available');
  }
});
