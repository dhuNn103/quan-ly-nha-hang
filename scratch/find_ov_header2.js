const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

let p = 0;
while ((p = html.indexOf('.ov-header {', p)) !== -1) {
  console.log('ov-header { at:', p);
  console.log(html.substring(p - 50, p + 400));
  p += 12;
}
