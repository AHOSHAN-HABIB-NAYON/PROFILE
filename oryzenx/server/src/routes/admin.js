// Admin-only endpoints. Every change is recorded in the audit log.
const express = require('express');
const config = require('../config');
const {
  query, one, getSetting, setSetting,
} = require('../db');
const {
  ah, bad, HttpError, str, num, date, datetime, coin, oneOf, month, page, randomToken, EMAIL_RE, money,
} = require('../lib/util');
const {
  requireAdmin, requireSuperAdmin, privateUser,
} = require('../lib/auth');
const { EMAIL_TYPES, sendEmail, esc } = require('../lib/mail');
const { saveDataUrl, removeUpload } = require('../lib/uploads');
const notify = require('../lib/notify');
const audit = require('../lib/audit');
const { activate } = require('./auth');
const { METHOD_TYPES, METHOD_NAMES } = require('./me');

const router = express.Router();
router.use(requireAdmin);

const fmtDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
function ordinal(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
}

async function activeUsers() {
  return query("SELECT * FROM users WHERE status IN ('active','restricted')");
}

async function getUserOr404(id) {
  const u = await one('SELECT * FROM users WHERE id = ?', [Number(id)]);
  if (!u) throw new HttpError(404, 'User not found');
  return u;
}

// ---------- Overview ----------

router.get('/overview', ah(async (_req, res) => {
  const m = (await one("SELECT DATE_FORMAT(CURDATE(), '%Y-%m') AS m")).m;
  const [users, kyc, pay, sched, emails, trades, logins] = await Promise.all([
    one(`SELECT SUM(status IN ('active','restricted')) AS active, SUM(status = 'pending') AS pending,
                SUM(status = 'disabled') AS disabled, COUNT(*) AS total FROM users`),
    one("SELECT SUM(kyc_status IN ('submitted','review')) AS pending, SUM(kyc_status = 'review') AS review, SUM(reverify_reason IS NOT NULL AND status = 'restricted') AS held FROM users"),
    one("SELECT SUM(status = 'paid') AS paid, SUM(status = 'pending') AS pending, COALESCE(SUM(IF(status = 'pending', amount, 0)), 0) AS due FROM payments WHERE month = ?", [m]),
    one('SELECT pay_date FROM payment_schedule WHERE month = ?', [m]),
    one("SELECT SUM(status = 'failed') AS failed, SUM(status = 'queued') AS queued FROM email_queue WHERE created_at >= NOW() - INTERVAL 7 DAY"),
    one('SELECT COUNT(*) AS n, COALESCE(SUM(profit - fee), 0) AS net FROM trades WHERE traded_at >= CURDATE()'),
    one('SELECT SUM(success = 0) AS failed FROM login_events WHERE created_at >= NOW() - INTERVAL 1 DAY'),
  ]);
  const n = (v) => Number(v || 0);
  res.json({
    month: m,
    pay_date: sched?.pay_date || null,
    users: { active: n(users.active), pending: n(users.pending), disabled: n(users.disabled), total: n(users.total) },
    kyc: { pending: n(kyc.pending), review: n(kyc.review), held: n(kyc.held) },
    payments: { paid: n(pay.paid), pending: n(pay.pending), due: n(pay.due) },
    emails: { failed: n(emails.failed), queued: n(emails.queued) },
    trades_today: { count: n(trades.n), net: n(trades.net) },
    failed_logins_24h: n(logins.failed),
  });
}));

// ---------- Users ----------

router.get('/users', ah(async (req, res) => {
  const where = req.query.status ? 'WHERE status = ?' : '';
  const users = await query(`SELECT * FROM users ${where} ORDER BY status = 'pending' DESC, created_at DESC`, req.query.status ? [req.query.status] : []);
  const methods = await query('SELECT user_id, type, account, holder, network, is_default FROM payment_methods');
  res.json({
    rows: users.map((u) => ({
      ...privateUser(u),
      payment_methods: methods.filter((m) => m.user_id === u.id),
    })),
  });
}));

router.post('/users/:id/approve', ah(async (req, res) => {
  const u = await getUserOr404(req.params.id);
  if (u.status !== 'pending') throw bad('This user is not waiting for approval');
  // New members get the group's standard deposit terms unless an admin already set them.
  const def = await getSetting('default_deposit', null);
  if (def && !u.deposit_amount) {
    await query('UPDATE users SET deposit_amount = ?, deposit_date = COALESCE(deposit_date, ?) WHERE id = ?', [def.amount || 0, def.date || null, u.id]);
  }
  await activate(u);
  await notify(u.id, 'Account approved', 'Welcome! Your account has been approved by an admin.');
  await audit(req, 'user_approve', 'user', u.id);
  res.json({ ok: true });
}));

router.put('/users/:id', ah(async (req, res) => {
  const u = await getUserOr404(req.params.id);
  const b = req.body;
  const next = {
    name: b.name !== undefined ? str(b.name, { field: 'Name', min: 2, max: 120, required: true }) : u.name,
    phone: b.phone !== undefined ? str(b.phone, { field: 'Phone', max: 40 }) : u.phone,
    address: b.address !== undefined ? str(b.address, { field: 'Address', max: 255 }) : u.address,
    deposit_amount: b.deposit_amount !== undefined ? num(b.deposit_amount, { field: 'Deposit amount', min: 0, required: true }) : u.deposit_amount,
    deposit_date: b.deposit_date !== undefined ? date(b.deposit_date, { field: 'Deposit date' }) : u.deposit_date,
    salary: b.salary !== undefined ? num(b.salary, { field: 'Salary', min: 0, required: true }) : u.salary,
    status: b.status !== undefined ? oneOf(b.status, ['pending', 'active', 'restricted', 'disabled'], 'Status') : u.status,
  };
  if (u.id === req.user.id && next.status !== 'active') throw bad('You cannot restrict or disable your own account');
  if (u.role === 'super_admin' && req.user.role !== 'super_admin') throw new HttpError(403, 'Only a Super Admin can edit a Super Admin');
  await query(
    `UPDATE users SET name = ?, phone = ?, address = ?, deposit_amount = ?, deposit_date = ?, salary = ?, status = ?,
       token_version = token_version + ? WHERE id = ?`,
    [next.name, next.phone, next.address, next.deposit_amount, next.deposit_date, next.salary, next.status,
      next.status === 'disabled' && u.status !== 'disabled' ? 1 : 0, u.id],
  );
  const changes = Object.fromEntries(Object.entries(next).filter(([k, v]) => String(u[k] ?? '') !== String(v ?? '')).map(([k, v]) => [k, { from: u[k], to: v }]));
  if (changes.deposit_amount || changes.deposit_date) {
    await sendEmail(u, 'deposit', {
      subject: 'Your deposit details were updated',
      title: 'Deposit details',
      body: `Your deposit amount is <b>${money(next.deposit_amount)}</b>${next.deposit_date ? `, due by <b>${fmtDate(next.deposit_date)}</b>` : ''}.`,
    });
  }
  if (changes.status && next.status === 'active' && u.status === 'pending') await activate(u);
  await audit(req, 'user_update', 'user', u.id, changes);
  res.json({ ok: true });
}));

router.put('/users/:id/role', requireSuperAdmin, ah(async (req, res) => {
  const u = await getUserOr404(req.params.id);
  const role = oneOf(req.body.role, ['super_admin', 'admin', 'user'], 'Role');
  if (u.id === req.user.id) throw bad('You cannot change your own role');
  await query('UPDATE users SET role = ? WHERE id = ?', [role, u.id]);
  await audit(req, 'user_role', 'user', u.id, { from: u.role, to: role });
  res.json({ ok: true });
}));

router.post('/users/:id/deposit-received', ah(async (req, res) => {
  const u = await getUserOr404(req.params.id);
  const received = req.body.received !== false;
  await query('UPDATE users SET deposit_received_at = IF(?, NOW(), NULL) WHERE id = ?', [received ? 1 : 0, u.id]);
  if (received) {
    await sendEmail(u, 'deposit', {
      subject: 'Deposit received', title: 'Your deposit was received',
      body: `Thanks, ${esc(u.name)}! Your deposit of <b>${money(u.deposit_amount)}</b> has been received and approved.`,
    });
    await notify(u.id, 'Deposit received', `Your deposit of ${money(u.deposit_amount)} was received.`);
  }
  await audit(req, received ? 'deposit_received' : 'deposit_unmark', 'user', u.id);
  res.json({ ok: true });
}));

// ---------- Invites ----------

router.get('/invites', ah(async (_req, res) => {
  res.json({
    rows: await query(`SELECT i.*, u.name AS used_by_name FROM invites i LEFT JOIN users u ON u.id = i.used_by ORDER BY i.id DESC LIMIT 100`),
  });
}));

router.post('/invites', ah(async (req, res) => {
  const email = str(req.body.email, { field: 'Email', max: 190 });
  if (email && !EMAIL_RE.test(email)) throw bad('Enter a valid email address');
  const days = num(req.body.days, { field: 'Days', min: 1, max: 365 }) || 14;
  const code = randomToken(6).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8).padEnd(8, 'X');
  await query('INSERT INTO invites (code, email, created_by, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))', [code, email?.toLowerCase() || null, req.user.id, days]);
  await audit(req, 'invite_create', 'invite', code, { email });
  res.status(201).json({ code, link: `${config.appUrl}/#/signup?invite=${code}` });
}));

router.delete('/invites/:code', ah(async (req, res) => {
  await query('DELETE FROM invites WHERE code = ? AND used_by IS NULL', [req.params.code]);
  await audit(req, 'invite_delete', 'invite', req.params.code);
  res.json({ ok: true });
}));

// ---------- Trades, investments, loans (simple CRUD) ----------

const resources = {
  trades: {
    parse: (b) => ({
      coin: coin(b.coin),
      side: oneOf(b.side || 'spot', ['long', 'short', 'spot'], 'Side'),
      profit: num(b.profit, { field: 'Profit', required: true }),
      fee: num(b.fee, { field: 'Fee', min: 0 }) || 0,
      traded_at: datetime(b.traded_at, { field: 'Trade date', required: true }),
      note: str(b.note, { field: 'Note', max: 255 }),
    }),
    after: async (row, created) => {
      if (created) await notify(null, `New trade: ${row.coin}`, `${row.profit - row.fee >= 0 ? 'Profit' : 'Loss'} ${money(Math.abs(row.profit - row.fee))} on ${row.coin}.`);
    },
  },
  investments: {
    parse: (b) => ({
      coin: coin(b.coin),
      quantity: num(b.quantity, { field: 'Quantity', min: 0, required: true }),
      entry_price: num(b.entry_price, { field: 'Entry price', min: 0, required: true }),
      invested_at: date(b.invested_at, { field: 'Date', required: true }),
      status: oneOf(b.status || 'open', ['open', 'closed'], 'Status'),
      note: str(b.note, { field: 'Note', max: 255 }),
    }),
  },
  loans: {
    parse: (b) => {
      const kind = oneOf(b.kind, ['coin', 'usd'], 'Loan type');
      const row = {
        kind,
        coin: kind === 'coin' ? coin(b.coin) : null,
        quantity: kind === 'coin' ? num(b.quantity, { field: 'Quantity', min: 0, required: true }) : null,
        entry_price: kind === 'coin' ? num(b.entry_price, { field: 'Price when borrowed', min: 0, required: true }) : null,
        amount_usd: num(b.amount_usd, { field: 'Amount', min: 0 }) || 0,
        remaining_usd: num(b.remaining_usd, { field: 'Remaining', min: 0 }),
        lender: str(b.lender, { field: 'Lender', max: 120 }),
        borrowed_at: date(b.borrowed_at, { field: 'Borrowed on', required: true }),
        repay_date: date(b.repay_date, { field: 'Repayment date' }),
        status: oneOf(b.status || 'open', ['open', 'repaid'], 'Status'),
        note: str(b.note, { field: 'Note', max: 255 }),
      };
      if (kind === 'coin' && !row.amount_usd) row.amount_usd = Math.round(row.quantity * row.entry_price * 100) / 100;
      if (row.remaining_usd === null) row.remaining_usd = row.amount_usd;
      if (row.status === 'repaid') row.remaining_usd = 0;
      return row;
    },
  },
};

for (const [table, def] of Object.entries(resources)) {
  router.post(`/${table}`, ah(async (req, res) => {
    const row = def.parse(req.body);
    const cols = Object.keys(row);
    const r = await query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, Object.values(row));
    await audit(req, `${table}_create`, table, r.insertId, row);
    if (def.after) await def.after(row, true);
    res.status(201).json({ id: r.insertId });
  }));

  router.put(`/${table}/:id`, ah(async (req, res) => {
    const before = await one(`SELECT * FROM ${table} WHERE id = ?`, [Number(req.params.id)]);
    if (!before) throw new HttpError(404, 'Not found');
    const row = def.parse(req.body);
    await query(`UPDATE ${table} SET ${Object.keys(row).map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...Object.values(row), before.id]);
    await audit(req, `${table}_update`, table, before.id, { before, after: row });
    res.json({ ok: true });
  }));

  router.delete(`/${table}/:id`, ah(async (req, res) => {
    const before = await one(`SELECT * FROM ${table} WHERE id = ?`, [Number(req.params.id)]);
    if (!before) throw new HttpError(404, 'Not found');
    await query(`DELETE FROM ${table} WHERE id = ?`, [before.id]);
    await audit(req, `${table}_delete`, table, before.id, { before });
    res.json({ ok: true });
  }));
}

// ---------- Settings ----------

router.get('/settings', ah(async (_req, res) => {
  res.json({
    balances: await getSetting('balances', { main_base: 0, trading_capital: 0 }),
    default_deposit: await getSetting('default_deposit', { amount: 0, date: null }),
    watchlist: await getSetting('watchlist', null),
    email_toggles: await getSetting('email_toggles', {}),
    email_types: EMAIL_TYPES,
    method_logos: await getSetting('method_logos', {}),
    push_enabled: require('../lib/push').enabled(),
  });
}));

router.put('/settings', ah(async (req, res) => {
  const b = req.body;
  const changed = {};
  if (b.balances) {
    const v = {
      main_base: num(b.balances.main_base, { field: 'Starting main balance', required: true }),
      trading_capital: num(b.balances.trading_capital, { field: 'Trading balance', min: 0, required: true }),
    };
    await setSetting('balances', v); changed.balances = v;
  }
  if (b.default_deposit) {
    const v = {
      amount: num(b.default_deposit.amount, { field: 'Deposit amount', min: 0, required: true }),
      date: date(b.default_deposit.date, { field: 'Deposit date' }),
    };
    await setSetting('default_deposit', v); changed.default_deposit = v;
    if (b.apply_deposit_to_all) {
      await query("UPDATE users SET deposit_amount = ?, deposit_date = ? WHERE status IN ('active','restricted','pending')", [v.amount, v.date]);
      changed.applied_to_all = true;
    }
  }
  if (b.watchlist) {
    const v = [...new Set((Array.isArray(b.watchlist) ? b.watchlist : String(b.watchlist).split(/[\s,]+/)).filter(Boolean).map((c) => coin(c)))].slice(0, 30);
    if (!v.length) throw bad('Add at least one coin');
    await setSetting('watchlist', v); changed.watchlist = v;
  }
  if (b.email_toggles) {
    const v = {};
    for (const k of Object.keys(EMAIL_TYPES)) if (!EMAIL_TYPES[k].locked) v[k] = b.email_toggles[k] !== false;
    await setSetting('email_toggles', v); changed.email_toggles = v;
  }
  await audit(req, 'settings_update', 'settings', null, changed);
  res.json({ ok: true });
}));

router.put('/method-logos/:type', ah(async (req, res) => {
  const type = oneOf(req.params.type, METHOD_TYPES, 'Method');
  const logos = await getSetting('method_logos', {});
  const url = await saveDataUrl(req.body.image, 'logos', {
    allow: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'], maxBytes: 200 * 1024, ownerId: req.user.id,
  });
  await removeUpload(logos[type]);
  logos[type] = url;
  await setSetting('method_logos', logos);
  await audit(req, 'method_logo_update', 'settings', type);
  res.json({ url });
}));

// ---------- Monthly payment date and payments ----------

// Create a pending payment row for every active member with a salary for the month.
async function ensurePayments(m) {
  await query(
    `INSERT IGNORE INTO payments (user_id, month, amount)
       SELECT id, ?, salary FROM users WHERE status IN ('active','restricted') AND salary > 0`, [m],
  );
}

router.put('/schedule', ah(async (req, res) => {
  const m = month(req.body.month);
  const payDate = date(req.body.pay_date, { field: 'Payment date', required: true });
  const note = str(req.body.note, { field: 'Note', max: 255 });
  const before = await one('SELECT * FROM payment_schedule WHERE month = ?', [m]);
  await query(
    `INSERT INTO payment_schedule (month, pay_date, note, set_by) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE pay_date = VALUES(pay_date), note = VALUES(note), set_by = VALUES(set_by)`,
    [m, payDate, note, req.user.id],
  );
  await ensurePayments(m);
  if (!before || before.pay_date !== payDate) {
    const day = ordinal(Number(payDate.slice(8, 10)));
    const delayed = before && payDate > before.pay_date;
    const title = before ? (delayed ? 'Payment rescheduled' : 'Payment date changed') : 'Payment date set';
    const text = before
      ? `This month's payment has moved from ${fmtDate(before.pay_date)} to ${fmtDate(payDate)}.`
      : `This month's salary will be paid on the ${day} (${fmtDate(payDate)}).`;
    await notify(null, title, text + (note ? ` ${note}` : ''));
    for (const u of await activeUsers()) {
      await sendEmail(u, delayed ? 'payment_delayed' : 'payment_date', {
        subject: `${title}: ${fmtDate(payDate)}`, title,
        body: `Hi ${esc(u.name)},<br>${esc(text)}${note ? `<br><i>${esc(note)}</i>` : ''}`,
      });
    }
  }
  await audit(req, 'schedule_set', 'schedule', m, { from: before?.pay_date || null, to: payDate, note });
  res.json({ ok: true });
}));

router.get('/payments', ah(async (req, res) => {
  const m = month(req.query.month);
  await ensurePayments(m);
  const rows = await query(
    `SELECT p.*, u.name, u.email FROM payments p JOIN users u ON u.id = p.user_id WHERE p.month = ? ORDER BY p.status DESC, u.name`, [m],
  );
  const methods = await query('SELECT user_id, type, account, holder, network, is_default FROM payment_methods');
  res.json({ rows: rows.map((r) => ({ ...r, payment_methods: methods.filter((x) => x.user_id === r.user_id) })) });
}));

router.put('/payments/:id', ah(async (req, res) => {
  const p = await one('SELECT * FROM payments WHERE id = ?', [Number(req.params.id)]);
  if (!p) throw new HttpError(404, 'Payment not found');
  const amount = num(req.body.amount, { field: 'Amount', min: 0, required: true });
  const note = str(req.body.note, { field: 'Note', max: 255 });
  await query('UPDATE payments SET amount = ?, note = ? WHERE id = ?', [amount, note, p.id]);
  await audit(req, 'payment_update', 'payment', p.id, { from: p.amount, to: amount, note });
  res.json({ ok: true });
}));

router.post('/payments/:id/paid', ah(async (req, res) => {
  const p = await one('SELECT * FROM payments WHERE id = ?', [Number(req.params.id)]);
  if (!p) throw new HttpError(404, 'Payment not found');
  const method = oneOf(req.body.method, METHOD_TYPES, 'Method');
  const paidAt = datetime(req.body.paid_at, { field: 'Paid on' });
  await query(
    "UPDATE payments SET status = 'paid', method = ?, paid_at = COALESCE(?, NOW()), marked_by = ?, note = COALESCE(?, note) WHERE id = ?",
    [method, paidAt, req.user.id, str(req.body.note, { field: 'Note', max: 255 }), p.id],
  );
  const fresh = await one('SELECT * FROM payments WHERE id = ?', [p.id]);
  const u = await getUserOr404(p.user_id);
  await notify(u.id, 'Payment sent', `${money(fresh.amount)} for ${fresh.month} was paid via ${METHOD_NAMES[method]}.`);
  await sendEmail(u, 'payment_paid', {
    subject: `Payment sent: ${money(fresh.amount)}`, title: 'Your payment was sent',
    body: `Hi ${esc(u.name)},<br>Your payment for <b>${fresh.month}</b> has been marked <b>Paid</b>.<br>
      <b>Amount:</b> ${money(fresh.amount)}<br><b>Date:</b> ${esc(fresh.paid_at)}<br><b>Method:</b> ${METHOD_NAMES[method]}`,
  });
  await audit(req, 'payment_paid', 'payment', p.id, { user_id: u.id, amount: fresh.amount, method });
  res.json({ ok: true });
}));

router.post('/payments/:id/unpaid', ah(async (req, res) => {
  const p = await one('SELECT * FROM payments WHERE id = ?', [Number(req.params.id)]);
  if (!p) throw new HttpError(404, 'Payment not found');
  await query("UPDATE payments SET status = 'pending', method = NULL, paid_at = NULL, marked_by = NULL WHERE id = ?", [p.id]);
  await audit(req, 'payment_unpaid', 'payment', p.id, { before: p });
  res.json({ ok: true });
}));

// ---------- Backup ----------

// Full database export (gzipped JSON) for safekeeping. Super Admin only. KYC files stay encrypted.
router.get('/backup', requireSuperAdmin, ah(async (req, res) => {
  const zlib = require('zlib');
  const tables = (await query('SHOW TABLES')).map((r) => Object.values(r)[0]);
  const dump = { app: 'OryzenX BD', created_at: new Date().toISOString(), tables: {} };
  for (const t of tables) dump.tables[t] = await query(`SELECT * FROM \`${t}\``);
  const json = JSON.stringify(dump, (_k, v) => (v && v.type === 'Buffer' && Array.isArray(v.data) ? { $b64: Buffer.from(v.data).toString('base64') } : v));
  await audit(req, 'backup_download', 'database', null, { tables: tables.length });
  res.set({
    'Content-Type': 'application/gzip',
    'Content-Disposition': `attachment; filename="oryzenx-backup-${new Date().toISOString().slice(0, 10)}.json.gz"`,
  });
  res.send(zlib.gzipSync(json));
}));

// ---------- Notifications and logs ----------

router.post('/notify', ah(async (req, res) => {
  const title = str(req.body.title, { field: 'Title', max: 160, required: true });
  const body = str(req.body.body, { field: 'Message', max: 500, required: true });
  await notify(null, title, body);
  await audit(req, 'broadcast', 'notification', null, { title });
  res.json({ ok: true });
}));

router.get('/audit', ah(async (req, res) => {
  const { limit, offset, page: p } = page(req, 50);
  const rows = await query(
    `SELECT a.*, u.name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT ? OFFSET ?`, [limit, offset],
  );
  res.json({ rows, page: p, limit });
}));

router.get('/emails', ah(async (req, res) => {
  const { limit, offset, page: p } = page(req, 50);
  const rows = await query(
    'SELECT id, to_email, type, subject, status, attempts, last_error, sent_at, created_at FROM email_queue ORDER BY id DESC LIMIT ? OFFSET ?', [limit, offset],
  );
  res.json({ rows, page: p, limit });
}));

router.get('/logins', ah(async (req, res) => {
  const { limit, offset, page: p } = page(req, 50);
  const rows = await query(
    `SELECT l.*, u.name FROM login_events l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT ? OFFSET ?`, [limit, offset],
  );
  res.json({ rows, page: p, limit });
}));

module.exports = { router, ensurePayments };
