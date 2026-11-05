// Máy chủ quản lý nhà hàng: lưu dữ liệu chung, xác thực nhân viên, nhận order từ khách quét QR, đồng bộ realtime (SSE).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000, DB = path.join(__dirname, 'data.json'), PUB = path.join(__dirname, 'public');
let db = { v: 0, state: null };
try { db = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (e) {}
const U = (name, u, p, role) => ({ name, u, p, role, st: 'active', t: Date.now() });
if (!db.state) db.state = { users: [
  U('Quản trị viên', 'admin', process.env.ADMIN_PASSWORD || 'Admin@123', 'admin'),
  U('Nguyễn Quản Lý', 'quanly', 'Quanly@123', 'manager'),
  U('Trần Phục Vụ', 'phucvu', 'Phucvu@123', 'waiter'),
  U('Lê Bếp', 'bep', 'Bep@12345', 'kitchen')] };
const persist = () => { fs.writeFileSync(DB + '.tmp', JSON.stringify(db)); fs.renameSync(DB + '.tmp', DB); };
const tokens = new Map(), fails = {}, rl = new Map(), clients = new Set();
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, no) => { let b = '', n = 0;
  req.on('data', c => { n += c.length; if (n > 25e6) { no(new Error('too big')); req.destroy(); } else b += c; });
  req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { no(e); } }); });
const bump = () => { db.v++; persist(); for (const c of clients) c.write('data: ' + db.v + '\n\n'); };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function hotIds(s){const c={};(s.inv||[]).forEach(v=>(v.items||[]).forEach(i=>{c[i.name]=(c[i.name]||0)+i.qty}));(s.orders||[]).forEach(o=>(o.items||[]).forEach(i=>{if(i.st!=='cancel')c[i.name]=(c[i.name]||0)+i.qty}));return (s.menu||[]).filter(m=>m.st!=='hide'&&c[m.name]).map(m=>({id:m.id,q:c[m.name]})).sort((a,b)=>b.q-a.q).slice(0,6).map(x=>x.id)}
function viewFor(me){return me.role === 'admin' ? db.state : { ...db.state, users: db.state.users.map(({ p: _x, ...u }) => u) };}
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), p = url.pathname;
    const tk = req.headers['x-token'], uname = tokens.get(tk);
    const me = uname && db.state.users.find(x => x.u === uname && x.st === 'active');

    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('retry: 2000\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
    }
    if (p === '/api/login' && req.method === 'POST') {
      const b = await readBody(req), u = db.state.users.find(x => x.u === b.u), f = fails[b.u] || { n: 0, until: 0 };
      if (u && u.role !== 'admin' && f.until > Date.now()) return send(res, 429, { error: 'Tài khoản bị khóa 15 phút do nhập sai quá 5 lần.' });
      if (!u || u.p !== b.p) {
        if (u && u.role !== 'admin') { if (++f.n >= 5) { f.until = Date.now() + 9e5; f.n = 0; } fails[b.u] = f; }
        return send(res, 401, { error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
      }
      if (u.st !== 'active') return send(res, 403, { error: 'Tài khoản đã bị khóa hoặc vô hiệu hóa.' });
      fails[b.u] = { n: 0, until: 0 };
      const t = crypto.randomBytes(24).toString('hex'); tokens.set(t, u.u);
      const { p: _pw, ...pub } = u; return send(res, 200, { token: t, user: pub });
    }
    if (p === '/api/state') {
      if (!me) return send(res, 401, { error: 'Chưa đăng nhập' });
      if (req.method === 'GET') {
        const s = viewFor(me);
        return send(res, 200, { v: db.v, state: s });
      }
      if (req.method === 'PUT') {
        const b = await readBody(req);
        if (b.v !== db.v) return send(res, 409, { error: 'conflict', v: db.v, state: viewFor(me) });
        if (!b.state || typeof b.state !== 'object') return send(res, 400, { error: 'Dữ liệu không hợp lệ' });
        if (me.role !== 'admin') b.state.users = db.state.users; // chỉ Admin được sửa tài khoản
        db.state = b.state; bump(); return send(res, 200, { v: db.v });
      }
    }
    if (p === '/api/public') { // dữ liệu tối thiểu cho khách quét QR, không chứa mật khẩu hay thông tin nội bộ
      const s = db.state, t = +url.searchParams.get('table'), c = s.cfg || {};
      return send(res, 200, { v: db.v, state: { cfg: { name: c.name, logo: c.logo, late: c.late, qrAuto: c.qrAuto },
        menu: (s.menu || []).filter(m => m.st !== 'hide'), tables: (s.tables || []).filter(x => x.id === t),
        orders: (s.orders || []).filter(o => o.table === t && o.pay !== 'paid'), hot: hotIds(s) } });
    }
    if (p === '/api/order' && req.method === 'POST') {
      const ip = req.socket.remoteAddress; if (Date.now() - (rl.get(ip) || 0) < 3000) return send(res, 429, { error: 'Vui lòng đợi vài giây.' });
      rl.set(ip, Date.now());
      const b = await readBody(req), s = db.state, t = (s.tables || []).find(x => x.id === b.table);
      if (!s.menu || !s.orders) return send(res, 400, { error: 'Hệ thống chưa được khởi tạo. Hãy đăng nhập Admin một lần.' });
      if (!t || t.off) return send(res, 400, { error: 'Bàn không hợp lệ hoặc đang tạm ngừng phục vụ.' });
      const note = String(b.note || '').slice(0, 200), items = [];
      for (const i of Array.isArray(b.items) ? b.items : []) {
        const m = s.menu.find(x => x.id === i.id), q = Math.floor(+i.qty);
        if (!m || m.st !== 'on' || !(q > 0 && q <= 50)) return send(res, 400, { error: 'Có món không hợp lệ hoặc đã hết.' });
        items.push({ id: 'i' + s.seq++, name: m.name, price: m.price, qty: q, note, st: 'wait' }); // giá lấy từ máy chủ
      }
      if (!items.length) return send(res, 400, { error: 'Chưa chọn món.' });
      const id = 'DH' + s.seq++;
      s.orders.push({ id, table: t.id, src: 'Khách qua QR', by: String(b.by || 'Khách').slice(0, 60), t: Date.now(),
        status: s.cfg && s.cfg.qrAuto ? 'confirmed' : 'pending', pay: 'unpaid', note, items });
      if (t.st !== 'busy') t.st = 'busy';
      (s.log = s.log || []).push({ t: Date.now(), by: 'Khách (QR)', a: 'Khách gửi order QR', d: 'Bàn ' + t.name });
      bump(); return send(res, 200, { id });
    }
    // tệp tĩnh
    let f = path.normalize(path.join(PUB, p === '/' ? 'index.html' : p));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  } catch (e) { try { send(res, 400, { error: 'Yêu cầu không hợp lệ' }); } catch (_) {} }
}).listen(PORT, () => console.log('Nhà hàng đang chạy tại http://localhost:' + PORT));
