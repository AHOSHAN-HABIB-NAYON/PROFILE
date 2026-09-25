'use strict';
const notifications = require('../models/notification');

/**
 * Activate (or extend) a plan for a user inside a transaction. If a plan is
 * already active its remaining time is carried over and the new plan's limit
 * applies from now.
 */
async function activate(tx, userId, plan, { paymentId = null, grantedBy = null, notify = true } = {}) {
  const current = await tx.one(
    "SELECT id, expires_at FROM user_premium WHERE user_id = ? AND status = 'active' AND expires_at > UTC_TIMESTAMP() ORDER BY expires_at DESC LIMIT 1 FOR UPDATE",
    [userId],
  );
  const now = new Date();
  const base = current && new Date(current.expires_at) > now ? new Date(current.expires_at) : now;
  const expires = new Date(base.getTime() + plan.duration_days * 86_400_000);
  if (current) await tx.run("UPDATE user_premium SET status = 'cancelled' WHERE id = ?", [current.id]);
  const res = await tx.run(
    `INSERT INTO user_premium (user_id, plan_id, plan_name, resource_limit, starts_at, expires_at, status, payment_id, granted_by)
     VALUES (?,?,?,?,?,?, 'active', ?, ?)`,
    [userId, plan.id, plan.name, plan.resource_limit, now, expires, paymentId, grantedBy],
  );
  if (notify) await notifications.notify(userId, {
    type: 'premium', title: 'Premium activated 👑',
    body: `${plan.name} plan is active until ${expires.toISOString().slice(0, 10)}.`, link: '/premium',
  }, tx);
  return { id: res.insertId, expires_at: expires };
}

module.exports = { activate };
