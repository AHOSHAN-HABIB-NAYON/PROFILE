'use strict';
/**
 * Facts for the in-app help bot: ranges with today's OTP success rate, plans,
 * the user's limits, payments and the support contact. Read-only, never secret.
 */
const db = require('../config/database');
const settings = require('../models/settings');
const quota = require('../services/quota');
const money = require('../utils/money');

exports.info = async (req, res) => {
  const s = await settings.loadAll();
  const [services, stats, plans, limits, premium, otpsToday] = await Promise.all([
    db.query(`SELECT s.id, s.country_code, s.country_name, s.app_code, s.app_name, s.status,
                COALESCE(s.manual_available, (SELECT COUNT(*) FROM authorized_resources r WHERE r.service_id = s.id AND r.status = 'available')) AS available
              FROM services s WHERE s.status = 'active' ORDER BY s.sort_order, s.id`),
    // Success rate = numbers taken in the last 24 h that received an OTP.
    db.query(`SELECT service_id, COUNT(*) AS taken, SUM(last_code IS NOT NULL) AS hit
              FROM resource_assignments WHERE assigned_at > UTC_TIMESTAMP() - INTERVAL 1 DAY GROUP BY service_id`),
    db.query("SELECT name, duration_days, price, hourly_limit, daily_limit FROM premium_plans WHERE status = 'active' ORDER BY sort_order, price"),
    quota.limitsFor(req.user.id),
    quota.activePremium(req.user.id),
    db.one('SELECT COUNT(*) AS n FROM event_records WHERE received_at > UTC_TIMESTAMP() - INTERVAL 1 DAY'),
  ]);
  const st = new Map(stats.map((x) => [x.service_id, x]));
  res.json({
    ok: true,
    ranges: services.map((x) => {
      const t = st.get(x.id);
      const taken = Number(t?.taken || 0);
      return {
        code: `${x.country_code} ${x.app_code}`, name: `${x.country_name} ${x.app_name}`, available: Number(x.available) > 0,
        taken_24h: taken, success_rate: taken ? Math.round((Number(t.hit) / taken) * 100) : null,
      };
    }),
    otps_24h: Number(otpsToday?.n || 0),
    plans: plans.map((p) => ({ name: p.name, days: p.duration_days, price: money.display(p.price), hourly: p.hourly_limit, daily: p.daily_limit })),
    limits: { hourly: limits.hourly_limit, daily: limits.daily_limit, hour_used: limits.hour_used, day_used: limits.day_used },
    premium: premium ? { plan: premium.plan_name, expires_at: premium.expires_at } : null,
    return_minutes: Number(s.assignment_timeout_minutes) || 10,
    min_withdrawal: s.min_withdrawal, currency: s.currency_symbol || '$',
    payments: { trc20: !!s.trc20_address, binance: !!(s.binance_uid || s.binance_pay_link) },
    support: { whatsapp: s.support_whatsapp || '', note: s.support_contact_note || '' },
  });
};
