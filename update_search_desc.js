const fs = require('fs');
const file = 'C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/scratch/quan-ly-nha-hang/public/index.html';
let content = fs.readFileSync(file, 'utf8');

// 1. Update VI translation
const oldVi = `searchEmptyDesc: 'Gõ tên trang, tên dự án, tên phần mềm hay một từ khoá kỹ thuật. Không cần bỏ dấu. Đặt cụm trong ngoặc kép ("lò đốt") để tìm đúng cụm ấy.',`;
const newVi = `searchEmptyDesc: 'Gõ tên món ăn, mục thực đơn, không gian, thông tin đặt bàn hoặc liên hệ',`;

if (!content.includes(oldVi)) {
  throw new Error('oldVi not found!');
}
content = content.replace(oldVi, newVi);

// 2. Update EN translation
const oldEn = `searchEmptyDesc: 'Type page names, projects, software or technical keywords. Diacritics not required. Use quotes ("combustion chamber") for exact matching.',`;
const newEn = `searchEmptyDesc: 'Type dish names, menu sections, space, reservation info or contact',`;

if (!content.includes(oldEn)) {
  throw new Error('oldEn not found!');
}
content = content.replace(oldEn, newEn);

// 3. Update fallback in hpRenderSearchResults
const oldFallback = `<div class="hp-spotlight-empty-desc">\${hpT('searchEmptyDesc', 'Gõ tên trang, tên dự án, tên phần mềm hay một từ khoá kỹ thuật. Không cần bỏ dấu. Đặt cụm trong ngoặc kép ("lò đốt") để tìm đúng cụm ấy.')}</div>`;
const newFallback = `<div class="hp-spotlight-empty-desc">\${hpT('searchEmptyDesc', 'Gõ tên món ăn, mục thực đơn, không gian, thông tin đặt bàn hoặc liên hệ')}</div>`;

if (!content.includes(oldFallback)) {
  throw new Error('oldFallback not found!');
}
content = content.replace(oldFallback, newFallback);

// 4. Update sitePages descriptions to match the guide keywords
content = content.replace(
  `{ type: 'page', id: 'menu', nameVi: 'Thực đơn', nameEn: 'Full Menu', descVi: 'Toàn bộ thực đơn món ăn, đồ uống đặc sắc', descEn: 'Browse all dishes and specialty drinks', icon: 'fa-utensils', action: () => hpNavToFullMenu('all') },`,
  `{ type: 'page', id: 'menu', nameVi: 'Thực đơn', nameEn: 'Full Menu', descVi: 'Toàn bộ mục thực đơn món ăn, đồ uống đặc sắc', descEn: 'Browse all menu sections and specialty drinks', icon: 'fa-utensils', action: () => hpNavToFullMenu('all') },`
);

content = content.replace(
  `{ type: 'page', id: 'booking', nameVi: 'Đặt bàn ngay', nameEn: 'Reservation', descVi: 'Đặt bàn trước tiện lợi, chọn số lượng khách', descEn: 'Reserve table online, select party size', icon: 'fa-calendar-check', action: () => hpNavTo('booking') },`,
  `{ type: 'page', id: 'booking', nameVi: 'Đặt bàn ngay', nameEn: 'Reservation', descVi: 'Thông tin đặt bàn trước tiện lợi, chọn số lượng khách', descEn: 'Reservation information, table bookings and party size', icon: 'fa-calendar-check', action: () => hpNavTo('booking') },`
);

content = content.replace(
  `{ type: 'page', id: 'contact', nameVi: 'Liên hệ', nameEn: 'Contact & Location', descVi: 'Hotline, địa chỉ nhà hàng và bản đồ', descEn: 'Hotline, restaurant address and directions', icon: 'fa-location-dot', action: () => hpNavTo('contact') },`,
  `{ type: 'page', id: 'contact', nameVi: 'Liên hệ', nameEn: 'Contact & Location', descVi: 'Thông tin liên hệ, hotline, địa chỉ nhà hàng và bản đồ', descEn: 'Contact info, hotline, restaurant address and directions', icon: 'fa-location-dot', action: () => hpNavTo('contact') },`
);

fs.writeFileSync(file, content, 'utf8');
console.log('SUCCESS: searchEmptyDesc updated to user request!');
