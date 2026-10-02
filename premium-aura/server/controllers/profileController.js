'use strict';
/** Profile, preferences, password, 2FA, sessions. Sensitive changes require the current password. */
const db = require('../config/database');
const settings = require('../models/settings');
const User = require('../models/user');
const audit = require('../models/auditLog');
const twofa = require('../services/twofa');
const quota = require('../services/quota');
const mailer = require('../services/mailer');
const push = require('../services/push');
const money = require('../utils/money');
const v = require('../utils/validate');
const { E } = require('../utils/errors');

async function requirePassword(req) {
  const pw = v.str(req.body.password ?? req.body.current_password, { name: 'Current password', required: true, max: 128, trim: false });
  const row = await db.one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await User.verifyPassword(pw, row.password_hash))) {
    await audit.log(req, 'security.password_check_failed', { category: 'security', targetType: 'user', targetId: req.user.id });
    throw E.forbidden('Current password is incorrect', { code: 'BAD_PASSWORD' });
  }
}

function validTimezone(tz) {
  if (tz === 'auto') return true;
  try { Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

exports.get = async (req, res) => {
  const [w, limits, twofaOn] = await Promise.all([
    db.one('SELECT balance, total_earned, total_withdrawn FROM wallets WHERE user_id = ?', [req.user.id]),
    quota.limitsFor(req.user.id),
    twofa.isEnabled(req.user.id),
  ]);
  res.json({
    ok: true,
    user: User.toPublic(req.user),
    wallet: { display: money.display(w?.balance || '0'), earned: money.display(w?.total_earned || '0'), withdrawn: money.display(w?.total_withdrawn || '0') },
    limits,
    twofa: twofaOn,
  });
};

exports.update = async (req, res) => {
  const name = v.str(req.body.name, { name: 'Name', min: 2, max: 120, required: true });
  const address = v.str(req.body.address, { name: 'Address', max: 255 });
  const binance = v.str(req.body.binance_uid, { name: 'Binance UID', max: 64, pattern: /^\d{5,20}$/ });
  const tz = v.str(req.body.timezone || 'auto', { name: 'Timezone', max: 64 });
  if (!validTimezone(tz)) throw E.badRequest('Unknown timezone');
  await db.run('UPDATE users SET name = ?, address = ?, binance_uid = ?, timezone = ? WHERE id = ?', [name, address || null, binance || null, tz, req.user.id]);
  res.json({ ok: true, message: 'Profile updated' });
};

exports.theme = async (req, res) => {
  const theme = v.oneOf(req.body.theme, ['light', 'dark'], { name: 'Theme' });
  await db.run('UPDATE users SET theme = ? WHERE id = ?', [theme, req.user.id]);
  res.json({ ok: true, theme });
};

exports.changePassword = async (req, res) => {
  await requirePassword(req);
  const next = v.password(req.body.new_password, { name: 'New password' });
  if (req.body.new_password_confirm !== undefined && req.body.new_password_confirm !== next) throw E.badRequest('Passwords do not match');
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await User.hashPassword(next), req.user.id]);
  await db.run('UPDATE user_security SET password_changed_at = UTC_TIMESTAMP() WHERE user_id = ?', [req.user.id]);
  await db.run('DELETE FROM user_sessions WHERE user_id = ? AND session_id <> ?', [req.user.id, req.sessionID]);
  await audit.log(req, 'password.changed', { category: 'security', targetType: 'user', targetId: req.user.id });
  if (req.user.notify_security !== 0) mailer.send({ to: req.user.email, subject: 'Your password was changed', title: 'Security alert',
    text: `Your ${await settings.get('site_name')} password was changed. Other sessions were signed out. If this was not you, reset your password immediately.` }).catch(() => {});
  res.json({ ok: true, message: 'Password changed. Other devices were signed out.' });
};

exports.security = async (req, res) => {
  const [enabled, remaining, sessions, logs] = await Promise.all([
    twofa.isEnabled(req.user.id),
    twofa.remainingCodes(req.user.id),
    db.query('SELECT session_id, ip, user_agent, updated_at, expires_at FROM user_sessions WHERE user_id = ? AND expires_at > UTC_TIMESTAMP() ORDER BY updated_at DESC LIMIT 20', [req.user.id]),
    db.query("SELECT action, ip, created_at FROM admin_logs WHERE admin_id = ? AND category IN ('auth','security') ORDER BY id DESC LIMIT 15", [req.user.id]),
  ]);
  res.json({
    ok: true,
    twofa: { enabled, recovery_remaining: remaining },
    sessions: sessions.map((s) => ({ current: s.session_id === req.sessionID, ip: s.ip, user_agent: s.user_agent, last_active: s.updated_at, expires_at: s.expires_at })),
    activity: logs,
  });
};

exports.twofaSetup = async (req, res) => {
  await requirePassword(req);
  const out = await twofa.beginSetup(req.user, await settings.get('site_name'));
  if (out.alreadyEnabled) throw E.conflict('Two-factor authentication is already enabled');
  req.session.twofaSetupAt = Date.now();
  res.json({ ok: true, secret: out.secret, qr: out.qr });
};

exports.twofaConfirm = async (req, res) => {
  if (!req.session.twofaSetupAt || Date.now() - req.session.twofaSetupAt > 15 * 60_000) throw E.badRequest('Start the 2FA setup again');
  const code = v.str(req.body.code, { name: 'Code', required: true, pattern: /^\d{6}$/ });
  const out = await twofa.confirm(req.user.id, code);
  if (!out.ok) throw E.badRequest('That code is not valid. Check your authenticator app time and try again.');
  req.session.twofaSetupAt = null;
  await audit.log(req, '2fa.enabled', { category: 'security', targetType: 'user', targetId: req.user.id });
  if (req.user.notify_security !== 0) mailer.send({ to: req.user.email, subject: 'Two-factor authentication enabled', title: 'Security alert', text: '2FA was enabled on your account.' }).catch(() => {});
  res.json({ ok: true, message: 'Two-factor authentication enabled', recovery_codes: out.recoveryCodes });
};

exports.twofaDisable = async (req, res) => {
  await requirePassword(req);
  const code = v.str(req.body.code, { name: 'Authenticator or recovery code', required: true, max: 20 });
  const ok = await twofa.verifyLogin(req.user.id, code);
  if (!ok.ok) throw E.badRequest('Invalid verification code');
  await twofa.disable(req.user.id);
  await audit.log(req, '2fa.disabled', { category: 'security', targetType: 'user', targetId: req.user.id });
  if (req.user.notify_security !== 0) mailer.send({ to: req.user.email, subject: 'Two-factor authentication disabled', title: 'Security alert', text: '2FA was turned off on your account. If this was not you, secure your account now.' }).catch(() => {});
  res.json({ ok: true, message: 'Two-factor authentication disabled' });
};

exports.twofaRecovery = async (req, res) => {
  await requirePassword(req);
  if (!(await twofa.isEnabled(req.user.id))) throw E.badRequest('2FA is not enabled');
  const codes = await twofa.regenerateCodes(req.user.id);
  await audit.log(req, '2fa.recovery_regenerated', { category: 'security', targetType: 'user', targetId: req.user.id });
  res.json({ ok: true, recovery_codes: codes });
};

exports.revokeSessions = async (req, res) => {
  await requirePassword(req);
  const r = await db.run('DELETE FROM user_sessions WHERE user_id = ? AND session_id <> ?', [req.user.id, req.sessionID]);
  await audit.log(req, 'sessions.revoked', { category: 'security', targetType: 'user', targetId: req.user.id, details: { count: r.affectedRows } });
  res.json({ ok: true, message: `Signed out ${r.affectedRows} other session(s)` });
};

exports.file = async (req, res) => {
  const id = v.id(req.params.id);
  const f = await db.one("SELECT id, user_id, visibility, stored_name, mime_type FROM file_uploads WHERE id = ? AND visibility = 'private'", [id]);
  if (!f) throw E.notFound('File not found');
  if (f.user_id !== req.user.id && req.user.role !== 'admin') throw E.forbidden();
  const fileStorage = require('../services/fileStorage');
  res.set('Content-Disposition', `inline; filename="file-${f.id}"`);
  res.set('Cache-Control', 'private, max-age=300');
  if (!(await fileStorage.sendStored(res, f))) throw E.notFound('This file is no longer available');
};

/** The user's own notification preferences (bell, email, push, security alerts). */
exports.notificationPrefs = async (req, res) => {
  const b = req.body || {};
  const val = (k) => (b[k] === undefined ? undefined : (v.bool(b[k]) ? 1 : 0));
  const prefs = { notify_inapp: val('inapp'), notify_email: val('email'), notify_push: val('push'), notify_security: val('security') };
  const set = Object.entries(prefs).filter(([, x]) => x !== undefined);
  if (!set.length) throw E.badRequest('Nothing to save');
  await db.run(`UPDATE users SET ${set.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`, [...set.map(([, x]) => x), req.user.id]);
  res.json({ ok: true, message: 'Notification settings saved' });
};

exports.pushKey = async (req, res) => res.json({ ok: true, key: await push.publicKey() });

exports.pushSubscribe = async (req, res) => {
  if (!(await push.subscribe(req.user.id, req.body.subscription, req.get('user-agent')))) throw E.badRequest('Invalid push subscription');
  res.json({ ok: true, message: 'Push notifications enabled on this device' });
};

exports.pushUnsubscribe = async (req, res) => {
  await push.unsubscribe(req.user.id, req.body.endpoint);
  res.json({ ok: true, message: 'Push notifications turned off on this device' });
};

exports.pushTest = async (req, res) => {
  const n = await push.sendToUser(req.user.id, { title: 'Premium Aura', body: 'Push notifications are working ✅', link: '/settings' });
  res.json({ ok: true, sent: n, message: n ? 'Test notification sent' : 'No device is subscribed (or push is turned off)' });
};
