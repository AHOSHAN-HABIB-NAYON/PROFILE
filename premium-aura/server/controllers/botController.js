'use strict';
/**
 * Facts for the in-app help bot: which countries/ranges are active, plans,
 * the user's limits, payments and the support contact. Read-only, never secret.
 */
const db = require('../config/database');
const settings = require('../models/settings');
const quota = require('../services/quota');
const money = require('../utils/money');

// The shared part (ranges, plans, settings) is the same for everyone, so it is cached
// for a minute: many users opening the bot cost one set of queries, not one each.
const TTL_MS = 60_000;
let shared = null;
let sharedAt = 0;
let pending = null;

async function loadShared() {
  const s = await settings.loadAll();
  const [services, plans] = await Promise.all([
    db.query(`SELECT s.country_code, s.country_name, s.app_code, s.app_name,
                CASE WHEN s.manual_available IS NOT NULL THEN s.manual_available > 0
                  ELSE EXISTS (SELECT 1 FROM authorized_resources r WHERE r.service_id = s.id AND r.status = 'available') END AS available
              FROM services s WHERE s.status = 'active' ORDER BY s.sort_order, s.id`),
    db.query("SELECT name, duration_days, price, hourly_limit, daily_limit FROM premium_plans WHERE status = 'active' ORDER BY sort_order, price"),
  ]);
  return {
    ranges: services.map((x) => ({
      code: `${x.country_code} ${x.app_code}`, cc: String(x.country_code || '').toUpperCase(), country: x.country_name, app: x.app_name || x.app_code,
      available: !!Number(x.available),
    })),
    plans: plans.map((p) => ({ name: p.name, days: p.duration_days, price: money.display(p.price), hourly: p.hourly_limit, daily: p.daily_limit })),
    return_minutes: Number(s.assignment_timeout_minutes) || 10,
    min_withdrawal: s.min_withdrawal, currency: s.currency_symbol || '$',
    payments: { trc20: !!s.trc20_address, binance: !!(s.binance_uid || s.binance_pay_link) },
    support: { whatsapp: s.support_whatsapp || '', note: s.support_contact_note || '' },
  };
}

async function getShared() {
  if (shared && Date.now() - sharedAt < TTL_MS) return shared;
  if (!pending) {
    pending = loadShared()
      .then((v) => { shared = v; sharedAt = Date.now(); return v; })
      .finally(() => { pending = null; });
  }
  return pending;
}

exports.info = async (req, res) => {
  const [common, limits, premium] = await Promise.all([
    getShared(),
    quota.limitsFor(req.user.id),
    quota.activePremium(req.user.id),
  ]);
  res.json({
    ok: true,
    ...common,
    limits: { hourly: limits.hourly_limit, daily: limits.daily_limit, hour_used: limits.hour_used, day_used: limits.day_used },
    premium: premium ? { plan: premium.plan_name, expires_at: premium.expires_at } : null,
  });
};
