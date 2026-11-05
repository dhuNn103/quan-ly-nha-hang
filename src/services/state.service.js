const db = require('../db/database');
const authService = require('./auth.service');
const logger = require('../logger');

class StateService {
  // Calculate top 6 most popular dish IDs from invoices and active orders
  calculateHotIds(state) {
    if (!state) return [];
    const countMap = {};

    (state.inv || []).forEach(invoice => {
      (invoice.items || []).forEach(item => {
        countMap[item.name] = (countMap[item.name] || 0) + (item.qty || 0);
      });
    });

    (state.orders || []).forEach(order => {
      (order.items || []).forEach(item => {
        if (item.st !== 'cancel') {
          countMap[item.name] = (countMap[item.name] || 0) + (item.qty || 0);
        }
      });
    });

    return (state.menu || [])
      .filter(m => m.st !== 'hide' && countMap[m.name])
      .map(m => ({ id: m.id, q: countMap[m.name] }))
      .sort((a, b) => b.q - a.q)
      .slice(0, 6)
      .map(x => x.id);
  }

  // Get sanitized state for guest scanning table QR code
  getPublicState(tableId) {
    const s = db.state || {};
    const t = Number(tableId);
    const c = s.cfg || {};

    return {
      v: db.v,
      state: {
        cfg: {
          name: c.name,
          logo: c.logo,
          late: c.late,
          qrAuto: c.qrAuto
        },
        menu: (s.menu || []).filter(m => m.st !== 'hide'),
        tables: (s.tables || []).filter(x => x.id === t),
        orders: (s.orders || []).filter(o => o.table === t && o.pay !== 'paid'),
        hot: this.calculateHotIds(s)
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
