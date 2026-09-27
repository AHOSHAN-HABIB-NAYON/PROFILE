'use strict';
/** Lending & borrowing with automatic reminders and repayment tracking. */
const express = require('express');
const db = require('../../db');
const { ah, ok, err } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const ledger = require('../../services/ledger');
const reminders = require('../../services/reminders');
const { fmtMoney } = require('../../services/scheduler');

const r = express.Router();
const TABLE = { lent: 'loans_lent', borrowed: 'loans_borrowed' };
const kindOf = (k) => { if (!TABLE[k]) throw err(404, 'not_found', 'Not found'); return k; };

r.get('/', ah(async (req, res) => {
  const status = ['open', 'settled', 'written_off'].includes(req.query.status) ? req.query.status : null;
  const out = {};
  for (const k of ['lent', 'borrowed']) {
    out[k] = await db.q(`SELECT l.*, a.name account_name, a.type account_type FROM ${TABLE[k]} l LEFT JOIN accounts a ON a.id=l.account_id
      WHERE l.user_id=? ${status ? 'AND l.status=?' : ''} ORDER BY l.status='open' DESC, l.due_date IS NULL, l.due_date, l.id DESC LIMIT 200`, status ? [req.user.id, status] : [req.user.id]);
  }
  const sum = (arr) => arr.filter((x) => x.status === 'open').reduce((s, x) => s + (Number(x.amount) - Number(x.paid_amount)), 0);
  ok(res, { ...out, receivable: sum(out.lent).toFixed(2), payable: sum(out.borrowed).toFixed(2) });
}));

r.get('/:kind/:id', ah(async (req, res) => {
  const k = kindOf(req.params.kind);
  const loan = await db.one(`SELECT l.*, a.name account_name FROM ${TABLE[k]} l LEFT JOIN accounts a ON a.id=l.account_id WHERE l.id=? AND l.user_id=?`, [Number(req.params.id) || 0, req.user.id]);
  if (!loan) throw err(404, 'not_found', 'Loan not found');
  const payments = await db.q('SELECT p.*, a.name account_name FROM loan_payments p LEFT JOIN accounts a ON a.id=p.account_id WHERE p.loan_kind=? AND p.loan_id=? AND p.user_id=? ORDER BY p.paid_at DESC, p.id DESC', [k, loan.id, req.user.id]);
  const rem = await db.q("SELECT id, remind_at, sent_at, done_at FROM reminders WHERE user_id=? AND ref_type=? AND ref_id=? ORDER BY remind_at", [req.user.id, k, loan.id]);
  ok(res, { ...loan, kind: k, payments, reminders: rem });
}));

r.post('/', ah(async (req, res) => {
  const b = validate(req.body, {
    kind: ['enum', { values: ['lent', 'borrowed'] }], person_name: ['str', { min: 1, max: 120 }], contact: ['str', { max: 190, optional: true }],
    amount: ['amount'], account_id: ['id'], given_at: ['date'], due_date: ['date', { optional: true, nullable: true }], note: ['str', { max: 500, optional: true }],
  });
  if (b.due_date && b.due_date < b.given_at) throw err(422, 'validation_failed', 'Return date must be after the given date', { fields: { due_date: 'invalid_date' } });
  const key = String(req.get('idempotency-key') || '').slice(0, 64) || null;
  if (key) {
    const dup = await db.one("SELECT ref_id FROM transactions WHERE user_id=? AND idempotency_key=? AND ref_type='loan'", [req.user.id, key]);
    if (dup) return ok(res, await db.one(`SELECT * FROM ${TABLE[b.kind]} WHERE id=? AND user_id=?`, [dup.ref_id, req.user.id]));
  }
  const id = await db.tx(async (t) => {
    const accs = await ledger.lockAccounts(t, req.user.id, [b.account_id]);
    const cur = accs[b.account_id].currency;
    const ins = await t.q(`INSERT INTO ${TABLE[b.kind]} (user_id, person_name, contact, amount, currency, account_id, given_at, due_date, note) VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.user.id, b.person_name, b.contact || null, b.amount, cur, b.account_id, b.given_at, b.due_date, b.note || null]);
    const txOut = await ledger.create(req.user.id, {
      type: b.kind === 'lent' ? 'lend' : 'borrow', account_id: b.account_id, amount: b.amount,
      occurred_at: new Date(b.given_at + 'T12:00:00Z'), note: `${b.kind === 'lent' ? 'Lent to' : 'Borrowed from'} ${b.person_name}${b.note ? ' — ' + b.note : ''}`.slice(0, 500),
      ref_type: 'loan', ref_id: ins.insertId, idempotency_key: key,
    }, t);
    await t.q(`UPDATE ${TABLE[b.kind]} SET transaction_id=? WHERE id=?`, [txOut.tx.id, ins.insertId]);
    if (b.due_date) {
      const amt = fmtMoney(b.amount, cur);
      await reminders.scheduleForDue(t, req.user.id, {
        type: b.kind === 'lent' ? 'lend' : 'borrow',
        title: b.kind === 'lent' ? `Collect ${amt} from ${b.person_name}` : `Repay ${amt} to ${b.person_name}`,
        body: b.kind === 'lent' ? `You lent ${amt} to ${b.person_name}.` : `You borrowed ${amt} from ${b.person_name}.`,
        amount: b.amount, dueDate: b.due_date, refType: b.kind, refId: ins.insertId,
      });
    }
    return ins.insertId;
  });
  ok(res, { ...(await db.one(`SELECT * FROM ${TABLE[b.kind]} WHERE id=?`, [id])), kind: b.kind }, 201);
}));

/** Record a repayment (partial or full). Overpayment and double submission are rejected. */
r.post('/:kind/:id/payments', ah(async (req, res) => {
  const k = kindOf(req.params.kind);
  const b = validate(req.body, { amount: ['amount'], account_id: ['id'], paid_at: ['date'], note: ['str', { max: 255, optional: true }] });
  const key = String(req.get('idempotency-key') || '').slice(0, 64) || null;
  if (key) { const dup = await db.one('SELECT id FROM loan_payments WHERE user_id=? AND idempotency_key=?', [req.user.id, key]); if (dup) return ok(res, { duplicate: true }); }
  const loan = await db.tx(async (t) => {
    const l = await t.one(`SELECT * FROM ${TABLE[k]} WHERE id=? AND user_id=? FOR UPDATE`, [Number(req.params.id) || 0, req.user.id]);
    if (!l) throw err(404, 'not_found', 'Loan not found');
    if (l.status !== 'open') throw err(409, 'loan_closed', 'This loan is already closed');
    const remaining = Math.round((Number(l.amount) - Number(l.paid_amount)) * 100);
    if (Math.round(Number(b.amount) * 100) > remaining) throw err(422, 'overpayment', 'Amount exceeds the remaining balance', { fields: { amount: 'too_large' } });
    const accs = await ledger.lockAccounts(t, req.user.id, [b.account_id]);
    if (accs[b.account_id].currency !== l.currency) throw err(422, 'currency_mismatch', 'Account currency must match the loan currency');
    const pay = await t.q('INSERT INTO loan_payments (user_id, loan_kind, loan_id, amount, account_id, paid_at, note, idempotency_key) VALUES (?,?,?,?,?,?,?,?)',
      [req.user.id, k, l.id, b.amount, b.account_id, b.paid_at, b.note || null, key]);
    const txOut = await ledger.create(req.user.id, {
      type: k === 'lent' ? 'repay_in' : 'repay_out', account_id: b.account_id, amount: b.amount, occurred_at: new Date(b.paid_at + 'T12:00:00Z'),
      note: `${k === 'lent' ? 'Repayment from' : 'Repayment to'} ${l.person_name}`, ref_type: 'loan_payment', ref_id: pay.insertId,
    }, t);
    await t.q('UPDATE loan_payments SET transaction_id=? WHERE id=?', [txOut.tx.id, pay.insertId]);
    const settled = Math.round(Number(b.amount) * 100) === remaining;
    await t.q(`UPDATE ${TABLE[k]} SET paid_amount=paid_amount+?, status=? WHERE id=?`, [b.amount, settled ? 'settled' : 'open', l.id]);
    if (settled) await reminders.cancelForRef(t, req.user.id, k, l.id);
    return t.one(`SELECT * FROM ${TABLE[k]} WHERE id=?`, [l.id]);
  });
  ok(res, { ...loan, kind: k }, 201);
}));

r.patch('/:kind/:id', ah(async (req, res) => {
  const k = kindOf(req.params.kind);
  const b = validate(req.body, { person_name: ['str', { min: 1, max: 120 }], contact: ['str', { max: 190, optional: true }], due_date: ['date', { optional: true, nullable: true }], note: ['str', { max: 500, optional: true }] });
  const loan = await db.tx(async (t) => {
    const l = await t.one(`SELECT * FROM ${TABLE[k]} WHERE id=? AND user_id=? FOR UPDATE`, [Number(req.params.id) || 0, req.user.id]);
    if (!l) throw err(404, 'not_found', 'Loan not found');
    await t.q(`UPDATE ${TABLE[k]} SET person_name=?, contact=?, due_date=?, note=? WHERE id=?`, [b.person_name, b.contact || null, b.due_date, b.note || null, l.id]);
    const oldDue = l.due_date ? new Date(l.due_date).toISOString().slice(0, 10) : null;
    if (l.status === 'open' && b.due_date !== oldDue) {
      await reminders.cancelForRef(t, req.user.id, k, l.id);
      if (b.due_date) {
        const amt = fmtMoney(Number(l.amount) - Number(l.paid_amount), l.currency);
        await reminders.scheduleForDue(t, req.user.id, { type: k === 'lent' ? 'lend' : 'borrow', title: k === 'lent' ? `Collect ${amt} from ${b.person_name}` : `Repay ${amt} to ${b.person_name}`,
          amount: (Number(l.amount) - Number(l.paid_amount)).toFixed(2), dueDate: b.due_date, refType: k, refId: l.id });
      }
    }
    return t.one(`SELECT * FROM ${TABLE[k]} WHERE id=?`, [l.id]);
  });
  ok(res, { ...loan, kind: k });
}));

r.post('/:kind/:id/close', ah(async (req, res) => {
  const k = kindOf(req.params.kind);
  await db.tx(async (t) => {
    const l = await t.one(`SELECT id, status FROM ${TABLE[k]} WHERE id=? AND user_id=? FOR UPDATE`, [Number(req.params.id) || 0, req.user.id]);
    if (!l) throw err(404, 'not_found', 'Loan not found');
    if (l.status !== 'open') throw err(409, 'loan_closed', 'Already closed');
    await t.q(`UPDATE ${TABLE[k]} SET status='written_off' WHERE id=?`, [l.id]);
    await reminders.cancelForRef(t, req.user.id, k, l.id);
  });
  ok(res, { closed: true });
}));

/** Delete a loan and reverse every related balance movement atomically */
r.delete('/:kind/:id', ah(async (req, res) => {
  const k = kindOf(req.params.kind);
  await db.tx(async (t) => {
    const l = await t.one(`SELECT * FROM ${TABLE[k]} WHERE id=? AND user_id=? FOR UPDATE`, [Number(req.params.id) || 0, req.user.id]);
    if (!l) throw err(404, 'not_found', 'Loan not found');
    const pays = await t.q('SELECT id, transaction_id FROM loan_payments WHERE user_id=? AND loan_kind=? AND loan_id=?', [req.user.id, k, l.id]);
    for (const p of pays) if (p.transaction_id) { const tx = await t.one('SELECT id FROM transactions WHERE id=? AND deleted_at IS NULL', [p.transaction_id]); if (tx) await ledger.remove(req.user.id, p.transaction_id, t, { force: true }); }
    if (l.transaction_id) { const tx = await t.one('SELECT id FROM transactions WHERE id=? AND deleted_at IS NULL', [l.transaction_id]); if (tx) await ledger.remove(req.user.id, l.transaction_id, t, { force: true }); }
    await t.q('DELETE FROM loan_payments WHERE user_id=? AND loan_kind=? AND loan_id=?', [req.user.id, k, l.id]);
    await t.q("DELETE FROM reminders WHERE user_id=? AND ref_type=? AND ref_id=?", [req.user.id, k, l.id]);
    await t.q(`DELETE FROM ${TABLE[k]} WHERE id=?`, [l.id]);
  });
  ok(res, { deleted: true });
}));

module.exports = r;
