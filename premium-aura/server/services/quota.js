'use strict';
/**
 * Resource request limits — enforced server-side only:
 *   1. request interval (default 1 request / 1 second)
 *   2. hourly & daily caps (admin configurable, per-user override)
 *   3. plan quota: premium plan resource_limit for the plan period, or the free
 *      daily quota. Exceeding the quota triggers the premium upgrade prompt.
 */
const db = require('../config/database');
const settings = require('../models/settings');
const { E } = require('../utils/errors');

const lastAttempt = new Map(); // userId -> ms (in-process fast path; DB check below covers multi-process)
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [k, v] of lastAttempt) if (v < cutoff) lastAttempt.delete(k);
}, 60_000).unref();

async function rateConfig(conn = db) {
  const r = await conn.one("SELECT interval_seconds, hourly_limit, daily_limit, enabled FROM rate_limits WHERE scope = 'resource_assign'");
  return r || { interval_seconds: 1, hourly_limit: 50, daily_limit: 200, enabled: 1 };
}

async function activePremium(userId, conn = db) {
  return conn.one(
    `SELECT id, plan_id, plan_name, resource_limit, starts_at, expires_at FROM user_premium
     WHERE user_id = ? AND status = 'active' AND expires_at > UTC_TIMESTAMP() ORDER BY expires_at DESC LIMIT 1`, [userId],
  );
}

/** Full limits snapshot for UI + enforcement. */
async function limitsFor(userId, conn = db) {
  const [rc, user, premium] = await Promise.all([
    rateConfig(conn),
    conn.one('SELECT custom_hourly_limit, custom_daily_limit, custom_quota FROM users WHERE id = ?', [userId]),
    activePremium(userId, conn),
  ]);
  const counts = await conn.one(
    `SELECT
       SUM(assigned_at > UTC_TIMESTAMP() - INTERVAL 1 HOUR) AS hour_used,
       SUM(assigned_at > UTC_TIMESTAMP() - INTERVAL 1 DAY) AS day_used,
       SUM(assigned_at >= ?) AS plan_used,
       MAX(assigned_at) AS last_at,
       COUNT(*) AS total
     FROM resource_assignments WHERE user_id = ?`,
    [premium ? premium.starts_at : new Date(Date.now() - 86_400_000), userId],
  );
  const hourly = user?.custom_hourly_limit ?? rc.hourly_limit;
  const daily = user?.custom_daily_limit ?? rc.daily_limit;
  let quota;
  let quotaLabel;
  if (premium) {
    quota = user?.custom_quota ?? premium.resource_limit; // null = unlimited
    quotaLabel = `${premium.plan_name} plan`;
  } else {
    quota = user?.custom_quota ?? (await settings.getInt('free_quota_daily', 10));
    quotaLabel = 'Free daily quota';
  }
  return {
    interval_seconds: rc.interval_seconds,
    enabled: !!rc.enabled,
    hourly_limit: hourly,
    daily_limit: daily,
    hour_used: Number(counts.hour_used || 0),
    day_used: Number(counts.day_used || 0),
    quota, // null = unlimited
    quota_used: Number((premium ? counts.plan_used : counts.day_used) || 0),
    quota_label: quotaLabel,
    total_assigned: Number(counts.total || 0),
    last_assigned_at: counts.last_at,
    premium: premium ? { plan: premium.plan_name, expires_at: premium.expires_at, resource_limit: premium.resource_limit } : null,
  };
}

/** Cheap pre-check before opening a transaction. Throws 429 on interval. */
async function checkInterval(userId) {
  const rc = await rateConfig();
  const now = Date.now();
  const last = lastAttempt.get(userId) || 0;
  const minGap = Math.max(0, rc.interval_seconds) * 1000;
  if (rc.enabled && now - last < minGap) {
    const wait = Math.ceil((minGap - (now - last)) / 1000);
    throw E.tooMany(`Please wait ${wait}s between requests`, { retry_after: wait, code: 'INTERVAL' });
  }
  lastAttempt.set(userId, now);
}

/** Authoritative check inside the assignment transaction (user row is locked). */
async function enforce(tx, userId) {
  const l = await limitsFor(userId, tx);
  if (l.enabled) {
    if (l.last_assigned_at && l.interval_seconds > 0) {
      const gap = Date.now() - new Date(l.last_assigned_at).getTime();
      if (gap < l.interval_seconds * 1000) throw E.tooMany(`Please wait ${l.interval_seconds}s between requests`, { code: 'INTERVAL' });
    }
    if (l.hour_used >= l.hourly_limit) throw E.tooMany(`Hourly limit reached (${l.hourly_limit}/hour). Try again later.`, { code: 'HOURLY_LIMIT', limits: l });
    if (l.day_used >= l.daily_limit) throw E.tooMany(`Daily limit reached (${l.daily_limit}/day).`, { code: 'DAILY_LIMIT', limits: l });
  }
  if (l.quota !== null && l.quota !== undefined && l.quota_used >= l.quota) {
    throw E.forbidden(
      l.premium ? `You have used all ${l.quota} resources in your ${l.premium.plan} plan. Upgrade to continue.` : `Free quota reached (${l.quota}). Upgrade to Premium for higher limits.`,
      { code: 'QUOTA', upgrade: true, limits: l },
    );
  }
  return l;
}

module.exports = { limitsFor, checkInterval, enforce, rateConfig, activePremium };
