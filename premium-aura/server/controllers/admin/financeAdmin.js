'use strict';
const db = require('../../config/database');
const audit = require('../../models/auditLog');
const wallet = require('../../models/wallet');
const notifications = require('../../models/notification');
const premium = require('../../services/premium');
const mailer = require('../../services/mailer');
const realtime = require('../../services/realtime');
const money = require('../../utils/money');
const v = require('../../utils/validate');
const { E } = require('../../utils/errors');
const { paginate, meta } = require('../../utils/pagination');

// ------------------------------------------------------------------ plans
function planInput(b) {
  const price = String(b.price ?? '').trim();
  if (!money.isMoney(price) || money.cmp(price, '0') < 0) throw E.badRequest('Enter a valid price');
  return {
    name: v.str(b.name, { name: 'Name', required: true, max: 80 }),
    description: v.str(b.description, { name: 'Description', max: 255 }) || null,
    duration_days: v.int(b.duration_days, { name: 'Duration (days)', min: 1, max: 3650 }),
    price: money.normalize(price).slice(0, -2),
    resource_limit: b.resource_limit === '' || b.resource_limit === null || b.resource_limit === undefined || v.bool(b.unlimited)
      ? null : v.int(b.resource_limit, { name: 'Limit', min: 1, max: 10_000_000 }),
    hourly_limit: b.hourly_limit === '' || b.hourly_limit === null || b.hourly_limit === undefined ? null : v.int(b.hourly_limit, { name: 'Hourly limit', min: 1, max: 1_000_000 }),
    daily_limit: b.daily_limit === '' || b.daily_limit === null || b.daily_limit === undefined ? null : v.int(b.daily_limit, { name: 'Daily limit', min: 1, max: 10_000_000 }),
    status: v.oneOf(b.status, ['active', 'inactive'], { def: 'active' }),
    is_featured: v.bool(b.is_featured) ? 1 : 0,
    sort_order: v.int(b.sort_order, { name: 'Sort order', min: -1000, max: 10000, def: 0 }),
  };
}

exports.plans = async (req, res) => {
  const rows = await db.query(`SELECT p.*, (SELECT COUNT(*) FROM user_premium u WHERE u.plan_id = p.id AND u.status = 'active' AND u.expires_at > UTC_TIMESTAMP()) AS active_members
                               FROM premium_plans p ORDER BY sort_order, id`);
  res.json({ ok: true, items: rows });
};
exports.createPlan = async (req, res) => {
  const d = planInput(req.body);
  const r = await db.run('INSERT INTO premium_plans SET ?', [d]);
  await audit.log(req, 'plan.create', { targetType: 'plan', targetId: r.insertId, details: d });
  res.status(201).json({ ok: true, id: r.insertId, message: 'Plan created' });
};
exports.updatePlan = async (req, res) => {
  const id = v.id(req.params.id);
  const d = planInput(req.body);
  const r = await db.run('UPDATE premium_plans SET ? WHERE id = ?', [d, id]);
  if (!r.affectedRows) throw E.notFound('Plan not found');
  await audit.log(req, 'plan.update', { targetType: 'plan', targetId: id, details: d });
  res.json({ ok: true, message: 'Plan saved' });
};
exports.deletePlan = async (req, res) => {
  const id = v.id(req.params.id);
  await db.run('DELETE FROM premium_plans WHERE id = ?', [id]);
  await audit.log(req, 'plan.delete', { targetType: 'plan', targetId: id });
  res.json({ ok: true, message: 'Plan deleted' });
};

// ------------------------------------------------------------------ payments
exports.payments = async (req, res) => {
  const p = paginate(req.query, { defaultSize: 30 });
  const where = ['1=1'];
  const params = [];
  if (['pending', 'approved', 'rejected'].includes(req.query.status)) { where.push('p.status = ?'); params.push(req.query.status); }
  if (['trc20', 'binance', 'wallet'].includes(req.query.method)) { where.push('p.method = ?'); params.push(req.query.method); }
  if (req.query.q) { where.push('(u.email LIKE ? OR p.transaction_ref LIKE ?)'); const q = `%${String(req.query.q).slice(0, 80)}%`; params.push(q, q); }
  const [items, [{ n }]] = await Promise.all([
    db.query(`SELECT p.*, u.email, u.name, pl.name AS plan_name FROM payments p JOIN users u ON u.id = p.user_id LEFT JOIN premium_plans pl ON pl.id = p.plan_id
              WHERE ${where.join(' AND ')} ORDER BY p.status = 'pending' DESC, p.id DESC LIMIT ? OFFSET ?`, [...params, p.size, p.offset]),
    db.query(`SELECT COUNT(*) AS n FROM payments p JOIN users u ON u.id = p.user_id WHERE ${where.join(' AND ')}`, params),
  ]);
  res.json({ ok: true, items: items.map((i) => ({ ...i, screenshot_url: i.screenshot_file_id ? `/api/files/${i.screenshot_file_id}` : null })), pagination: meta(n, p) });
};

exports.reviewPayment = async (req, res) => {
  const id = v.id(req.params.id);
  const action = v.oneOf(req.body.action, ['approve', 'reject'], { name: 'Action' });
  const note = v.str(req.body.note, { name: 'Note', max: 255 }) || null;
  const out = await db.transaction(async (tx) => {
    const pay = await tx.one("SELECT * FROM payments WHERE id = ? AND status = 'pending' FOR UPDATE", [id]);
    if (!pay) throw E.conflict('Payment is not pending');
    await tx.run('UPDATE payments SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = UTC_TIMESTAMP() WHERE id = ?',
      [action === 'approve' ? 'approved' : 'rejected', note, req.user.id, id]);
    if (action === 'approve' && pay.plan_id) {
      const plan = await tx.one('SELECT * FROM premium_plans WHERE id = ?', [pay.plan_id]);
      if (plan) await premium.activate(tx, pay.user_id, plan, { paymentId: id, grantedBy: req.user.id });
    } else {
      await notifications.notify(pay.user_id, { type: 'payment', title: 'Payment rejected', body: note || 'Your payment could not be verified.', link: '/premium' }, tx);
    }
    return pay;
  });
  const u = await db.one('SELECT email FROM users WHERE id = ?', [out.user_id]);
  mailer.send({ to: u.email, subject: `Payment ${action === 'approve' ? 'approved' : 'rejected'}`, title: `Payment ${action === 'approve' ? 'approved' : 'rejected'}`,
    text: action === 'approve' ? `Your payment of $${out.amount} was approved and your plan is active.` : `Your payment of $${out.amount} was rejected.${note ? ` Note: ${note}` : ''}` }).catch(() => {});
  realtime.toUser(out.user_id, 'payment:update', { id, status: action === 'approve' ? 'approved' : 'rejected' });
  await audit.log(req, `payment.${action}`, { targetType: 'payment', targetId: id, details: { note } });
  res.json({ ok: true, message: `Payment ${action === 'approve' ? 'approved' : 'rejected'}` });
};

// ------------------------------------------------------------------ withdrawals
exports.withdrawals = async (req, res) => {
  const p = paginate(req.query, { defaultSize: 30 });
  const where = ['1=1'];
  const params = [];
  if (['pending', 'waiting_admin', 'approved', 'rejected', 'paid'].includes(req.query.status)) { where.push('w.status = ?'); params.push(req.query.status); }
  if (req.query.q) { where.push('(u.email LIKE ? OR w.binance_uid LIKE ?)'); const q = `%${String(req.query.q).slice(0, 80)}%`; params.push(q, q); }
  const [items, [{ n }]] = await Promise.all([
    db.query(`SELECT w.*, u.email, u.name FROM withdrawals w JOIN users u ON u.id = w.user_id WHERE ${where.join(' AND ')}
              ORDER BY w.status IN ('pending','waiting_admin') DESC, w.id DESC LIMIT ? OFFSET ?`, [...params, p.size, p.offset]),
    db.query(`SELECT COUNT(*) AS n FROM withdrawals w JOIN users u ON u.id = w.user_id WHERE ${where.join(' AND ')}`, params),
  ]);
  res.json({ ok: true, items: items.map((i) => ({ ...i, amount: money.display(i.amount) })), pagination: meta(n, p) });
};

const TRANSITIONS = {
  approve: { from: ['pending', 'waiting_admin'], to: 'approved' },
  reject: { from: ['pending', 'waiting_admin', 'approved'], to: 'rejected' },
  paid: { from: ['approved', 'waiting_admin', 'pending'], to: 'paid' },
};

exports.reviewWithdrawal = async (req, res) => {
  const id = v.id(req.params.id);
  const action = v.oneOf(req.body.action, Object.keys(TRANSITIONS), { name: 'Action' });
  const note = v.str(req.body.note, { name: 'Note', max: 255 }) || null;
  const t = TRANSITIONS[action];
  const out = await db.transaction(async (tx) => {
    const w = await tx.one('SELECT * FROM withdrawals WHERE id = ? FOR UPDATE', [id]);
    if (!w) throw E.notFound('Withdrawal not found');
    if (!t.from.includes(w.status)) throw E.conflict(`Cannot ${action} a ${w.status.replace('_', ' ')} withdrawal`);
    await tx.run(`UPDATE withdrawals SET status = ?, admin_note = COALESCE(?, admin_note), reviewed_by = ?, reviewed_at = UTC_TIMESTAMP()
                  ${action === 'paid' ? ', paid_at = UTC_TIMESTAMP()' : ''} WHERE id = ?`, [t.to, note, req.user.id, id]);
    let balance = null;
    if (action === 'reject') {
      await tx.run("UPDATE wallet_transactions SET status = 'reversed' WHERE withdrawal_id = ? AND type = 'withdraw'", [id]);
      const r = await wallet.apply(tx, w.user_id, w.amount, { type: 'refund', description: `Refund · withdrawal #${id} rejected`, withdrawalId: id, adminId: req.user.id });
      await tx.run('UPDATE wallets SET total_withdrawn = GREATEST(total_withdrawn - ?, 0) WHERE user_id = ?', [w.amount, w.user_id]);
      balance = r.balance;
    } else if (action === 'paid') {
      await tx.run("UPDATE wallet_transactions SET status = 'completed' WHERE withdrawal_id = ? AND type = 'withdraw'", [id]);
    }
    const label = { approve: 'approved', reject: 'rejected', paid: 'paid' }[action];
    await notifications.notify(w.user_id, { type: 'withdrawal', title: `Withdrawal ${label}`, body: `$${money.display(w.amount)} to Binance ${w.binance_uid}${note ? ` — ${note}` : ''}`, link: '/withdraw' }, tx);
    return { w, balance, label };
  });
  if (out.balance !== null) wallet.emitBalance(out.w.user_id, out.balance);
  realtime.toUser(out.w.user_id, 'withdrawal:update', { id, status: TRANSITIONS[action].to });
  const u = await db.one('SELECT email FROM users WHERE id = ?', [out.w.user_id]);
  mailer.send({ to: u.email, subject: `Withdrawal ${out.label}`, title: `Withdrawal ${out.label}`, text: `Your withdrawal of $${money.display(out.w.amount)} is now ${out.label}.${note ? ` Note: ${note}` : ''}` }).catch(() => {});
  await audit.log(req, `withdrawal.${action}`, { targetType: 'withdrawal', targetId: id, details: { note } });
  res.json({ ok: true, message: `Withdrawal ${out.label}` });
};
