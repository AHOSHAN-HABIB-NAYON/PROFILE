'use strict';
const db = require('../../config/database');
const realtime = require('../../services/realtime');
const demo = require('../../services/demoGenerator');
const money = require('../../utils/money');

exports.stats = async (req, res) => {
  const [[users], [resources], [events], [demoRow], providers, [payments], [withdrawals], [premium], [news], [notifs], [wallets], series] = await Promise.all([
    db.query(`SELECT COUNT(*) AS total, SUM(status = 'suspended') AS suspended, SUM(status = 'pending') AS pending, SUM(last_active_at > UTC_TIMESTAMP() - INTERVAL 5 MINUTE) AS online,
              SUM(created_at > UTC_TIMESTAMP() - INTERVAL 1 DAY) AS new_today FROM users`),
    db.query(`SELECT COUNT(*) AS total, SUM(status = 'available') AS available, SUM(status = 'assigned') AS assigned FROM authorized_resources`),
    db.query(`SELECT COUNT(*) AS total, SUM(status = 'received') AS live, SUM(received_at > UTC_TIMESTAMP() - INTERVAL 1 DAY) AS today FROM event_records`),
    db.query(`SELECT COUNT(*) AS live FROM demo_event_logs WHERE status = 'DEMO'`),
    db.query('SELECT id, name, enabled, health_status, last_checked_at, last_error FROM api_providers ORDER BY id'),
    db.query(`SELECT SUM(status = 'pending') AS pending, SUM(status = 'approved') AS approved, COALESCE(SUM(IF(status = 'approved', amount, 0)), 0) AS revenue FROM payments`),
    db.query(`SELECT SUM(status IN ('pending','waiting_admin')) AS pending, SUM(status = 'approved') AS approved, COALESCE(SUM(IF(status = 'paid', amount, 0)), 0) AS paid FROM withdrawals`),
    db.query(`SELECT COUNT(DISTINCT user_id) AS active FROM user_premium WHERE status = 'active' AND expires_at > UTC_TIMESTAMP()`),
    db.query(`SELECT COUNT(*) AS total, SUM(status = 'published') AS published FROM news_posts`),
    db.query(`SELECT COUNT(*) AS total, SUM(is_read = 0) AS unread FROM notifications`),
    db.query(`SELECT COALESCE(SUM(balance), 0) AS liabilities FROM wallets`),
    db.query(`SELECT DATE(created_at) AS d, COUNT(*) AS n FROM users WHERE created_at >= UTC_DATE() - INTERVAL 13 DAY GROUP BY d`),
  ]);
  const n = (x) => Number(x || 0);
  res.json({
    ok: true,
    users: { total: n(users.total), online: n(users.online), sockets: realtime.onlineCount(), suspended: n(users.suspended), pending: n(users.pending), new_today: n(users.new_today) },
    resources: { total: n(resources.total), available: n(resources.available), assigned: n(resources.assigned) },
    events: { total: n(events.total), live: n(events.live), today: n(events.today), demo_live: n(demoRow.live), demo_running: demo.status().running },
    providers,
    payments: { pending: n(payments.pending), approved: n(payments.approved), revenue: money.display(payments.revenue) },
    withdrawals: { pending: n(withdrawals.pending), approved: n(withdrawals.approved), paid: money.display(withdrawals.paid) },
    premium: { active: n(premium.active) },
    news: { total: n(news.total), published: n(news.published) },
    notifications: { total: n(notifs.total), unread: n(notifs.unread) },
    wallets: { liabilities: money.display(wallets.liabilities) },
    signups: series.map((r) => ({ d: new Date(r.d).toISOString().slice(0, 10), n: n(r.n) })),
  });
};
