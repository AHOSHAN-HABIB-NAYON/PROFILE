'use strict';
const express = require('express');
const db = require('../../db');
const { ah, ok, err } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const ledger = require('../../services/ledger');
const settings = require('../../services/settings');

const r = express.Router();
const TYPES = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card', 'wallet'];
const supported = (c) => settings.currencies().some((x) => x.code === c);

r.get('/', ah(async (req, res) => {
  const archived = req.query.archived === '1';
  const rows = await db.q(`SELECT a.id, a.name, a.type, a.currency, a.balance, a.color, a.number_hint, a.include_in_total, a.archived_at, a.sort_order,
      (SELECT COUNT(*) FROM transactions t WHERE (t.account_id=a.id OR t.to_account_id=a.id) AND t.deleted_at IS NULL) tx_count
    FROM accounts a WHERE a.user_id=? AND ${archived ? 'a.archived_at IS NOT NULL' : 'a.archived_at IS NULL'} ORDER BY a.sort_order, a.id`, [req.user.id]);
  ok(res, rows);
}));

r.post('/', ah(async (req, res) => {
  const b = validate(req.body, {
    name: ['str', { min: 1, max: 80 }], type: ['enum', { values: TYPES }], currency: ['currency', { optional: true }],
    opening_balance: ['signedAmount', { optional: true }], color: ['color', { optional: true, nullable: true }],
    number_hint: ['str', { max: 4, optional: true, nullable: true, pattern: /^\d{0,4}$/ }], include_in_total: ['bool', { optional: true, default: true }],
    idempotency_key: ['str', { max: 64, optional: true }],
  });
  const p = await db.one('SELECT currency FROM user_profiles WHERE user_id=?', [req.user.id]);
  const currency = b.currency || p.currency;
  if (!supported(currency)) throw err(422, 'validation_failed', 'Unsupported currency', { fields: { currency: 'invalid' } });
  const count = await db.one('SELECT COUNT(*) n FROM accounts WHERE user_id=?', [req.user.id]);
  if (Number(count.n) >= 100) throw err(409, 'limit_reached', 'Account limit reached');
  const id = await db.tx(async (t) => {
    const out = await t.q('INSERT INTO accounts (user_id, name, type, currency, color, number_hint, include_in_total, sort_order) VALUES (?,?,?,?,?,?,?,?)',
      [req.user.id, b.name, b.type, currency, b.color || null, b.number_hint || null, b.include_in_total ? 1 : 0, Number(count.n)]);
    if (b.opening_balance && Number(b.opening_balance) !== 0) {
      await ledger.create(req.user.id, { type: 'adjustment', account_id: out.insertId, amount: b.opening_balance, note: 'Opening balance', occurred_at: new Date() }, t);
    }
    return out.insertId;
  });
  ok(res, await db.one('SELECT * FROM accounts WHERE id=?', [id]), 201);
}));

r.get('/:id', ah(async (req, res) => {
  const a = await db.one('SELECT * FROM accounts WHERE id=? AND user_id=?', [Number(req.params.id) || 0, req.user.id]);
  if (!a) throw err(404, 'not_found', 'Account not found');
  const stats = await db.one(`SELECT
      COALESCE(SUM(CASE WHEN account_id=? AND type IN ('income','deposit','borrow','repay_in') THEN amount WHEN to_account_id=? THEN COALESCE(to_amount,amount) WHEN account_id=? AND type='adjustment' AND amount>0 THEN amount ELSE 0 END),0) inflow,
      COALESCE(SUM(CASE WHEN account_id=? AND type IN ('expense','investment','lend','repay_out','transfer') THEN amount WHEN account_id=? AND type='adjustment' AND amount<0 THEN -amount ELSE 0 END),0) outflow
    FROM transactions WHERE user_id=? AND deleted_at IS NULL AND (account_id=? OR to_account_id=?) AND occurred_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
  [a.id, a.id, a.id, a.id, a.id, req.user.id, a.id, a.id]);
  ok(res, { ...a, stats });
}));

r.patch('/:id', ah(async (req, res) => {
  const b = validate(req.body, {
    name: ['str', { min: 1, max: 80, optional: true }], type: ['enum', { values: TYPES, optional: true }], color: ['color', { optional: true, nullable: true }],
    number_hint: ['str', { max: 4, optional: true, nullable: true, pattern: /^\d{0,4}$/ }], include_in_total: ['bool', { optional: true }], sort_order: ['int', { min: 0, max: 1000, optional: true }],
  });
  const a = await db.one('SELECT id FROM accounts WHERE id=? AND user_id=?', [Number(req.params.id) || 0, req.user.id]);
  if (!a) throw err(404, 'not_found', 'Account not found');
  const raw = req.body || {}; const set = []; const vals = [];
  for (const k of ['name', 'type', 'color', 'number_hint', 'include_in_total', 'sort_order']) if (k in raw && b[k] !== undefined) { set.push(`${k}=?`); vals.push(typeof b[k] === 'boolean' ? +b[k] : b[k]); }
  if (set.length) await db.q(`UPDATE accounts SET ${set.join(',')} WHERE id=? AND user_id=?`, [...vals, a.id, req.user.id]);
  ok(res, await db.one('SELECT * FROM accounts WHERE id=?', [a.id]));
}));

/** Reconcile: set the real balance — recorded as an adjustment transaction, never a silent overwrite */
r.post('/:id/adjust', ah(async (req, res) => {
  const b = validate(req.body, { balance: ['signedAmount'], note: ['str', { max: 200, optional: true }], idempotency_key: ['str', { max: 64, optional: true }] });
  const id = Number(req.params.id) || 0;
  const out = await db.tx(async (t) => {
    const accs = await ledger.lockAccounts(t, req.user.id, [id]);
    const delta = (Math.round(Number(b.balance) * 100) - Math.round(Number(accs[id].balance) * 100)) / 100;
    if (delta === 0) return null;
    return ledger.create(req.user.id, { type: 'adjustment', account_id: id, amount: delta.toFixed(2), note: b.note || 'Balance adjustment', occurred_at: new Date(), idempotency_key: b.idempotency_key }, t);
  });
  ok(res, { adjusted: !!out, account: await db.one('SELECT * FROM accounts WHERE id=?', [id]) });
}));

r.post('/:id/archive', ah(async (req, res) => {
  const out = await db.q('UPDATE accounts SET archived_at=IF(archived_at IS NULL, NOW(), NULL) WHERE id=? AND user_id=?', [Number(req.params.id) || 0, req.user.id]);
  if (!out.affectedRows) throw err(404, 'not_found', 'Account not found');
  ok(res, await db.one('SELECT * FROM accounts WHERE id=?', [Number(req.params.id)]));
}));

r.delete('/:id', ah(async (req, res) => {
  const id = Number(req.params.id) || 0;
  const a = await db.one('SELECT id FROM accounts WHERE id=? AND user_id=?', [id, req.user.id]);
  if (!a) throw err(404, 'not_found', 'Account not found');
  const used = await db.one('SELECT COUNT(*) n FROM transactions WHERE (account_id=? OR to_account_id=?) AND deleted_at IS NULL', [id, id]);
  if (Number(used.n) > 0) throw err(409, 'account_in_use', 'This account has transactions — archive it instead');
  await db.tx(async (t) => {
    await t.q('DELETE FROM transactions WHERE (account_id=? OR to_account_id=?) AND user_id=? AND deleted_at IS NOT NULL', [id, id, req.user.id]);
    await t.q('DELETE FROM accounts WHERE id=? AND user_id=?', [id, req.user.id]);
  });
  ok(res, { deleted: true });
}));

module.exports = r;
