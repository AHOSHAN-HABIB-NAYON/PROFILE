'use strict';
const express = require('express');
const db = require('../../db');
const { ah, ok, err } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const { validTz } = require('../../lib/time');
const settings = require('../../services/settings');
const auth = require('../../services/auth');
const logs = require('../../services/logs');
const i18n = require('../../services/i18n');
const { can } = require('../../middleware/security');
const upload = require('../../services/uploads');

const r = express.Router();

async function me(userId, user) {
  const p = await db.one('SELECT * FROM user_profiles WHERE user_id=?', [userId]);
  const unread = await db.one('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL', [userId]);
  return {
    user: { id: user.uuid, name: user.name, email: user.email, avatar: user.avatar, verified: user.verified, role: user.role, hasPassword: user.hasPassword,
      isStaff: ['support', 'admin', 'super_admin'].includes(user.role), canAdmin: can(user.role, 'stats.view') },
    profile: p && {
      language: p.language, currency: p.currency, date_format: p.date_format, time_format: p.time_format, timezone: p.timezone, theme: p.theme, phone: p.phone,
      notify_inapp: !!p.notify_inapp, notify_email: !!p.notify_email, notify_push: !!p.notify_push, notify_security: !!p.notify_security,
      reminder_days_before: p.reminder_days_before, reminder_hour: p.reminder_hour, hide_balances: !!p.hide_balances,
    },
    unread: Number(unread.n),
  };
}

r.get('/', ah(async (req, res) => ok(res, await me(req.user.id, req.user))));

r.patch('/profile', ah(async (req, res) => {
  const b = validate(req.body, {
    name: ['str', { min: 1, max: 120, optional: true }],
    phone: ['str', { max: 32, optional: true, nullable: true }],
    language: ['enum', { values: i18n.LOCALES, optional: true }],
    currency: ['currency', { optional: true }],
    date_format: ['enum', { values: ['DD MMM YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'], optional: true }],
    time_format: ['enum', { values: ['12', '24'], optional: true }],
    timezone: ['str', { max: 64, optional: true }],
    theme: ['enum', { values: ['light', 'dark'], optional: true }],
    notify_inapp: ['bool', { optional: true }], notify_email: ['bool', { optional: true }], notify_push: ['bool', { optional: true }], notify_security: ['bool', { optional: true }],
    reminder_days_before: ['int', { min: 0, max: 14, optional: true }], reminder_hour: ['int', { min: 0, max: 23, optional: true }],
    hide_balances: ['bool', { optional: true }],
  });
  if (b.timezone && !validTz(b.timezone)) throw err(422, 'validation_failed', 'Invalid timezone', { fields: { timezone: 'invalid' } });
  if (b.currency && !settings.currencies().some((c) => c.code === b.currency)) throw err(422, 'validation_failed', 'Unsupported currency', { fields: { currency: 'invalid' } });
  const raw = req.body || {};
  if (b.name !== undefined && 'name' in raw) await db.q('UPDATE users SET name=? WHERE id=?', [b.name, req.user.id]);
  const cols = ['phone', 'language', 'currency', 'date_format', 'time_format', 'timezone', 'theme', 'notify_inapp', 'notify_email', 'notify_push', 'notify_security', 'reminder_days_before', 'reminder_hour', 'hide_balances'];
  const set = []; const vals = [];
  for (const c of cols) if (c in raw && b[c] !== undefined) { set.push(`${c}=?`); vals.push(typeof b[c] === 'boolean' ? (b[c] ? 1 : 0) : b[c]); }
  if (set.length) await db.q(`UPDATE user_profiles SET ${set.join(',')} WHERE user_id=?`, [...vals, req.user.id]);
  const u = await db.one('SELECT name FROM users WHERE id=?', [req.user.id]);
  ok(res, await me(req.user.id, { ...req.user, name: u.name }));
}));

r.post('/avatar', upload.image('file'), ah(async (req, res) => {
  if (!req.file) throw err(422, 'validation_failed', 'Choose an image');
  const url = await upload.saveImage(req.file, 'avatars', { maxSize: 256 });
  await db.q('UPDATE users SET avatar_url=? WHERE id=?', [url, req.user.id]);
  ok(res, { avatar: url });
}));

/** Full personal data export (GDPR-style) */
r.get('/export', ah(async (req, res) => {
  const id = req.user.id;
  const pick = (sql) => db.q(sql, [id]);
  const data = {
    exported_at: new Date().toISOString(),
    user: await db.one('SELECT uuid, email, name, created_at FROM users WHERE id=?', [id]),
    profile: await db.one('SELECT language, currency, date_format, time_format, timezone, theme FROM user_profiles WHERE user_id=?', [id]),
    accounts: await pick('SELECT id, name, type, currency, balance, archived_at, created_at FROM accounts WHERE user_id=?'),
    categories: await pick('SELECT id, name, kind, icon, color FROM categories WHERE user_id=?'),
    transactions: await pick('SELECT uuid, type, account_id, to_account_id, amount, to_amount, currency, category_id, occurred_at, note, tags, created_at FROM transactions WHERE user_id=? AND deleted_at IS NULL ORDER BY occurred_at'),
    loans_lent: await pick('SELECT person_name, contact, amount, paid_amount, currency, given_at, due_date, status, note FROM loans_lent WHERE user_id=?'),
    loans_borrowed: await pick('SELECT person_name, contact, amount, paid_amount, currency, given_at, due_date, status, note FROM loans_borrowed WHERE user_id=?'),
    investments: await pick('SELECT name, kind, amount, current_value, currency, started_at, closed_at FROM investments WHERE user_id=?'),
    goals: await pick('SELECT name, kind, target_amount, current_amount, currency, deadline, note, completed_at FROM goals WHERE user_id=?'),
    reminders: await pick('SELECT type, title, body, amount, due_at, repeat_rule, done_at FROM reminders WHERE user_id=?'),
    moods: await pick('SELECT entry_date, mood, activity, note FROM moods WHERE user_id=?'),
    notes: await pick('SELECT title, body, pinned, created_at FROM notes WHERE user_id=?'),
  };
  await logs.security(req, id, 'data_export');
  res.setHeader('Content-Disposition', `attachment; filename="lifetrack-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(data);
}));

r.get('/export.csv', ah(async (req, res) => {
  const rows = await db.q(`SELECT t.occurred_at, t.type, t.amount, t.currency, a.name account, ta.name to_account, c.name category, t.note, t.tags
    FROM transactions t JOIN accounts a ON a.id=t.account_id LEFT JOIN accounts ta ON ta.id=t.to_account_id LEFT JOIN categories c ON c.id=t.category_id
    WHERE t.user_id=? AND t.deleted_at IS NULL ORDER BY t.occurred_at DESC`, [req.user.id]);
  const esc = (v) => { let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const out = ['date,type,amount,currency,account,to_account,category,note,tags', ...rows.map((r) => [r.occurred_at, r.type, r.amount, r.currency, r.account, r.to_account, r.category, r.note, r.tags].map(esc).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="lifetrack-transactions-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + out);
}));

/** Permanently delete the account (requires password or typed confirmation for password-less accounts) */
r.post('/delete', ah(async (req, res) => {
  const b = validate(req.body, { password: ['str', { max: 200, optional: true }], confirm: ['str', { max: 20, optional: true }] });
  const u = await db.one('SELECT password_hash, role FROM users WHERE id=?', [req.user.id]);
  if (u.role === 'super_admin') {
    const others = await db.one("SELECT COUNT(*) n FROM users WHERE role='super_admin' AND id<>? AND deleted_at IS NULL", [req.user.id]);
    if (!Number(others.n)) throw err(409, 'last_super_admin', 'Transfer super admin role before deleting this account');
  }
  if (u.password_hash) { if (!(await auth.verifyPassword(u.password_hash, b.password || ''))) throw err(401, 'invalid_password', 'Incorrect password'); }
  else if (b.confirm !== 'DELETE') throw err(422, 'validation_failed', 'Type DELETE to confirm', { fields: { confirm: 'invalid' } });
  await db.tx(async (t) => {
    const id = req.user.id;
    for (const tbl of ['loan_payments', 'investments', 'loans_lent', 'loans_borrowed']) await t.q(`DELETE FROM ${tbl} WHERE user_id=?`, [id]);
    await t.q('DELETE FROM transactions WHERE user_id=?', [id]);
    await t.q('DELETE FROM users WHERE id=?', [id]);
  });
  await logs.security(req, null, 'account_deleted', { user: req.user.uuid }, 'warning');
  res.clearCookie(auth.SID, { path: '/' });
  ok(res, { deleted: true });
}));

module.exports = r;
