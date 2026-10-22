// Read-only project data. Every approved member sees all of this (the project is transparent).
// Private member details (email, phone, address, payout accounts) are never returned here.
const express = require('express');
const { query, one, getSetting } = require('../db');
const {
  ah, page, coin, date, oneOf, month,
} = require('../lib/util');
const { requireReady, publicUser } = require('../lib/auth');
const stats = require('../lib/stats');

const router = express.Router();
router.use(requireReady);

router.get('/summary', ah(async (req, res) => {
  const m = await stats.thisMonth();
  const [schedule, balances, profit, investments, coinLoans, users, recent, myPayment, payStatus] = await Promise.all([
    one('SELECT month, pay_date, note FROM payment_schedule WHERE month = ?', [m]),
    stats.balances(),
    stats.profitPeriods(),
    stats.openInvestments(),
    stats.openCoinLoans(),
    one("SELECT COUNT(*) AS n FROM users WHERE status IN ('active','restricted')"),
    query('SELECT id, coin, side, profit, fee, traded_at FROM trades WHERE traded_at >= CURDATE() ORDER BY traded_at DESC LIMIT 20'),
    one('SELECT month, amount, status, method, paid_at FROM payments WHERE user_id = ? AND month = ?', [req.user.id, m]),
    one("SELECT SUM(status = 'paid') AS paid, SUM(status = 'pending') AS pending FROM payments WHERE month = ?", [m]),
  ]);
  res.json({
    month: m,
    schedule,
    balances,
    profit,
    investments,
    coin_loans: coinLoans,
    total_users: users.n,
    recent,
    my_payment: myPayment,
    payment_status: { paid: Number(payStatus.paid || 0), pending: Number(payStatus.pending || 0) },
    watchlist: await stats.watchlist(),
  });
}));

router.get('/coins', ah(async (_req, res) => {
  res.json({ watchlist: await stats.watchlist() });
}));

function tradeFilters(req) {
  const where = ['1 = 1'];
  const params = [];
  if (req.query.coin) { where.push('coin = ?'); params.push(coin(req.query.coin)); }
  if (req.query.from) { where.push('traded_at >= ?'); params.push(date(req.query.from, { field: 'From' })); }
  if (req.query.to) { where.push('traded_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(date(req.query.to, { field: 'To' })); }
  if (req.query.result) {
    oneOf(req.query.result, ['profit', 'loss'], 'Result');
    where.push(req.query.result === 'profit' ? 'profit - fee >= 0' : 'profit - fee < 0');
  }
  return { sql: where.join(' AND '), params };
}

router.get('/trades', ah(async (req, res) => {
  const { limit, offset, page: p } = page(req);
  const f = tradeFilters(req);
  const [rows, total, sums] = await Promise.all([
    query(`SELECT id, coin, side, profit, fee, traded_at, note FROM trades WHERE ${f.sql} ORDER BY traded_at DESC, id DESC LIMIT ? OFFSET ?`, [...f.params, limit, offset]),
    one(`SELECT COUNT(*) AS n FROM trades WHERE ${f.sql}`, f.params),
    stats.pnl(f.sql, f.params),
  ]);
  res.json({ rows, total: total.n, page: p, limit, sums });
}));

router.get('/trades.csv', ah(async (req, res) => {
  const f = tradeFilters(req);
  const rows = await query(`SELECT traded_at, coin, side, profit, fee, profit - fee AS net, note FROM trades WHERE ${f.sql} ORDER BY traded_at DESC LIMIT 50000`, f.params);
  // Prefix cells that start with formula characters so spreadsheets do not execute them.
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = ['Date,Coin,Side,Profit (USD),Fee (USD),Net (USD),Note', ...rows.map((r) => [r.traded_at, r.coin, r.side, r.profit, r.fee, r.net.toFixed(2), r.note].map(cell).join(','))];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="oryzenx-trade-history.csv"');
  res.send(`${lines.join('\n')}\n`);
}));

router.get('/trading', ah(async (_req, res) => {
  const [profit, balances, byCoin] = await Promise.all([
    stats.profitPeriods(),
    stats.balances(),
    query(`SELECT coin, COUNT(*) AS trades, SUM(profit - fee) AS net, MAX(traded_at) AS last_trade
             FROM trades GROUP BY coin ORDER BY last_trade DESC LIMIT 50`),
  ]);
  res.json({ profit, balances, by_coin: byCoin });
}));

router.get('/investments', ah(async (_req, res) => {
  const m = await stats.thisMonth();
  const [rows, monthPnl, salaries, balances] = await Promise.all([
    query('SELECT id, coin, quantity, entry_price, invested_at, status, note FROM investments ORDER BY status, invested_at DESC, id DESC'),
    stats.pnl("DATE_FORMAT(traded_at, '%Y-%m') = ?", [m]),
    one(`SELECT COALESCE(SUM(salary), 0) AS total FROM users WHERE status IN ('active','restricted')`),
    stats.balances(),
  ]);
  // Reinvest rule: this month's net trading profit minus everyone's monthly salary.
  res.json({
    rows,
    balances,
    reinvest: {
      month: m, net_profit: monthPnl.net, salaries: salaries.total,
      reinvest: Math.max(0, monthPnl.net - salaries.total),
    },
  });
}));

router.get('/loans', ah(async (_req, res) => {
  res.json({
    rows: await query(
      'SELECT id, kind, coin, quantity, entry_price, amount_usd, remaining_usd, lender, borrowed_at, repay_date, status, note FROM loans ORDER BY status, repay_date IS NULL, repay_date, id DESC',
    ),
  });
}));

router.get('/members', ah(async (_req, res) => {
  const m = await stats.thisMonth();
  const users = await query("SELECT * FROM users WHERE status IN ('active','restricted') ORDER BY created_at");
  const paid = await query("SELECT user_id, SUM(amount) AS total FROM payments WHERE status = 'paid' GROUP BY user_id");
  const cur = await query('SELECT user_id, status, amount, paid_at, method FROM payments WHERE month = ?', [m]);
  const paidBy = Object.fromEntries(paid.map((r) => [r.user_id, r.total]));
  const curBy = Object.fromEntries(cur.map((r) => [r.user_id, r]));
  res.json({
    month: m,
    rows: users.map((u) => ({ ...publicUser(u), total_paid: paidBy[u.id] || 0, this_month: curBy[u.id] || null })),
  });
}));

// Payment status list for a month: who is paid and who is pending.
router.get('/payments', ah(async (req, res) => {
  const m = req.query.month ? month(req.query.month) : await stats.thisMonth();
  const [schedule, rows] = await Promise.all([
    one('SELECT month, pay_date, note FROM payment_schedule WHERE month = ?', [m]),
    query(`SELECT p.id, p.user_id, u.name, u.avatar_url, p.amount, p.status, p.method, p.paid_at
             FROM payments p JOIN users u ON u.id = p.user_id WHERE p.month = ? ORDER BY p.status DESC, u.name`, [m]),
  ]);
  res.json({ month: m, schedule, rows });
}));

router.get('/payments/history', ah(async (req, res) => {
  const userId = Number(req.query.user_id) || req.user.id;
  const rows = await query('SELECT id, month, amount, status, method, paid_at, note FROM payments WHERE user_id = ? ORDER BY month DESC LIMIT 120', [userId]);
  const total = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + r.amount, 0);
  res.json({ rows, total_paid: total });
}));

router.get('/schedule', ah(async (_req, res) => {
  res.json({ rows: await query('SELECT month, pay_date, note FROM payment_schedule ORDER BY month DESC LIMIT 24') });
}));

router.get('/method-logos', ah(async (_req, res) => {
  res.json({ logos: await getSetting('method_logos', {}) });
}));

router.get('/notifications', ah(async (req, res) => {
  const rows = await query(
    'SELECT id, title, body, created_at FROM notifications WHERE user_id IS NULL OR user_id = ? ORDER BY id DESC LIMIT 50', [req.user.id],
  );
  const r = await one('SELECT last_read_id FROM notification_reads WHERE user_id = ?', [req.user.id]);
  const last = r?.last_read_id || 0;
  res.json({ rows, unread: rows.filter((n) => n.id > last).length, last_read_id: last });
}));

router.post('/notifications/read', ah(async (req, res) => {
  const top = await one('SELECT COALESCE(MAX(id), 0) AS id FROM notifications WHERE user_id IS NULL OR user_id = ?', [req.user.id]);
  await query('INSERT INTO notification_reads (user_id, last_read_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_read_id = VALUES(last_read_id)', [req.user.id, top.id]);
  res.json({ ok: true });
}));

module.exports = router;
