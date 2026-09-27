'use strict';
/**
 * The ledger is the only code allowed to change account balances.
 * Every change runs inside a DB transaction with SELECT … FOR UPDATE row locks,
 * verifies ownership server-side and is protected by per-user idempotency keys.
 */
const db = require('../db');
const { err } = require('../lib/http');
const { uuid } = require('../lib/crypto');

const INFLOW = new Set(['income', 'deposit', 'borrow', 'repay_in']);
const OUTFLOW = new Set(['expense', 'investment', 'lend', 'repay_out']);
const TYPES = ['income', 'expense', 'investment', 'transfer', 'deposit', 'lend', 'borrow', 'repay_in', 'repay_out', 'adjustment'];

/** Balance deltas for a transaction row */
function effects(tx) {
  const a = String(tx.amount);
  if (INFLOW.has(tx.type)) return [[tx.account_id, a]];
  if (OUTFLOW.has(tx.type)) return [[tx.account_id, neg(a)]];
  if (tx.type === 'transfer') return [[tx.account_id, neg(a)], [tx.to_account_id, String(tx.to_amount ?? a)]];
  if (tx.type === 'adjustment') return [[tx.account_id, a]];
  return [];
}
const neg = (a) => (String(a).startsWith('-') ? String(a).slice(1) : '-' + a);

/** Lock the given accounts (owned by user, not archived) in id order to avoid deadlocks */
async function lockAccounts(t, userId, ids, { allowArchived = false } = {}) {
  const uniq = [...new Set(ids.filter(Boolean).map(Number))].sort((x, y) => x - y);
  if (!uniq.length) return {};
  const rows = await t.q(`SELECT id, currency, balance, archived_at FROM accounts WHERE user_id=? AND id IN (?) ORDER BY id FOR UPDATE`, [userId, uniq]);
  const map = Object.fromEntries(rows.map((r) => [r.id, r]));
  for (const id of uniq) {
    if (!map[id]) throw err(404, 'account_not_found', 'Account not found');
    if (map[id].archived_at && !allowArchived) throw err(409, 'account_archived', 'This account is archived');
  }
  return map;
}

async function applyEffects(t, list, sign = 1) {
  for (const [accId, delta] of list) {
    const d = sign === 1 ? delta : neg(delta);
    await t.q('UPDATE accounts SET balance = balance + CAST(? AS DECIMAL(15,2)) WHERE id=?', [d, accId]);
  }
}

async function checkCategory(t, userId, categoryId) {
  if (!categoryId) return null;
  const c = await t.one('SELECT id FROM categories WHERE id=? AND (user_id=? OR user_id IS NULL) AND archived_at IS NULL', [categoryId, userId]);
  if (!c) throw err(404, 'category_not_found', 'Category not found');
  return c.id;
}

async function findByIdem(userId, key) {
  if (!key) return null;
  return db.one('SELECT * FROM transactions WHERE user_id=? AND idempotency_key=?', [userId, key]);
}

/**
 * Create a transaction. `t` is an open DB transaction (optional).
 * data: { type, account_id, to_account_id?, amount, to_amount?, category_id?, occurred_at(Date), note?, tags?, ref_type?, ref_id?, idempotency_key?, attachment? }
 */
async function create(userId, data, t = null) {
  if (!t) {
    const dup = await findByIdem(userId, data.idempotency_key);
    if (dup) return { tx: dup, duplicate: true };
    try { return await db.tx((tt) => create(userId, data, tt)); } catch (e) {
      if (e.code === 'ER_DUP_ENTRY' && data.idempotency_key) { const d = await findByIdem(userId, data.idempotency_key); if (d) return { tx: d, duplicate: true }; }
      throw e;
    }
  }
  if (!TYPES.includes(data.type)) throw err(422, 'invalid_type', 'Invalid transaction type');
  if (data.type === 'transfer') {
    if (!data.to_account_id) throw err(422, 'validation_failed', 'Destination account required', { fields: { to_account_id: 'required' } });
    if (Number(data.to_account_id) === Number(data.account_id)) throw err(422, 'same_account', 'Choose two different accounts');
  }
  const accs = await lockAccounts(t, userId, [data.account_id, data.to_account_id]);
  const src = accs[data.account_id];
  let toAmount = null;
  if (data.type === 'transfer') {
    const dst = accs[data.to_account_id];
    if (dst.currency !== src.currency && !data.to_amount) throw err(422, 'validation_failed', 'Converted amount required', { fields: { to_amount: 'required' } });
    toAmount = dst.currency === src.currency ? data.amount : data.to_amount;
  }
  const categoryId = data.type === 'transfer' ? null : await checkCategory(t, userId, data.category_id);
  const row = {
    uuid: uuid(), user_id: userId, account_id: Number(data.account_id), to_account_id: data.type === 'transfer' ? Number(data.to_account_id) : null,
    type: data.type, amount: data.amount, to_amount: toAmount, currency: src.currency, category_id: categoryId,
    occurred_at: data.occurred_at || new Date(), note: data.note || null, tags: data.tags || null,
    attachment_path: data.attachment_path || null, attachment_mime: data.attachment_mime || null,
    ref_type: data.ref_type || null, ref_id: data.ref_id || null, idempotency_key: data.idempotency_key || null,
  };
  const r = await t.q('INSERT INTO transactions SET ?', [row]);
  row.id = r.insertId;
  await applyEffects(t, effects(row), 1);
  if (row.type === 'investment' && !data.ref_type) {
    const inv = await t.q('INSERT INTO investments (user_id, transaction_id, name, kind, amount, current_value, currency, started_at, note) VALUES (?,?,?,?,?,?,?,?,?)',
      [userId, row.id, (data.investment_name || data.note || 'Investment').slice(0, 120), data.investment_kind || 'other', row.amount, row.amount, row.currency, toDateStr(row.occurred_at), row.note]);
    await t.q('UPDATE transactions SET ref_type=?, ref_id=? WHERE id=?', ['investment', inv.insertId, row.id]);
    row.ref_type = 'investment'; row.ref_id = inv.insertId;
  }
  return { tx: await t.one('SELECT * FROM transactions WHERE id=?', [row.id]), duplicate: false };
}
const toDateStr = (d) => new Date(d).toISOString().slice(0, 10);

/** Update amount/category/date/note/tags/account of a normal transaction — reverse old effect, apply new, atomically. */
async function update(userId, id, patch) {
  return db.tx(async (t) => {
    const cur = await t.one('SELECT * FROM transactions WHERE id=? AND user_id=? AND deleted_at IS NULL FOR UPDATE', [id, userId]);
    if (!cur) throw err(404, 'not_found', 'Transaction not found');
    if (['loan', 'loan_payment'].includes(cur.ref_type)) throw err(409, 'managed_by_loan', 'Edit this from the lending screen');
    if (cur.type === 'transfer' && (patch.amount || patch.account_id)) throw err(409, 'transfer_locked', 'Delete and re-create transfers to change amounts');
    const next = { ...cur, ...patch };
    await lockAccounts(t, userId, [cur.account_id, cur.to_account_id, next.account_id], { allowArchived: true });
    if (patch.account_id && Number(patch.account_id) !== Number(cur.account_id)) {
      const a = await t.one('SELECT currency, archived_at FROM accounts WHERE id=?', [patch.account_id]);
      if (a.archived_at) throw err(409, 'account_archived', 'This account is archived');
      next.currency = a.currency;
    }
    if ('category_id' in patch) next.category_id = await checkCategory(t, userId, patch.category_id);
    await applyEffects(t, effects(cur), -1);
    await applyEffects(t, effects(next), 1);
    await t.q('UPDATE transactions SET account_id=?, amount=?, currency=?, category_id=?, occurred_at=?, note=?, tags=? WHERE id=?',
      [next.account_id, next.amount, next.currency, next.category_id, next.occurred_at, next.note, next.tags, id]);
    if (cur.ref_type === 'investment' && patch.amount) await t.q('UPDATE investments SET amount=? WHERE id=? AND user_id=?', [next.amount, cur.ref_id, userId]);
    return t.one('SELECT * FROM transactions WHERE id=?', [id]);
  });
}

/** Soft-delete + reverse balance effect */
async function remove(userId, id, t = null, { force = false } = {}) {
  if (!t) return db.tx((tt) => remove(userId, id, tt, { force }));
  const cur = await t.one('SELECT * FROM transactions WHERE id=? AND user_id=? AND deleted_at IS NULL FOR UPDATE', [id, userId]);
  if (!cur) throw err(404, 'not_found', 'Transaction not found');
  if (!force && ['loan', 'loan_payment'].includes(cur.ref_type)) throw err(409, 'managed_by_loan', 'Delete this from the lending screen');
  await lockAccounts(t, userId, [cur.account_id, cur.to_account_id], { allowArchived: true });
  await applyEffects(t, effects(cur), -1);
  await t.q('UPDATE transactions SET deleted_at=NOW(), idempotency_key=NULL WHERE id=?', [id]);
  if (cur.ref_type === 'investment') await t.q('UPDATE investments SET closed_at=NOW(), transaction_id=NULL WHERE id=? AND user_id=?', [cur.ref_id, userId]);
  return cur;
}

module.exports = { create, update, remove, effects, lockAccounts, TYPES, INFLOW, OUTFLOW };
