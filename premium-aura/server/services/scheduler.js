'use strict';
/** Periodic housekeeping: event expiry, premium expiry, log pruning. */
const db = require('../config/database');
const events = require('./events');
const notifications = require('../models/notification');
const logger = require('../utils/logger');

let timer = null;

async function premiumExpiry() {
  const due = await db.query("SELECT id, user_id, plan_name FROM user_premium WHERE status = 'active' AND expires_at <= UTC_TIMESTAMP() LIMIT 500");
  for (const p of due) {
    await db.run("UPDATE user_premium SET status = 'expired' WHERE id = ?", [p.id]);
    await notifications.notify(p.user_id, { type: 'premium', title: 'Premium expired', body: `Your ${p.plan_name} plan has ended. Renew to keep higher limits.`, link: '/premium' });
  }
}

async function run() {
  try {
    await events.expire();
    await premiumExpiry();
    await db.run('DELETE FROM api_provider_logs WHERE created_at < UTC_TIMESTAMP() - INTERVAL 14 DAY LIMIT 10000');
    await db.run('DELETE FROM notifications WHERE is_read = 1 AND created_at < UTC_TIMESTAMP() - INTERVAL 90 DAY LIMIT 10000');
  } catch (err) {
    logger.error(`scheduler: ${err.message}`);
  }
}

function start() {
  if (timer) return;
  run();
  timer = setInterval(run, 60_000);
}

function stop() { if (timer) clearInterval(timer); timer = null; }

module.exports = { start, stop, run };
