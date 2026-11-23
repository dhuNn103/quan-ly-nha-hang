const config = require('../config');
const db = require('../db/database');
const logger = require('../logger');
const emailService = require('./email.service');

class ReservationService {
  constructor() {
    this.rateLimits = new Map(); // ip -> timestamp for public customer rate limiting

    // Clean up rate limits map every 10 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 10 * 60 * 1000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  cleanup() {
    const now = Date.now();
    for (const [ip, time] of this.rateLimits.entries()) {
      if (now - time > 60 * 1000) {
        this.rateLimits.delete(ip);
      }
    }
  }

  // Helper: Format YYYY-MM-DD
  formatYMD(dateObj = new Date()) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Helper: Format DD/MM/YYYY
  formatDMY(dateStr) {
    if (!dateStr) return '';
    const parts = String(dateStr).split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return String(dateStr);
  }

  // Helper: Sinh mã đặt bàn duy nhất, luôn tăng dần và không bao giờ trùng lặp
  getNextReservationId(s) {
    if (!s) return 'DB' + Date.now();
    let maxNum = 0;
    if (Array.isArray(s.reservations)) {
      for (const r of s.reservations) {
        if (r && r.id) {
          const m = String(r.id).match(/^DB(\d+)$/i);
          if (m) {
            const n = parseInt(m[1], 10);
            if (!isNaN(n) && n > maxNum) maxNum = n;
          }
        }
      }
    }
    const currentSeq = (typeof s.seq === 'number' && !isNaN(s.seq)) ? s.seq : 1;
    const nextNum = Math.max(currentSeq, maxNum + 1);
    s.seq = nextNum + 1;
    return 'DB' + nextNum;
  }

  /**
   * Tính toán chính sách tiền cọc đặt bàn:
   * - 1–4 khách: ko cần cọc (level: 'none')
   * - 5–8 khách: không cần cọc hoặc tùy thời điểm (level: 'flexible')
   * - 9–15 khách: Có thể yêu cầu cọc (level: 'recommended')
   * - Trên 15 khách: Nên yêu cầu cọc (level: 'required')
   * - Phòng VIP riêng: Có thể yêu cầu cọc (level: 'recommended')
   * - Dịp lễ, Tết: Nên yêu cầu cọc (level: 'required')
   * - Đặt tiệc, sự kiện: Nên yêu cầu cọc (level: 'required')
   * - Mức cọc: khoản cố định (amountFixed) HOẶC phần trăm giá trị dự kiến của bữa ăn (amountPercent)
   */
  calculateDepositPolicy(params = {}) {
    const guests = Math.max(1, Math.floor(Number(params.guests)) || 2);
    const space = String(params.space || 'Bàn chung').trim();
    const date = String(params.date || '').trim();
    const rawNote = String(params.note || '').toLowerCase();

    // Kiểm tra Lễ Tết qua cờ, ghi chú hoặc ngày dương lịch phổ biến
    let isHoliday = !!params.isHoliday;
    if (!isHoliday && date) {
      const md = date.slice(5); // 'MM-DD'
      const holidayDates = ['01-01', '02-14', '03-08', '04-30', '05-01', '09-02', '09-03', '10-20', '12-24', '12-25', '12-31'];
      if (holidayDates.includes(md)) isHoliday = true;
    }
    if (rawNote.includes('lễ') || rawNote.includes('tết') || rawNote.includes('holiday')) {
      isHoliday = true;
    }

    const isEvent = /tiệc|sự kiện|event|liên hoan|sinh nhật|kỷ niệm/i.test(space) || /tiệc|sự kiện|event/i.test(rawNote);
    const isVip = /vip|phòng riêng|riêng/i.test(space);

    // 1. Đặt tiệc, sự kiện
    if (isEvent) {
      return {
        level: 'required',
        code: 'event',
        label: 'Nên yêu cầu cọc',
        badge: 'Nên yêu cầu cọc',
        badgeClass: 'red',
        title: 'Đặt tiệc, sự kiện',
        desc: 'Nhà hàng cần chuẩn bị setup không gian tiệc, trang trí và lên thực đơn riêng theo yêu cầu.',
        amountFixed: '1.000.000đ – 3.000.000đ',
        amountPercent: '30% – 50% giá trị dự kiến của bữa tiệc',
        suggestedAmount: 1000000,
        note: 'Khoản cọc cố định từ 1.000.000đ hoặc 30% - 50% giá trị dự kiến. Nhà hàng sẽ liên hệ trao đổi thực đơn và thông báo rõ trước khi xác nhận đơn.'
      };
    }

    // 2. Dịp Lễ, Tết
    if (isHoliday) {
      return {
        level: 'required',
        code: 'holiday',
        label: 'Nên yêu cầu cọc',
        badge: 'Nên yêu cầu cọc',
        badgeClass: 'red',
        title: 'Dịp Lễ, Tết',
        desc: 'Thời điểm cao điểm lễ tết, nhà hàng cần giữ chỗ ưu tiên và đảm bảo bàn cho Quý khách.',
        amountFixed: '500.000đ – 1.000.000đ',
        amountPercent: '20% – 30% giá trị dự kiến của bữa ăn',
        suggestedAmount: 500000,
        note: 'Khoản cọc từ 500.000đ hoặc 20% - 30% dự kiến. Nhân viên sẽ thông báo rõ chi tiết trước khi xác nhận đặt bàn.'
      };
    }

    // 3. Trên 15 khách
    if (guests > 15) {
      return {
        level: 'required',
        code: 'large_group',
        label: 'Nên yêu cầu cọc',
        badge: 'Nên yêu cầu cọc',
        badgeClass: 'red',
        title: `Đoàn trên 15 khách (${guests} người)`,
        desc: 'Đoàn khách đông cần sắp xếp dãy bàn dài và chuẩn bị trước nguyên liệu để phục vụ chu đáo.',
        amountFixed: '1.000.000đ – 2.000.000đ',
        amountPercent: '30% giá trị dự kiến của bữa ăn',
        suggestedAmount: 1000000,
        note: 'Mức cọc là khoản cố định từ 1.000.000đ hoặc 30% giá trị dự kiến. Nhà hàng sẽ liên hệ xác nhận cụ thể trước khi nhận đơn.'
      };
    }

    // 4. Phòng VIP riêng
    if (isVip) {
      return {
        level: 'recommended',
        code: 'vip',
        label: 'Có thể yêu cầu cọc',
        badge: 'Có thể yêu cầu cọc',
        badgeClass: 'orange',
        title: 'Phòng VIP riêng',
        desc: 'Không gian riêng tư, sang trọng với dịch vụ phục vụ chu đáo.',
        amountFixed: '500.000đ',
        amountPercent: '20% giá trị dự kiến của bữa ăn',
        suggestedAmount: 500000,
        note: 'Có thể yêu cầu cọc 500.000đ hoặc 20% dự tính để giữ phòng riêng. Nhân viên sẽ thông báo rõ trước khi xác nhận giữ phòng.'
      };
    }

    // 5. Nhóm 9 - 15 khách
    if (guests >= 9 && guests <= 15) {
      return {
        level: 'recommended',
        code: 'group',
        label: 'Có thể yêu cầu cọc',
        badge: 'Có thể yêu cầu cọc',
        badgeClass: 'orange',
        title: `Nhóm 9 – 15 khách (${guests} người)`,
        desc: 'Nhóm đông cần giữ khu vực bàn liền kề và chuẩn bị chỗ ngồi chu đáo.',
        amountFixed: '300.000đ – 500.000đ',
        amountPercent: '20% giá trị dự kiến của bữa ăn',
        suggestedAmount: 300000,
        note: 'Có thể yêu cầu cọc 300.000đ - 500.000đ hoặc 20% dự tính. Nhân viên sẽ tư vấn cụ thể và thông báo trước khi chốt đơn.'
      };
    }

    // 6. Nhóm 5 - 8 khách
    if (guests >= 5 && guests <= 8) {
      return {
        level: 'flexible',
        code: 'flexible',
        label: 'Không cần cọc hoặc tùy thời điểm',
        badge: 'Không cần cọc hoặc tùy thời điểm',
        badgeClass: 'yellow',
        title: `Nhóm 5 – 8 khách (${guests} người)`,
        desc: 'Ngày thường miễn phí đặt cọc. Khung giờ cao điểm cuối tuần có thể linh hoạt yêu cầu cọc nhẹ.',
        amountFixed: '0đ (hoặc 200.000đ khi vào giờ cao điểm)',
        amountPercent: '10% – 15% (chỉ khi vào giờ cao điểm)',
        suggestedAmount: 0,
        note: 'Thông thường không cần đặt cọc. Nếu vào khung giờ cao điểm đông khách, nhân viên sẽ trao đổi rõ trước.'
      };
    }

    // 7. Nhóm 1 - 4 khách
    return {
      level: 'none',
      code: 'none',
      label: 'Không cần cọc',
      badge: 'Không cần cọc',
      badgeClass: 'green',
      title: `Nhóm 1 – 4 khách (${guests} người)`,
      desc: 'Hoàn toàn miễn phí đặt cọc! Nhà hàng giữ bàn ưu tiên trong 15 phút tính từ giờ hẹn.',
      amountFixed: '0đ (Miễn phí cọc)',
      amountPercent: '0%',
      suggestedAmount: 0,
      note: 'Miễn phí đặt cọc 100%. Quý khách không cần thanh toán bất kỳ khoản nào trước khi đến.'
    };
  }

  // 1. Create Public Reservation (From Homepage)
  createPublicReservation(clientIp, body) {
    const now = Date.now();
    const lastTime = this.rateLimits.get('res_' + clientIp) || 0;

    // 3-second debounce per IP to prevent spamming
    if (now - lastTime < 3000) {
      return {
        status: 429,
        data: { error: 'Thao tác quá nhanh, Quý khách vui lòng đợi giây lát rồi thử lại.' }
      };
    }
    this.rateLimits.set('res_' + clientIp, now);

    const s = db.state;
    if (!s) {
      return {
        status: 500,
        data: { error: 'Hệ thống nhà hàng đang khởi động, vui lòng thử lại sau.' }
      };
    }

    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const guests = Math.floor(Number(body.guests)) || 2;
    const date = String(body.date || '').trim();
    const time = String(body.time || '').trim();
    const space = String(body.space || 'Bàn chung').trim();
    const note = String(body.note || '').trim().slice(0, 300);

    // Validations
    if (!name || name.length < 2 || name.length > 60) {
      return {
        status: 400,
        data: { error: 'Quý khách vui lòng nhập Họ và tên hợp lệ (từ 2 đến 60 ký tự).' }
      };
    }

    if (!phone || !/^[0-9+() -]{9,15}$/.test(phone)) {
      return {
        status: 400,
        data: { error: 'Quý khách vui lòng nhập Số điện thoại hợp lệ (9 - 15 chữ số).' }
      };
    }

    if (guests < 1 || guests > 100) {
      return {
        status: 400,
        data: { error: 'Số lượng khách phải từ 1 đến 100 người.' }
      };
    }

    if (!date) {
      return {
        status: 400,
        data: { error: 'Quý khách vui lòng chọn ngày đến dùng bữa.' }
      };
    }

    if (!time) {
      return {
        status: 400,
        data: { error: 'Quý khách vui lòng chọn giờ đến dùng bữa.' }
      };
    }

    // Unique Sequence ID
    if (!Array.isArray(s.reservations)) {
      s.reservations = [];
    }

    const resId = this.getNextReservationId(s);
    const dateFormatted = this.formatDMY(date);
    const isHoliday = !!body.isHoliday;
    const depositPolicy = this.calculateDepositPolicy({ guests, space, date, isHoliday, note });
    const reservation = {
      id: resId,
      name,
      phone,
      guests,
      date,
      time,
      space,
      note,
      isHoliday,
      depositPolicy,
      status: 'pending', // pending, confirmed, seated, completed, cancelled
      tableId: null,
      tableName: null,
      deposit: Math.max(0, Math.floor(Number(body.deposit) || 0)),
      source: 'web',
      createdAt: now,
      ip: clientIp
    };

    s.reservations.unshift(reservation);

    // Keep up to 500 most recent reservations
    if (s.reservations.length > 500) {
      s.reservations = s.reservations.slice(0, 500);
    }

    // Audit log
    if (!Array.isArray(s.log)) s.log = [];
    s.log.push({
      t: now,
      by: 'Khách (Trang chủ)',
      a: 'Khách đặt bàn',
      d: `Mã ${resId}: ${name} (${phone}) - ${guests} người - ${space} - ${time} ngày ${dateFormatted}${note ? ` (Ghi chú: ${note})` : ''}`
    });

    db.bump();
    logger.info(`Đặt bàn mới ${resId}: ${name} - ${phone} (${guests} khách lúc ${time} ${date})`);

    // Asynchronously dispatch email notification to Admin
    Promise.resolve(emailService.sendReservationAlertToAdmin(reservation)).catch(err => {
      logger.error(`[Reservation] Gửi email thông báo thất bại: ${err.message}`);
    });

    return {
      status: 200,
      data: {
        success: true,
        id: resId,
        message: 'Đặt bàn thành công! Nhà hàng sẽ liên hệ xác nhận trong giây lát.',
        reservation
      }
    };
  }

  // 2. Create Admin Reservation (Staff / Manager / Admin)
  createAdminReservation(user, body) {
    const s = db.state;
    if (!s) {
      return { status: 500, data: { error: 'Hệ thống nhà hàng đang khởi động.' } };
    }

    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const guests = Math.floor(Number(body.guests)) || 2;
    const date = String(body.date || this.formatYMD()).trim();
    const time = String(body.time || '18:00').trim();
    const space = String(body.space || 'Bàn chung').trim();
    const note = String(body.note || '').trim().slice(0, 300);
    const staffNote = String(body.staffNote || '').trim().slice(0, 300);
    const deposit = Math.max(0, Math.floor(Number(body.deposit) || 0));
    const status = ['pending', 'confirmed', 'seated'].includes(body.status) ? body.status : 'confirmed';

    if (!name || name.length < 2) {
      return { status: 400, data: { error: 'Tên khách hàng không được để trống (tối thiểu 2 ký tự).' } };
    }

    if (!phone || !/^[0-9+() -]{9,15}$/.test(phone)) {
      return { status: 400, data: { error: 'Số điện thoại không hợp lệ (9 - 15 chữ số).' } };
    }

    if (guests < 1 || guests > 200) {
      return { status: 400, data: { error: 'Số lượng khách phải từ 1 đến 200 người.' } };
    }

    // Unique Sequence ID
    if (!Array.isArray(s.reservations)) s.reservations = [];

    const resId = this.getNextReservationId(s);
    const dateFormatted = this.formatDMY(date);
    let assignedTableId = null;
    let assignedTableName = null;

    if (body.tableId) {
      const tid = Number(body.tableId);
      if (tid > 0) {
        assignedTableId = tid;
        const table = (s.tables || []).find(t => t.id === tid);
        assignedTableName = table ? table.name : ('Bàn ' + tid);
        if (status === 'seated' && table && table.st !== 'busy') {
          table.st = 'busy';
        }
      }
    }

    const now = Date.now();
    const isHoliday = !!body.isHoliday;
    const depositPolicy = this.calculateDepositPolicy({ guests, space, date, isHoliday, note: body.note });
    const reservation = {
      id: resId,
      name,
      phone,
      guests,
      date,
      time,
      space,
      note,
      isHoliday,
      depositPolicy,
      staffNote,
      deposit,
      status,
      tableId: assignedTableId,
      tableName: assignedTableName,
      source: body.source || 'admin',
      createdBy: user.name || user.u,
      createdAt: now,
      updatedAt: now
    };

    s.reservations.unshift(reservation);
    if (s.reservations.length > 500) {
      s.reservations = s.reservations.slice(0, 500);
    }

    if (!Array.isArray(s.log)) s.log = [];
    s.log.push({
      t: now,
      by: user.name || user.u,
      a: 'Tạo đặt bàn mới ' + resId,
      d: `Mã ${resId}: ${name} (${phone}) - ${guests} người - ${space} - ${time} ngày ${dateFormatted} [${status}]`
    });

    db.bump();
    logger.info(`Admin ${user.u} tạo đặt bàn ${resId}: ${name} (${guests} khách lúc ${time} ${date})`);

    return {
      status: 200,
      data: {
        success: true,
        id: resId,
        message: 'Tạo đặt bàn mới thành công!',
        reservation
      }
    };
  }

  // 3. List Reservations with Advanced Filtering & Pagination
  listReservations(user, query = {}) {
    const s = db.state || {};
    let list = Array.isArray(s.reservations) ? [...s.reservations] : [];

    // Helper to get param from URLSearchParams or plain object
    const getParam = k => (query && typeof query.get === 'function' ? query.get(k) : query?.[k]) || '';

    const status = getParam('status');
    const date = getParam('date');
    const fromDate = getParam('fromDate');
    const toDate = getParam('toDate');
    const tableId = getParam('tableId');
    const search = getParam('search').trim().toLowerCase();
    const sort = getParam('sort') || 'created_desc';
    const page = Math.max(1, parseInt(getParam('page'), 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(getParam('limit'), 10) || 20));

    // Summary counters (before filtering by status)
    const summary = {
      total: list.length,
      pending: list.filter(r => r.status === 'pending').length,
      confirmed: list.filter(r => r.status === 'confirmed').length,
      seated: list.filter(r => r.status === 'seated').length,
      completed: list.filter(r => r.status === 'completed').length,
      cancelled: list.filter(r => r.status === 'cancelled').length,
      totalGuestsToday: 0
    };

    const todayStr = this.formatYMD();
    summary.totalGuestsToday = list
      .filter(r => r.date === todayStr && r.status !== 'cancelled')
      .reduce((acc, r) => acc + (Number(r.guests) || 0), 0);

    // 1. Filter by Status
    if (status && status !== 'all') {
      const statuses = status.split(',').map(x => x.trim().toLowerCase());
      list = list.filter(r => statuses.includes(String(r.status || '').toLowerCase()));
    }

    // 2. Filter by Date / Quick dates
    if (date) {
      if (date === 'today') {
        list = list.filter(r => r.date === todayStr);
      } else if (date === 'tomorrow') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomStr = this.formatYMD(tomorrow);
        list = list.filter(r => r.date === tomStr);
      } else if (date === 'upcoming') {
        list = list.filter(r => r.date >= todayStr && r.status !== 'cancelled');
      } else {
        list = list.filter(r => r.date === date);
      }
    }

    // 3. Filter by Date Range
    if (fromDate) {
      list = list.filter(r => r.date >= fromDate);
    }
    if (toDate) {
      list = list.filter(r => r.date <= toDate);
    }

    // 4. Filter by Table
    if (tableId) {
      const tid = Number(tableId);
      list = list.filter(r => Number(r.tableId) === tid);
    }

    // 5. Filter by Search Query
    if (search) {
      list = list.filter(r =>
        (r.name && r.name.toLowerCase().includes(search)) ||
        (r.phone && r.phone.includes(search)) ||
        (r.id && r.id.toLowerCase().includes(search)) ||
        (r.tableName && r.tableName.toLowerCase().includes(search)) ||
        (r.note && r.note.toLowerCase().includes(search)) ||
        (r.staffNote && r.staffNote.toLowerCase().includes(search))
      );
    }

    // 6. Sorting
    list.sort((a, b) => {
      if (sort === 'time_asc') {
        const dateCmp = String(a.date || '').localeCompare(String(b.date || ''));
        if (dateCmp !== 0) return dateCmp;
        return String(a.time || '').localeCompare(String(b.time || ''));
      }
      if (sort === 'time_desc') {
        const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
        if (dateCmp !== 0) return dateCmp;
        return String(b.time || '').localeCompare(String(a.time || ''));
      }
      if (sort === 'guests_desc') {
        return (Number(b.guests) || 0) - (Number(a.guests) || 0);
      }
      if (sort === 'created_asc') {
        return (a.createdAt || 0) - (b.createdAt || 0);
      }
      // default: created_desc
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    const totalFiltered = list.length;
    const totalPages = Math.ceil(totalFiltered / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedList = list.slice(startIndex, startIndex + limit);

    return {
      status: 200,
      data: {
        total: totalFiltered,
        page,
        limit,
        totalPages,
        summary,
        reservations: paginatedList
      }
    };
  }

  // 4. Get Reservation by ID with Customer History
  getReservationById(id) {
    const s = db.state || {};
    const reservations = s.reservations || [];
    const item = reservations.find(r => r.id === id);

    if (!item) {
      return { status: 404, data: { error: 'Không tìm thấy đặt bàn mã ' + id } };
    }

    // Fetch customer history by phone number
    const customerHistory = reservations
      .filter(r => r.phone === item.phone && r.id !== item.id)
      .map(r => ({
        id: r.id,
        date: r.date,
        time: r.time,
        guests: r.guests,
        status: r.status,
        tableName: r.tableName
      }));

    return {
      status: 200,
      data: {
        reservation: item,
        customerHistory: {
          totalBookings: customerHistory.length + 1,
          pastBookings: customerHistory
        }
      }
    };
  }

  // 5. Update Reservation (Details, Status, Table, Deposit, Notes)
  updateReservation(user, id, body) {
    const s = db.state;
    if (!s || !Array.isArray(s.reservations)) {
      return { status: 404, data: { error: 'Không tìm thấy thông tin đặt bàn.' } };
    }

    const item = s.reservations.find(r => r.id === id);
    if (!item) {
      return { status: 404, data: { error: 'Không tìm thấy đặt bàn mã ' + id } };
    }

    const validStatuses = ['pending', 'confirmed', 'seated', 'completed', 'cancelled'];
    const oldStatus = item.status;
    const oldTableId = item.tableId;

    if (body.status && validStatuses.includes(body.status)) {
      item.status = body.status;
    }

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length >= 2) item.name = name;
    }

    if (body.phone !== undefined) {
      const phone = String(body.phone).trim();
      if (/^[0-9+() -]{9,15}$/.test(phone)) item.phone = phone;
    }

    if (body.guests !== undefined) {
      const g = Math.floor(Number(body.guests));
      if (g >= 1 && g <= 200) item.guests = g;
    }

    if (body.date !== undefined && body.date) {
      item.date = String(body.date).trim();
    }

    if (body.time !== undefined && body.time) {
      item.time = String(body.time).trim();
    }

    if (body.space !== undefined) {
      item.space = String(body.space).trim();
    }

    if (body.deposit !== undefined) {
      item.deposit = Math.max(0, Math.floor(Number(body.deposit) || 0));
    }

    if (body.cancelReason !== undefined) {
      item.cancelReason = String(body.cancelReason).slice(0, 200);
    }

    // Table assignment
    if (body.tableId !== undefined) {
      const tid = Number(body.tableId);
      if (tid > 0) {
        const table = (s.tables || []).find(t => t.id === tid);
        if (table) {
          item.tableId = tid;
          item.tableName = table.name;
          if (item.status === 'seated' && table.st !== 'busy') {
            table.st = 'busy';
          }
        }
      } else {
        item.tableId = null;
        item.tableName = null;
      }
    }

    // Status transition side-effects on tables
    if (item.status === 'seated' && item.tableId) {
      const table = (s.tables || []).find(t => t.id === item.tableId);
      if (table && table.st !== 'busy') {
        table.st = 'busy';
      }
    }

    if (body.note !== undefined) {
      item.note = String(body.note).slice(0, 300);
    }

    if (body.staffNote !== undefined) {
      item.staffNote = String(body.staffNote).slice(0, 300);
    }

    if (body.isHoliday !== undefined) {
      item.isHoliday = !!body.isHoliday;
    }

    // Re-evaluate deposit policy on updates
    item.depositPolicy = this.calculateDepositPolicy({
      guests: item.guests,
      space: item.space,
      date: item.date,
      isHoliday: item.isHoliday,
      note: item.note
    });

    item.updatedAt = Date.now();
    item.updatedBy = user.name || user.u;

    if (!Array.isArray(s.log)) s.log = [];
    s.log.push({
      t: Date.now(),
      by: user.name || user.u,
      a: 'Cập nhật đặt bàn ' + id,
      d: `Trạng thái: ${oldStatus} -> ${item.status}${item.tableName ? ' | Bàn: ' + item.tableName : ''}${item.deposit ? ' | Cọc: ' + item.deposit.toLocaleString('vi-VN') + 'đ' : ''}`
    });

    db.bump();
    logger.info(`Cập nhật đặt bàn ${id} bởi ${user.u}: status=${item.status}, table=${item.tableId}`);

    return {
      status: 200,
      data: {
        success: true,
        message: 'Cập nhật đặt bàn thành công!',
        reservation: item
      }
    };
  }

  // 6. Delete Reservation (Admin / Manager only)
  deleteReservation(user, id) {
    if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
      return { status: 403, data: { error: 'Chỉ Quản trị viên và Quản lý mới có quyền xóa đặt bàn.' } };
    }

    const s = db.state;
    if (!s || !Array.isArray(s.reservations)) {
      return { status: 404, data: { error: 'Không tìm thấy danh sách đặt bàn.' } };
    }

    const idx = s.reservations.findIndex(r => r.id === id);
    if (idx === -1) {
      return { status: 404, data: { error: 'Không tìm thấy đặt bàn mã ' + id } };
    }

    const removed = s.reservations.splice(idx, 1)[0];

    if (!Array.isArray(s.log)) s.log = [];
    s.log.push({
      t: Date.now(),
      by: user.name || user.u,
      a: 'Xóa đặt bàn ' + id,
      d: `Xóa đặt bàn của khách: ${removed.name} (${removed.phone})`
    });

    db.bump();
    logger.info(`Admin ${user.u} đã xóa đặt bàn ${id} (${removed.name})`);

    return {
      status: 200,
      data: {
        success: true,
        message: 'Đã xóa đặt bàn ' + id + ' thành công!'
      }
    };
  }

  // 7. Get Reservation Dashboard Statistics
  getStats(user) {
    const s = db.state || {};
    const list = Array.isArray(s.reservations) ? s.reservations : [];
    const todayStr = this.formatYMD();

    const stats = {
      totalAll: list.length,
      today: {
        date: todayStr,
        total: 0,
        guests: 0,
        pending: 0,
        confirmed: 0,
        seated: 0,
        completed: 0,
        cancelled: 0
      },
      upcoming7Days: {},
      hourlyBreakdownToday: {},
      spacesBreakdown: {}
    };

    // Initialize upcoming 7 days
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const ds = this.formatYMD(d);
      stats.upcoming7Days[ds] = 0;
    }

    list.forEach(r => {
      // Today breakdown
      if (r.date === todayStr) {
        stats.today.total++;
        if (r.status !== 'cancelled') {
          stats.today.guests += Number(r.guests) || 0;
        }
        if (stats.today[r.status] !== undefined) {
          stats.today[r.status]++;
        }

        // Hourly breakdown
        const hour = (r.time || '').split(':')[0] || 'Khác';
        stats.hourlyBreakdownToday[hour] = (stats.hourlyBreakdownToday[hour] || 0) + 1;
      }

      // Next 7 days
      if (stats.upcoming7Days[r.date] !== undefined && r.status !== 'cancelled') {
        stats.upcoming7Days[r.date]++;
      }

      // Space breakdown
      const sp = r.space || 'Bàn chung';
      stats.spacesBreakdown[sp] = (stats.spacesBreakdown[sp] || 0) + 1;
    });

    return {
      status: 200,
      data: { stats }
    };
  }

  // Helper: Normalize 4 Table Types (standard, vip, outdoor, event)
  normalizeTableType(raw, tableId) {
    const s = String(raw || '').toLowerCase().trim();
    if (s === 'vip' || s.includes('vip') || s.includes('riêng')) return 'vip';
    if (s === 'outdoor' || s.includes('ngoài trời') || s.includes('sân vườn')) return 'outdoor';
    if (s === 'event' || s.includes('tiệc') || s.includes('sự kiện')) return 'event';
    if (s === 'standard' || s.includes('tiêu chuẩn') || s.includes('bàn chung')) return 'standard';
    if (tableId) {
      const id = Number(tableId);
      if (id <= 8) return 'standard';
      if (id <= 12) return 'outdoor';
      if (id <= 16) return 'vip';
      return 'event';
    }
    return 'standard';
  }

  getTableTypeName(type) {
    switch (type) {
      case 'vip': return 'Phòng VIP riêng';
      case 'outdoor': return 'Khu vực ngoài trời';
      case 'event': return 'Đặt tiệc, sự kiện';
      case 'standard':
      default: return 'Bàn tiêu chuẩn';
    }
  }

  // 8. Check Available Tables for Date / Time / Guests / Space
  checkAvailability(date, time, guests = 2, space = '') {
    const s = db.state || {};
    const allTables = (s.tables || []).filter(t => !t.off);
    const dateStr = String(date || this.formatYMD()).trim();
    const timeStr = String(time || '18:00').trim();
    const targetType = space ? this.normalizeTableType(space) : '';

    // Check reservations at the same date that are confirmed or seated
    const activeReservations = (s.reservations || []).filter(r =>
      r.date === dateStr &&
      (r.status === 'confirmed' || r.status === 'seated') &&
      r.tableId
    );

    const bookedTableIds = new Set(activeReservations.map(r => r.tableId));

    const tablesWithStatus = allTables.map(t => {
      const isBooked = bookedTableIds.has(t.id);
      const tableType = t.type ? this.normalizeTableType(t.type, t.id) : this.normalizeTableType(t.name, t.id);
      const tableTypeName = this.getTableTypeName(tableType);
      const isAvailable = !isBooked && (t.st === 'free' || dateStr !== this.formatYMD());
      const isMatchSpace = !targetType || tableType === targetType;

      return {
        id: t.id,
        name: t.name,
        type: tableType,
        typeName: tableTypeName,
        currentStatus: t.st,
        isAvailable,
        isMatchSpace,
        bookedInfo: isBooked ? activeReservations.find(r => r.tableId === t.id) : null
      };
    });

    return {
      status: 200,
      data: {
        date: dateStr,
        time: timeStr,
        guests: Number(guests),
        space: space || '',
        targetType,
        totalTables: allTables.length,
        availableCount: tablesWithStatus.filter(t => t.isAvailable).length,
        matchedCount: targetType ? tablesWithStatus.filter(t => t.isMatchSpace).length : allTables.length,
        matchedAvailableCount: targetType ? tablesWithStatus.filter(t => t.isMatchSpace && t.isAvailable).length : tablesWithStatus.filter(t => t.isAvailable).length,
        tables: tablesWithStatus
      }
    };
  }

  // 9. Export Reservations to Excel-Compatible CSV (UTF-8 with BOM)
  exportCsv(user, query = {}) {
    const s = db.state || {};
    let list = Array.isArray(s.reservations) ? [...s.reservations] : [];

    const date = (query && typeof query.get === 'function' ? query.get('date') : query?.date) || '';
    if (date) {
      list = list.filter(r => r.date === date);
    }

    const headers = [
      'Mã đặt bàn',
      'Khách hàng',
      'Số điện thoại',
      'Số khách',
      'Ngày đến',
      'Giờ đến',
      'Khu vực',
      'Bàn phục vụ',
      'Chính sách cọc',
      'Tiền cọc (VNĐ)',
      'Trạng thái',
      'Nguồn đặt',
      'Ghi chú của khách',
      'Ghi chú nội bộ',
      'Thời gian tạo'
    ];

    const statusMap = {
      pending: 'Chờ xác nhận',
      confirmed: 'Đã xác nhận',
      seated: 'Đã vào bàn',
      completed: 'Đã hoàn tất',
      cancelled: 'Đã hủy'
    };

    const rows = list.map(r => [
      `"${r.id || ''}"`,
      `"${(r.name || '').replace(/"/g, '""')}"`,
      `"${r.phone || ''}"`,
      r.guests || 0,
      `"${r.date || ''}"`,
      `"${r.time || ''}"`,
      `"${(r.space || 'Bàn chung').replace(/"/g, '""')}"`,
      `"${(r.tableName || 'Chưa xếp').replace(/"/g, '""')}"`,
      `"${r.depositPolicy ? r.depositPolicy.label : 'Chưa xác định'}"`,
      r.deposit || 0,
      `"${statusMap[r.status] || r.status || ''}"`,
      `"${r.source === 'admin' ? 'Nội bộ/Gọi điện' : 'Website'}"`,
      `"${(r.note || '').replace(/"/g, '""')}"`,
      `"${(r.staffNote || '').replace(/"/g, '""')}"`,
      `"${new Date(r.createdAt || Date.now()).toLocaleString('vi-VN')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');

    return {
      status: 200,
      contentType: 'text/csv; charset=utf-8',
      fileName: `Danh_sach_dat_ban_${this.formatYMD()}.csv`,
      data: csvContent
    };
  }
}

module.exports = ReservationService;
