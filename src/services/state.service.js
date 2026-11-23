const db = require('../db/database');
const authService = require('./auth.service');
const logger = require('../logger');

class StateService {
  // Calculate dish sales count dictionary from invoices and active orders
  calculateDishSales(state) {
    if (!state) return {};
    const countMap = {};
    const add = (name, qty) => {
      if (!name) return;
      const nm = String(name).trim();
      const l = nm.toLowerCase();
      countMap[nm] = (countMap[nm] || 0) + qty;
      if (l !== nm) countMap[l] = (countMap[l] || 0) + qty;
    };

    (state.inv || []).forEach(invoice => {
      (invoice.items || []).forEach(item => {
        if (item && item.name) {
          add(item.name, Number(item.qty) || 1);
        }
      });
    });

    const liveOrders = (state.orders || []).filter(o => o && o.pay !== 'paid');
    liveOrders.forEach(order => {
      (order.items || []).forEach(item => {
        if (item && item.st !== 'cancel' && item.name) {
          add(item.name, Number(item.qty) || 1);
        }
      });
    });

    return countMap;
  }

  // Calculate top 6 most popular dish IDs from invoices and active orders
  calculateHotIds(state) {
    if (!state) return [];
    const countMap = this.calculateDishSales(state);

    return (state.menu || [])
      .filter(m => m && m.st !== 'hide' && (countMap[m.name] || countMap[String(m.name).trim().toLowerCase()]))
      .map(m => ({ id: m.id, q: countMap[m.name] || countMap[String(m.name).trim().toLowerCase()] || 0 }))
      .sort((a, b) => b.q - a.q)
      .slice(0, 6)
      .map(x => x.id);
  }

  // Get sanitized state for guest scanning table QR code or viewing homepage
  getPublicState(tableId) {
    const s = db.state || {};
    const t = Number(tableId);
    const c = s.cfg || {};

    return {
      v: db.v,
      state: {
        cfg: {
          ...c,
          name: c.name,
          logo: c.logo,
          phone: c.phone || '',
          addr: c.addr || '',
          email: c.email || '',
          open: c.open || '08:00',
          close: c.close || '23:00',
          msg: c.msg || '',
          late: c.late,
          qrAuto: c.qrAuto,
          slogan: c.slogan || '',
          desc: c.desc || c.heroDesc || c.storyDesc || '',
          heroDesc: c.desc || c.heroDesc || '',
          storyDesc: c.desc || c.storyDesc || '',
          socialFb: c.socialFb || '',
          socialZalo: c.socialZalo || '',
          socialYoutube: c.socialYoutube || '',
          banners: Array.isArray(c.banners) ? c.banners : [],
          hpFeatures: c.hpFeatures,
          hpServices: c.hpServices,
          hpDishes: c.hpDishes,
          hpAboutTitle: c.hpAboutTitle,
          hpAboutDesc: c.hpAboutDesc,
          hpAboutImg: c.hpAboutImg,
          hpAboutBadge: c.hpAboutBadge,
          hpAboutBtnText: c.hpAboutBtnText,
          hpBookingTitle: c.hpBookingTitle,
          hpBookingDesc: c.hpBookingDesc,
          hpBookingImg: c.hpBookingImg,
          hpBookingBtnText: c.hpBookingBtnText,
          hpBookingBadge: c.hpBookingBadge,
          hpFooterBio: c.hpFooterBio,
          hpCopyright: c.hpCopyright
        },
        menu: (s.menu || []).filter(m => m.st !== 'hide'),
        tables: (s.tables || []).filter(x => x.id === t),
        orders: (s.orders || []).filter(o => o.table === t && o.pay !== 'paid'),
        hot: this.calculateHotIds(s),
        dishSales: this.calculateDishSales(s)
      }
    };
  }

  // Get full or role-filtered state for staff
  getState(user) {
    return {
      v: db.v,
      state: authService.viewFor(user)
    };
  }

  // Update system state from client with conflict detection and authorization
  updateState(user, body) {
    if (body.v !== db.v) {
      return {
        status: 409,
        data: {
          error: 'conflict',
          v: db.v,
          state: authService.viewFor(user)
        }
      };
    }

    if (!body.state || typeof body.state !== 'object') {
      return {
        status: 400,
        data: { error: 'Dữ liệu không hợp lệ' }
      };
    }

    const val = db.validateState(body.state);
    if (!val.valid) {
      return {
        status: 400,
        data: { error: val.reason }
      };
    }

    // Only Admin is allowed to modify staff user accounts
    if (user.role !== 'admin') {
      body.state.users = db.state.users;
    } else if (Array.isArray(body.state.users) && Array.isArray(db.state.users)) {
      // Invalidate active sessions if staff password changed, account deactivated, or deleted
      for (const oldU of db.state.users) {
        if (!oldU || !oldU.u) continue;
        const newU = body.state.users.find(x => x && x.u === oldU.u);
        if (newU) {
          if (newU.p !== oldU.p || (newU.st !== 'active' && oldU.st === 'active')) {
            authService.revokeSessionsForUser(oldU.u);
          }
        } else {
          // User deleted
          authService.revokeSessionsForUser(oldU.u);
        }
      }
    }

    // Preserve sequence counter if missing in update
    if (typeof body.state.seq !== 'number') {
      body.state.seq = (db.state && db.state.seq) || 1;
    }

    db.state = body.state;
    const newVer = db.bump();

    return {
      status: 200,
      data: { v: newVer }
    };
  }
}

module.exports = new StateService();
