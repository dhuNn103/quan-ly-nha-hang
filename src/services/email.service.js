const net = require('net');
const tls = require('tls');
const db = require('../db/database');
const logger = require('../logger');

class EmailService {
  /**
   * Format timestamp to Vietnam datetime string (DD/MM/YYYY HH:mm:ss)
   */
  formatDateTime(timestamp) {
    const d = new Date(timestamp || Date.now());
    const pad = n => String(n).padStart(2, '0');
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());
    return `${hours}:${minutes}:${seconds} ${day}/${month}/${year}`;
  }

  /**
   * Parse email address from string, e.g. "Name <email@dom.com>" -> "email@dom.com"
   */
  extractEmail(str) {
    if (!str) return '';
    const match = String(str).match(/<([^>]+)>/);
    if (match && match[1]) return match[1].trim();
    return String(str).trim();
  }

  /**
   * Get effective SMTP config from current database state
   */
  getSmtpConfig() {
    const s = db.state || {};
    const cfg = s.cfg || {};
    const smtp = cfg.smtp || {};
    const port = parseInt(smtp.port, 10) || 465;
    const secure = smtp.secure !== undefined ? !!smtp.secure : (port === 465);

    return {
      enabled: smtp.enabled === true,
      host: smtp.host || 'smtp.gmail.com',
      port,
      secure,
      user: smtp.user || '',
      pass: smtp.pass || '',
      fromName: smtp.fromName || cfg.name || 'Hương Vị Việt',
      adminEmail: (smtp.adminEmail || cfg.email || smtp.user || '').trim(),
      notifyNewsletter: smtp.notifyNewsletter !== false,
      notifyReservation: smtp.notifyReservation !== false
    };
  }

  /**
   * Send an email via native SMTP over direct TLS (port 465) or STARTTLS (port 587/25)
   */
  sendMail(smtpConfig, mailOptions) {
    return new Promise((resolve, reject) => {
      const host = smtpConfig.host || 'smtp.gmail.com';
      const port = parseInt(smtpConfig.port, 10) || 465;
      const isDirectTls = smtpConfig.secure !== undefined ? !!smtpConfig.secure : (port === 465);
      const timeout = smtpConfig.timeout || 15000;

      const user = smtpConfig.user || '';
      const pass = smtpConfig.pass || '';
      const fromName = smtpConfig.fromName || 'Hương Vị Việt';
      const fromAddress = this.extractEmail(smtpConfig.from || user);

      const rawTo = Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to];
      const rcptAddresses = rawTo.map(t => this.extractEmail(t)).filter(Boolean);

      if (!rcptAddresses.length) {
        return reject(new Error('Chưa có địa chỉ người nhận (To).'));
      }

      const subject = mailOptions.subject || 'Thông báo từ hệ thống';
      const text = mailOptions.text || '';
      const html = mailOptions.html || '';

      // Prepare boundary for MIME
      const boundary = '----=_Part_' + Date.now() + '_' + Math.random().toString(36).substring(2);
      const subjectBase64 = Buffer.from(subject, 'utf8').toString('base64');
      const fromHeader = `"${fromName.replace(/"/g, '')}" <${fromAddress}>`;
      const toHeader = rawTo.join(', ');

      const messageHeaders = [
        `From: ${fromHeader}`,
        `To: ${toHeader}`,
        `Subject: =?UTF-8?B?${subjectBase64}?=`,
        `Date: ${new Date().toUTCString()}`,
        `Message-ID: <${Date.now()}.${Math.random().toString(36).substring(2)}@${host}>`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary="${boundary}"`
      ];

      const messageBody = [
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(text, 'utf8').toString('base64'),
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(html || text, 'utf8').toString('base64'),
        '',
        `--${boundary}--`
      ].join('\r\n');

      let socket = null;
      let buffer = '';
      let step = isDirectTls ? 'GREETING' : 'PLAIN_GREETING';
      let rcptIndex = 0;
      let settled = false;

      const timer = setTimeout(() => {
        cleanup(new Error(`Hết thời gian kết nối tới máy chủ SMTP ${host}:${port} (${timeout}ms).`));
      }, timeout);

      function cleanup(err, result) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          if (socket && !socket.destroyed) {
            socket.write('QUIT\r\n');
            socket.end();
          }
        } catch (_) {}
        if (err) reject(err);
        else resolve(result);
      }

      function attachListeners(targetSocket) {
        targetSocket.on('data', onData);
        targetSocket.on('error', (err) => {
          cleanup(new Error(`Lỗi socket SMTP: ${err.message}`));
        });
        targetSocket.on('close', () => {
          if (!settled && step !== 'DONE') {
            cleanup(new Error('Kết nối tới máy chủ SMTP bị đóng bất ngờ.'));
          }
        });
      }

      function onData(chunk) {
        buffer += chunk.toString('utf8');
        if (!buffer.endsWith('\r\n')) return;

        const lines = buffer.trimEnd().split('\r\n');
        const lastLine = lines[lines.length - 1];
        if (!/^\d{3}( |$)/.test(lastLine)) return; // wait for final line of multi-line reply

        const code = parseInt(lastLine.slice(0, 3), 10);
        const replyText = buffer;
        buffer = '';

        if (code >= 400) {
          if (code === 535) {
            return cleanup(new Error('Xác thực SMTP thất bại (Sai email hoặc mật khẩu ứng dụng Gmail/SMTP).'));
          }
          return cleanup(new Error(`Máy chủ SMTP trả về lỗi ${code}: ${lastLine}`));
        }

        handleStep(code, replyText);
      }

      function handleStep(code, replyText) {
        try {
          switch (step) {
            case 'PLAIN_GREETING':
              if (code === 220) {
                step = 'PLAIN_EHLO';
                socket.write(`EHLO localhost\r\n`);
              }
              break;

            case 'PLAIN_EHLO':
              if (code === 250) {
                step = 'STARTTLS';
                socket.write('STARTTLS\r\n');
              }
              break;

            case 'STARTTLS':
              if (code === 220) {
                step = 'TLS_UPGRADED_EHLO';
                socket.removeListener('data', onData);
                const tlsSocket = tls.connect({
                  socket,
                  host,
                  servername: host,
                  minVersion: 'TLSv1.2',
                  rejectUnauthorized: false
                }, () => {
                  socket = tlsSocket;
                  attachListeners(tlsSocket);
                  tlsSocket.write(`EHLO localhost\r\n`);
                });
                tlsSocket.on('error', (err) => {
                  cleanup(new Error(`Lỗi nâng cấp TLS: ${err.message}`));
                });
              }
              break;

            case 'TLS_UPGRADED_EHLO':
            case 'GREETING':
              if (step === 'GREETING' && code === 220) {
                step = 'EHLO';
                socket.write(`EHLO localhost\r\n`);
              } else if (step === 'TLS_UPGRADED_EHLO' && code === 250) {
                startAuthOrMail();
              }
              break;

            case 'EHLO':
              if (code === 250) {
                startAuthOrMail();
              }
              break;

            case 'AUTH_LOGIN':
              if (code === 334) {
                step = 'AUTH_USER';
                socket.write(Buffer.from(user).toString('base64') + '\r\n');
              }
              break;

            case 'AUTH_USER':
              if (code === 334) {
                step = 'AUTH_PASS';
                socket.write(Buffer.from(pass).toString('base64') + '\r\n');
              }
              break;

            case 'AUTH_PASS':
              if (code === 235) {
                step = 'MAIL_FROM';
                socket.write(`MAIL FROM:<${fromAddress}>\r\n`);
              }
              break;

            case 'MAIL_FROM':
              if (code === 250) {
                step = 'RCPT_TO';
                rcptIndex = 0;
                socket.write(`RCPT TO:<${rcptAddresses[rcptIndex]}>\r\n`);
              }
              break;

            case 'RCPT_TO':
              if (code === 250) {
                rcptIndex++;
                if (rcptIndex < rcptAddresses.length) {
                  socket.write(`RCPT TO:<${rcptAddresses[rcptIndex]}>\r\n`);
                } else {
                  step = 'DATA';
                  socket.write('DATA\r\n');
                }
              }
              break;

            case 'DATA':
              if (code === 354) {
                step = 'SEND_BODY';
                socket.write(messageHeaders.join('\r\n') + '\r\n\r\n' + messageBody + '\r\n.\r\n');
              }
              break;

            case 'SEND_BODY':
              if (code === 250) {
                step = 'DONE';
                cleanup(null, { success: true, message: 'Đã gửi email thành công.' });
              }
              break;

            default:
              break;
          }
        } catch (e) {
          cleanup(e);
        }
      }

      function startAuthOrMail() {
        if (user && pass) {
          step = 'AUTH_LOGIN';
          socket.write('AUTH LOGIN\r\n');
        } else {
          step = 'MAIL_FROM';
          socket.write(`MAIL FROM:<${fromAddress}>\r\n`);
        }
      }

      // Initial socket connection
      try {
        if (isDirectTls) {
          socket = tls.connect({
            host,
            port,
            servername: host,
            minVersion: 'TLSv1.2',
            rejectUnauthorized: false
          });
        } else {
          socket = net.createConnection({ host, port });
        }
        attachListeners(socket);
      } catch (err) {
        cleanup(err);
      }
    });
  }

  /**
   * Send notification to Admin when customer subscribes to newsletter
   */
  async sendNewsletterAlertToAdmin({ subscriberEmail, time, ip }) {
    const s = db.state || {};
    const cfg = s.cfg || {};
    const smtp = this.getSmtpConfig();
    const formattedTime = this.formatDateTime(time || Date.now());
    const clientIp = ip || '127.0.0.1';
    const adminEmail = smtp.adminEmail || cfg.email || '';

    // Record an in-app notification in state so Admin sees it immediately in dashboard
    if (!Array.isArray(s.notifications)) s.notifications = [];
    const notif = {
      id: 'NT_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      type: 'newsletter',
      title: 'Khách đăng ký nhận ưu đãi',
      detail: subscriberEmail,
      ip: clientIp,
      t: time || Date.now(),
      read: false
    };
    s.notifications.unshift(notif);
    if (s.notifications.length > 200) s.notifications = s.notifications.slice(0, 200);

    // If SMTP is disabled or incomplete, log helpful guidance
    if (!smtp.enabled) {
      logger.info(`[EmailService] Khách đăng ký nhận ưu đãi: ${subscriberEmail}. Chưa bật gửi email SMTP trong Cài đặt hệ thống.`);
      return { sent: false, reason: 'smtp_disabled', adminEmail };
    }

    if (!smtp.user || !smtp.pass) {
      logger.warn(`[EmailService] Khách đăng ký nhận ưu đãi: ${subscriberEmail}. Cần điền Email gửi và Mật khẩu ứng dụng SMTP trong Cài đặt.`);
      return { sent: false, reason: 'unconfigured_credentials', adminEmail };
    }

    if (!adminEmail) {
      logger.warn(`[EmailService] Chưa cấu hình Email nhận thông báo của Admin.`);
      return { sent: false, reason: 'no_admin_email' };
    }

    const restaurantName = cfg.name || 'Hương Vị Việt';
    const phone = cfg.phone || '0333 838 386';
    const address = cfg.addr || 'Hà Nội';
    const baseUrl = (cfg.base || 'http://localhost:3000/').replace(/\/+$/, '');

    const subject = `🔔 [${restaurantName}] Khách hàng mới đăng ký nhận ưu đãi: ${subscriberEmail}`;

    const text = `
THÔNG BÁO TỪ HỆ THỐNG ${restaurantName.toUpperCase()}
--------------------------------------------------
Khách hàng vừa đăng ký nhận ưu đãi từ trang chủ website!

- Email khách hàng: ${subscriberEmail}
- Thời gian đăng ký: ${formattedTime}
- Địa chỉ IP: ${clientIp}

Quý khách có thể truy cập Bảng quản trị để xem và quản lý danh sách:
${baseUrl}

${restaurantName} · Hotline: ${phone} · Địa chỉ: ${address}
`.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Khách hàng mới đăng ký nhận ưu đãi</title>
</head>
<body style="margin:0;padding:24px;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#333333;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,0.08);border:1px solid #e2e8f0;">
    
    <!-- Header -->
    <div style="background:linear-gradient(135deg, #1b382b 0%, #29553f 100%);padding:28px 32px;text-align:center;color:#ffffff;">
      <h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#e8c371;letter-spacing:0.5px;">${restaurantName}</h1>
      <p style="margin:0;font-size:14px;opacity:0.9;">Hệ Thống Quản Lý Nhà Hàng & Đặt Bàn Trực Tuyến</p>
    </div>

    <!-- Body Content -->
    <div style="padding:32px 32px 28px;">
      <div style="display:inline-block;background:#fef3c7;color:#92400e;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:16px;">
        🎉 Khách hàng mới đăng ký ưu đãi
      </div>
      <h2 style="margin:0 0 14px;color:#1b382b;font-size:20px;line-height:1.4;">
        Có 1 khách hàng vừa gửi email đăng ký nhận ưu đãi!
      </h2>
      <p style="font-size:15px;line-height:1.6;color:#4b5563;margin-top:0;">
        Hệ thống vừa ghi nhận một lượt đăng ký nhận bản tin khuyến mãi & thông tin ẩm thực mới nhất từ chân trang website:
      </p>

      <!-- Info Box -->
      <div style="background:#f8faf9;border-left:4px solid #29553f;border-radius:8px;padding:18px 20px;margin:22px 0;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:6px 0;color:#6b7280;width:140px;font-weight:500;">📧 Email đăng ký:</td>
            <td style="padding:6px 0;font-weight:700;color:#b45309;font-size:16px;">
              <a href="mailto:${subscriberEmail}" style="color:#b45309;text-decoration:none;">${subscriberEmail}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280;font-weight:500;">⏰ Thời gian:</td>
            <td style="padding:6px 0;color:#1f2937;font-weight:600;">${formattedTime}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280;font-weight:500;">🌐 Địa chỉ IP:</td>
            <td style="padding:6px 0;color:#4b5563;">${clientIp}</td>
          </tr>
        </table>
      </div>

      <div style="background:#f0fdf4;border:1px dashed #86efac;border-radius:8px;padding:14px 18px;margin-bottom:24px;font-size:14px;color:#166534;line-height:1.5;">
        💡 <strong>Mẹo chăm sóc khách hàng:</strong> Bạn có thể bấm trực tiếp vào email phía trên để gửi tặng khách voucher giảm giá, lời chào mừng hoặc thực đơn món mới hấp dẫn.
      </div>

      <!-- Action Button -->
      <div style="text-align:center;margin:30px 0 10px;">
        <a href="${baseUrl}" style="display:inline-block;background:#29553f;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:600;font-size:15px;box-shadow:0 3px 10px rgba(41,85,63,0.3);">
          Mở Trang Quản Trị Nhà Hàng
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:20px 32px;text-align:center;font-size:13px;color:#94a3b8;border-top:1px solid #e2e8f0;line-height:1.6;">
      <strong>${restaurantName}</strong><br>
      📍 ${address} · 📞 Hotline: ${phone}<br>
      <span style="font-size:11px;color:#cbd5e1;">Email được gửi tự động khi có khách đăng ký bản tin trên website.</span>
    </div>

  </div>
</body>
</html>
`.trim();

    try {
      await this.sendMail(smtp, {
        to: adminEmail,
        subject,
        text,
        html
      });
      logger.info(`[EmailService] Đã gửi email thông báo khách đăng ký ưu đãi (${subscriberEmail}) tới ${adminEmail} thành công.`);
      return { sent: true, adminEmail };
    } catch (err) {
      logger.error(`[EmailService] Gửi email thông báo tới ${adminEmail} thất bại: ${err.message}`);
      return { sent: false, error: err.message, adminEmail };
    }
  }

  /**
   * Send notification to Admin when customer creates a table reservation
   */
  async sendReservationAlertToAdmin(reservation) {
    if (!reservation) return;
    const s = db.state || {};
    const cfg = s.cfg || {};
    const smtp = this.getSmtpConfig();

    if (!smtp.enabled || !smtp.notifyReservation || !smtp.user || !smtp.pass) {
      return;
    }

    const adminEmail = smtp.adminEmail || cfg.email || '';
    if (!adminEmail) return;

    const restaurantName = cfg.name || 'Hương Vị Việt';
    const baseUrl = (cfg.base || 'http://localhost:3000/').replace(/\/+$/, '');
    const subject = `📅 [${restaurantName}] Đặt bàn mới ${reservation.id}: ${reservation.name} (${reservation.guests} khách)`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;background:#f4f6f8;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e2e8f0;">
    <h2 style="color:#1b382b;margin-top:0;">📅 Đặt bàn mới: ${reservation.id}</h2>
    <p>Có khách vừa đặt bàn trực tuyến qua website:</p>
    <ul>
      <li><strong>Khách hàng:</strong> ${reservation.name}</li>
      <li><strong>Số điện thoại:</strong> ${reservation.phone}</li>
      <li><strong>Số khách:</strong> ${reservation.guests} khách</li>
      <li><strong>Ngày giờ đến:</strong> ${reservation.time} ngày ${reservation.date}</li>
      <li><strong>Khu vực:</strong> ${reservation.space || 'Bàn chung'}</li>
      <li><strong>Ghi chú:</strong> ${reservation.note || 'Không có'}</li>
      <li><strong>Chính sách cọc:</strong> ${reservation.depositPolicy ? reservation.depositPolicy.label : 'Tiêu chuẩn'}</li>
    </ul>
    <p><a href="${baseUrl}" style="display:inline-block;padding:10px 20px;background:#29553f;color:#fff;text-decoration:none;border-radius:6px;">Xác nhận đặt bàn ngay</a></p>
  </div>
</body>
</html>
    `.trim();

    try {
      await this.sendMail(smtp, {
        to: adminEmail,
        subject,
        text: `Đặt bàn mới ${reservation.id} từ ${reservation.name} (${reservation.phone}) - ${reservation.guests} khách lúc ${reservation.time} ngày ${reservation.date}`,
        html
      });
      logger.info(`[EmailService] Đã gửi email đặt bàn ${reservation.id} tới ${adminEmail}`);
    } catch (err) {
      logger.error(`[EmailService] Gửi email đặt bàn thất bại: ${err.message}`);
    }
  }

  /**
   * Send Password Reset OTP email to user
   */
  async sendPasswordResetOtp(user, otp, targetEmail = '') {
    const s = db.state || {};
    const cfg = s.cfg || {};
    const smtp = this.getSmtpConfig();
    const recipient = (targetEmail || user.em || '').trim();

    if (!recipient) {
      return { success: false, error: 'Tài khoản chưa cập nhật địa chỉ email nhận mã.' };
    }

    const restaurantName = cfg.name || 'Hương Vị Việt';
    const nowStr = this.formatDateTime();
    const subject = `🔐 [${restaurantName}] Mã xác thực đặt lại mật khẩu: ${otp}`;
    const text = `Xin chào ${user.name || user.u},\n\nBạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản "${user.u}" trên hệ thống ${restaurantName}.\n\nMã xác thực OTP của bạn là: ${otp}\n(Mã có hiệu lực trong vòng 10 phút. Tuyệt đối không chia sẻ mã này cho bất kỳ ai)\n\nNếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua thư này hoặc thông báo cho Quản trị viên.\n\nThời gian: ${nowStr}\nTrân trọng,\n${restaurantName}`;
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;background:#f8fafc;color:#1e293b;">
  <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:12px;padding:32px 28px;border:1px solid #e2e8f0;box-shadow:0 4px 14px rgba(0,0,0,0.05);">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;padding:12px 16px;background:#eff6ff;color:#2563eb;border-radius:50px;font-size:28px;margin-bottom:12px;">🔐</div>
      <h2 style="color:#0f172a;margin:0 0 8px;font-size:22px;">Khôi Phục Mật Khẩu</h2>
      <p style="color:#64748b;margin:0;font-size:14px;">Hệ thống quản lý nhà hàng <strong>${restaurantName}</strong></p>
    </div>
    <div style="background:#f8fafc;border-left:4px solid #3b82f6;padding:14px 16px;border-radius:4px;margin-bottom:20px;font-size:14px;line-height:1.6;color:#334155;">
      Xin chào <strong>${user.name || user.u}</strong>,<br>
      Hệ thống nhận được yêu cầu lấy lại mật khẩu cho tài khoản <strong>${user.u}</strong>.
    </div>
    <div style="text-align:center;padding:24px 16px;background:#f1f5f9;border-radius:10px;margin-bottom:24px;">
      <div style="font-size:13px;color:#64748b;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Mã OTP xác thực của bạn</div>
      <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1d4ed8;font-family:monospace;margin-bottom:8px;">${otp}</div>
      <div style="font-size:12px;color:#ef4444;font-weight:500;">⏱️ Mã này sẽ hết hạn sau 10 phút</div>
    </div>
    <p style="font-size:13px;color:#64748b;line-height:1.6;margin:0 0 16px;">
      ⚠️ <em>Lưu ý:</em> Tuyệt đối không chia sẻ mã này cho bất kỳ ai kể cả nhân viên kỹ thuật. Nếu bạn không gửi yêu cầu này, vui lòng bỏ qua email hoặc thông báo cho Quản trị viên.
    </p>
    <div style="border-top:1px solid #f1f5f9;padding-top:16px;font-size:12px;color:#94a3b8;text-align:center;">
      Thời gian yêu cầu: ${nowStr} • ${restaurantName}
    </div>
  </div>
</body>
</html>
    `.trim();

    if (!smtp.enabled || !smtp.user || !smtp.pass) {
      logger.info(`[EmailService] SMTP chưa được bật, mô phỏng gửi OTP ${otp} tới email: ${recipient}`);
      return { success: true, simulated: true, recipient };
    }

    try {
      await this.sendMail(smtp, {
        to: recipient,
        subject,
        text,
        html
      });
      logger.info(`[EmailService] Đã gửi mã OTP đặt lại mật khẩu tới ${recipient}`);
      return { success: true, simulated: false, recipient };
    } catch (err) {
      logger.error(`[EmailService] Gửi OTP email thất bại: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Test SMTP connection and dispatch a test email to verify credentials
   */
  async testSmtpConnection(customConfig = {}, targetEmail = '') {
    const s = db.state || {};
    const cfg = s.cfg || {};
    const current = this.getSmtpConfig();

    const merged = {
      ...current,
      ...customConfig,
      port: parseInt(customConfig.port || current.port, 10) || 465,
      secure: customConfig.secure !== undefined ? !!customConfig.secure : ((customConfig.port || current.port) == 465)
    };

    const recipient = (targetEmail || merged.adminEmail || cfg.email || merged.user || '').trim();

    if (!merged.host) {
      return { success: false, error: 'Vui lòng nhập địa chỉ máy chủ SMTP (VD: smtp.gmail.com).' };
    }
    if (!merged.user) {
      return { success: false, error: 'Vui lòng nhập tài khoản email gửi (VD: nhahang@gmail.com).' };
    }
    if (!merged.pass) {
      return { success: false, error: 'Vui lòng nhập Mật khẩu ứng dụng (App Password) của email gửi.' };
    }
    if (!recipient) {
      return { success: false, error: 'Vui lòng nhập địa chỉ email nhận thư kiểm tra.' };
    }

    const restaurantName = cfg.name || 'Hương Vị Việt';
    const nowStr = this.formatDateTime();

    const subject = `🧪 [${restaurantName}] Kiểm tra kết nối gửi Email SMTP thành công!`;
    const text = `Xin chào Quản trị viên,\n\nKết nối máy chủ gửi Email (${merged.host}:${merged.port}) của bạn đã hoạt động chính xác!\nThời gian kiểm tra: ${nowStr}\n\nHệ thống hiện đã sẵn sàng tự động gửi email thông báo khi có khách đăng ký nhận ưu đãi hoặc đặt bàn.\n\nTrân trọng,\n${restaurantName}`;
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;background:#f4f6f8;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:30px;border:1px solid #e2e8f0;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
    <div style="text-align:center;margin-bottom:20px;">
      <span style="font-size:42px;">🎉</span>
      <h2 style="color:#166534;margin:10px 0 6px;">Kết Nối Email SMTP Hoàn Toàn Hợp Lệ!</h2>
      <p style="color:#6b7280;margin:0;font-size:14px;">Hệ thống nhà hàng ${restaurantName}</p>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;font-size:14px;color:#15803d;line-height:1.6;">
      ✅ <strong>Xin chúc mừng!</strong> Email thử nghiệm đã được gửi thành công từ máy chủ <code>${merged.host}:${merged.port}</code>.<br>
      ⏰ Thời gian gửi: <strong>${nowStr}</strong><br>
      📧 Tài khoản gửi: <strong>${merged.user}</strong><br>
      📬 Hòm thư nhận: <strong>${recipient}</strong>
    </div>
    <p style="color:#374151;font-size:14px;line-height:1.6;">
      Từ bây giờ, mỗi khi có khách hàng điền email vào mục <strong>"Đăng ký nhận ưu đãi"</strong> hoặc <strong>"Đặt bàn trực tuyến"</strong> trên trang chủ, hệ thống sẽ tự động gửi email thông báo chi tiết ngay lập tức về hộp thư này của bạn.
    </p>
  </div>
</body>
</html>
    `.trim();

    try {
      await this.sendMail(merged, {
        to: recipient,
        subject,
        text,
        html
      });
      return {
        success: true,
        message: `Đã gửi email thử nghiệm thành công tới ${recipient}! Vui lòng kiểm tra hộp thư đến (hoặc thư mục Spam).`
      };
    } catch (err) {
      return {
        success: false,
        error: `Lỗi kết nối SMTP: ${err.message}`
      };
    }
  }
}

module.exports = new EmailService();
