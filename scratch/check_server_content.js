const http = require('http');

http.get('http://localhost:3000', res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Total length:', data.length);
    console.log('Contains ov-header-actions grid?:', data.includes('grid-template-columns: repeat(2, minmax(0, 1fr)) !important;'));
    const idx = data.indexOf('Overview Dashboard on Mobile');
    console.log('Overview Dashboard on Mobile idx:', idx);
    if (idx !== -1) {
      console.log(data.substring(idx, idx + 400));
    }
  });
}).on('error', err => {
  console.error(err);
});
