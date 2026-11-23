const fs = require('fs');
const file = 'C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/scratch/quan-ly-nha-hang/public/index.html';
let content = fs.readFileSync(file, 'utf8');

// 1. Update lines 5529-5542
const oldBlock1 = `.hp-res-input-wrap input, .hp-res-input-wrap select {
  width: 100%; height: 40px; border-radius: 8px;
  border: 1px solid transparent; background: #ffffff;
  color: #231d17; font-size: 13px; font-weight: 500;
  padding: 0 28px 0 34px; box-sizing: border-box; outline: none;
  font-family: inherit; appearance: none; -webkit-appearance: none;
  transition: all .2s;
}
.hp-res-input-wrap input::placeholder {
  color: #231d17; opacity: 0.9; font-weight: 500;
}`;

const newBlock1 = `.hp-res-input-wrap input, .hp-res-input-wrap select {
  width: 100%; height: 42px; border-radius: 8px;
  border: 1px solid transparent; background: #ffffff;
  color: #231d17; font-size: 16px; font-weight: 500;
  padding: 0 28px 0 36px; box-sizing: border-box; outline: none;
  font-family: inherit; appearance: none; -webkit-appearance: none;
  transition: all .2s;
}
.hp-res-input-wrap input::placeholder {
  color: #231d17; opacity: 0.9; font-weight: 500; font-size: 16px;
}
#hp-bk-date,
#hp-bk-name,
#hp-bk-phone {
  font-size: 16px !important;
}
#hp-bk-date::placeholder,
#hp-bk-name::placeholder,
#hp-bk-phone::placeholder {
  font-size: 16px !important;
}`;

if (!content.includes(oldBlock1)) {
  throw new Error('oldBlock1 not found!');
}
content = content.replace(oldBlock1, newBlock1);

// 2. Update lines 5906-5917
const oldBlock2 = `.hp-res-input-wrap input,
.hp-res-input-wrap select {
  font-size: 13px;
  padding: 0 22px 0 32px;
  min-width: 0;
  text-overflow: ellipsis;
}
.hp-res-input-wrap input::placeholder {
  font-size: 12.5px;
  color: #554838;
}`;

const newBlock2 = `.hp-res-input-wrap input,
.hp-res-input-wrap select {
  font-size: 16px;
  padding: 0 24px 0 36px;
  min-width: 0;
  text-overflow: ellipsis;
}
.hp-res-input-wrap input::placeholder {
  font-size: 16px;
  color: #554838;
}`;

if (!content.includes(oldBlock2)) {
  throw new Error('oldBlock2 not found!');
}
content = content.replace(oldBlock2, newBlock2);

// 3. Update mobile media query line 6546
const oldMobile = `.hp-res-input-wrap input, .hp-res-input-wrap select { height: 42px; font-size: 13.5px; }`;
const newMobile = `.hp-res-input-wrap input, .hp-res-input-wrap select { height: 44px; font-size: 16px; }`;

if (!content.includes(oldMobile)) {
  throw new Error('oldMobile not found!');
}
content = content.replace(oldMobile, newMobile);

fs.writeFileSync(file, content, 'utf8');
console.log('SUCCESS: Booking form fontsize updated to 16px!');
