const { query } = require('../db');

// In-app notification. userId null = everyone in the group.
async function notify(userId, title, body) {
  await query('INSERT INTO notifications (user_id, title, body) VALUES (?, ?, ?)', [userId, title.slice(0, 160), body.slice(0, 500)]);
}

// Admin-only notification (one row per admin, so members never see it).
notify.admins = async function notifyAdmins(title, body) {
  const admins = await query("SELECT id FROM users WHERE role IN ('admin','super_admin') AND status = 'active'");
  for (const a of admins) await notify(a.id, title, body);
};

module.exports = notify;
