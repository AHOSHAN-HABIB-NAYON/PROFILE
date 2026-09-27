'use strict';
/**
 * Transactional email. SMTP credentials live encrypted in settings (or SMTP_* env)
 * and are never sent to the browser. Every attempt is recorded in email_logs.
 */
const nodemailer = require('nodemailer');
const db = require('../db');
const settings = require('./settings');
const i18n = require('./i18n');

let transport = null; let transportKey = '';

function smtpConfig() {
  const e = process.env;
  return {
    host: e.SMTP_HOST || settings.get('smtp_host'),
    port: Number(e.SMTP_PORT || settings.get('smtp_port') || 587),
    secure: (e.SMTP_SECURE || settings.get('smtp_secure')) === '1' || e.SMTP_SECURE === 'true',
    user: e.SMTP_USER || settings.get('smtp_user'),
    pass: e.SMTP_PASS || settings.get('smtp_pass'),
    fromName: settings.get('mail_from_name') || settings.get('site_name'),
    fromEmail: e.MAIL_FROM || settings.get('mail_from_email') || settings.get('smtp_user'),
  };
}

function enabled() {
  const c = smtpConfig();
  return (settings.bool('mail_enabled') || !!process.env.SMTP_HOST) && !!c.host && !!c.fromEmail;
}

function getTransport() {
  const c = smtpConfig();
  const k = JSON.stringify([c.host, c.port, c.secure, c.user, c.pass]);
  if (!transport || k !== transportKey) {
    transport = nodemailer.createTransport({
      host: c.host, port: c.port, secure: c.secure,
      auth: c.user ? { user: c.user, pass: c.pass } : undefined,
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    });
    transportKey = k;
  }
  return transport;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (tpl, vars) => String(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => esc(vars[k] ?? ''));

/** Template names and the variables they use (documented for the admin editor). */
const TEMPLATES = {
  welcome: ['name', 'app_url'],
  verify_email: ['name', 'link'],
  password_reset: ['name', 'link', 'minutes'],
  password_changed: ['name', 'time', 'ip'],
  login_alert: ['name', 'time', 'ip', 'device'],
  twofa_code: ['name', 'code', 'minutes'],
  twofa_changed: ['name', 'action', 'time'],
  recovery_used: ['name', 'time', 'remaining'],
  passkey_changed: ['name', 'action', 'passkey', 'time'],
  lend_reminder: ['name', 'person', 'amount', 'due'],
  borrow_reminder: ['name', 'person', 'amount', 'due'],
  due_reminder: ['name', 'title', 'amount', 'due'],
  announcement: ['name', 'title', 'body'],
  test: ['name'],
};

function layout({ title, bodyHtml, cta, locale }) {
  const name = esc(settings.get('site_name'));
  const logo = settings.get('logo_url');
  const url = settings.siteUrl();
  const logoAbs = logo ? (logo.startsWith('http') ? logo : url + logo) : '';
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#F3F6FB;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0F172A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F6FB;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.06)">
<tr><td style="background:linear-gradient(135deg,#1E4FD8,#0EA5A0);padding:18px 22px;color:#fff">
${logoAbs ? `<img src="${esc(logoAbs)}" alt="" height="28" style="vertical-align:middle;margin-right:8px;border-radius:6px">` : ''}<span style="font-size:17px;font-weight:700;vertical-align:middle">${name}</span>
<div style="font-size:12px;opacity:.85;margin-top:2px">${esc(settings.get('site_tagline'))}</div></td></tr>
<tr><td style="padding:22px">
<h1 style="font-size:18px;margin:0 0 12px">${esc(title)}</h1>
<div style="font-size:14px;line-height:1.6;color:#334155">${bodyHtml}</div>
${cta ? `<p style="margin:20px 0 6px"><a href="${esc(cta.link)}" style="display:inline-block;background:#1E4FD8;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600;font-size:14px">${esc(cta.label)}</a></p>
<p style="font-size:11px;color:#94A3B8;word-break:break-all">${esc(cta.link)}</p>` : ''}
</td></tr>
<tr><td style="padding:14px 22px;border-top:1px solid #EEF2F7;font-size:11px;color:#94A3B8">${esc(i18n.t(locale, 'email.footer', { site: settings.get('site_name') }))}</td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * send({ to, userId, template, locale, vars, cta })
 * Subject/body come from admin overrides (email_templates setting) or i18n defaults.
 */
async function send({ to, userId = null, template, locale = 'en', vars = {}, cta = null }) {
  const overrides = settings.json('email_templates', {}) || {};
  const ov = overrides[`${template}.${locale}`] || overrides[template] || {};
  const allVars = { site: settings.get('site_name'), app_url: settings.siteUrl() + '/app', ...vars };
  const subject = fill(ov.subject || i18n.t(locale, `email.${template}.subject`, {}), allVars).replace(/&amp;/g, '&');
  const bodyText = ov.body || i18n.t(locale, `email.${template}.body`, {});
  const bodyHtml = fill(bodyText, allVars).split(/\n{2,}/).map((p) => `<p style="margin:0 0 10px">${p.replace(/\n/g, '<br>')}</p>`).join('');
  const html = layout({ title: subject, bodyHtml, cta: cta ? { ...cta, label: i18n.t(locale, cta.labelKey || 'email.open_app') } : null, locale });
  const text = fill(bodyText, allVars).replace(/&amp;/g, '&') + (cta ? `\n\n${cta.link}` : '');

  if (!enabled()) {
    await log(userId, to, template, subject, 'skipped', 'Email not configured');
    return { sent: false, reason: 'not_configured' };
  }
  const c = smtpConfig();
  try {
    await getTransport().sendMail({ from: { name: c.fromName, address: c.fromEmail }, to, subject, html, text });
    await log(userId, to, template, subject, 'sent', null);
    return { sent: true };
  } catch (e) {
    console.error('[mail]', e.message);
    await log(userId, to, template, subject, 'failed', e.message);
    return { sent: false, reason: 'failed', error: e.message };
  }
}

async function log(userId, to, template, subject, status, error) {
  try { await db.q('INSERT INTO email_logs (user_id, to_email, template, subject, status, error) VALUES (?,?,?,?,?,?)', [userId, to, template, subject.slice(0, 255), status, error ? String(error).slice(0, 500) : null]); } catch {}
}

async function verifyConnection() { return getTransport().verify(); }

module.exports = { send, enabled, verifyConnection, TEMPLATES };
