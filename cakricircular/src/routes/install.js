'use strict';
/**
 * One-time web installer. Shown only while no config exists. After success the
 * config lives outside the code folder, so future deploys never ask again.
 */
const express = require('express');
const path = require('path');
const config = require('../config');
const db = require('../db');
const { html, raw } = require('../util/html');
const { asset } = require('../assets');
const { hashPassword, rateLimit, clientIp } = require('../util/security');

function page(body, err = '') {
  return '<!doctype html>' + html`<html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ইনস্টলেশন — চাকরি সার্কুলার</title><meta name="robots" content="noindex">

<link rel="stylesheet" href="${asset('css/admin.css')}"></head>
<body class="install-body"><main class="install">
<div class="install-brand"><img src="${asset('img/logo.svg')}" width="64" height="64" alt=""><h1>চাকরি সার্কুলার</h1><p>ইনস্টলেশন উইজার্ড</p></div>
${err ? html`<div class="alert alert-err">${err}</div>` : ''}
${raw(body)}
</main></body></html>`;
}

function form(v = {}) {
  const f = (name, label, attrs = '', val) => html`<label class="field"><span>${label}</span><input name="${name}" value="${val !== undefined ? val : v[name] || ''}" ${raw(attrs)}></label>`;
  return String(html`<form method="post" action="/install" class="card install-card">
  <h2>১. ডাটাবেজ (MySQL)</h2>
  <p class="muted">Hostinger hPanel → Databases → MySQL Databases থেকে ডাটাবেজ তৈরি করে তথ্যগুলো দিন।</p>
  <div class="grid2">${f('db_host', 'হোস্ট', 'required', v.db_host || 'localhost')}${f('db_port', 'পোর্ট', 'inputmode="numeric"', v.db_port || '3306')}</div>
  ${f('db_name', 'ডাটাবেজের নাম', 'required')}
  <div class="grid2">${f('db_user', 'ইউজারনেম', 'required autocomplete="off"')}${f('db_pass', 'পাসওয়ার্ড', 'type="password" autocomplete="new-password"')}</div>
  <h2>২. সাইট</h2>
  ${f('site_name', 'সাইটের নাম', 'required', v.site_name || 'চাকরি সার্কুলার')}
  ${f('site_domain', 'ডোমেইন', 'required placeholder="cakricircular.com"', v.site_domain || '')}
  <h2>৩. এডমিন অ্যাকাউন্ট</h2>
  <div class="grid2">${f('admin_user', 'ইউজারনেম', 'required minlength="3" autocomplete="username"')}${f('admin_email', 'ইমেইল', 'type="email" required')}</div>
  ${f('admin_pass', 'পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)', 'type="password" required minlength="8" autocomplete="new-password"', '')}
  ${f('admin_path', 'এডমিন প্যানেলের গোপন পথ', 'pattern="[A-Za-z0-9_-]{3,40}"', v.admin_path || 'v2admin')}
  <label class="check"><input type="checkbox" name="demo" value="1" ${raw(v.demo ? 'checked' : '')}> ডেমো কনটেন্ট যোগ করুন (পরে মুছে ফেলা যাবে)</label>
  <button class="btn btn-primary btn-block btn-lg" type="submit">ইনস্টল করুন</button>
</form>`);
}

const router = express.Router();
router.get('/install', (req, res) => {
  if (config.isInstalled()) return res.status(404).send('Not found');
  res.set('X-Robots-Tag', 'noindex').send(page(form({ site_domain: req.headers.host })));
});

router.post('/install', express.urlencoded({ extended: false, limit: '50kb' }), async (req, res) => {
  if (config.isInstalled()) return res.status(404).send('Not found');
  if (!rateLimit(`install:${clientIp(req)}`, 20, 600000).ok) return res.status(429).send(page('', 'অনেকবার চেষ্টা করা হয়েছে, ১০ মিনিট পরে চেষ্টা করুন।'));
  const b = req.body || {};
  const dbCfg = { host: String(b.db_host || 'localhost').trim(), port: Number(b.db_port) || 3306, name: String(b.db_name || '').trim(), user: String(b.db_user || '').trim(), password: String(b.db_pass || '') };
  const err = (msg) => res.status(400).send(page(form(b), msg));
  if (!dbCfg.name || !dbCfg.user) return err('ডাটাবেজের নাম ও ইউজারনেম দিন।');
  if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(b.admin_user || '')) return err('এডমিন ইউজারনেম শুধু ইংরেজি অক্ষর/সংখ্যা দিয়ে কমপক্ষে ৩ অক্ষরের হতে হবে।');
  if (String(b.admin_pass || '').length < 8) return err('পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.admin_email || '')) return err('সঠিক ইমেইল দিন।');

  try {
    await db.testConnection(dbCfg);
  } catch (e) {
    const m = String(e.code || e.message);
    const msg = m.includes('ACCESS_DENIED') ? 'ডাটাবেজ ইউজারনেম বা পাসওয়ার্ড ভুল।'
      : m.includes('BAD_DB') ? 'এই নামে কোনো ডাটাবেজ নেই।'
        : m.includes('ENOTFOUND') || m.includes('ECONNREFUSED') ? 'ডাটাবেজ হোস্ট/পোর্টে সংযোগ করা যায়নি।'
          : `ডাটাবেজে সংযোগ ব্যর্থ: ${e.message}`;
    return err(msg);
  }

  try {
    const cfg = {
      installed: true, version: 2, installedAt: new Date().toISOString(),
      db: dbCfg, secret: config.randomSecret(32), cronKey: config.randomSecret(16),
      dataDir: config.defaultDataDir(),
    };
    cfg.uploadsDir = path.join(cfg.dataDir, 'uploads');
    const app = req.app;
    // boot() connects, migrates and loads settings
    config.save({ ...cfg, installed: false });
    await app.locals.boot();
    const settings = require('../settings');
    const seed = require('../seed');
    await seed.seedBase();
    const adminPath = String(b.admin_path || 'v2admin').replace(/[^A-Za-z0-9_-]/g, '') || 'v2admin';
    await settings.set({ site_name: b.site_name || 'চাকরি সার্কুলার', app_name: b.site_name || 'চাকরি সার্কুলার', site_domain: String(b.site_domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, ''), admin_path: adminPath, cron_key: cfg.cronKey, contact_email: b.admin_email, auto_notify_email: b.admin_email });
    const existing = await db.one('SELECT id FROM users WHERE username = ? OR email = ?', [b.admin_user, b.admin_email]);
    let adminId;
    if (existing) {
      adminId = existing.id;
      await db.update('users', { password_hash: await hashPassword(b.admin_pass), role: 'admin', active: 1 }, 'id = ?', [adminId]);
    } else {
      adminId = await db.insert('users', { username: b.admin_user, email: b.admin_email, name: 'Admin', password_hash: await hashPassword(b.admin_pass), role: 'admin', permissions: '[]' });
    }
    if (b.demo) await seed.seedDemo(adminId);
    await require('../util/push').ensureKeys();
    config.save(cfg);
    await app.locals.boot();
    res.send(page(String(html`<div class="card install-card done">
      <div class="done-ic">✓</div><h2>ইনস্টলেশন সম্পন্ন হয়েছে!</h2>
      <p>কনফিগারেশন সংরক্ষিত হয়েছে কোডের বাইরের ফোল্ডারে। এখন থেকে নতুন ফাইল ডিপ্লয় করলেও আর কোনো তথ্য দিতে হবে না।</p>
      <p class="muted">এডমিন প্যানেল: <b>/${adminPath}</b> (এটি গোপন রাখুন)</p>
      <div class="row-gap"><a class="btn btn-primary" href="/${adminPath}">এডমিন প্যানেলে যান</a><a class="btn btn-outline" href="/">সাইট দেখুন</a></div>
    </div>`)));
  } catch (e) {
    console.error('[install]', e);
    return err(`ইনস্টল করতে সমস্যা হয়েছে: ${e.message}`);
  }
});

module.exports = router;
