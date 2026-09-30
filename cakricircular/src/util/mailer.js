'use strict';
const nodemailer = require('nodemailer');
const settings = require('../settings');
const { esc } = require('./html');

let transport = null;
let transportKey = '';

function getTransport() {
  const host = settings.get('smtp_host');
  if (!host) return null;
  const key = ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass'].map((k) => settings.get(k)).join('|');
  if (transport && key === transportKey) return transport;
  transport = nodemailer.createTransport({
    host,
    port: settings.int('smtp_port', 465),
    secure: settings.bool('smtp_secure'),
    auth: settings.get('smtp_user') ? { user: settings.get('smtp_user'), pass: settings.get('smtp_pass') } : undefined,
    pool: true, maxConnections: 1, maxMessages: 50,
    connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000,
  });
  transportKey = key;
  return transport;
}

function wrap(title, bodyHtml) {
  const site = esc(settings.get('site_name'));
  const color = settings.get('theme_color') || '#15803d';
  return `<!doctype html><html lang="bn"><body style="margin:0;background:#f1f5f4;font-family:'Hind Siliguri',Arial,sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;padding:24px 12px">
<div style="background:${color};color:#fff;border-radius:14px 14px 0 0;padding:18px 22px;font-size:20px;font-weight:700">${site}</div>
<div style="background:#fff;border-radius:0 0 14px 14px;padding:22px;line-height:1.7">
<h2 style="margin:0 0 12px;font-size:18px">${esc(title)}</h2>${bodyHtml}
</div>
<p style="text-align:center;color:#64748b;font-size:12px;margin-top:14px">${esc(settings.get('footer_slogan'))}</p>
</div></body></html>`;
}

/** Send a mail. Throws a Bangla-friendly error message on failure. */
async function send({ to, subject, html, text }) {
  const t = getTransport();
  if (!t) throw new Error('SMTP সেটিংস দেওয়া হয়নি (সেটিংস → ইমেইল)');
  const fromEmail = settings.get('mail_from') || settings.get('smtp_user');
  try {
    return await t.sendMail({
      from: { name: settings.get('mail_from_name') || settings.get('site_name'), address: fromEmail },
      to, subject, html: wrap(subject, html), text,
    });
  } catch (e) {
    throw new Error(explain(e));
  }
}

function explain(e) {
  const m = String((e && (e.code || '')) + ' ' + (e && e.message)).toLowerCase();
  if (m.includes('eauth') || m.includes('auth')) return 'SMTP ইউজারনেম বা পাসওয়ার্ড ভুল';
  if (m.includes('enotfound') || m.includes('getaddrinfo')) return 'SMTP হোস্ট খুঁজে পাওয়া যায়নি';
  if (m.includes('timeout') || m.includes('etimedout')) return 'SMTP সার্ভারে সংযোগের সময় শেষ হয়ে গেছে (পোর্ট/SSL যাচাই করুন)';
  if (m.includes('econnrefused')) return 'SMTP সার্ভার সংযোগ গ্রহণ করেনি (পোর্ট ভুল হতে পারে)';
  if (m.includes('certificate') || m.includes('ssl') || m.includes('tls')) return 'SSL/TLS সমস্যা — Secure অপশন ও পোর্ট মিলিয়ে দেখুন (465=SSL, 587=STARTTLS)';
  return 'মেইল পাঠানো যায়নি: ' + ((e && e.message) || 'অজানা ত্রুটি');
}

function configured() { return !!settings.get('smtp_host'); }

module.exports = { send, configured, wrap };
