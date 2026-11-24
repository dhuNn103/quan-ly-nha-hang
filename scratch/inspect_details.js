const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

console.log('=== 1. Check UiKit.time24h definition ===');
const t24Idx = html.indexOf('time24h:');
if (t24Idx !== -1) {
  console.log(html.substring(t24Idx, t24Idx + 800));
} else {
  console.log('time24h not found in UiKit!');
}

console.log('=== 2. Check "Cảnh báo đơn chậm" vs "Đơn chậm" ===');
let p = 0;
while ((p = html.indexOf('Cảnh báo đơn chậm', p)) !== -1) {
  console.log('Found "Cảnh báo đơn chậm" at', p, ':', html.substring(p - 50, p + 80));
  p += 1;
}

let p2 = 0;
while ((p2 = html.indexOf('Đơn chậm', p2)) !== -1) {
  console.log('Found "Đơn chậm" at', p2, ':', html.substring(p2 - 50, p2 + 80));
  p2 += 1;
}

console.log('=== 3. Check layout structure of PAGES.set ===');
const setStart = html.indexOf('PAGES.set=');
const setEnd = html.indexOf('/* ===== Bổ sung:', setStart);
console.log('PAGES.set length:', setEnd - setStart);

const set2Start = html.indexOf("PAGES.set = () => {");
if (set2Start !== -1) {
  const set2End = html.indexOf("PAGES.", set2Start + 10);
  console.log('Found 2nd PAGES.set at', set2Start, 'to', set2End);
  console.log(html.substring(set2Start, set2Start + 1500));
}
