'use strict';
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { E } = require('../utils/errors');

const BCRYPT_COST = 12;

const hashPassword = (pw) => bcrypt.hash(pw, BCRYPT_COST);
const verifyPassword = (pw, hash) => bcrypt.compare(String(pw || ''), hash || '');

async function create({ name, email, password, role = 'user', verified = false }, conn = db) {
  const exists = await conn.one('SELECT id FROM users WHERE email = ?', [email]);
  if (exists) throw E.conflict('An account with this email already exists');
  const hash = await hashPassword(password);
  const res = await conn.run(
    'INSERT INTO users (name, email, password_hash, role, status, email_verified_at) VALUES (?,?,?,?,?,?)',
    [name, email, hash, role, 'active', verified ? new Date() : null],
  );
  await conn.run('INSERT INTO user_security (user_id, password_changed_at) VALUES (?, UTC_TIMESTAMP())', [res.insertId]);
  await conn.run('INSERT INTO wallets (user_id) VALUES (?)', [res.insertId]);
  return res.insertId;
}

async function security(userId) {
  await db.run('INSERT IGNORE INTO user_security (user_id) VALUES (?)', [userId]);
  return db.one('SELECT * FROM user_security WHERE user_id = ?', [userId]);
}

/** Only ever send this shape to the browser. */
function toPublic(u) {
  if (!u) return null;
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, status: u.status,
    initial: String(u.name || u.email || '?').trim().charAt(0).toUpperCase(),
    email_verified: !!u.email_verified_at, theme: u.theme, timezone: u.timezone,
    address: u.address || '', binance_uid: u.binance_uid || '', created_at: u.created_at,
  };
}

module.exports = { create, security, toPublic, hashPassword, verifyPassword };
