'use strict';
const db = require('../config/database');
const realtime = require('../services/realtime');

const TYPES = ['service', 'resource', 'post', 'payment', 'premium', 'withdrawal', 'system'];

async function notify(userId, { type = 'system', title, body = null, link = null }, conn = db) {
  const res = await conn.run(
    'INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)',
    [userId, TYPES.includes(type) ? type : 'system', String(title).slice(0, 160), body ? String(body).slice(0, 500) : null, link],
  );
  const payload = { id: res.insertId, type, title, body, link, is_read: 0, created_at: new Date().toISOString() };
  realtime.toUser(userId, 'notification:new', payload);
  return payload;
}

/** Broadcast to every active user (one row per user so read-state is per user). */
async function broadcast({ type = 'system', title, body = null, link = null, roles = ['user', 'admin'] }) {
  const res = await db.run(
    `INSERT INTO notifications (user_id, type, title, body, link)
     SELECT id, ?, ?, ?, ? FROM users WHERE status = 'active' AND role IN (?)`,
    [TYPES.includes(type) ? type : 'system', String(title).slice(0, 160), body ? String(body).slice(0, 500) : null, link, roles],
  );
  realtime.broadcast('notification:new', { type, title, body, link, is_read: 0, created_at: new Date().toISOString() });
  return res.affectedRows;
}

/** Notify every admin (e.g. a new account waiting for approval). */
async function notifyAdmins(payload) {
  const admins = await db.query("SELECT id FROM users WHERE role = 'admin' AND status = 'active'");
  for (const a of admins) await notify(a.id, payload);
}

module.exports = { notify, broadcast, notifyAdmins, TYPES };
