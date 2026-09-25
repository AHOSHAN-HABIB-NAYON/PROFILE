'use strict';
const db = require('../../config/database');
const settings = require('../../models/settings');
const audit = require('../../models/auditLog');
const mailer = require('../../services/mailer');
const fileStorage = require('../../services/fileStorage');
const maintenance = require('../../middleware/maintenance');
const { encrypt } = require('../../utils/crypto');
const money = require('../../utils/money');
const v = require('../../utils/validate');
const { E } = require('../../utils/errors');
const { paginate, meta } = require('../../utils/pagination');

function validTz(tz) { try { Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } }

exports.getSettings = async (req, res) => {
  const all = { ...(await settings.loadAll(true)) };
  all.has_google_secret = !!all.google_client_secret;
  all.google_client_secret = ''; // write-only
  res.json({ ok: true, settings: all, has_sharp: fileStorage.hasSharp() });
};

/** Partial update — only known keys, each validated by type. */
exports.saveSettings = async (req, res) => {
  const b = req.body || {};
  const out = {};
  const txt = (k, max = 255) => { if (b[k] !== undefined) out[k] = v.str(b[k], { name: k, max }); };
  const col = (k) => { if (b[k] !== undefined) out[k] = v.color(b[k], settings.DEFAULTS[k]); };
  const flag = (k) => { if (b[k] !== undefined) out[k] = v.bool(b[k]) ? '1' : '0'; };
  const urlk = (k) => { if (b[k] !== undefined) out[k] = v.url(b[k], { name: k }) || ''; };
  const moneyk = (k, min) => {
    if (b[k] === undefined) return;
    const s = String(b[k]).trim();
    if (!money.isMoney(s) || money.cmp(s, min) < 0) throw E.badRequest(`${k} must be a valid amount ≥ ${min}`);
    out[k] = money.normalize(s);
  };
  const intk = (k, min, max) => { if (b[k] !== undefined) out[k] = String(v.int(b[k], { name: k, min, max })); };

  ['site_name', 'site_subtitle', 'pwa_name'].forEach((k) => txt(k, 80));
  txt('pwa_short_name', 30);
  txt('footer_text', 300);
  txt('trc20_network_note', 200);
  txt('binance_name', 120);
  txt('currency_symbol', 4);
  if (b.trc20_address !== undefined) out.trc20_address = v.str(b.trc20_address, { name: 'TRC20 address', max: 64, pattern: /^T[1-9A-HJ-NP-Za-km-z]{33}$/ });
  if (b.binance_uid !== undefined) out.binance_uid = v.str(b.binance_uid, { name: 'Binance UID', max: 20, pattern: /^\d{5,20}$/ });
  urlk('binance_pay_link');
  ['logo_url', 'favicon_url', 'pwa_icon_url', 'login_background_url', 'binance_qr_url'].forEach(urlk);
  ['primary_color', 'accent_color', 'pwa_theme_color', 'pwa_background_color'].forEach(col);
  ['registration_enabled', 'require_email_verification', 'require_admin_approval', 'news_demo_engagement_enabled', 'live_activity_show_code', 'twofa_email_recovery'].forEach(flag);
  if (b.admin_alert_email !== undefined) out.admin_alert_email = v.email(b.admin_alert_email, { required: false });
  if (b.support_whatsapp !== undefined) out.support_whatsapp = v.str(b.support_whatsapp, { name: 'WhatsApp number', max: 24, pattern: /^\+?[\d\s-]{6,24}$/ });
  txt('support_contact_note', 200);
  flag('google_login_enabled');
  if (b.google_client_id !== undefined) out.google_client_id = v.str(b.google_client_id, { name: 'Google Client ID', max: 200, pattern: /^$|^[\w.-]+\.apps\.googleusercontent\.com$/ });
  if (typeof b.google_client_secret === 'string' && b.google_client_secret.trim()) out.google_client_secret = encrypt(v.str(b.google_client_secret, { name: 'Google Client Secret', max: 200 }));
  if (v.bool(b.clear_google_secret)) out.google_client_secret = '';
  if (b.default_theme !== undefined) out.default_theme = v.oneOf(b.default_theme, ['light', 'dark']);
  if (b.default_timezone !== undefined) {
    if (!validTz(b.default_timezone)) throw E.badRequest('Unknown timezone');
    out.default_timezone = b.default_timezone;
  }
  moneyk('event_reward', '0');
  moneyk('min_withdrawal', '1');
  intk('upload_max_mb', 1, 20);
  intk('assignment_timeout_minutes', 1, 1440);
  intk('notification_ttl_hours', 1, 720);
  intk('feed_page_size', 10, 100);
  intk('api_polling_default', 1, 3600);
  if (out.event_reward !== undefined && money.cmp(out.event_reward, '100') > 0) throw E.badRequest('Reward is too large');

  const n = await settings.set(out);
  await audit.log(req, 'settings.update', { details: { ...out, ...(out.google_client_secret ? { google_client_secret: '[encrypted]' } : {}) } });
  res.json({ ok: true, message: `${n} setting(s) saved` });
};

const BRAND_TARGETS = {
  logo: { key: 'logo_url', maxWidth: 512 },
  favicon: { key: 'favicon_url', square: 64 },
  pwa_icon: { key: 'pwa_icon_url', square: 512 },
  login_background: { key: 'login_background_url', maxWidth: 1920 },
  binance_qr: { key: 'binance_qr_url', maxWidth: 600 },
};

exports.uploadBrand = async (req, res) => {
  const target = BRAND_TARGETS[req.params.target];
  if (!target) throw E.notFound('Unknown upload target');
  const saved = await fileStorage.saveImage(req.file, { userId: req.user.id, purpose: `brand_${req.params.target}`, visibility: 'public', maxWidth: target.maxWidth, square: target.square });
  await settings.set({ [target.key]: saved.url });
  await audit.log(req, 'settings.upload', { details: { target: req.params.target, file: saved.id } });
  res.status(201).json({ ok: true, url: saved.url, message: 'Uploaded' });
};

// ------------------------------------------------------------------ SMTP
exports.getSmtp = async (req, res) => {
  const r = await db.one('SELECT host, port, username, encryption, from_name, from_email, enabled, password_encrypted IS NOT NULL AS has_password FROM smtp_settings WHERE id = 1');
  res.json({ ok: true, smtp: { ...r, has_password: !!r?.has_password, enabled: !!r?.enabled } });
};

exports.saveSmtp = async (req, res) => {
  const b = req.body;
  const d = {
    host: v.str(b.host, { name: 'SMTP host', max: 190, pattern: /^[\w.-]+$/ }) || null,
    port: v.int(b.port, { name: 'Port', min: 1, max: 65535, def: 587 }),
    username: v.str(b.username, { name: 'Username', max: 190 }) || null,
    encryption: v.oneOf(b.encryption, ['none', 'ssl', 'tls'], { def: 'tls' }),
    from_name: v.str(b.from_name, { name: 'From name', max: 120 }) || null,
    from_email: v.email(b.from_email, { required: false }) || null,
    enabled: v.bool(b.enabled) ? 1 : 0,
  };
  await db.run('INSERT IGNORE INTO smtp_settings (id) VALUES (1)');
  await db.run('UPDATE smtp_settings SET ? WHERE id = 1', [d]);
  if (typeof b.password === 'string' && b.password) await db.run('UPDATE smtp_settings SET password_encrypted = ? WHERE id = 1', [encrypt(b.password)]);
  if (v.bool(b.clear_password)) await db.run('UPDATE smtp_settings SET password_encrypted = NULL WHERE id = 1');
  await audit.log(req, 'smtp.update', { details: { ...d, password_changed: !!b.password } });
  res.json({ ok: true, message: 'SMTP settings saved' });
};

exports.testSmtp = async (req, res) => {
  const to = v.email(req.body.to || req.user.email);
  const cfg = await mailer.smtpConfig();
  if (!cfg) throw E.badRequest('SMTP is not configured or not enabled');
  try {
    await mailer.verifyConfig(cfg);
    const r = await mailer.send({ to, subject: 'SMTP test email', title: 'It works! ✅', text: 'Your SMTP settings are configured correctly.' }, { throwOnError: true });
    await audit.log(req, 'smtp.test', { details: { to, delivered: r.delivered } });
    res.json({ ok: true, message: `Test email sent to ${to}` });
  } catch (err) {
    throw E.badRequest(`SMTP test failed: ${String(err.message).replace(/pass(word)?[^,]*/gi, '[redacted]').slice(0, 200)}`);
  }
};

// ------------------------------------------------------------------ maintenance
exports.getMaintenance = async (req, res) => {
  res.json({ ok: true, maintenance: await db.one('SELECT is_active, title, message, contact, estimated_end, updated_at FROM maintenance WHERE id = 1') });
};

exports.saveMaintenance = async (req, res) => {
  const b = req.body;
  const est = b.estimated_end ? new Date(b.estimated_end) : null;
  if (est && Number.isNaN(est.getTime())) throw E.badRequest('Invalid estimated time');
  const d = {
    is_active: v.bool(b.is_active) ? 1 : 0,
    title: v.str(b.title, { name: 'Title', required: true, max: 190 }),
    message: v.str(b.message, { name: 'Message', max: 2000 }) || null,
    contact: v.str(b.contact, { name: 'Contact', max: 190 }) || null,
    estimated_end: est,
    activated_by: req.user.id,
  };
  await db.run('UPDATE maintenance SET ? WHERE id = 1', [d]);
  maintenance.invalidate();
  await audit.log(req, d.is_active ? 'maintenance.on' : 'maintenance.off', { details: { title: d.title } });
  require('../../services/realtime').broadcast('maintenance', { active: !!d.is_active });
  res.json({ ok: true, message: d.is_active ? 'Maintenance mode is ON' : 'Maintenance mode is OFF' });
};

// ------------------------------------------------------------------ logs
exports.logs = async (req, res) => {
  const p = paginate(req.query, { defaultSize: 30 });
  const where = ['1=1'];
  const params = [];
  if (['admin', 'security', 'auth', 'system'].includes(req.query.category)) { where.push('l.category = ?'); params.push(req.query.category); }
  if (req.query.q) { where.push('(l.action LIKE ? OR u.email LIKE ? OR l.ip LIKE ?)'); const q = `%${String(req.query.q).slice(0, 80)}%`; params.push(q, q, q); }
  const [items, [{ n }]] = await Promise.all([
    db.query(`SELECT l.id, l.category, l.action, l.target_type, l.target_id, l.details, l.ip, l.user_agent, l.created_at, u.email
              FROM admin_logs l LEFT JOIN users u ON u.id = l.admin_id WHERE ${where.join(' AND ')} ORDER BY l.id DESC LIMIT ? OFFSET ?`, [...params, p.size, p.offset]),
    db.query(`SELECT COUNT(*) AS n FROM admin_logs l LEFT JOIN users u ON u.id = l.admin_id WHERE ${where.join(' AND ')}`, params),
  ]);
  res.json({ ok: true, items, pagination: meta(n, p) });
};
