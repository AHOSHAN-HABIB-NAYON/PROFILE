const { query } = require('../db');

// In-app notification. userId null = everyone in the group.
async function notify(userId, title, body) {
  await query('INSERT INTO notifications (user_id, title, body) VALUES (?, ?, ?)', [userId, title.slice(0, 160), body.slice(0, 500)]);
}

module.exports = notify;
