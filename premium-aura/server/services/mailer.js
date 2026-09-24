'use strict';
/**
 * Transactional e-mail via Nodemailer. SMTP settings come from the admin panel
 * (smtp_settings, password encrypted) and fall back to .env. When no SMTP is
 * configured, mails are written to logs/mail.log so flows remain testable.
 */
const nodemailer = require('nodemailer');
const db = require('../config/database');
const config = require('../config/env');
const settings = require('../models/settings');
const { decrypt } = require('../utils/crypto');
const logger = require('../utils/logger');
const esc = require('../utils/escape');

async function smtpConfig() {
  const row = db.isReady() ? await db.one('SELECT * FROM smtp_settings WHERE id = 1') : null;
  if (row && row.enabled && row.host) {
    return {
      host: row.host, port: row.port || 587, user: row.username || '',
      password: row.password_encrypted ? decrypt(row.password_encrypted) : '',
      encryption: row.encryption, fromName: row.from_name, fromEmail: row.from_email,
    };
  }
  if (config.smtp.host) {
    return {
      host: config.smtp.host, port: config.smtp.port, user: config.smtp.user, password: config.smtp.password,
      encryption: config.smtp.secure ? 'ssl' : 'tls', fromName: config.smtp.fromName, fromEmail: config.smtp.fromEmail || config.smtp.user,
    };
  }
  return null;
}

function transportFor(c) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.encryption === 'ssl',
    requireTLS: c.encryption === 'tls',
    ignoreTLS: c.encryption === 'none',
    auth: c.user ? { user: c.user, pass: c.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

async function layout(title, bodyHtml, cta) {
  const s = db.isReady() ? await settings.loadAll() : settings.DEFAULTS;
  const button = cta ? `<p style="text-align:center;margin:28px 0"><a href="${esc(cta.url)}" style="background:linear-gradient(135deg,${esc(s.primary_color)},${esc(s.accent_color)});color:#fff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>
  <p style="font-size:12px;color:#64748b;word-break:break-all">If the button does not work, copy this link: ${esc(cta.url)}</p>` : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f7fe;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="text-align:center;padding:16px 0"><strong style="font-size:22px;color:${esc(s.primary_color)}">${esc(s.site_name)}</strong><br>
  <span style="font-size:12px;color:#64748b">${esc(s.site_subtitle)}</span></div>
  <div style="background:#fff;border-radius:18px;padding:28px;box-shadow:0 10px 30px rgba(37,99,235,.08)">
  <h2 style="margin-top:0;font-size:20px">${esc(title)}</h2>${bodyHtml}${button}</div>
  <p style="text-align:center;font-size:12px;color:#94a3b8;margin-top:16px">${esc(s.footer_text || '')}</p></div></body></html>`;
}

/**
 * @param {{to:string, subject:string, title?:string, text?:string, html?:string, cta?:{url:string,label:string}}} msg
 */
async function send(msg, { throwOnError = false, overrideConfig = null } = {}) {
  const c = overrideConfig || (await smtpConfig());
  const s = db.isReady() ? await settings.loadAll() : settings.DEFAULTS;
  const html = msg.html || (await layout(msg.title || msg.subject, `<p style="line-height:1.6">${esc(msg.text || '')}</p>`, msg.cta));
  if (!c) {
    logger.mail({ to: msg.to, subject: msg.subject, text: msg.text, link: msg.cta?.url });
    if (!config.isProd) logger.info(`[mail:dev] ${msg.subject} → ${msg.to}${msg.cta ? ` (${msg.cta.url})` : ''}`);
    return { delivered: false, logged: true };
  }
  try {
    const info = await transportFor(c).sendMail({
      from: { name: c.fromName || s.site_name, address: c.fromEmail || c.user },
      to: msg.to, subject: msg.subject, html,
      text: `${msg.text || ''}${msg.cta ? `\n\n${msg.cta.label}: ${msg.cta.url}` : ''}`,
    });
    return { delivered: true, id: info.messageId };
  } catch (err) {
    logger.error(`mail send failed: ${err.message}`, { to: msg.to, subject: msg.subject });
    if (throwOnError) throw err;
    return { delivered: false, error: err.message };
  }
}

async function verifyConfig(c) {
  await transportFor(c).verify();
}

module.exports = { send, smtpConfig, verifyConfig, layout };
