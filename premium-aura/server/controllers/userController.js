'use strict';
/** Current user, dashboard and wallet endpoints. */
const db = require('../config/database');
const settings = require('../models/settings');
const User = require('../models/user');
const quota = require('../services/quota');
const money = require('../utils/money');
const { paginate, meta } = require('../utils/pagination');
const { ensureToken } = require('../middleware/csrf');

exports.me = async (req, res) => {
  const site = await settings.publicSettings();
  const csrfToken = ensureToken(req);
  if (!req.user) return res.json({ ok: true, user: null, site, csrfToken });
  const [wallet, unread, premium] = await Promise.all([
    db.one('SELECT balance FROM wallets WHERE user_id = ?', [req.user.id]),
    db.one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]),
    quota.activePremium(req.user.id),
  ]);
  res.json({
    ok: true,
    csrfToken,
    site,
    user: User.toPublic(req.user),
    wallet: { balance: money.normalize(wallet?.balance || '0'), display: money.display(wallet?.balance || '0') },
    unread: Number(unread.n),
    premium: premium ? { plan: premium.plan_name, expires_at: premium.expires_at } : null,
  });
};

function days(n) {
  const out = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    out.push(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i)).toISOString().slice(0, 10));
  }
  return out;
}

exports.dashboard = async (req, res) => {
  const uid = req.user.id;
  const [wallet, eventsTotal, limits, evSeries, resSeries, earnSeries, activity] = await Promise.all([
    db.one('SELECT balance, total_earned FROM wallets WHERE user_id = ?', [uid]),
    db.one("SELECT COUNT(*) AS n, SUM(received_at > UTC_TIMESTAMP() - INTERVAL 1 DAY) AS today FROM event_records WHERE user_id = ?", [uid]),
    quota.limitsFor(uid),
    db.query(`SELECT DATE(received_at) AS d, COUNT(*) AS n FROM event_records WHERE user_id = ? AND received_at >= UTC_DATE() - INTERVAL 6 DAY GROUP BY d`, [uid]),
    db.query(`SELECT DATE(assigned_at) AS d, COUNT(*) AS n FROM resource_assignments WHERE user_id = ? AND assigned_at >= UTC_DATE() - INTERVAL 6 DAY GROUP BY d`, [uid]),
    db.query(`SELECT DATE(created_at) AS d, SUM(amount) AS n FROM wallet_transactions WHERE user_id = ? AND type = 'credit' AND created_at >= UTC_DATE() - INTERVAL 6 DAY GROUP BY d`, [uid]),
    recentActivity(uid, 8),
  ]);
  const labels = days(7);
  const series = (rows, isMoney = false) => {
    const m = new Map(rows.map((r) => [new Date(r.d).toISOString().slice(0, 10), isMoney ? Number(r.n) : Number(r.n)]));
    return labels.map((l) => m.get(l) || 0);
  };
  res.json({
    ok: true,
    cards: {
      wallet: { balance: money.normalize(wallet?.balance || '0'), display: money.display(wallet?.balance || '0'), earned: money.display(wallet?.total_earned || '0') },
      events: { total: Number(eventsTotal.n), today: Number(eventsTotal.today || 0) },
      resources: { used: limits.quota_used, quota: limits.quota, label: limits.quota_label, total: limits.total_assigned },
      limit: { hourly: limits.hourly_limit, hour_used: limits.hour_used, daily: limits.daily_limit, day_used: limits.day_used, interval: limits.interval_seconds },
      premium: limits.premium ? { active: true, plan: limits.premium.plan, expires_at: limits.premium.expires_at } : { active: false },
    },
    chart: { labels, events: series(evSeries), resources: series(resSeries), earnings: series(earnSeries, true) },
    activity,
  });
};

async function recentActivity(uid, limit) {
  const rows = await db.query(
    `(SELECT 'event' AS type, CONCAT('New authorized event · ', application) AS title, CONCAT('Code received for ', COALESCE(country_code,'')) AS body, created_at FROM event_records WHERE user_id = ? ORDER BY id DESC LIMIT 5)
     UNION ALL
     (SELECT 'resource', 'Resource assigned', CONCAT(s.country_code, ' · ', s.app_name), a.assigned_at FROM resource_assignments a JOIN services s ON s.id = a.service_id WHERE a.user_id = ? ORDER BY a.id DESC LIMIT 5)
     UNION ALL
     (SELECT 'premium', CONCAT('Premium · ', plan_name), CONCAT('Valid until ', DATE_FORMAT(expires_at, '%Y-%m-%d')), created_at FROM user_premium WHERE user_id = ? ORDER BY id DESC LIMIT 3)
     UNION ALL
     (SELECT 'payment', CONCAT('Payment ', status), CONCAT('$', amount, ' via ', UPPER(method)), created_at FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 3)
     UNION ALL
     (SELECT 'withdrawal', CONCAT('Withdrawal ', REPLACE(status, '_', ' ')), CONCAT('$', FORMAT(amount, 2), ' to Binance'), created_at FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 3)
     UNION ALL
     (SELECT 'announcement', title, category, published_at FROM news_posts WHERE status = 'published' AND category IN ('announcement','update','maintenance') ORDER BY published_at DESC LIMIT 3)
     ORDER BY created_at DESC LIMIT ?`,
    [uid, uid, uid, uid, uid, limit],
  );
  return rows.map((r) => ({ ...r, created_at: r.created_at ? new Date(r.created_at).toISOString() : null }));
}

exports.wallet = async (req, res) => {
  const p = paginate(req.query, { defaultSize: 30 });
  const type = ['credit', 'debit', 'withdraw', 'refund', 'admin_adjustment'].includes(req.query.type) ? req.query.type : null;
  const where = type ? 'AND type = ?' : '';
  const params = type ? [req.user.id, type] : [req.user.id];
  const [w, rows, [{ n }]] = await Promise.all([
    db.one('SELECT balance, total_earned, total_withdrawn FROM wallets WHERE user_id = ?', [req.user.id]),
    db.query(`SELECT id, type, amount, balance_after, description, status, created_at FROM wallet_transactions WHERE user_id = ? ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, p.size, p.offset]),
    db.query(`SELECT COUNT(*) AS n FROM wallet_transactions WHERE user_id = ? ${where}`, params),
  ]);
  res.json({
    ok: true,
    wallet: {
      balance: money.normalize(w?.balance || '0'), display: money.display(w?.balance || '0'),
      earned: money.display(w?.total_earned || '0'), withdrawn: money.display(w?.total_withdrawn || '0'),
      reward: money.display(await settings.get('event_reward')), min_withdrawal: money.display(await settings.get('min_withdrawal')),
    },
    items: rows.map((r) => ({ ...r, amount: money.normalize(r.amount), balance_after: money.normalize(r.balance_after) })),
    pagination: meta(n, p),
  });
};

exports.recentActivity = recentActivity;
