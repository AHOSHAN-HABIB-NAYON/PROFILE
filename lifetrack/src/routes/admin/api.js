'use strict';
/** Admin API — every route is RBAC-guarded and every mutation is audit-logged. */
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('../../db');
const { ah, ok, err } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const { randomToken, sha256 } = require('../../lib/crypto');
const { requirePerm, requireStaff, can } = require('../../middleware/security');
const settings = require('../../services/settings');
const logs = require('../../services/logs');
const mailer = require('../../services/mailer');
const push = require('../../services/push');
const i18n = require('../../services/i18n');
const upload = require('../../services/uploads');
const { notify } = require('../../services/notify');
const { convert } = require('../../services/fx');
const auth = require('../../services/auth');

const r = express.Router();
r.use(requireStaff);
const BACKUP_DIR = path.join(__dirname, '..', '..', '..', 'backups');
const RANK = { user: 0, support: 1, admin: 2, super_admin: 3 };
const page = (q, max = 100) => { const limit = Math.min(max, Math.max(1, Number(q.limit) || 20)); const p = Math.max(1, Number(q.page) || 1); return { limit, page: p, offset: (p - 1) * limit }; };

r.get('/me', (req, res) => ok(res, { user: { name: req.user.name, email: req.user.email, role: req.user.role, avatar: req.user.avatar },
  permissions: ['stats.view', 'users.view', 'users.manage', 'tx.view', 'logs.security', 'logs.audit', 'emails.view', 'emails.manage', 'notifications.user', 'notifications.broadcast', 'categories.manage', 'translations.manage', 'content.manage', 'branding.manage', 'seo.manage', 'pwa.manage', 'settings.system', 'backups', 'roles.manage'].filter((p) => can(req.user.role, p)) }));

/* ---------------- Analytics ---------------- */
r.get('/stats', requirePerm('stats.view'), ah(async (req, res) => {
  const cur = settings.get('default_currency') || 'BDT';
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
  const one = (sql, p = []) => db.one(sql, p);
  const [users, active, newUsers, prevNew, txs, prevTx, sessions, notif, email, pushS, sec, regs, txDaily, logins, langs, accTypes, topCats, roles, twofa, passkeys, volRows, recentUsers, recentSec] = await Promise.all([
    one('SELECT COUNT(*) n, SUM(email_verified_at IS NOT NULL) verified, SUM(status="suspended") suspended FROM users WHERE deleted_at IS NULL'),
    one('SELECT SUM(last_login_at > DATE_SUB(NOW(), INTERVAL 1 DAY)) d1, SUM(last_login_at > DATE_SUB(NOW(), INTERVAL 7 DAY)) d7, SUM(last_login_at > DATE_SUB(NOW(), INTERVAL 30 DAY)) d30 FROM users WHERE deleted_at IS NULL'),
    one('SELECT COUNT(*) n FROM users WHERE created_at > DATE_SUB(NOW(), INTERVAL ? DAY)', [days]),
    one('SELECT COUNT(*) n FROM users WHERE created_at BETWEEN DATE_SUB(NOW(), INTERVAL ? DAY) AND DATE_SUB(NOW(), INTERVAL ? DAY)', [days * 2, days]),
    one('SELECT COUNT(*) n FROM transactions WHERE deleted_at IS NULL AND created_at > DATE_SUB(NOW(), INTERVAL ? DAY)', [days]),
    one('SELECT COUNT(*) n FROM transactions WHERE deleted_at IS NULL AND created_at BETWEEN DATE_SUB(NOW(), INTERVAL ? DAY) AND DATE_SUB(NOW(), INTERVAL ? DAY)', [days * 2, days]),
    one('SELECT COUNT(*) n FROM sessions WHERE revoked_at IS NULL AND expires_at > NOW() AND last_seen_at > DATE_SUB(NOW(), INTERVAL 1 DAY)'),
    db.q('SELECT type, COUNT(*) n, SUM(read_at IS NOT NULL) read_n FROM notifications WHERE created_at > DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY type ORDER BY n DESC', [days]),
    db.q('SELECT status, COUNT(*) n FROM email_logs WHERE created_at > DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY status', [days]),
    db.q('SELECT status, COUNT(*) n FROM push_logs WHERE created_at > DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY status', [days]),
    db.q('SELECT event, severity, COUNT(*) n FROM security_logs WHERE created_at > DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY event, severity ORDER BY n DESC', [days]),
    db.q("SELECT DATE_FORMAT(created_at,'%Y-%m-%d') d, COUNT(*) n FROM users WHERE created_at > DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY d", [days]),
    db.q("SELECT DATE_FORMAT(created_at,'%Y-%m-%d') d, COUNT(*) n FROM transactions WHERE deleted_at IS NULL AND created_at > DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY d", [days]),
    db.q("SELECT DATE_FORMAT(created_at,'%Y-%m-%d') d, COUNT(DISTINCT user_id) n FROM security_logs WHERE event='login_success' AND created_at > DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY d", [days]),
    db.q('SELECT language k, COUNT(*) n FROM user_profiles GROUP BY language'),
    db.q('SELECT type k, COUNT(*) n FROM accounts WHERE archived_at IS NULL GROUP BY type ORDER BY n DESC'),
    db.q("SELECT c.name k, COUNT(*) n FROM transactions t JOIN categories c ON c.id=t.category_id WHERE t.type='expense' AND t.deleted_at IS NULL AND t.created_at > DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY c.name ORDER BY n DESC LIMIT 6", [days]),
    db.q('SELECT role k, COUNT(*) n FROM users WHERE deleted_at IS NULL GROUP BY role'),
    one('SELECT COUNT(*) n FROM two_factor WHERE totp_enabled_at IS NOT NULL OR email_enabled_at IS NOT NULL'),
    one('SELECT COUNT(DISTINCT user_id) n FROM passkeys'),
    db.q("SELECT type, currency, SUM(amount) s FROM transactions WHERE deleted_at IS NULL AND type IN ('income','expense') AND created_at > DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY type, currency", [days]),
    db.q('SELECT uuid, name, email, created_at FROM users WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 6'),
    db.q("SELECT s.event, s.severity, s.ip, s.created_at, u.email FROM security_logs s LEFT JOIN users u ON u.id=s.user_id WHERE s.severity<>'info' ORDER BY s.id DESC LIMIT 8"),
  ]);
  const fill = (rows) => { const m = Object.fromEntries(rows.map((x) => [x.d, Number(x.n)])); const out = []; for (let i = days - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); out.push({ d, n: m[d] || 0 }); } return out; };
  const vol = { income: 0, expense: 0 }; for (const v of volRows) vol[v.type] += convert(v.s, v.currency, cur);
  const growth = (a, b) => (Number(b) ? Math.round(((Number(a) - Number(b)) / Number(b)) * 1000) / 10 : null);
  ok(res, {
    days, currency: cur,
    users: { total: Number(users.n), verified: Number(users.verified || 0), suspended: Number(users.suspended || 0), active1: Number(active.d1 || 0), active7: Number(active.d7 || 0), active30: Number(active.d30 || 0),
      new: Number(newUsers.n), newGrowth: growth(newUsers.n, prevNew.n), twofa: Number(twofa.n), passkeys: Number(passkeys.n) },
    transactions: { count: Number(txs.n), growth: growth(txs.n, prevTx.n), income: Math.round(vol.income), expense: Math.round(vol.expense) },
    activeSessions: Number(sessions.n),
    notifications: notif.map((x) => ({ type: x.type, n: Number(x.n), read: Number(x.read_n) })),
    email: Object.fromEntries(email.map((x) => [x.status, Number(x.n)])), push: Object.fromEntries(pushS.map((x) => [x.status, Number(x.n)])),
    security: sec.map((x) => ({ ...x, n: Number(x.n) })),
    series: { registrations: fill(regs), transactions: fill(txDaily), logins: fill(logins) },
    languages: langs.map((x) => ({ k: x.k, n: Number(x.n) })), accountTypes: accTypes.map((x) => ({ k: x.k, n: Number(x.n) })), topCategories: topCats.map((x) => ({ k: x.k, n: Number(x.n) })),
    roles: roles.map((x) => ({ k: x.k, n: Number(x.n) })), recentUsers, recentSecurity: recentSec,
  });
}));

/* ---------------- Users ---------------- */
r.get('/users', requirePerm('users.view'), ah(async (req, res) => {
  const { limit, page: p, offset } = page(req.query);
  const where = ['u.deleted_at IS NULL']; const params = [];
  if (req.query.q) { const s = `%${String(req.query.q).slice(0, 80).replace(/[%_\\]/g, '\\$&')}%`; where.push('(u.email LIKE ? OR u.name LIKE ? OR u.uuid=?)'); params.push(s, s, String(req.query.q)); }
  if (['active', 'suspended'].includes(req.query.status)) { where.push('u.status=?'); params.push(req.query.status); }
  if (RANK[req.query.role] !== undefined) { where.push('u.role=?'); params.push(req.query.role); }
  if (req.query.verified === '1') where.push('u.email_verified_at IS NOT NULL');
  if (req.query.verified === '0') where.push('u.email_verified_at IS NULL');
  const sort = { joined: 'u.id DESC', login: 'u.last_login_at IS NULL, u.last_login_at DESC', name: 'u.name ASC' }[req.query.sort] || 'u.id DESC';
  const w = where.join(' AND ');
  const [rows, count] = await Promise.all([
    db.q(`SELECT u.id, u.uuid, u.name, u.email, u.role, u.status, u.avatar_url, u.email_verified_at, u.google_id IS NOT NULL google, u.created_at, u.last_login_at, u.last_login_ip,
        (tf.totp_enabled_at IS NOT NULL OR tf.email_enabled_at IS NOT NULL) twofa,
        (SELECT COUNT(*) FROM passkeys pk WHERE pk.user_id=u.id) passkeys,
        (SELECT COUNT(*) FROM push_subscriptions ps WHERE ps.user_id=u.id) push_devices,
        p.notify_email, p.notify_push, p.language, p.currency
      FROM users u LEFT JOIN two_factor tf ON tf.user_id=u.id LEFT JOIN user_profiles p ON p.user_id=u.id
      WHERE ${w} ORDER BY ${sort} LIMIT ? OFFSET ?`, [...params, limit, offset]),
    db.one(`SELECT COUNT(*) n FROM users u WHERE ${w}`, params),
  ]);
  ok(res, { items: rows, total: Number(count.n), page: p, pages: Math.ceil(Number(count.n) / limit) });
}));

async function targetUser(req, id) {
  const u = await db.one('SELECT id, uuid, name, email, role, status FROM users WHERE id=? AND deleted_at IS NULL', [Number(id) || 0]);
  if (!u) throw err(404, 'not_found', 'User not found');
  return u;
}
function assertCanManage(req, u) {
  if (u.id === req.user.id) throw err(409, 'self_action', 'Use your own settings for your account');
  if (RANK[u.role] >= RANK[req.user.role] && req.user.role !== 'super_admin') throw err(403, 'forbidden', 'You cannot manage a user with an equal or higher role');
}

r.get('/users/:id', requirePerm('users.view'), ah(async (req, res) => {
  const u = await db.one(`SELECT u.id, u.uuid, u.name, u.email, u.role, u.status, u.avatar_url, u.email_verified_at, u.google_id IS NOT NULL google, u.password_hash IS NOT NULL has_password,
      u.created_at, u.last_login_at, u.last_login_ip, u.password_changed_at, p.language, p.currency, p.timezone, p.theme, p.notify_inapp, p.notify_email, p.notify_push, p.notify_security,
      tf.totp_enabled_at, tf.email_enabled_at
    FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id LEFT JOIN two_factor tf ON tf.user_id=u.id WHERE u.id=? AND u.deleted_at IS NULL`, [Number(req.params.id) || 0]);
  if (!u) throw err(404, 'not_found', 'User not found');
  const id = u.id;
  const [counts, accounts, sessions, secLogs, passkeys, pushSubs, notifs] = await Promise.all([
    db.one(`SELECT (SELECT COUNT(*) FROM transactions WHERE user_id=? AND deleted_at IS NULL) tx, (SELECT COUNT(*) FROM goals WHERE user_id=? AND archived_at IS NULL) goals,
      (SELECT COUNT(*) FROM loans_lent WHERE user_id=?) lent, (SELECT COUNT(*) FROM loans_borrowed WHERE user_id=?) borrowed, (SELECT COUNT(*) FROM moods WHERE user_id=?) moods,
      (SELECT COUNT(*) FROM recovery_codes WHERE user_id=? AND used_at IS NULL) recovery`, [id, id, id, id, id, id]),
    db.q('SELECT name, type, currency, balance, archived_at FROM accounts WHERE user_id=? ORDER BY sort_order', [id]),
    db.q('SELECT s.id, s.ip, s.auth_method, s.created_at, s.last_seen_at, d.name device FROM sessions s LEFT JOIN devices d ON d.id=s.device_id WHERE s.user_id=? AND s.revoked_at IS NULL AND s.expires_at > NOW() ORDER BY s.last_seen_at DESC LIMIT 10', [id]),
    db.q('SELECT event, severity, ip, user_agent, created_at FROM security_logs WHERE user_id=? ORDER BY id DESC LIMIT 25', [id]),
    db.q('SELECT name, device_type, created_at, last_used_at FROM passkeys WHERE user_id=?', [id]),
    db.q('SELECT kind, user_agent, created_at, last_success_at FROM push_subscriptions WHERE user_id=?', [id]),
    db.q('SELECT type, title, read_at, created_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 10', [id]),
  ]);
  await logs.audit(req, 'user.view', 'user', u.uuid);
  ok(res, { ...u, counts, accounts: can(req.user.role, 'users.manage') ? accounts : accounts.map((a) => ({ ...a, balance: null })), sessions, securityLogs: secLogs, passkeys, pushSubs, notifications: notifs });
}));

r.patch('/users/:id', requirePerm('users.manage'), ah(async (req, res) => {
  const u = await targetUser(req, req.params.id); assertCanManage(req, u);
  const b = validate(req.body, { status: ['enum', { values: ['active', 'suspended'], optional: true }], role: ['enum', { values: Object.keys(RANK), optional: true }], verified: ['bool', { optional: true }], name: ['str', { min: 1, max: 120, optional: true }] });
  const raw = req.body || {};
  if ('role' in raw && b.role !== u.role) {
    if (!can(req.user.role, 'roles.manage')) throw err(403, 'forbidden', 'Only a super admin can change roles');
    if (u.role === 'super_admin') { const n = await db.one("SELECT COUNT(*) n FROM users WHERE role='super_admin' AND deleted_at IS NULL", []); if (Number(n.n) <= 1) throw err(409, 'last_super_admin', 'Cannot demote the last super admin'); }
    await db.q('UPDATE users SET role=? WHERE id=?', [b.role, u.id]);
    await logs.audit(req, 'user.role', 'user', u.uuid, { from: u.role, to: b.role });
    await logs.security(req, u.id, 'role_changed', { from: u.role, to: b.role, by: req.user.email }, 'warning');
  }
  if ('status' in raw && b.status !== u.status) {
    await db.q('UPDATE users SET status=? WHERE id=?', [b.status, u.id]);
    if (b.status === 'suspended') await auth.revokeAllSessions(u.id);
    await logs.audit(req, b.status === 'suspended' ? 'user.suspend' : 'user.activate', 'user', u.uuid);
  }
  if ('verified' in raw) { await db.q('UPDATE users SET email_verified_at=' + (b.verified ? 'COALESCE(email_verified_at, NOW())' : 'NULL') + ' WHERE id=?', [u.id]); await logs.audit(req, 'user.verify', 'user', u.uuid, { verified: b.verified }); }
  if ('name' in raw) { await db.q('UPDATE users SET name=? WHERE id=?', [b.name, u.id]); await logs.audit(req, 'user.rename', 'user', u.uuid); }
  ok(res, { updated: true });
}));

r.post('/users/:id/revoke-sessions', requirePerm('users.manage'), ah(async (req, res) => {
  const u = await targetUser(req, req.params.id); assertCanManage(req, u);
  await auth.revokeAllSessions(u.id);
  await logs.audit(req, 'user.revoke_sessions', 'user', u.uuid);
  await logs.security(req, u.id, 'sessions_revoked_by_admin', { by: req.user.email }, 'warning');
  ok(res, { revoked: true });
}));

/** Account recovery assistance: disables 2FA after identity has been verified out-of-band. Audited + user notified. */
r.post('/users/:id/reset-2fa', requirePerm('users.manage'), ah(async (req, res) => {
  const u = await targetUser(req, req.params.id); assertCanManage(req, u);
  const b = validate(req.body, { reason: ['str', { min: 5, max: 300 }] });
  await db.q('DELETE FROM two_factor WHERE user_id=?', [u.id]);
  await db.q('DELETE FROM recovery_codes WHERE user_id=?', [u.id]);
  await auth.revokeAllSessions(u.id);
  await logs.audit(req, 'user.reset_2fa', 'user', u.uuid, { reason: b.reason });
  await logs.security(req, u.id, '2fa_reset_by_admin', { by: req.user.email, reason: b.reason }, 'critical');
  await notify(u.id, { type: 'security', titleKey: 'notif.2fa_changed.title', bodyKey: 'notif.2fa_reset_admin.body', security: true, email: { template: 'twofa_changed', vars: { action: 'reset by an administrator', time: new Date().toUTCString() } } });
  ok(res, { reset: true });
}));

r.post('/users/:id/send-reset', requirePerm('users.manage'), ah(async (req, res) => {
  const u = await targetUser(req, req.params.id); assertCanManage(req, u);
  const token = randomToken(32);
  await db.q('UPDATE password_resets SET used_at=NOW() WHERE user_id=? AND used_at IS NULL', [u.id]);
  await db.q('INSERT INTO password_resets (user_id, token_hash, ip, expires_at) VALUES (?,?,?, DATE_ADD(NOW(), INTERVAL 60 MINUTE))', [u.id, sha256(token), null]);
  const p = await db.one('SELECT language FROM user_profiles WHERE user_id=?', [u.id]);
  const out = await mailer.send({ to: u.email, userId: u.id, template: 'password_reset', locale: p?.language || 'en', vars: { name: u.name, minutes: 60 }, cta: { link: `${settings.siteUrl(req)}/app/reset-password?token=${token}`, labelKey: 'email.reset_cta' } });
  await logs.audit(req, 'user.send_reset', 'user', u.uuid, { sent: out.sent });
  if (!out.sent) throw err(503, 'email_unavailable', 'Email could not be sent — check SMTP settings');
  ok(res, { sent: true });
}));

r.post('/users/:id/notify', requirePerm('notifications.user'), ah(async (req, res) => {
  const u = await targetUser(req, req.params.id);
  const b = validate(req.body, { title: ['str', { min: 1, max: 190 }], body: ['str', { min: 1, max: 1000 }], email: ['bool', { optional: true }] });
  await notify(u.id, { type: 'system', title: b.title, body: b.body, link: '/app/notifications', channels: b.email ? ['inapp', 'push', 'email'] : ['inapp', 'push'], email: b.email ? { template: 'announcement', vars: { title: b.title, body: b.body } } : null });
  await logs.audit(req, 'user.notify', 'user', u.uuid, { title: b.title });
  ok(res, { sent: true });
}));

r.delete('/users/:id', requirePerm('roles.manage'), ah(async (req, res) => {
  const u = await targetUser(req, req.params.id); assertCanManage(req, u);
  await db.tx(async (t) => {
    for (const tbl of ['loan_payments', 'investments', 'loans_lent', 'loans_borrowed']) await t.q(`DELETE FROM ${tbl} WHERE user_id=?`, [u.id]);
    await t.q('DELETE FROM transactions WHERE user_id=?', [u.id]);
    await t.q('DELETE FROM users WHERE id=?', [u.id]);
  });
  await logs.audit(req, 'user.delete', 'user', u.uuid, { email: u.email });
  ok(res, { deleted: true });
}));

/* ---------------- Transactions & accounts (read-only oversight) ---------------- */
r.get('/transactions', requirePerm('tx.view'), ah(async (req, res) => {
  const { limit, page: p, offset } = page(req.query);
  const where = ['t.deleted_at IS NULL']; const params = [];
  if (req.query.q) { const s = `%${String(req.query.q).slice(0, 80).replace(/[%_\\]/g, '\\$&')}%`; where.push('(u.email LIKE ? OR t.note LIKE ?)'); params.push(s, s); }
  if (req.query.type) { where.push('t.type=?'); params.push(String(req.query.type)); }
  const w = where.join(' AND ');
  const [rows, count] = await Promise.all([
    db.q(`SELECT t.uuid, t.type, t.amount, t.currency, t.occurred_at, t.created_at, a.type account_type, c.name category, u.email, u.name user_name
      FROM transactions t JOIN users u ON u.id=t.user_id JOIN accounts a ON a.id=t.account_id LEFT JOIN categories c ON c.id=t.category_id WHERE ${w} ORDER BY t.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
    db.one(`SELECT COUNT(*) n FROM transactions t JOIN users u ON u.id=t.user_id WHERE ${w}`, params),
  ]);
  ok(res, { items: rows, total: Number(count.n), page: p, pages: Math.ceil(Number(count.n) / limit) });
}));

r.get('/accounts', requirePerm('tx.view'), ah(async (req, res) => {
  const rows = await db.q('SELECT type, currency, COUNT(*) n, SUM(balance) total, SUM(archived_at IS NOT NULL) archived FROM accounts GROUP BY type, currency ORDER BY n DESC');
  ok(res, rows);
}));

/* ---------------- System categories ---------------- */
r.get('/categories', requirePerm('categories.manage'), ah(async (req, res) => ok(res, await db.q('SELECT id, name, kind, icon, color, archived_at FROM categories WHERE user_id IS NULL ORDER BY kind, name'))));
r.post('/categories', requirePerm('categories.manage'), ah(async (req, res) => {
  const b = validate(req.body, { name: ['str', { min: 1, max: 60 }], kind: ['enum', { values: ['income', 'expense', 'investment', 'other'] }], icon: ['str', { max: 40, pattern: /^[a-z0-9-]+$/ }], color: ['color'] });
  const out = await db.q('INSERT INTO categories (user_id, name, kind, icon, color) VALUES (NULL,?,?,?,?)', [b.name, b.kind, b.icon, b.color]);
  await logs.audit(req, 'category.create', 'category', out.insertId, b);
  ok(res, { id: out.insertId }, 201);
}));
r.delete('/categories/:id', requirePerm('categories.manage'), ah(async (req, res) => {
  await db.q('UPDATE categories SET archived_at=IF(archived_at IS NULL, NOW(), NULL) WHERE id=? AND user_id IS NULL', [Number(req.params.id) || 0]);
  await logs.audit(req, 'category.toggle', 'category', req.params.id);
  ok(res, { toggled: true });
}));

/* ---------------- Notifications / announcements / push ---------------- */
r.get('/announcements', requirePerm('notifications.user'), ah(async (req, res) => {
  ok(res, await db.q('SELECT a.*, u.email created_by_email FROM announcements a LEFT JOIN users u ON u.id=a.created_by ORDER BY a.id DESC LIMIT 50'));
}));
r.post('/announcements', requirePerm('notifications.broadcast'), ah(async (req, res) => {
  const b = validate(req.body, { title: ['str', { min: 1, max: 190 }], body: ['str', { min: 1, max: 1000 }], link: ['str', { max: 255, optional: true, pattern: /^\/[\w\-/?=&.#]*$/ }],
    audience: ['enum', { values: ['all', 'verified', 'admins'] }], push: ['bool', { optional: true }], email: ['bool', { optional: true }] });
  const where = { all: "status='active'", verified: "status='active' AND email_verified_at IS NOT NULL", admins: "status='active' AND role IN ('support','admin','super_admin')" }[b.audience];
  const users = await db.q(`SELECT id FROM users WHERE deleted_at IS NULL AND ${where}`);
  const channels = ['inapp', b.push && 'push', b.email && 'email'].filter(Boolean);
  const ins = await db.q('INSERT INTO announcements (title, body, link, audience, channels, recipients, created_by) VALUES (?,?,?,?,?,?,?)', [b.title, b.body, b.link || null, b.audience, channels.join(','), users.length, req.user.id]);
  await logs.audit(req, 'announcement.send', 'announcement', ins.insertId, { audience: b.audience, channels, recipients: users.length });
  // Deliver in the background, in small batches
  (async () => {
    for (const u of users) {
      try { await notify(u.id, { type: 'announcement', title: b.title, body: b.body, link: b.link || '/app/notifications', channels, email: b.email ? { template: 'announcement', vars: { title: b.title, body: b.body } } : null }); } catch (e) { console.error('[announce]', e.message); }
    }
  })();
  ok(res, { id: ins.insertId, recipients: users.length }, 201);
}));

/* ---------------- Email ---------------- */
r.get('/emails', requirePerm('emails.view'), ah(async (req, res) => {
  const { limit, page: p, offset } = page(req.query);
  const where = ['1=1']; const params = [];
  if (['sent', 'failed', 'skipped'].includes(req.query.status)) { where.push('status=?'); params.push(req.query.status); }
  if (req.query.q) { where.push('to_email LIKE ?'); params.push(`%${String(req.query.q).slice(0, 80).replace(/[%_\\]/g, '\\$&')}%`); }
  const w = where.join(' AND ');
  const [rows, count] = await Promise.all([db.q(`SELECT id, to_email, template, subject, status, error, created_at FROM email_logs WHERE ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]), db.one(`SELECT COUNT(*) n FROM email_logs WHERE ${w}`, params)]);
  ok(res, { items: rows, total: Number(count.n), page: p, pages: Math.ceil(Number(count.n) / limit), configured: mailer.enabled() });
}));
r.get('/email-templates', requirePerm('emails.manage'), ah(async (req, res) => {
  const ov = settings.json('email_templates', {}) || {};
  const out = Object.entries(mailer.TEMPLATES).map(([k, vars]) => ({ key: k, vars, subject: ov[k]?.subject || '', body: ov[k]?.body || '',
    defaultSubject: i18n.t('en', `email.${k}.subject`), defaultBody: i18n.t('en', `email.${k}.body`) }));
  ok(res, out);
}));
r.put('/email-templates/:key', requirePerm('emails.manage'), ah(async (req, res) => {
  if (!mailer.TEMPLATES[req.params.key]) throw err(404, 'not_found', 'Unknown template');
  const b = validate(req.body, { subject: ['str', { max: 200, optional: true }], body: ['str', { max: 5000, optional: true }] });
  const ov = settings.json('email_templates', {}) || {};
  if (!b.subject && !b.body) delete ov[req.params.key]; else ov[req.params.key] = { subject: b.subject || '', body: b.body || '' };
  await settings.set('email_templates', JSON.stringify(ov), req.user.id);
  await logs.audit(req, 'email_template.update', 'template', req.params.key);
  ok(res, { saved: true });
}));
r.post('/emails/test', requirePerm('emails.manage'), ah(async (req, res) => {
  const b = validate(req.body, { to: ['email'] });
  const out = await mailer.send({ to: b.to, userId: req.user.id, template: 'test', vars: { name: req.user.name } });
  await logs.audit(req, 'email.test', null, null, { to: b.to, sent: out.sent });
  if (!out.sent) throw err(502, 'email_failed', out.error || 'Email is not configured');
  ok(res, { sent: true });
}));

/* ---------------- Translations ---------------- */
r.get('/translations', requirePerm('translations.manage'), ah(async (req, res) => {
  const locale = i18n.LOCALES.includes(req.query.locale) ? req.query.locale : 'bn';
  const base = i18n.base(); const ov = await db.q('SELECT `key`, value FROM translations WHERE locale=?', [locale]);
  const om = Object.fromEntries(ov.map((x) => [x.key, x.value]));
  const q = String(req.query.q || '').toLowerCase();
  const keys = Object.keys(base.en).filter((k) => !q || k.toLowerCase().includes(q) || String(base.en[k]).toLowerCase().includes(q) || String(base[locale][k] || '').toLowerCase().includes(q));
  ok(res, { locale, locales: i18n.LOCALES.map((l) => ({ code: l, ...i18n.META[l] })), total: keys.length,
    items: keys.slice(0, 400).map((k) => ({ key: k, en: base.en[k], base: base[locale][k] || '', override: om[k] ?? null })) });
}));
r.put('/translations', requirePerm('translations.manage'), ah(async (req, res) => {
  const b = validate(req.body, { locale: ['enum', { values: i18n.LOCALES }], key: ['str', { min: 1, max: 120 }], value: ['str', { max: 2000, optional: true }] });
  if (!(b.key in i18n.base().en)) throw err(404, 'not_found', 'Unknown key');
  if (b.value) await db.q('INSERT INTO translations (locale, `key`, value) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)', [b.locale, b.key, b.value]);
  else await db.q('DELETE FROM translations WHERE locale=? AND `key`=?', [b.locale, b.key]);
  await i18n.loadOverrides();
  await logs.audit(req, 'translation.update', 'translation', `${b.locale}:${b.key}`);
  ok(res, { saved: true });
}));

/* ---------------- Settings ---------------- */
const GROUPS = {
  'branding.manage': ['site_name', 'site_tagline', 'logo_url', 'logo_show_name', 'favicon_url', 'pwa_icon_url', 'og_image_url'],
  'seo.manage': ['seo_title', 'seo_description', 'seo_keywords'],
  'content.manage': ['landing_hero_title', 'landing_hero_subtitle', 'landing_cta', 'landing_show_faq'],
  'pwa.manage': ['theme_color', 'background_color'],
  'settings.system': ['site_url', 'registration_enabled', 'email_verification_required', 'auth_google_enabled', 'google_client_id', 'google_client_secret', 'auth_passkey_enabled', 'auth_2fa_enabled',
    'session_days', 'login_max_attempts', 'login_lock_minutes', 'mail_enabled', 'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'mail_from_name', 'mail_from_email',
    'push_enabled', 'vapid_subject', 'firebase_enabled', 'firebase_web_config', 'firebase_vapid_key', 'firebase_service_account', 'default_language', 'languages_enabled', 'default_currency',
    'default_timezone', 'currencies', 'notify_welcome', 'notify_security_email', 'maintenance_mode', 'upload_max_mb'],
};
const permFor = (key) => Object.entries(GROUPS).find(([, keys]) => keys.includes(key))?.[0];

r.get('/settings', requirePerm('branding.manage'), ah(async (req, res) => {
  const all = settings.adminView();
  const visible = {};
  for (const [perm, keys] of Object.entries(GROUPS)) if (can(req.user.role, perm)) for (const k of keys) visible[k] = all[k];
  if (can(req.user.role, 'settings.system')) visible.vapid_public = settings.get('vapid_public');
  ok(res, { values: visible, mailConfigured: mailer.enabled(), sharp: upload.hasSharp() });
}));

r.put('/settings', ah(async (req, res) => {
  const body = req.body?.values || {};
  const changed = [];
  for (const [k, v] of Object.entries(body)) {
    const perm = permFor(k);
    if (!perm) throw err(400, 'unknown_setting', `Unknown setting: ${k}`);
    if (!can(req.user.role, perm)) throw err(403, 'forbidden', `No permission to change ${k}`);
    if (settings.isSecret(k) && (v === '__set__' || v === undefined)) continue; // unchanged secret
    let val = typeof v === 'boolean' ? (v ? '1' : '0') : String(v ?? '').slice(0, 20000);
    if (k === 'site_url' && val && !/^https?:\/\/[^\s/]+(:\d+)?$/.test(val.replace(/\/+$/, ''))) throw err(422, 'validation_failed', 'Site URL must look like https://example.com', { fields: { site_url: 'invalid' } });
    if (k === 'site_url') val = val.replace(/\/+$/, '');
    if (['theme_color', 'background_color'].includes(k) && !/^#[0-9a-fA-F]{6}$/.test(val)) throw err(422, 'validation_failed', 'Invalid colour', { fields: { [k]: 'invalid' } });
    if (['currencies', 'firebase_web_config', 'firebase_service_account'].includes(k) && val) { try { JSON.parse(val); } catch { throw err(422, 'validation_failed', `${k} must be valid JSON`, { fields: { [k]: 'invalid' } }); } }
    if (k === 'currencies') {
      const list = JSON.parse(val);
      if (!Array.isArray(list) || !list.length || !list.every((c) => /^[A-Z]{3}$/.test(c.code) && c.symbol && Number(c.rate) > 0)) throw err(422, 'validation_failed', 'Each currency needs code, symbol and a positive rate', { fields: { currencies: 'invalid' } });
    }
    if (k === 'site_name' && !val.trim()) throw err(422, 'validation_failed', 'Site name is required', { fields: { site_name: 'required' } });
    await settings.set(k, val, req.user.id);
    changed.push(k);
  }
  if (changed.length) await logs.audit(req, 'settings.update', 'settings', null, { keys: changed });
  ok(res, { changed });
}));

r.post('/branding/:kind', requirePerm('branding.manage'), upload.brand('file'), ah(async (req, res) => {
  const kinds = { logo: 'logo_url', favicon: 'favicon_url', pwa_icon: 'pwa_icon_url', og_image: 'og_image_url' };
  const key = kinds[req.params.kind];
  if (!key) throw err(404, 'not_found', 'Unknown asset');
  if (!req.file) throw err(422, 'validation_failed', 'Choose an image');
  let url;
  if (key === 'pwa_icon_url') {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(req.file.realType)) throw err(415, 'file_type', 'PWA icon must be PNG/JPEG/WebP (512×512 recommended)');
    url = await upload.makePwaIcons(req.file);
    if (!url) throw err(501, 'sharp_missing', 'Image processing (sharp) is not installed on this server');
  } else if (key === 'og_image_url') url = await upload.saveImage(req.file, 'brand', { maxSize: 1200 });
  else url = await upload.saveImage(req.file, 'brand', { maxSize: key === 'favicon_url' ? 256 : 512, keepFormat: key === 'favicon_url' });
  await settings.set(key, url, req.user.id); // note: site_name is a separate setting and never touched here
  await logs.audit(req, 'branding.upload', 'settings', key, { url });
  ok(res, { key, url });
}));
r.delete('/branding/:kind', requirePerm('branding.manage'), ah(async (req, res) => {
  const kinds = { logo: 'logo_url', favicon: 'favicon_url', pwa_icon: 'pwa_icon_url', og_image: 'og_image_url' };
  if (!kinds[req.params.kind]) throw err(404, 'not_found', 'Unknown asset');
  await settings.set(kinds[req.params.kind], '', req.user.id);
  await logs.audit(req, 'branding.reset', 'settings', kinds[req.params.kind]);
  ok(res, { reset: true });
}));

r.post('/settings/test-smtp', requirePerm('settings.system'), ah(async (req, res) => {
  try { await mailer.verifyConnection(); ok(res, { ok: true }); } catch (e) { throw err(502, 'smtp_failed', 'SMTP connection failed: ' + e.message); }
}));
r.post('/settings/regenerate-vapid', requirePerm('settings.system'), ah(async (req, res) => {
  const k = push.generateVapid();
  await settings.set('vapid_public', k.publicKey, req.user.id); await settings.set('vapid_private', k.privateKey, req.user.id);
  await db.q("DELETE FROM push_subscriptions WHERE kind='webpush'");
  await logs.audit(req, 'push.vapid_regenerated');
  ok(res, { publicKey: k.publicKey });
}));

/* ---------------- Logs ---------------- */
r.get('/logs/security', requirePerm('logs.security'), ah(async (req, res) => {
  const { limit, page: p, offset } = page(req.query);
  const where = ['1=1']; const params = [];
  if (req.query.event) { where.push('s.event=?'); params.push(String(req.query.event)); }
  if (['info', 'warning', 'critical'].includes(req.query.severity)) { where.push('s.severity=?'); params.push(req.query.severity); }
  if (req.query.q) { const s = `%${String(req.query.q).slice(0, 80).replace(/[%_\\]/g, '\\$&')}%`; where.push('(u.email LIKE ? OR s.ip LIKE ?)'); params.push(s, s); }
  const w = where.join(' AND ');
  const [rows, count, events] = await Promise.all([
    db.q(`SELECT s.id, s.event, s.severity, s.ip, s.user_agent, s.meta, s.created_at, u.email, u.id user_id FROM security_logs s LEFT JOIN users u ON u.id=s.user_id WHERE ${w} ORDER BY s.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
    db.one(`SELECT COUNT(*) n FROM security_logs s LEFT JOIN users u ON u.id=s.user_id WHERE ${w}`, params),
    db.q('SELECT DISTINCT event FROM security_logs ORDER BY event'),
  ]);
  ok(res, { items: rows, total: Number(count.n), page: p, pages: Math.ceil(Number(count.n) / limit), events: events.map((e) => e.event) });
}));
r.get('/logs/audit', requirePerm('logs.audit'), ah(async (req, res) => {
  const { limit, page: p, offset } = page(req.query);
  const where = ['1=1']; const params = [];
  if (req.query.q) { const s = `%${String(req.query.q).slice(0, 80).replace(/[%_\\]/g, '\\$&')}%`; where.push('(a.action LIKE ? OR u.email LIKE ? OR a.target_id LIKE ?)'); params.push(s, s, s); }
  const w = where.join(' AND ');
  const [rows, count] = await Promise.all([
    db.q(`SELECT a.id, a.action, a.target_type, a.target_id, a.meta, a.ip, a.actor_role, a.created_at, u.email FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE ${w} ORDER BY a.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
    db.one(`SELECT COUNT(*) n FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE ${w}`, params),
  ]);
  ok(res, { items: rows, total: Number(count.n), page: p, pages: Math.ceil(Number(count.n) / limit) });
}));

/* ---------------- System & backups ---------------- */
r.get('/system', requirePerm('settings.system'), ah(async (req, res) => {
  const [ver, tables, migrations] = await Promise.all([
    db.one('SELECT VERSION() v'),
    db.q('SELECT table_name name, table_rows `rows`, ROUND((data_length+index_length)/1024) kb FROM information_schema.tables WHERE table_schema=DATABASE() ORDER BY (data_length+index_length) DESC'),
    db.q('SELECT name, applied_at FROM migrations ORDER BY name'),
  ]);
  ok(res, {
    node: process.version, platform: `${os.type()} ${os.release()}`, uptime: Math.round(process.uptime()), memory: Math.round(process.memoryUsage().rss / 1048576),
    load: os.loadavg().map((x) => Math.round(x * 100) / 100), db: ver.v, tables: tables.map((t) => ({ name: t.name || t.NAME || t.TABLE_NAME, rows: Number(t.rows ?? t.ROWS ?? 0), kb: Number(t.kb) })), migrations,
    mail: mailer.enabled(), push: { vapid: !!settings.get('vapid_public'), firebase: settings.bool('firebase_enabled') }, sharp: upload.hasSharp(), env: process.env.NODE_ENV || 'development',
  });
}));

r.get('/backups', requirePerm('backups'), ah(async (req, res) => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.sql')).map((f) => { const s = fs.statSync(path.join(BACKUP_DIR, f)); return { name: f, size: s.size, created: s.mtime }; }).sort((a, b) => b.created - a.created);
  ok(res, files);
}));
r.post('/backups', requirePerm('backups'), ah(async (req, res) => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const name = `lifetrack-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.sql`;
  const file = path.join(BACKUP_DIR, name);
  const out = fs.createWriteStream(file, { mode: 0o600 });
  const pool = db.getPool();
  out.write(`-- LifeTrack backup ${new Date().toISOString()}\nSET FOREIGN_KEY_CHECKS=0;\nSET NAMES utf8mb4;\n\n`);
  const tables = (await db.q('SHOW TABLES')).map((r0) => Object.values(r0)[0]);
  for (const t of tables) {
    const create = await db.one(`SHOW CREATE TABLE \`${t}\``);
    out.write(`DROP TABLE IF EXISTS \`${t}\`;\n${create['Create Table']};\n`);
    let offset = 0;
    for (;;) {
      const rows = await db.q(`SELECT * FROM \`${t}\` LIMIT 500 OFFSET ${offset}`);
      if (!rows.length) break;
      const cols = Object.keys(rows[0]).map((c) => `\`${c}\``).join(',');
      out.write(`INSERT INTO \`${t}\` (${cols}) VALUES\n${rows.map((row) => '(' + Object.values(row).map((v) => pool.escape(v)).join(',') + ')').join(',\n')};\n`);
      offset += rows.length;
      if (rows.length < 500) break;
    }
    out.write('\n');
  }
  out.write('SET FOREIGN_KEY_CHECKS=1;\n');
  await new Promise((resolve) => out.end(resolve));
  await logs.audit(req, 'backup.create', 'backup', name);
  ok(res, { name, size: fs.statSync(file).size }, 201);
}));
r.get('/backups/:name', requirePerm('backups'), ah(async (req, res) => {
  const name = path.basename(req.params.name);
  const file = path.join(BACKUP_DIR, name);
  if (!/^lifetrack-[\w-]+\.sql$/.test(name) || !fs.existsSync(file)) throw err(404, 'not_found', 'Backup not found');
  await logs.audit(req, 'backup.download', 'backup', name);
  res.download(file);
}));
r.delete('/backups/:name', requirePerm('backups'), ah(async (req, res) => {
  const name = path.basename(req.params.name);
  if (!/^lifetrack-[\w-]+\.sql$/.test(name)) throw err(404, 'not_found', 'Backup not found');
  fs.rmSync(path.join(BACKUP_DIR, name), { force: true });
  await logs.audit(req, 'backup.delete', 'backup', name);
  ok(res, { deleted: true });
}));

module.exports = r;
