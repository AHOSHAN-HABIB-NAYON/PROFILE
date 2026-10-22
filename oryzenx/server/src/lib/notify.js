const { query } = require('../db');
const { sendPush } = require('./push');

// Push is best-effort and never blocks or breaks the request.
const push = (ids, title, body, route) => { sendPush(ids, title, body, { route: route || 'notifications' }).catch((e) => console.error('push', e.message)); };

// In-app notification (+ phone push). userId null = everyone in the group.
async function notify(userId, title, body, route) {
  await query('INSERT INTO notifications (user_id, title, body) VALUES (?, ?, ?)', [userId, title.slice(0, 160), body.slice(0, 500)]);
  push(userId === null ? null : [userId], title, body, route);
}

// Admin-only notification (one row per admin, so members never see it).
notify.admins = async function notifyAdmins(title, body, route = 'admin') {
  const admins = await query("SELECT id FROM users WHERE role IN ('admin','super_admin') AND status = 'active'");
  for (const a of admins) await query('INSERT INTO notifications (user_id, title, body) VALUES (?, ?, ?)', [a.id, title.slice(0, 160), body.slice(0, 500)]);
  push(admins.map((a) => a.id), title, body, route);
};

module.exports = notify;
