/* ─────────────────────────────────────────────
   ইমেইল: SMTP (Hostinger / Gmail App Password / Brevo / SES) + কিউ
   কিউ থেকে ছোট ব্যাচে, ঘণ্টার সীমা মেনে পাঠায় — তাই মেইল সার্ভার বা সাইট কোনোটাই চাপে পড়ে না।
   ───────────────────────────────────────────── */
import nodemailer from 'nodemailer';
import { setting, settingInt } from '../../core/settings.js';
import { all, run, col } from '../../db.js';
import { esc } from '../../core/html.js';

let transport; let transportKey = '';
export const smtpConfigured = () => Boolean(setting('smtp_host') && setting('smtp_user') && setting('smtp_pass'));

function getTransport() {
  const key = [setting('smtp_host'), setting('smtp_port'), setting('smtp_secure'), setting('smtp_user'), setting('smtp_pass')].join('|');
  if (transport && key === transportKey) return transport;
  const port = settingInt('smtp_port', 465);
  const sec = setting('smtp_secure', port === 465 ? 'ssl' : 'tls');
  transport = nodemailer.createTransport({
    host: setting('smtp_host'), port, secure: sec === 'ssl' || port === 465,
    requireTLS: sec === 'tls', auth: { user: setting('smtp_user'), pass: setting('smtp_pass') },
    connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000, tls: { minVersion: 'TLSv1.2' },
  });
  transportKey = key;
  return transport;
}

export function fromAddress() {
  const email = setting('smtp_from') || setting('smtp_user');
  const name = setting('smtp_from_name') || setting('site_name', 'চাকরি সার্কুলার');
  return `"${name.replace(/"/g, '')}" <${email}>`;
}

/** সরাসরি পাঠানো → {ok, err} */
export async function sendMail(to, subject, htmlBody, { unsubUrl } = {}) {
  if (!smtpConfigured()) return { ok: false, err: 'SMTP সেট করা নেই (এডমিন → সেটিংস → ইমেইল)' };
  try {
    await getTransport().sendMail({
      from: fromAddress(), to, subject, html: htmlBody,
      headers: unsubUrl ? { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined,
    });
    return { ok: true };
  } catch (e) { return { ok: false, err: String(e.message || e).slice(0, 240) }; }
}

export async function enqueueMail(to, subject, body) {
  await run('INSERT INTO mail_queue (to_email, subject, body, created_at) VALUES (?,?,?,NOW())', [to, subject.slice(0, 250), body]);
}

/** কিউ থেকে ব্যাচ পাঠাই। ঘণ্টায় সর্বোচ্চ mail_hourly_limit (ডিফল্ট 80) */
export async function drainQueue(max = 20) {
  if (!smtpConfigured()) return { sent: 0, skipped: true };
  const limit = settingInt('mail_hourly_limit', 80);
  const sentHour = Number(await col("SELECT COUNT(*) FROM mail_queue WHERE status='sent' AND sent_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)", [], 0));
  const room = Math.max(0, Math.min(max, limit - sentHour));
  if (!room) return { sent: 0, throttled: true };
  const rows = await all("SELECT * FROM mail_queue WHERE status='pending' AND tries < 3 ORDER BY id ASC LIMIT ?", [room]);
  let sent = 0;
  for (const r of rows) {
    const unsub = /unsub\?t=([a-f0-9]{32})/.exec(r.body);
    const res = await sendMail(r.to_email, r.subject, r.body, { unsubUrl: unsub ? `${setting('site_url', '')}/notify/unsub?t=${unsub[1]}` : undefined });
    if (res.ok) { sent += 1; await run("UPDATE mail_queue SET status='sent', sent_at=NOW(), tries=tries+1 WHERE id=?", [r.id]); }
    else await run("UPDATE mail_queue SET tries=tries+1, err=?, status=IF(tries+1>=3,'failed','pending') WHERE id=?", [res.err, r.id]);
    await new Promise((ok) => setTimeout(ok, 350)); // মেইল সার্ভারকে দম নিতে দিই
  }
  await run("DELETE FROM mail_queue WHERE status='sent' AND sent_at < DATE_SUB(NOW(), INTERVAL 3 DAY)").catch(() => {});
  return { sent };
}

/* ─── ইমেইল টেমপ্লেট (ইনলাইন স্টাইল, মোবাইলে ঠিকঠাক) ─── */
export function emailShell({ title, preheader = '', body, base, footer = '' }) {
  const name = esc(setting('site_name', 'চাকরি সার্কুলার'));
  return `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f4f7f6;font-family:'Hind Siliguri','Noto Sans Bengali',Segoe UI,Arial,sans-serif;color:#0f1f1c">
<span style="display:none;opacity:0;height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f6;padding:18px 10px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e1e8e6">
<tr><td style="background:linear-gradient(135deg,#0f766e,#14a08b);padding:20px 24px;color:#fff"><a href="${base}" style="color:#fff;text-decoration:none;font-size:20px;font-weight:700">${name}</a><div style="font-size:13px;opacity:.9;margin-top:2px">${esc(setting('tagline', 'সঠিক তথ্য, আপনার সফলতা'))}</div></td></tr>
<tr><td style="padding:22px 24px;font-size:15px;line-height:1.7">${body}</td></tr>
<tr><td style="padding:14px 24px 22px;font-size:12px;color:#5f716d;border-top:1px solid #eef3f2">${footer || `আপনি ${name}-এর সাবস্ক্রাইবার হিসেবে এই মেইল পাচ্ছেন।`}</td></tr>
</table></td></tr></table></body></html>`;
}
export const btn = (href, label) => `<a href="${href}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:99px;margin:6px 0">${label}</a>`;
