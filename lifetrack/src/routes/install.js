'use strict';
/**
 * First-run web installer. Available ONLY until installation completes.
 * Optional INSTALL_TOKEN env var must be supplied when set (protects public servers).
 */
const express = require('express');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const path = require('path');
const { ah, ok, err } = require('../lib/http');
const { validate } = require('../lib/validate');
const config = require('../config');

const r = express.Router();

function guard(req) {
  if (config.get().installed) throw err(404, 'not_found', 'Already installed');
  const tok = process.env.INSTALL_TOKEN;
  if (tok && req.body?.install_token !== tok) throw err(403, 'install_token', 'Invalid installation token');
}

const dbSchema = {
  db_host: ['str', { min: 1, max: 190 }], db_port: ['int', { min: 1, max: 65535, optional: true, default: 3306 }],
  db_user: ['str', { min: 1, max: 120 }], db_password: ['str', { max: 200, optional: true }], db_name: ['str', { min: 1, max: 64, pattern: /^[A-Za-z0-9_]+$/ }],
};

async function connectAndCreate(b) {
  const conn = await mysql.createConnection({ host: b.db_host, port: b.db_port, user: b.db_user, password: req0(b.db_password), connectTimeout: 8000 });
  try {
    const [[v]] = await conn.query('SELECT VERSION() v');
    try {
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${b.db_name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } catch (e) {
      // Shared hosting (Hostinger, cPanel…) users usually can't CREATE DATABASE — use the existing one.
      try { await conn.query(`USE \`${b.db_name}\``); } catch { throw e; }
    }
    return v.v;
  } finally { await conn.end(); }
}
const req0 = (p) => (p === undefined || p === null ? '' : String(p));

/** Does this database already contain a LifeTrack installation? */
async function existingInstall(b) {
  const conn = await mysql.createConnection({ host: b.db_host, port: b.db_port, user: b.db_user, password: req0(b.db_password), database: b.db_name, connectTimeout: 8000 });
  try {
    const [m] = await conn.query("SELECT 1 FROM settings WHERE `key`='installed_at' LIMIT 1").catch(() => [[]]);
    if (m.length) return true;
    const [a] = await conn.query("SELECT 1 FROM users WHERE role='super_admin' LIMIT 1").catch(() => [[]]);
    return a.length > 0;
  } finally { await conn.end(); }
}

r.get('/status', (req, res) => ok(res, { installed: config.get().installed, tokenRequired: !!process.env.INSTALL_TOKEN, node: process.version,
  defaults: { db_host: process.env.DB_HOST || '127.0.0.1', db_port: Number(process.env.DB_PORT || 3306), db_user: process.env.DB_USER || '', db_name: process.env.DB_NAME || 'lifetrack' } }));

r.post('/check-db', ah(async (req, res) => {
  guard(req);
  const b = validate(req.body, dbSchema);
  let version;
  try { version = await connectAndCreate(b); } catch (e) { throw err(400, 'db_connect_failed', 'Database connection failed: ' + e.message); }
  ok(res, { connected: true, version, existing: await existingInstall(b) });
}));

r.post('/run', ah(async (req, res) => {
  guard(req);
  const b = validate(req.body, {
    ...dbSchema,
    site_name: ['str', { min: 1, max: 80 }], site_url: ['str', { max: 190, optional: true }],
    admin_name: ['str', { min: 1, max: 120 }], admin_email: ['email'], admin_password: ['password'],
    default_language: ['enum', { values: ['en', 'bn', 'hi'], optional: true, default: 'en' }], default_currency: ['currency', { optional: true, default: 'BDT' }],
    timezone: ['str', { max: 64, optional: true, default: 'Asia/Dhaka' }],
    smtp_host: ['str', { max: 190, optional: true }], smtp_port: ['int', { min: 1, max: 65535, optional: true, default: 587 }], smtp_secure: ['bool', { optional: true }],
    smtp_user: ['str', { max: 190, optional: true }], smtp_pass: ['str', { max: 300, optional: true }], mail_from_email: ['email', { optional: true }],
  });
  const siteUrl = (b.site_url || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+(:\d+)?$/.test(siteUrl)) throw err(422, 'validation_failed', 'Site URL must look like https://example.com', { fields: { site_url: 'invalid' } });
  try { await connectAndCreate(b); } catch (e) { throw err(400, 'db_connect_failed', 'Database connection failed: ' + e.message); }
  if (await existingInstall(b)) throw err(409, 'already_installed', 'This database already has LifeTrack installed. Use “Reconnect” instead — your data and admin account are kept.');

  // Persist config (DB credentials + generated APP_KEY) — file is chmod 600 and git-ignored
  const cfg = { installed: false, appKey: crypto.randomBytes(32).toString('base64'), db: { host: b.db_host, port: b.db_port, user: b.db_user, password: req0(b.db_password), database: b.db_name } };
  const prev = config.get();
  config.save({ ...cfg, appKey: prev.appKey && process.env.APP_KEY ? prev.appKey : cfg.appKey });

  const db = require('../db');
  db.connect(config.get().db);
  const migrate = require('../migrate');
  await migrate.run();
  const settings = require('../services/settings');
  const seed = require('../services/seed');
  await seed.defaults();
  const values = { site_name: b.site_name, site_url: siteUrl, default_language: b.default_language, default_currency: b.default_currency, default_timezone: b.timezone, mail_from_name: b.site_name, vapid_subject: 'mailto:' + b.admin_email };
  if (b.smtp_host) Object.assign(values, { mail_enabled: '1', smtp_host: b.smtp_host, smtp_port: String(b.smtp_port), smtp_secure: b.smtp_secure ? '1' : '0', smtp_user: b.smtp_user || '', smtp_pass: b.smtp_pass || '', mail_from_email: b.mail_from_email || b.smtp_user || b.admin_email });
  await settings.setMany(values);

  const auth = require('../services/auth');
  const existing = await db.one('SELECT id FROM users WHERE email=?', [b.admin_email]);
  let adminId;
  if (existing) {
    adminId = existing.id;
    await db.q("UPDATE users SET role='super_admin', status='active', password_hash=?, email_verified_at=COALESCE(email_verified_at, NOW()) WHERE id=?", [await auth.hashPassword(b.admin_password), adminId]);
  } else {
    adminId = await auth.createUser({ email: b.admin_email, name: b.admin_name, password: b.admin_password, role: 'super_admin', verified: true, language: b.default_language, currency: b.default_currency, timezone: b.timezone });
  }
  const { notify } = require('../services/notify');
  await notify(adminId, { type: 'welcome', titleKey: 'notif.welcome.title', bodyKey: 'notif.welcome.body', link: '/app', email: { template: 'welcome', cta: { link: siteUrl + '/app' } } });
  const logs = require('../services/logs');
  await logs.audit({ user: { id: adminId, role: 'super_admin' }, ip: req.ip }, 'system.installed', null, null, { version: require(path.join(config.ROOT, 'package.json')).version });

  await seed.markInstalled();
  config.save({ ...config.get(), installed: true, db: config.get().db, appKey: config.get().appKey, installedAt: new Date().toISOString() });
  await req.app.locals.onInstalled();
  ok(res, { installed: true, admin: b.admin_email, appUrl: siteUrl + '/app', adminUrl: siteUrl + '/admin' });
}));

/**
 * Reconnect an already-installed database (e.g. config file lost). Nothing in the database is changed —
 * no admin account is created or modified.
 */
r.post('/reconnect', ah(async (req, res) => {
  guard(req);
  const b = validate(req.body, dbSchema);
  try { await connectAndCreate(b); } catch (e) { throw err(400, 'db_connect_failed', 'Database connection failed: ' + e.message); }
  if (!(await existingInstall(b))) throw err(404, 'not_installed', 'No LifeTrack installation found in this database');
  const prev = config.get();
  const appKey = process.env.APP_KEY || prev.appKey || crypto.randomBytes(32).toString('base64');
  config.save({ installed: false, appKey, db: { host: b.db_host, port: b.db_port, user: b.db_user, password: req0(b.db_password), database: b.db_name } });
  const db = require('../db');
  db.connect(config.get().db);
  const settings = require('../services/settings');
  await settings.loadAll();
  // Encrypted settings only decrypt with the original APP_KEY
  const check = await db.one("SELECT value FROM settings WHERE `key`='app_key_check'");
  let keyOk = true;
  if (check) { try { keyOk = require('../lib/crypto').decrypt(check.value) === 'lifetrack-ok'; } catch { keyOk = false; } }
  config.markInstalled();
  await req.app.locals.onInstalled();
  const logs = require('../services/logs');
  await logs.audit({ ip: req.ip }, 'system.reconnected', null, null, { keyOk });
  ok(res, { reconnected: true, keyOk });
}));

module.exports = r;
