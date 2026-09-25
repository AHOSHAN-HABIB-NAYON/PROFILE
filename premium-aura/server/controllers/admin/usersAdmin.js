'use strict';
const db = require('../../config/database');
const config = require('../../config/env');
const User = require('../../models/user');
const wallet = require('../../models/wallet');
const audit = require('../../models/auditLog');
const notifications = require('../../models/notification');
const premium = require('../../services/premium');
const quota = require('../../services/quota');
const mailer = require('../../services/mailer');
const money = require('../../utils/money');
const v = require('../../utils/validate');
const { E } = require('../../utils/errors');
const { paginate, meta } = require('../../utils/pagination');
const { randomToken, sha256 } = require('../../utils/crypto');

const SORTS = { id: 'u.id', name: 'u.name', balance: 'balance', joined: 'u.created_at', active: 'u.last_active_at', events: 'event_count' };

exports.list = async (req, res) => {
  const p = paginate(req.query, { defaultSize: 30 });
  const where = ['1=1'];
  const params = [];
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (q) {
    if (/^\d+$/.test(q)) { where.push('(u.id = ? OR u.email LIKE ? OR u.name LIKE ?)'); params.push(Number(q), `%${q}%`, `%${q}%`); }
    else { where.push('(u.email LIKE ? OR u.name LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  }
  if (['active', 'suspended', 'pending'].includes(req.query.status)) { where.push('u.status = ?'); params.push(req.query.status); }
  if (['user', 'admin'].includes(req.query.role)) { where.push('u.role = ?'); params.push(req.query.role); }
  if (req.query.premium === '1') where.push("EXISTS (SELECT 1 FROM user_premium up WHERE up.user_id = u.id AND up.status = 'active' AND up.expires_at > UTC_TIMESTAMP())");
  if (req.query.premium === '0') where.push("NOT EXISTS (SELECT 1 FROM user_premium up WHERE up.user_id = u.id AND up.status = 'active' AND up.expires_at > UTC_TIMESTAMP())");
  const sort = SORTS[req.query.sort] || 'u.id';
  const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  const rows = await db.query(
    `SELECT u.id, u.name, u.email, u.role, u.status, u.email_verified_at, u.created_at, u.last_active_at,
            COALESCE(w.balance, 0) AS balance,
            (SELECT COUNT(*) FROM resource_assignments a WHERE a.user_id = u.id) AS used_resources,
            (SELECT COUNT(*) FROM event_records e WHERE e.user_id = u.id) AS event_count,
            (SELECT up.plan_name FROM user_premium up WHERE up.user_id = u.id AND up.status = 'active' AND up.expires_at > UTC_TIMESTAMP() ORDER BY up.expires_at DESC LIMIT 1) AS premium_plan
     FROM users u LEFT JOIN wallets w ON w.user_id = u.id
     WHERE ${where.join(' AND ')} ORDER BY ${sort} ${dir} LIMIT ? OFFSET ?`,
    [...params, p.size, p.offset],
  );
  const [{ n }] = await db.query(`SELECT COUNT(*) AS n FROM users u WHERE ${where.join(' AND ')}`, params);
  res.json({ ok: true, items: rows.map((r) => ({ ...r, balance: money.display(r.balance) })), pagination: meta(n, p) });
};

exports.show = async (req, res) => {
  const id = v.id(req.params.id);
  const u = await db.one('SELECT * FROM users WHERE id = ?', [id]);
  if (!u) throw E.notFound('User not found');
  const [limits, w, tx, assignments, premiums, sec] = await Promise.all([
    quota.limitsFor(id),
    db.one('SELECT balance, total_earned, total_withdrawn FROM wallets WHERE user_id = ?', [id]),
    db.query('SELECT id, type, amount, balance_after, description, status, created_at FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 15', [id]),
    db.query(`SELECT a.id, a.status, a.assigned_at, a.released_at, r.resource_value, s.country_code, s.app_code FROM resource_assignments a
              JOIN authorized_resources r ON r.id = a.resource_id JOIN services s ON s.id = a.service_id WHERE a.user_id = ? ORDER BY a.id DESC LIMIT 15`, [id]),
    db.query('SELECT id, plan_name, resource_limit, starts_at, expires_at, status FROM user_premium WHERE user_id = ? ORDER BY id DESC LIMIT 10', [id]),
    db.one('SELECT failed_login_attempts, locked_until, password_changed_at FROM user_security WHERE user_id = ?', [id]),
  ]);
  const twofa = await db.one('SELECT enabled FROM two_factor_auth WHERE user_id = ?', [id]);
  res.json({
    ok: true,
    user: { ...User.toPublic(u), custom_hourly_limit: u.custom_hourly_limit, custom_daily_limit: u.custom_daily_limit, custom_quota: u.custom_quota,
      last_active_at: u.last_active_at, last_login_at: u.last_login_at, last_login_ip: u.last_login_ip, twofa: !!twofa?.enabled, security: sec },
    limits,
    wallet: { balance: money.display(w?.balance || 0), earned: money.display(w?.total_earned || 0), withdrawn: money.display(w?.total_withdrawn || 0) },
    transactions: tx.map((t) => ({ ...t, amount: money.normalize(t.amount), balance_after: money.normalize(t.balance_after) })),
    assignments, premiums,
  });
};

exports.update = async (req, res) => {
  const id = v.id(req.params.id);
  const u = await db.one('SELECT id, role FROM users WHERE id = ?', [id]);
  if (!u) throw E.notFound('User not found');
  const name = v.str(req.body.name, { name: 'Name', min: 2, max: 120, required: true });
  const email = v.email(req.body.email);
  const role = v.oneOf(req.body.role, ['user', 'admin'], { def: u.role });
  if (id === req.user.id && role !== 'admin') throw E.badRequest('You cannot remove your own admin role');
  const dupe = await db.one('SELECT id FROM users WHERE email = ? AND id <> ?', [email, id]);
  if (dupe) throw E.conflict('Email already in use');
  const verified = v.bool(req.body.email_verified);
  await db.run('UPDATE users SET name = ?, email = ?, role = ?, email_verified_at = IF(?, COALESCE(email_verified_at, UTC_TIMESTAMP()), NULL) WHERE id = ?',
    [name, email, role, verified ? 1 : 0, id]);
  await audit.log(req, 'user.update', { targetType: 'user', targetId: id, details: { name, email, role, verified } });
  res.json({ ok: true, message: 'User updated' });
};

async function setStatus(req, id, status) {
  if (id === req.user.id) throw E.badRequest('You cannot change your own status');
  const r = await db.run('UPDATE users SET status = ? WHERE id = ?', [status, id]);
  if (!r.affectedRows) throw E.notFound('User not found');
  if (status === 'suspended') await db.run('DELETE FROM user_sessions WHERE user_id = ?', [id]);
  await audit.log(req, `user.${status === 'suspended' ? 'suspend' : 'unsuspend'}`, { targetType: 'user', targetId: id });
}

exports.suspend = async (req, res) => { await setStatus(req, v.id(req.params.id), 'suspended'); res.json({ ok: true, message: 'User suspended' }); };
exports.unsuspend = async (req, res) => { await setStatus(req, v.id(req.params.id), 'active'); res.json({ ok: true, message: 'User reactivated' }); };

exports.approve = async (req, res) => {
  const id = v.id(req.params.id);
  const u = await db.one('SELECT id, name, email, status FROM users WHERE id = ?', [id]);
  if (!u) throw E.notFound('User not found');
  if (u.status !== 'pending') throw E.conflict('This account is not waiting for approval');
  await db.run("UPDATE users SET status = 'active' WHERE id = ?", [id]);
  const site = await require('../../models/settings').get('site_name');
  const url = `${config.appUrl || `${req.protocol}://${req.get('host')}`}/login`;
  await mailer.send({
    to: u.email, subject: `Your ${site} account is approved 🎉`, title: `Welcome, ${u.name}!`,
    text: `Good news — your ${site} account has been approved. You can sign in and start using it now.`,
    cta: { url, label: 'Sign in now' },
  });
  await notifications.notify(id, { type: 'system', title: 'Account approved', body: 'Welcome! Your account is active.', link: '/dashboard' });
  await audit.log(req, 'user.approve', { targetType: 'user', targetId: id });
  res.json({ ok: true, message: 'Account approved — the user was emailed' });
};

exports.resetPassword = async (req, res) => {
  const id = v.id(req.params.id);
  const u = await db.one('SELECT id, email FROM users WHERE id = ?', [id]);
  if (!u) throw E.notFound('User not found');
  const token = randomToken(32);
  await User.security(id);
  await db.run('UPDATE user_security SET password_reset_token_hash = ?, password_reset_expires_at = UTC_TIMESTAMP() + INTERVAL 24 HOUR WHERE user_id = ?', [sha256(token), id]);
  const url = `${config.appUrl || `${req.protocol}://${req.get('host')}`}/reset-password?token=${token}`;
  const sent = await mailer.send({ to: u.email, subject: 'Password reset by administrator', title: 'Reset your password',
    text: 'An administrator started a password reset for your account. The link is valid for 24 hours.', cta: { url, label: 'Set new password' } });
  await audit.log(req, 'user.reset_password', { targetType: 'user', targetId: id });
  // The link is shown to the admin only when e-mail delivery is not configured.
  res.json({ ok: true, message: sent.delivered ? 'Reset link emailed to the user' : 'SMTP not configured — share this one-time link securely', link: sent.delivered ? undefined : url });
};

exports.limits = async (req, res) => {
  const id = v.id(req.params.id);
  const opt = (x, name) => (x === '' || x === null || x === undefined ? null : v.int(x, { name, min: 0, max: 1_000_000 }));
  const hourly = opt(req.body.custom_hourly_limit, 'Hourly limit');
  const daily = opt(req.body.custom_daily_limit, 'Daily limit');
  const q = opt(req.body.custom_quota, 'Quota');
  const r = await db.run('UPDATE users SET custom_hourly_limit = ?, custom_daily_limit = ?, custom_quota = ? WHERE id = ?', [hourly, daily, q, id]);
  if (!r.affectedRows) throw E.notFound('User not found');
  await audit.log(req, 'user.limits', { targetType: 'user', targetId: id, details: { hourly, daily, quota: q } });
  res.json({ ok: true, message: 'Limits updated' });
};

exports.premium = async (req, res) => {
  const id = v.id(req.params.id);
  const action = v.oneOf(req.body.action, ['grant', 'revoke'], { name: 'Action' });
  if (action === 'revoke') {
    await db.run("UPDATE user_premium SET status = 'cancelled' WHERE user_id = ? AND status = 'active'", [id]);
    await notifications.notify(id, { type: 'premium', title: 'Premium updated', body: 'Your premium plan was cancelled by an administrator.', link: '/premium' });
    await audit.log(req, 'user.premium_revoke', { targetType: 'user', targetId: id });
    return res.json({ ok: true, message: 'Premium revoked' });
  }
  const planId = v.id(req.body.plan_id, 'plan_id');
  const plan = await db.one('SELECT * FROM premium_plans WHERE id = ?', [planId]);
  if (!plan) throw E.notFound('Plan not found');
  const out = await db.transaction((tx) => premium.activate(tx, id, plan, { grantedBy: req.user.id }));
  await audit.log(req, 'user.premium_grant', { targetType: 'user', targetId: id, details: { plan: plan.name } });
  res.json({ ok: true, message: `${plan.name} granted`, expires_at: out.expires_at });
};

exports.adjustWallet = async (req, res) => {
  const id = v.id(req.params.id);
  const amount = String(req.body.amount ?? '').trim();
  if (!money.isMoney(amount) || money.cmp(amount, '0') === 0) throw E.badRequest('Enter a non-zero amount, e.g. 5.00 or -2.50');
  const reason = v.str(req.body.reason, { name: 'Reason', required: true, min: 3, max: 200 });
  const t = await db.transaction((tx) => wallet.apply(tx, id, amount, { type: 'admin_adjustment', description: `Admin adjustment: ${reason}`, adminId: req.user.id }));
  wallet.emitBalance(id, t.balance);
  await notifications.notify(id, { type: 'system', title: 'Wallet adjusted', body: `${money.cmp(amount, '0') > 0 ? '+' : ''}$${money.display(amount)} — ${reason}`, link: '/wallet' });
  await audit.log(req, 'user.wallet_adjust', { targetType: 'user', targetId: id, details: { amount, reason } });
  res.json({ ok: true, message: 'Wallet adjusted', balance: money.display(t.balance) });
};

exports.bulk = async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map((x) => v.id(x)).filter((x) => x !== req.user.id).slice(0, 500);
  const action = v.oneOf(req.body.action, ['suspend', 'unsuspend', 'verify'], { name: 'Action' });
  if (!ids.length) throw E.badRequest('Select at least one user');
  let r;
  if (action === 'verify') r = await db.run('UPDATE users SET email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id IN (?)', [ids]);
  else {
    r = await db.run('UPDATE users SET status = ? WHERE id IN (?)', [action === 'suspend' ? 'suspended' : 'active', ids]);
    if (action === 'suspend') await db.run('DELETE FROM user_sessions WHERE user_id IN (?)', [ids]);
  }
  await audit.log(req, `user.bulk_${action}`, { targetType: 'user', details: { ids } });
  res.json({ ok: true, message: `${r.affectedRows} user(s) updated` });
};

exports.create = async (req, res) => {
  const name = v.str(req.body.name, { name: 'Name', min: 2, max: 120, required: true });
  const email = v.email(req.body.email);
  const password = v.password(req.body.password);
  const role = v.oneOf(req.body.role, ['user', 'admin'], { def: 'user' });
  const id = await User.create({ name, email, password, role, verified: true });
  await audit.log(req, 'user.create', { targetType: 'user', targetId: id, details: { email, role } });
  res.status(201).json({ ok: true, id, message: 'User created' });
};

exports.remove = async (req, res) => {
  const id = v.id(req.params.id);
  if (id === req.user.id) throw E.badRequest('You cannot delete yourself');
  await db.transaction(async (tx) => {
    // Assignments reference resources with RESTRICT; release and clear them first.
    await tx.run("UPDATE authorized_resources SET status = 'retired', assigned_user_id = NULL WHERE assigned_user_id = ?", [id]);
    await tx.run('DELETE FROM resource_assignments WHERE user_id = ?', [id]);
    await tx.run('DELETE FROM users WHERE id = ?', [id]);
  });
  await audit.log(req, 'user.delete', { targetType: 'user', targetId: id });
  res.json({ ok: true, message: 'User deleted' });
};
