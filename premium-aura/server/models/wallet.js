'use strict';
/**
 * Wallet ledger. Every balance change happens inside a transaction with the
 * wallet row locked (SELECT … FOR UPDATE) and produces a wallet_transactions
 * row with the resulting balance. Amounts are DECIMAL strings end-to-end.
 */
const db = require('../config/database');
const money = require('../utils/money');
const { E } = require('../utils/errors');
const realtime = require('../services/realtime');

async function ensure(userId, conn = db) {
  await conn.run('INSERT IGNORE INTO wallets (user_id) VALUES (?)', [userId]);
  return conn.one('SELECT * FROM wallets WHERE user_id = ?', [userId]);
}

/**
 * Apply a signed amount to a user's wallet. Must be called with a transaction
 * connection. Returns the created transaction row.
 */
async function apply(tx, userId, amount, { type, description, status = 'completed', eventId = null, withdrawalId = null, paymentId = null, adminId = null, allowNegative = false }) {
  await tx.run('INSERT IGNORE INTO wallets (user_id) VALUES (?)', [userId]);
  const w = await tx.one('SELECT id, balance FROM wallets WHERE user_id = ? FOR UPDATE', [userId]);
  const next = money.add(w.balance, amount);
  if (!allowNegative && money.cmp(next, '0') < 0) throw E.badRequest('Insufficient wallet balance');
  const earned = money.cmp(amount, '0') > 0 && type === 'credit' ? money.normalize(amount) : '0';
  const withdrawn = type === 'withdraw' ? money.neg(amount) : '0';
  await tx.run(
    'UPDATE wallets SET balance = ?, total_earned = total_earned + ?, total_withdrawn = total_withdrawn + ? WHERE id = ?',
    [next, earned, withdrawn, w.id],
  );
  const res = await tx.run(
    `INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_after, description, status, event_id, withdrawal_id, payment_id, admin_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [w.id, userId, type, money.normalize(amount), next, String(description).slice(0, 255), status, eventId, withdrawalId, paymentId, adminId],
  );
  return { id: res.insertId, balance: next };
}

function emitBalance(userId, balance) {
  realtime.toUser(userId, 'wallet:update', { balance: money.normalize(balance), display: money.display(balance) });
}

module.exports = { ensure, apply, emitBalance };
