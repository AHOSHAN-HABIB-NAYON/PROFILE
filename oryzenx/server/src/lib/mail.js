const nodemailer = require('nodemailer');
const config = require('../config');
const { query, getSetting } = require('../db');
const { escapeHtml } = require('./util');

// Every email type. `reminder: true` types can be turned off by the user; the rest always send
// (unless an admin switches the type off for everyone). `locked` types cannot be switched off at all.
const EMAIL_TYPES = {
  verify_email: { label: 'Email verification', locked: true },
  reset_password: { label: 'Password reset', locked: true },
  welcome: { label: 'Welcome email' },
  account_approved: { label: 'Account approved' },
  kyc: { label: 'KYC status changes (submitted, approved, rejected, re-submit)' },
  payment_date: { label: 'Monthly payment date set or changed' },
  payment_reminder: { label: 'Payment reminders (3 days, 1 day, payment day)', reminder: true },
  payment_paid: { label: 'Payment marked Paid' },
  payment_delayed: { label: 'Payment delayed or rescheduled' },
  deposit: { label: 'Deposit received / deposit date reminders' },
  payment_method: { label: 'Payment method added or changed' },
  security: { label: 'Profile/password changed and new login alerts' },
  loan_reminder: { label: 'Loan repayment reminders', reminder: true },
};

const MAX_ATTEMPTS = 5;

let transport = null;
function getTransport() {
  if (!config.smtp.host) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      pool: true, maxConnections: 2,
    });
  }
  return transport;
}

// Clean, table-based HTML that renders in Gmail/Outlook. `body` is trusted HTML built by us;
// any user-supplied values must be escaped by the caller (use `esc`).
function template({ title, body, cta }) {
  const button = cta
    ? `<tr><td style="padding:8px 0 24px"><a href="${escapeHtml(cta.url)}" style="background:#1f6feb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(cta.label)}</a></td></tr>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f3f6fb;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:14px;padding:28px">
<tr><td style="padding-bottom:18px"><img src="${config.appUrl}/icons/icon-96.png" width="40" height="40" alt="" style="vertical-align:middle;border-radius:10px"> <span style="font-size:20px;font-weight:700;vertical-align:middle;margin-left:8px">OryzenX <span style="color:#1f6feb">BD</span></span></td></tr>
<tr><td style="font-size:18px;font-weight:700;padding-bottom:10px">${escapeHtml(title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding-bottom:18px">${body}</td></tr>
${button}
<tr><td style="border-top:1px solid #e2e8f0;padding-top:14px;font-size:12px;color:#64748b;line-height:1.5">
This is a private friends' project. Please do not share this email or any project data outside the group.
Crypto trading involves risk and profits are not guaranteed.</td></tr>
</table></td></tr></table></body></html>`;
}

async function isTypeEnabled(type) {
  if (EMAIL_TYPES[type]?.locked) return true;
  const toggles = await getSetting('email_toggles', {});
  return toggles[type] !== false;
}

// Queue an email. Returns quickly; the worker sends it in the background.
async function sendEmail(user, type, { subject, title, body, cta, sendAfter = null }) {
  if (!EMAIL_TYPES[type]) throw new Error(`Unknown email type ${type}`);
  if (!(await isTypeEnabled(type))) return false;
  if (EMAIL_TYPES[type].reminder && user.reminder_emails === 0) return false;
  await query(
    'INSERT INTO email_queue (user_id, to_email, type, subject, html, send_after) VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()))',
    [user.id || null, user.email, type, subject, template({ title: title || subject, body, cta }), sendAfter],
  );
  return true;
}

async function processQueue() {
  const rows = await query(
    "SELECT * FROM email_queue WHERE status = 'queued' AND send_after <= NOW() ORDER BY id LIMIT 20",
  );
  const t = getTransport();
  for (const row of rows) {
    try {
      if (t) {
        await t.sendMail({ from: config.smtp.from, to: row.to_email, subject: row.subject, html: row.html });
      } else {
        console.log(`[email:dev] to=${row.to_email} type=${row.type} subject="${row.subject}"`);
        if (!config.isProd) {
          const link = row.html.match(/href="([^"]+)"/g)?.find((h) => !h.includes('icons'));
          if (link) console.log(`[email:dev] link ${link.slice(6, -1).replace(/&amp;/g, '&')}`);
        }
      }
      await query("UPDATE email_queue SET status = 'sent', sent_at = NOW(), attempts = attempts + 1 WHERE id = ?", [row.id]);
    } catch (err) {
      const attempts = row.attempts + 1;
      // Retry with backoff: 1, 4, 9, 16 minutes, then give up.
      await query(
        `UPDATE email_queue SET attempts = ?, last_error = ?, status = ?,
           send_after = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?`,
        [attempts, String(err.message).slice(0, 500), attempts >= MAX_ATTEMPTS ? 'failed' : 'queued', attempts * attempts, row.id],
      );
    }
  }
}

let timer = null;
function startWorker(intervalMs = 15000) {
  if (timer) return;
  let running = false;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await processQueue(); } catch (err) { console.error('email worker', err.message); }
    running = false;
  }, intervalMs);
  timer.unref();
}

module.exports = { EMAIL_TYPES, sendEmail, processQueue, startWorker, esc: escapeHtml };
