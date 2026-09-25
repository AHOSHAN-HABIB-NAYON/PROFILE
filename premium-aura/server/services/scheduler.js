'use strict';
/** Periodic housekeeping: event expiry, premium expiry, log pruning. */
const db = require('../config/database');
const events = require('./events');
const notifications = require('../models/notification');
const settings = require('../models/settings');
const realtime = require('./realtime');
const logger = require('../utils/logger');

let timer = null;

async function premiumExpiry() {
  const due = await db.query("SELECT id, user_id, plan_name FROM user_premium WHERE status = 'active' AND expires_at <= UTC_TIMESTAMP() LIMIT 500");
  for (const p of due) {
    await db.run("UPDATE user_premium SET status = 'expired' WHERE id = ?", [p.id]);
    await notifications.notify(p.user_id, { type: 'premium', title: 'Premium expired', body: `Your ${p.plan_name} plan has ended. Renew to keep higher limits.`, link: '/premium' });
  }
}

/** Numbers that got no OTP within the timeout go back to the pool for other users. */
async function returnUnused() {
  const minutes = Math.max(1, await settings.getInt('assignment_timeout_minutes', 10));
  const due = await db.query(
    `SELECT id, user_id, resource_id FROM resource_assignments
     WHERE status = 'pending' AND released_at IS NULL AND assigned_at <= UTC_TIMESTAMP() - INTERVAL ? MINUTE LIMIT 1000`, [minutes],
  );
  for (const a of due) {
    await db.transaction(async (tx) => {
      const r = await tx.run("UPDATE resource_assignments SET status = 'returned', released_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'pending' AND released_at IS NULL", [a.id]);
      if (r.affectedRows) await tx.run("UPDATE authorized_resources SET status = 'available', assigned_user_id = NULL WHERE id = ? AND assigned_user_id = ?", [a.resource_id, a.user_id]);
    });
    realtime.toUser(a.user_id, 'resource:returned', { id: a.id });
  }
  if (due.length) realtime.broadcast('service:count', {});
}

async function run() {
  try {
    await returnUnused();
    await events.expire();
    await premiumExpiry();
    await db.run('DELETE FROM api_provider_logs WHERE created_at < UTC_TIMESTAMP() - INTERVAL 14 DAY LIMIT 10000');
    const ttl = Math.max(1, await settings.getInt('notification_ttl_hours', 24));
    await db.run('DELETE FROM notifications WHERE created_at < UTC_TIMESTAMP() - INTERVAL ? HOUR LIMIT 20000', [ttl]);
  } catch (err) {
    logger.error(`scheduler: ${err.message}`);
  }
}

function start() {
  if (timer) return;
  run();
  timer = setInterval(run, 30_000);
}

function stop() { if (timer) clearInterval(timer); timer = null; }

module.exports = { start, stop, run, returnUnused };
