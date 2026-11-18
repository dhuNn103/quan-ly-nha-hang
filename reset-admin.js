#!/usr/bin/env node

/**
 * Công cụ khôi phục / đặt lại mật khẩu cho tài khoản Admin
 * Cách dùng:
 *   node reset-admin.js                 -> Xem mật khẩu Admin hiện tại hoặc hướng dẫn
 *   node reset-admin.js MatKhauMoi@123  -> Đặt lại mật khẩu mới cho Admin
 */

const fs = require('fs');
const path = require('path');
const config = require('./src/config');

const dataFile = config.DATA_FILE;
const newPassword = process.argv[2];

console.log('========================================================');
console.log('🔑 CÔNG CỤ KHÔI PHỤC MẬT KHẨU ADMIN (QUẢN TRỊ VIÊN)');
console.log('========================================================\n');

if (!fs.existsSync(dataFile)) {
  console.log('⚠️ Tệp dữ liệu data.json chưa được tạo.');
  console.log('Hệ thống đang sử dụng cấu hình mặc định ban đầu:');
  console.log('👉 Tên đăng nhập: admin');
  console.log(`👉 Mật khẩu mặc định: ${config.ADMIN_PASSWORD || 'Admin@123'}\n`);
  process.exit(0);
}

let dbData;
try {
  const content = fs.readFileSync(dataFile, 'utf8');
  dbData = JSON.parse(content);
} catch (err) {
  console.error('❌ Lỗi khi đọc tệp data.json:', err.message);
  process.exit(1);
}

if (!dbData.state || !Array.isArray(dbData.state.users)) {
  console.error('❌ Cấu trúc dữ liệu không hợp lệ (không tìm thấy danh sách users).');
  process.exit(1);
}

const adminUser = dbData.state.users.find(u => u.u === 'admin' || u.role === 'admin');
if (!adminUser) {
  console.error('❌ Không tìm thấy tài khoản admin trong hệ thống.');
  process.exit(1);
}

if (!newPassword) {
  console.log('ℹ️ THÔNG TIN TÀI KHOẢN ADMIN HIỆN TẠI:');
  console.log(`- Tên hiển thị  : ${adminUser.name}`);
  console.log(`- Tên đăng nhập : ${adminUser.u}`);
  console.log(`- Mật khẩu      : ${adminUser.p}`);
  console.log(`- Trạng thái    : ${adminUser.st === 'active' ? 'Đang hoạt động' : adminUser.st}\n`);
  console.log('--------------------------------------------------------');
  console.log('💡 Để đổi mật khẩu sang một mật khẩu mới, hãy chạy lệnh:');
  console.log('   node reset-admin.js <MatKhauMoi>');
  console.log('Ví dụ:');
  console.log('   node reset-admin.js Admin@123\n');
  process.exit(0);
}

// Update password
adminUser.p = String(newPassword);
adminUser.st = 'active'; // Ensure active
dbData.v = (Number(dbData.v) || 0) + 1;

try {
  const tmpFile = dataFile + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(dbData, null, 2), 'utf8');
  fs.renameSync(tmpFile, dataFile);

  console.log('✅ ĐÃ ĐẶT LẠI MẬT KHẨU ADMIN THÀNH CÔNG!');
  console.log(`👉 Tên đăng nhập : ${adminUser.u}`);
  console.log(`👉 Mật khẩu mới  : ${adminUser.p}`);
  console.log('\nBạn có thể khởi động lại máy chủ và đăng nhập ngay bây giờ.');
} catch (err) {
  console.error('❌ Lỗi khi lưu mật khẩu mới:', err.message);
  process.exit(1);
}
