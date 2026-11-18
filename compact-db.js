#!/usr/bin/env node

/**
 * Công cụ tối ưu & dọn dẹp cơ sở dữ liệu data.json
 * Cách dùng:
 *   node compact-db.js        -> Dọn dẹp dữ liệu (giữ lại 30 ngày gần nhất)
 *   node compact-db.js 60     -> Dọn dẹp dữ liệu (giữ lại 60 ngày gần nhất)
 */

const db = require('./src/db/database');
const fs = require('fs');
const config = require('./src/config');

const daysToKeep = parseInt(process.argv[2], 10) || 30;

console.log('========================================================');
console.log('🧹 CÔNG CỤ TỐI ƯU & NÉN CƠ SỞ DỮ LIỆU DATA.JSON');
console.log('========================================================\n');

async function run() {
  let oldSize = 0;
  try {
    oldSize = fs.statSync(config.DATA_FILE).size;
  } catch (_) {}

  console.log(`- Tệp dữ liệu hiện tại : ${config.DATA_FILE} (${Math.round(oldSize / 1024)} KB)`);
  console.log(`- Thời gian lưu trữ    : Giữ lại đơn thanh toán trong ${daysToKeep} ngày gần nhất`);
  console.log(`- Đang xử lý...\n`);

  const result = await db.compact(daysToKeep);

  if (!result.success) {
    console.error('❌ Lỗi:', result.reason || 'Không thể tối ưu dữ liệu.');
    process.exit(1);
  }

  console.log('✅ TỐI ƯU CƠ SỞ DỮ LIỆU HOÀN TẤT!');
  console.log(`👉 Đơn hàng cũ đã lưu trữ : ${result.removedOrders} đơn -> lưu vào backups/archive_orders.json`);
  console.log(`👉 Đơn hàng còn lại       : ${result.remainingOrders} đơn`);
  console.log(`👉 Nhật ký thao tác đã tỉa: ${result.removedLogs} dòng`);
  console.log(`👉 Dung lượng mới         : ${result.newSizeKb} KB\n`);

  process.exit(0);
}

run();
