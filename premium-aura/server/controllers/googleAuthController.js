'use strict';
/**
 * Sign in with Google (OAuth 2.0 authorization-code flow, server side).
 * Admin → System Settings → Google Login holds the client id and the
 * encrypted client secret. Google proves the email address, so accounts
 * created here skip email verification but still honour admin approval.
 */
const db = require('../config/database');
const config = require('../config/env');
const settings = require('../models/settings');
const User = require('../models/user');
const audit = require('../models/auditLog');
const twofa = require('../services/twofa');
const logger = require('../utils/logger');
const { decrypt, randomToken, safeEqual } = require('../utils/crypto');
const { finalizeLogin, requestApproval } = require('./authController');

const ENDPOINTS = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
};
// Test hook: point the token/userinfo calls at a local mock (never in production).
if (!config.isProd && process.env.GOOGLE_OAUTH_MOCK) {
  const m = process.env.GOOGLE_OAUTH_MOCK.replace(/\/+$/, '');
  Object.assign(ENDPOINTS, { auth: `${m}/auth`, token: `${m}/token`, userinfo: `${m}/userinfo` });
}

const STATE_TTL = 10 * 60_000;

function baseUrl(req) {
  return config.appUrl || `${req.protocol}://${req.get('host')}`;
}
const redirectUri = (req) => `${baseUrl(req)}/auth/google/callback`;
const saveSession = (req) => new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
const fail = (res, code) => res.redirect(`/login?google=${code}`);

function safeNext(n) {
  return typeof n === 'string' && /^\/(?!\/)[\w\-/?=&.%]*$/.test(n) && !n.startsWith('/login') ? n : null;
}

async function credentials() {
  const all = await settings.loadAll();
  if (!settings.googleReady(all)) return null;
  try {
    return { id: all.google_client_id, secret: decrypt(all.google_client_secret) };
  } catch (err) {
    logger.error(`Google login: client secret cannot be decrypted (${err.message})`);
    return null;
  }
}

exports.start = async (req, res) => {
  const c = await credentials();
  if (!c) return fail(res, 'disabled');
  const state = randomToken(24);
  req.session.googleOAuth = { state, at: Date.now(), next: safeNext(req.query.next) };
  const q = new URLSearchParams({
    client_id: c.id, redirect_uri: redirectUri(req), response_type: 'code',
    scope: 'openid email profile', state, prompt: 'select_account',
  });
  await saveSession(req); // the state must be stored before the browser can come back
  res.redirect(`${ENDPOINTS.auth}?${q}`);
};

async function fetchProfile(req, c, code) {
  const tr = await fetch(ENDPOINTS.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri(req), grant_type: 'authorization_code' }),
    signal: AbortSignal.timeout(10_000),
  });
  const tok = await tr.json().catch(() => ({}));
  if (!tr.ok || !tok.access_token) throw new Error(`token exchange failed (${tr.status} ${tok.error || ''})`);
  const ur = await fetch(ENDPOINTS.userinfo, { headers: { Authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(10_000) });
  const p = await ur.json().catch(() => ({}));
  if (!ur.ok || !p.sub) throw new Error(`userinfo failed (${ur.status})`);
  return p;
}

exports.callback = async (req, res) => {
  const saved = req.session?.googleOAuth;
  if (req.session) req.session.googleOAuth = null;
  if (req.query.error) return fail(res, 'cancelled');
  const state = String(req.query.state || '');
  if (!saved || Date.now() - saved.at > STATE_TTL || !safeEqual(state, saved.state)) return fail(res, 'expired');
  const c = await credentials();
  if (!c) return fail(res, 'disabled');

  let p;
  try {
    p = await fetchProfile(req, c, String(req.query.code || ''));
  } catch (err) {
    logger.warn(`Google login: ${err.message}`);
    return fail(res, 'failed');
  }
  const email = String(p.email || '').toLowerCase();
  if (!email || !(p.email_verified === true || p.email_verified === 'true')) return fail(res, 'unverified');
  const sub = String(p.sub).slice(0, 64);

  let user = await db.one('SELECT * FROM users WHERE google_id = ?', [sub])
    || await db.one('SELECT * FROM users WHERE email = ?', [email]);
  if (user) {
    // Link on first Google sign-in; Google has verified this address.
    if (!user.google_id) await db.run('UPDATE users SET google_id = ? WHERE id = ?', [sub, user.id]);
    if (!user.email_verified_at) await db.run('UPDATE users SET email_verified_at = UTC_TIMESTAMP() WHERE id = ?', [user.id]);
  } else {
    if (!(await settings.getBool('registration_enabled'))) return fail(res, 'closed');
    const name = (String(p.name || '').trim() || email.split('@')[0]).slice(0, 120);
    const pending = await settings.getBool('require_admin_approval');
    const id = await User.create({ name, email, password: randomToken(24), verified: true, status: pending ? 'pending' : 'active' });
    await db.run('UPDATE users SET google_id = ? WHERE id = ?', [sub, id]);
    await audit.log(req, 'register', { category: 'auth', userId: id, targetType: 'user', targetId: id, details: { via: 'google' } });
    if (pending) requestApproval(req, { name, email }).catch(() => {});
    user = await db.one('SELECT * FROM users WHERE id = ?', [id]);
  }

  if (user.status === 'suspended') return fail(res, 'suspended');
  if (user.status === 'pending') { await saveSession(req); return res.redirect('/login?verified=pending'); }
  if (await twofa.isEnabled(user.id)) {
    req.session.pending2fa = { userId: user.id, remember: true, at: Date.now() };
    await saveSession(req);
    return res.redirect('/two-factor');
  }
  await finalizeLogin(req, user, true);
  await audit.log(req, 'login.google', { category: 'auth', userId: user.id });
  await saveSession(req);
  res.redirect(user.role === 'admin' && saved.next === '/admin' ? '/admin' : (saved.next || '/dashboard'));
};
