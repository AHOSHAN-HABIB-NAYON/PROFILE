'use strict';
/** Premium plans, payments (TRC20 / Binance Pay / wallet) and withdrawals. */
const QRCode = require('qrcode');
const db = require('../config/database');
const settings = require('../models/settings');
const wallet = require('../models/wallet');
const audit = require('../models/auditLog');
const premium = require('../services/premium');
const quota = require('../services/quota');
const fileStorage = require('../services/fileStorage');
const realtime = require('../services/realtime');
const mailer = require('../services/mailer');
const money = require('../utils/money');
const v = require('../utils/validate');
const { E } = require('../utils/errors');
const { paginate, meta } = require('../utils/pagination');

const qrCache = new Map();
async function qr(text) {
  if (!text) return null;
  if (!qrCache.has(text)) qrCache.set(text, await QRCode.toDataURL(text, { margin: 1, width: 240 }));
  return qrCache.get(text);
}

async function paymentMethods() {
  const s = await settings.loadAll();
  return {
    trc20: s.trc20_address ? { address: s.trc20_address, note: s.trc20_network_note, qr: await qr(s.trc20_address) } : null,
    binance: s.binance_uid ? {
      uid: s.binance_uid, name: s.binance_name, link: /^https:\/\//.test(s.binance_pay_link) ? s.binance_pay_link : '',
      qr: s.binance_qr_url || (await qr(s.binance_pay_link || s.binance_uid)),
    } : null,
    upload_max_mb: Number(s.upload_max_mb) || 5,
  };
}

exports.overview = async (req, res) => {
  const [plans, limits, methods, payments] = await Promise.all([
    db.query("SELECT id, name, description, duration_days, price, resource_limit, hourly_limit, daily_limit, is_featured FROM premium_plans WHERE status = 'active' ORDER BY sort_order, price"),
    quota.limitsFor(req.user.id),
    paymentMethods(),
    db.query(
      `SELECT p.id, p.method, p.amount, p.status, p.transaction_ref, p.admin_note, p.created_at, pl.name AS plan_name
       FROM payments p LEFT JOIN premium_plans pl ON pl.id = p.plan_id WHERE p.user_id = ? ORDER BY p.id DESC LIMIT 10`, [req.user.id],
    ),
  ]);
  res.json({ ok: true, plans, limits, methods, payments });
};

exports.buyWithWallet = async (req, res) => {
  const planId = v.id(req.body.plan_id, 'plan_id');
  const out = await db.transaction(async (tx) => {
    const plan = await tx.one("SELECT * FROM premium_plans WHERE id = ? AND status = 'active'", [planId]);
    if (!plan) throw E.notFound('Plan not found');
    const pay = await tx.run(
      "INSERT INTO payments (user_id, plan_id, method, amount, status, reviewed_at) VALUES (?,?, 'wallet', ?, 'approved', UTC_TIMESTAMP())",
      [req.user.id, plan.id, plan.price],
    );
    const t = await wallet.apply(tx, req.user.id, money.neg(plan.price), { type: 'debit', description: `Premium · ${plan.name}`, paymentId: pay.insertId });
    const act = await premium.activate(tx, req.user.id, plan, { paymentId: pay.insertId, notify: false });
    return { balance: t.balance, expires_at: act.expires_at, plan: plan.name };
  });
  wallet.emitBalance(req.user.id, out.balance);
  await audit.log(req, 'premium.purchase_wallet', { category: 'system', targetType: 'plan', targetId: planId });
  res.json({ ok: true, message: `${out.plan} activated`, ...out });
};

exports.submitPayment = async (req, res) => {
  const planId = v.id(req.body.plan_id, 'plan_id');
  const method = v.oneOf(req.body.method, ['trc20', 'binance'], { name: 'Payment method' });
  const ref = v.str(req.body.transaction_ref, { name: 'Transaction ID / reference', max: 190, pattern: /^[\w\-:.#/ ]+$/ });
  const plan = await db.one("SELECT * FROM premium_plans WHERE id = ? AND status = 'active'", [planId]);
  if (!plan) throw E.notFound('Plan not found');
  if (!req.file && !ref) throw E.badRequest('Please upload a payment screenshot or enter the transaction ID');
  const pending = await db.one("SELECT COUNT(*) AS n FROM payments WHERE user_id = ? AND status = 'pending'", [req.user.id]);
  if (pending.n >= 3) throw E.tooMany('You already have payments waiting for review');
  let fileId = null;
  if (req.file) {
    const saved = await fileStorage.saveImage(req.file, { userId: req.user.id, purpose: 'payment_screenshot', visibility: 'private', maxWidth: 1600 });
    fileId = saved.id;
  }
  const r = await db.run(
    'INSERT INTO payments (user_id, plan_id, method, amount, transaction_ref, screenshot_file_id) VALUES (?,?,?,?,?,?)',
    [req.user.id, plan.id, method, plan.price, ref || null, fileId],
  );
  realtime.toAdmins('admin:payment', { id: r.insertId });
  await audit.log(req, 'payment.submitted', { category: 'system', targetType: 'payment', targetId: r.insertId });
  res.status(201).json({ ok: true, message: 'Payment submitted! We will verify it shortly.', id: r.insertId });
};

exports.myPayments = async (req, res) => {
  const p = paginate(req.query, { defaultSize: 30 });
  const [items, [{ n }]] = await Promise.all([
    db.query(`SELECT p.id, p.method, p.amount, p.status, p.transaction_ref, p.admin_note, p.created_at, pl.name AS plan_name
              FROM payments p LEFT JOIN premium_plans pl ON pl.id = p.plan_id WHERE p.user_id = ? ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    [req.user.id, p.size, p.offset]),
    db.query('SELECT COUNT(*) AS n FROM payments WHERE user_id = ?', [req.user.id]),
  ]);
  res.json({ ok: true, items, pagination: meta(n, p) });
};

// ---------------------------------------------------------------- withdrawals
exports.withdrawals = async (req, res) => {
  const p = paginate(req.query, { defaultSize: 30 });
  const [items, [{ n }], w] = await Promise.all([
    db.query('SELECT id, amount, binance_uid, status, admin_note, created_at, reviewed_at, paid_at FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?',
      [req.user.id, p.size, p.offset]),
    db.query('SELECT COUNT(*) AS n FROM withdrawals WHERE user_id = ?', [req.user.id]),
    db.one('SELECT balance FROM wallets WHERE user_id = ?', [req.user.id]),
  ]);
  res.json({
    ok: true,
    balance: money.normalize(w?.balance || '0'),
    display: money.display(w?.balance || '0'),
    min_withdrawal: money.normalize(await settings.get('min_withdrawal')),
    binance_uid: req.user.binance_uid || '',
    items: items.map((i) => ({ ...i, amount: money.normalize(i.amount) })),
    pagination: meta(n, p),
  });
};

exports.requestWithdrawal = async (req, res) => {
  const amountRaw = String(req.body.amount ?? '').trim();
  if (!money.isMoney(amountRaw) || money.cmp(amountRaw, '0') <= 0) throw E.badRequest('Enter a valid amount');
  const amount = money.normalize(amountRaw);
  const uid = v.str(req.body.binance_uid, { name: 'Binance UID', required: true, max: 64, pattern: /^\d{5,20}$/ });
  const min = await settings.get('min_withdrawal');
  if (money.cmp(amount, min) < 0) throw E.badRequest(`Minimum withdrawal is $${money.display(min)}`);
  const out = await db.transaction(async (tx) => {
    const open = await tx.one("SELECT COUNT(*) AS n FROM withdrawals WHERE user_id = ? AND status IN ('pending','waiting_admin','approved')", [req.user.id]);
    if (open.n > 0) throw E.conflict('You already have a withdrawal in progress');
    const w = await tx.run("INSERT INTO withdrawals (user_id, amount, binance_uid, status) VALUES (?,?,?, 'waiting_admin')", [req.user.id, amount, uid]);
    // Funds are held immediately (debited) and refunded if the request is rejected.
    const t = await wallet.apply(tx, req.user.id, money.neg(amount), {
      type: 'withdraw', description: `Withdrawal #${w.insertId} to Binance ${uid}`, status: 'pending', withdrawalId: w.insertId,
    });
    await tx.run('UPDATE users SET binance_uid = ? WHERE id = ?', [uid, req.user.id]);
    return { id: w.insertId, balance: t.balance };
  });
  wallet.emitBalance(req.user.id, out.balance);
  realtime.toAdmins('admin:withdrawal', { id: out.id });
  await audit.log(req, 'withdrawal.requested', { category: 'system', targetType: 'withdrawal', targetId: out.id, details: { amount } });
  mailer.send({ to: req.user.email, subject: 'Withdrawal request received', title: 'Withdrawal requested', text: `We received your withdrawal request of $${money.display(amount)} to Binance UID ${uid}. You will be notified when it is processed.` }).catch(() => {});
  res.status(201).json({ ok: true, message: 'Withdrawal requested', ...out });
};

exports.paymentMethods = paymentMethods;
