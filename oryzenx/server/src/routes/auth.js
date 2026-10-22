const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const config = require('../config');
const { query, one } = require('../db');
const {
  ah, bad, HttpError, sha256, randomToken, EMAIL_RE, str,
} = require('../lib/util');
const {
  setSession, clearSession, stageOf, privateUser, requireLogin,
} = require('../lib/auth');
const { sendEmail, esc } = require('../lib/mail');
const notify = require('../lib/notify');
const audit = require('../lib/audit');

const router = express.Router();
const google = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;

const strictLimit = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown, so timing does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

function checkPassword(pw) {
  const p = str(pw, { field: 'Password', min: 8, max: 128, required: true });
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) throw bad('Password needs at least one letter and one number');
  return p;
}

async function issueToken(userId, type, hours) {
  const token = randomToken();
  await query('UPDATE user_tokens SET used_at = NOW() WHERE user_id = ? AND type = ? AND used_at IS NULL', [userId, type]);
  await query(
    'INSERT INTO user_tokens (user_id, type, token_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))',
    [userId, type, sha256(token), hours],
  );
  return token;
}

async function consumeToken(token, type) {
  if (!token || typeof token !== 'string') throw bad('This link is invalid');
  const row = await one(
    'SELECT * FROM user_tokens WHERE token_hash = ? AND type = ? AND used_at IS NULL AND expires_at > NOW()',
    [sha256(token), type],
  );
  if (!row) throw bad('This link has expired or was already used. Request a new one.');
  await query('UPDATE user_tokens SET used_at = NOW() WHERE id = ?', [row.id]);
  return row.user_id;
}

async function sendVerification(user) {
  const token = await issueToken(user.id, 'verify_email', 48);
  await sendEmail(user, 'verify_email', {
    subject: 'Verify your email - OryzenX BD',
    title: 'Verify your email',
    body: `Hi ${esc(user.name)},<br>Tap the button below to verify your email address. The link expires in 48 hours.`,
    cta: { label: 'Verify email', url: `${config.appUrl}/#/verify-email?token=${token}` },
  });
}

// Invite codes auto-approve the account once the email is verified.
async function useInvite(code, user) {
  if (!code) return false;
  const inv = await one(
    'SELECT * FROM invites WHERE code = ? AND used_by IS NULL AND (expires_at IS NULL OR expires_at > NOW())',
    [String(code).trim().toUpperCase()],
  );
  if (!inv) throw bad('This invite code is invalid or already used');
  if (inv.email && inv.email.toLowerCase() !== user.email.toLowerCase()) throw bad('This invite code is for a different email');
  await query('UPDATE invites SET used_by = ?, used_at = NOW() WHERE id = ?', [user.id, inv.id]);
  return true;
}

async function activate(user) {
  await query("UPDATE users SET status = 'active' WHERE id = ? AND status = 'pending'", [user.id]);
  await sendEmail(user, 'account_approved', {
    subject: 'Your OryzenX BD account is approved',
    title: 'Welcome to the group!',
    body: `Hi ${esc(user.name)},<br>Your account has been approved. You can now open the dashboard.`,
    cta: { label: 'Open OryzenX BD', url: config.appUrl },
  });
}

async function notifyAdminsOfSignup(user) {
  await notify(null, 'New member waiting', `${user.name} signed up and is waiting for admin approval.`).catch(() => {});
}

async function loginAlert(req, user) {
  const ua = String(req.get('user-agent') || '').slice(0, 255);
  const seen = await one(
    'SELECT id FROM login_events WHERE user_id = ? AND success = 1 AND user_agent = ? LIMIT 1', [user.id, ua],
  );
  await query('INSERT INTO login_events (user_id, email, ip, user_agent, success) VALUES (?, ?, ?, ?, 1)', [user.id, user.email, req.ip, ua]);
  if (!seen && stageOf(user) === 'ready') {
    await sendEmail(user, 'security', {
      subject: 'New login to your OryzenX BD account',
      title: 'New login detected',
      body: `A new device signed in to your account.<br><b>Device:</b> ${esc(ua || 'Unknown')}<br><b>IP:</b> ${esc(req.ip)}<br>If this was not you, change your password now.`,
    });
  }
}

router.get('/config', (_req, res) => {
  res.json({ googleClientId: config.googleClientId || null });
});

router.post('/signup', strictLimit, ah(async (req, res) => {
  const name = str(req.body.name, { field: 'Name', min: 2, max: 120, required: true });
  const email = str(req.body.email, { field: 'Email', max: 190, required: true }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw bad('Enter a valid email address');
  const password = checkPassword(req.body.password);
  if (await one('SELECT id FROM users WHERE email = ?', [email])) throw bad('An account with this email already exists. Try logging in.');

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const r = await query('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [name, email, hash]);
  const user = await one('SELECT * FROM users WHERE id = ?', [r.insertId]);
  try {
    if (await useInvite(req.body.invite, user)) await query("UPDATE users SET status = 'active' WHERE id = ?", [user.id]);
    else await notifyAdminsOfSignup(user);
  } catch (err) {
    await query('DELETE FROM users WHERE id = ?', [user.id]);
    throw err;
  }
  await sendVerification(user);
  await sendEmail(user, 'welcome', {
    subject: 'Welcome to OryzenX BD',
    title: `Welcome, ${user.name}!`,
    body: 'Thanks for joining. Please verify your email. An admin will approve your account shortly.',
  });
  setSession(res, user);
  const fresh = await one('SELECT * FROM users WHERE id = ?', [user.id]);
  res.status(201).json({ user: privateUser(fresh), stage: stageOf(fresh) });
}));

router.post('/login', strictLimit, ah(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = email ? await one('SELECT * FROM users WHERE email = ?', [email]) : null;
  // Always run bcrypt so response time does not reveal whether the email exists.
  const ok = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
  if (!user || !user.password_hash || !ok) {
    await query('INSERT INTO login_events (user_id, email, ip, user_agent, success) VALUES (?, ?, ?, ?, 0)',
      [user?.id || null, email.slice(0, 190), req.ip, String(req.get('user-agent') || '').slice(0, 255)]);
    throw new HttpError(401, 'Wrong email or password');
  }
  if (user.status === 'disabled') throw new HttpError(403, 'This account is disabled. Contact an admin.');
  setSession(res, user);
  await loginAlert(req, user);
  res.json({ user: privateUser(user), stage: stageOf(user) });
}));

router.post('/google', strictLimit, ah(async (req, res) => {
  if (!google) throw bad('Google login is not set up on this server');
  let payload;
  try {
    const ticket = await google.verifyIdToken({ idToken: String(req.body.credential || ''), audience: config.googleClientId });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, 'Google sign-in failed. Please try again.');
  }
  if (!payload.email || !payload.email_verified) throw bad('Your Google email is not verified');
  const email = payload.email.toLowerCase();
  let user = await one('SELECT * FROM users WHERE google_sub = ? OR email = ? ORDER BY google_sub IS NULL LIMIT 1', [payload.sub, email]);
  if (user) {
    if (user.status === 'disabled') throw new HttpError(403, 'This account is disabled. Contact an admin.');
    await query('UPDATE users SET google_sub = ?, email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?', [payload.sub, user.id]);
  } else {
    const name = String(payload.name || email.split('@')[0]).slice(0, 120);
    const r = await query(
      'INSERT INTO users (name, email, google_sub, email_verified_at) VALUES (?, ?, ?, NOW())', [name, email, payload.sub],
    );
    user = await one('SELECT * FROM users WHERE id = ?', [r.insertId]);
    if (req.body.invite) await useInvite(req.body.invite, user).then((ok) => ok && activate(user));
    else await notifyAdminsOfSignup(user);
    await sendEmail(user, 'welcome', {
      subject: 'Welcome to OryzenX BD', title: `Welcome, ${user.name}!`,
      body: 'Thanks for joining. An admin will approve your account shortly.',
    });
  }
  user = await one('SELECT * FROM users WHERE id = ?', [user.id]);
  setSession(res, user);
  await loginAlert(req, user);
  res.json({ user: privateUser(user), stage: stageOf(user) });
}));

router.post('/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });

router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null, stage: 'logged_out' });
  res.json({ user: privateUser(req.user), stage: stageOf(req.user) });
});

router.post('/verify-email', strictLimit, ah(async (req, res) => {
  const userId = await consumeToken(req.body.token, 'verify_email');
  await query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?', [userId]);
  const user = await one('SELECT * FROM users WHERE id = ?', [userId]);
  res.json({ ok: true, stage: stageOf(user) });
}));

router.post('/resend-verification', strictLimit, requireLogin, ah(async (req, res) => {
  if (req.user.email_verified_at) return res.json({ ok: true });
  await sendVerification(req.user);
  res.json({ ok: true });
}));

router.post('/forgot-password', strictLimit, ah(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = email ? await one("SELECT * FROM users WHERE email = ? AND status <> 'disabled'", [email]) : null;
  if (user) {
    const token = await issueToken(user.id, 'reset_password', 1);
    await sendEmail(user, 'reset_password', {
      subject: 'Reset your OryzenX BD password',
      title: 'Reset your password',
      body: `Hi ${esc(user.name)},<br>Tap the button to choose a new password. The link expires in 1 hour. If you did not ask for this, ignore this email.`,
      cta: { label: 'Reset password', url: `${config.appUrl}/#/reset-password?token=${token}` },
    });
  }
  // Same answer either way, so this cannot be used to find out who has an account.
  res.json({ ok: true });
}));

router.post('/reset-password', strictLimit, ah(async (req, res) => {
  const password = checkPassword(req.body.password);
  const userId = await consumeToken(req.body.token, 'reset_password');
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  // Bumping token_version logs out every other session.
  await query('UPDATE users SET password_hash = ?, token_version = token_version + 1, email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?', [hash, userId]);
  const user = await one('SELECT * FROM users WHERE id = ?', [userId]);
  await sendEmail(user, 'security', {
    subject: 'Your OryzenX BD password was changed', title: 'Password changed',
    body: 'Your password was just reset. If this was not you, contact an admin right away.',
  });
  req.user = user;
  await audit(req, 'password_reset', 'user', userId);
  clearSession(res);
  res.json({ ok: true });
}));

router.post('/change-password', strictLimit, requireLogin, ah(async (req, res) => {
  const password = checkPassword(req.body.new_password);
  if (req.user.password_hash && !(await bcrypt.compare(String(req.body.current_password || ''), req.user.password_hash))) {
    throw bad('Current password is wrong');
  }
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await query('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [hash, req.user.id]);
  const user = await one('SELECT * FROM users WHERE id = ?', [req.user.id]);
  setSession(res, user);
  await sendEmail(user, 'security', {
    subject: 'Your OryzenX BD password was changed', title: 'Password changed',
    body: 'Your password was just changed. If this was not you, contact an admin right away.',
  });
  await audit(req, 'password_change', 'user', user.id);
  res.json({ ok: true });
}));

router.post('/accept-privacy', requireLogin, ah(async (req, res) => {
  if (!req.body.accept) throw bad('You need to accept the privacy notice to continue');
  await query('UPDATE users SET privacy_accepted_at = COALESCE(privacy_accepted_at, NOW()) WHERE id = ?', [req.user.id]);
  const user = await one('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ user: privateUser(user), stage: stageOf(user) });
}));

module.exports = { router, activate };
