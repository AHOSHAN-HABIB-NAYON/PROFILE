/* নোটিফিকেশন ও ইমেইল: SMTP সেটিংস, সাবস্ক্রাইবার, ব্রডকাস্ট, পরীক্ষা */
import { all, col, run } from '../../../db.js';
import { html } from '../../../core/html.js';
import { ic } from '../../../ui/icons.js';
import { card, field, input, sel, stat, csrfField, swRow } from '../layout.js';
import { setting, setSetting } from '../../../core/settings.js';
import { str, int, flag } from '../../../core/forms.js';
import { bn, bnDateTime } from '../../../core/bn.js';
import { sendMail, smtpConfigured, emailShell, btn, drainQueue } from '../../notify/mailer.js';
import { sendPush } from '../../notify/push.js';
import { sendDailyDigest, sendReminders } from '../../notify/jobs.js';
import { config } from '../../../config.js';

export default {
  perm: 'settings',
  async post(c) {
    const f = c.fields;
    if (f.do === 'smtp') {
      for (const k of ['smtp_host', 'smtp_user', 'smtp_from', 'smtp_from_name']) await setSetting(k, str(f[k], 200));
      await setSetting('smtp_port', int(f.smtp_port, 465)); await setSetting('smtp_secure', ['ssl', 'tls', 'none'].includes(f.smtp_secure) ? f.smtp_secure : 'ssl');
      await setSetting('mail_hourly_limit', Math.max(10, Math.min(2000, int(f.mail_hourly_limit, 80))));
      if (str(f.smtp_pass)) await setSetting('smtp_pass', String(f.smtp_pass));
      await setSetting('site_url', str(f.site_url, 200).replace(/\/+$/, ''));
      return c.go('notify', 'ok', 'ইমেইল সেটিংস সংরক্ষিত।');
    }
    if (f.do === 'test_mail') {
      const to = str(f.to, 150) || setting('contact_email');
      const r = await sendMail(to, `পরীক্ষামূলক মেইল — ${setting('site_name', 'চাকরি সার্কুলার')}`, emailShell({ title: 'পরীক্ষা', base: config.baseUrl || '', body: `<h2 style="margin:0 0 8px">✅ ইমেইল ঠিকঠাক কাজ করছে</h2><p>এই ঠিকানায় নতুন পোস্ট ও অটোমেশনের খবর আসবে।</p>${btn(config.baseUrl || '/', 'সাইট খুলুন')}` }));
      return c.go('notify', r.ok ? 'ok' : 'err', r.ok ? `পরীক্ষামূলক মেইল পাঠানো হয়েছে: ${to}` : `মেইল যায়নি — ${r.err}`);
    }
    if (f.do === 'broadcast') {
      const title = str(f.title, 100); const body = str(f.body, 200); const url = str(f.url, 300) || '/';
      if (!title) return c.go('notify', 'err', 'শিরোনাম দিন।');
      const subs = await all('SELECT * FROM push_subscriptions WHERE fails < 5'); let ok = 0;
      for (let i = 0; i < subs.length; i += 6) { const res = await Promise.all(subs.slice(i, i + 6).map((s) => sendPush(s, { title, body, url, tag: 'broadcast' }))); ok += res.filter((r) => r === 'ok').length; }
      return c.go('notify', 'ok', `${bn(ok)}/${bn(subs.length)} জনকে নোটিফিকেশন পাঠানো হয়েছে।`);
    }
    if (f.do === 'digest') { const r = await sendDailyDigest(true); await drainQueue(30); return c.go('notify', 'ok', r.queued ? `${bn(r.queued)}টি দৈনিক সারসংক্ষেপ কিউতে দেওয়া হয়েছে।` : r.empty ? 'গত ২৪ ঘণ্টায় নতুন পোস্ট নেই।' : 'পাঠানো হয়নি (SMTP?).'); }
    if (f.do === 'remind') { const r = await sendReminders(true); return c.go('notify', 'ok', `${bn(r.sent || 0)}টি ডেডলাইন রিমাইন্ডার পাঠানো হয়েছে।`); }
    if (f.do === 'unsub') { await run('UPDATE email_subscribers SET unsub_at = NOW() WHERE id = ?', [int(f.id)]); return c.go('notify', 'ok', 'আনসাবস্ক্রাইব করা হয়েছে।'); }
    return c.go('notify');
  },
  async get(c) {
    if (c.query.csv === '1') {
      const rows = await all('SELECT email, mode, cats, confirmed, created_at, unsub_at FROM email_subscribers ORDER BY id');
      c.reply.header('Content-Disposition', 'attachment; filename="subscribers.csv"');
      return c.reply.type('text/csv; charset=utf-8').send('﻿email,mode,cats,confirmed,created_at,unsubscribed\n' + rows.map((r) => [r.email, r.mode, `"${r.cats}"`, r.confirmed, r.created_at, r.unsub_at || ''].join(',')).join('\n'));
    }
    const n = async (sql) => Number(await col(sql, [], 0));
    const [pushN, mailN, pend, dailyN, instN, qPend, qFail, reminders] = await Promise.all([n('SELECT COUNT(*) FROM push_subscriptions WHERE fails < 5'), n('SELECT COUNT(*) FROM email_subscribers WHERE confirmed=1 AND unsub_at IS NULL'), n('SELECT COUNT(*) FROM email_subscribers WHERE confirmed=0 AND unsub_at IS NULL'),
      n("SELECT COUNT(*) FROM email_subscribers WHERE confirmed=1 AND unsub_at IS NULL AND mode='daily'"), n("SELECT COUNT(*) FROM email_subscribers WHERE confirmed=1 AND unsub_at IS NULL AND mode='instant'"),
      n("SELECT COUNT(*) FROM mail_queue WHERE status='pending'"), n("SELECT COUNT(*) FROM mail_queue WHERE status='failed'"), n('SELECT COUNT(*) FROM push_saved')]);
    const subs = await all('SELECT * FROM email_subscribers ORDER BY id DESC LIMIT 40');
    const jobs = await all("SELECT j.*, p.title FROM notify_jobs j LEFT JOIN posts p ON p.id = j.post_id ORDER BY j.id DESC LIMIT 8");
    const s = (k, d = '') => setting(k, d);
    return c.page('নোটিফিকেশন ও ইমেইল', html`
<div class="grid stats">${stat({ icon: 'bell', tone: '', label: 'পুশ সাবস্ক্রাইবার', value: bn(pushN), sub: `সেভ করা পোস্ট ${bn(reminders)}` })}${stat({ icon: 'mail', tone: 'b', label: 'ইমেইল (নিশ্চিত)', value: bn(mailN), sub: `দৈনিক ${bn(dailyN)} · তাৎক্ষণিক ${bn(instN)}` })}${stat({ icon: 'clock', tone: 'y', label: 'নিশ্চিতকরণ বাকি', value: bn(pend), sub: 'ইমেইল' })}${stat({ icon: 'send', tone: smtpConfigured() ? 'g' : 'r', label: 'মেইল কিউ', value: bn(qPend), sub: smtpConfigured() ? `ব্যর্থ ${bn(qFail)}` : 'SMTP সেট নেই' })}</div>
${card('ইমেইল সার্ভার (SMTP)', 'mail', html`<form method="post">${csrfField(c.csrf)}<input type="hidden" name="do" value="smtp"><div class="grid">
<div class="grid g3">${field('SMTP হোস্ট', input('smtp_host', s('smtp_host'), { ph: 'smtp.hostinger.com' }))}${field('পোর্ট', input('smtp_port', s('smtp_port', '465'), { type: 'number' }))}${field('সিকিউরিটি', sel('smtp_secure', s('smtp_secure', 'ssl'), [['ssl', 'SSL (465)'], ['tls', 'TLS (587)'], ['none', 'নেই']]))}</div>
<div class="grid g2">${field('ইউজার (ইমেইল)', input('smtp_user', s('smtp_user')))}${field('পাসওয়ার্ড', input('smtp_pass', '', { type: 'password', ph: s('smtp_pass') ? '•••••• (বদলাতে চাইলে লিখুন)' : '', extra: 'autocomplete="new-password"' }))}</div>
<div class="grid g3">${field('প্রেরকের ইমেইল', input('smtp_from', s('smtp_from')))}${field('প্রেরকের নাম', input('smtp_from_name', s('smtp_from_name')))}${field('ঘণ্টায় সর্বোচ্চ মেইল', input('mail_hourly_limit', s('mail_hourly_limit', '80'), { type: 'number' }), 'hPanel-এ আপনার প্ল্যানের লিমিটের চেয়ে কম রাখুন')}</div>
${field('সাইটের ঠিকানা (মেইলের লিংকের জন্য)', input('site_url', s('site_url', config.baseUrl), { ph: 'https://cakricircular.com' }))}</div><button class="btn" type="submit" style="margin-top:10px">${ic('save')}সংরক্ষণ</button></form>
<form method="post" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px" data-nolock>${csrfField(c.csrf)}<input type="hidden" name="do" value="test_mail"><input type="text" name="to" placeholder="${s('contact_email', 'test@example.com')}" style="flex:1;min-width:200px"><button class="btn sec">${ic('send')}পরীক্ষামূলক মেইল</button></form>`)}
<div class="grid g2">
${card('নোটিফিকেশন ব্রডকাস্ট', 'megaphone', html`<form method="post">${csrfField(c.csrf)}<input type="hidden" name="do" value="broadcast"><div class="grid">${field('শিরোনাম', input('title', '', { max: 100, req: true }))}${field('বার্তা', input('body', '', { max: 200 }))}${field('লিংক', input('url', '/', { max: 300 }))}</div><button class="btn" type="submit" style="margin-top:10px" data-confirm="সবাইকে নোটিফিকেশন যাবে — নিশ্চিত?">${ic('bell')}${bn(pushN)} জনকে পাঠান</button></form>`)}
${card('হাতে চালান', 'refresh', html`<div style="display:grid;gap:10px"><form method="post">${csrfField(c.csrf)}<input type="hidden" name="do" value="digest"><button class="btn sec block">${ic('mail')}আজকের দৈনিক সারসংক্ষেপ এখনই পাঠান</button></form><form method="post">${csrfField(c.csrf)}<input type="hidden" name="do" value="remind"><button class="btn sec block">${ic('clock')}ডেডলাইন রিমাইন্ডার এখনই পাঠান</button></form><a class="btn sec block" href="${c.au('notify?csv=1')}">${ic('download')}সাবস্ক্রাইবার তালিকা (CSV)</a></div><p class="hint">নিয়মিত: সারসংক্ষেপ প্রতিদিন সকাল ৮টায়, রিমাইন্ডার সকাল ৯টায় (ঢাকা) — অটো।</p>`)}</div>
${card('সাম্প্রতিক নোটিফিকেশন কাজ', 'activity', jobs.length ? html`<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>পোস্ট</th><th>অবস্থা</th><th>পুশ</th><th>ইমেইল</th><th>ব্যর্থ</th></tr></thead><tbody>${jobs.map((j) => html`<tr><td><b class="ttl">${j.title || `#${j.post_id}`}</b><span class="sub">${bnDateTime(j.created_at)}</span></td><td><span class="tag ${j.status === 'done' ? 'on' : j.status === 'failed' ? 'off' : 'warn'}">${j.status}</span></td><td data-l="পুশ">${bn(j.push_sent)}</td><td data-l="ইমেইল">${bn(j.mail_sent)}</td><td data-l="ব্যর্থ">${bn(j.failed)}</td></tr>`)}</tbody></table></div>` : html`<p class="sub">এখনো কোনো কাজ নেই।</p>`)}
${card('ইমেইল সাবস্ক্রাইবার (সর্বশেষ ৪০)', 'users', subs.length ? html`<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>ইমেইল</th><th>ধরন</th><th>অবস্থা</th><th>তারিখ</th><th></th></tr></thead><tbody>${subs.map((m) => html`<tr><td><b>${m.email}</b></td><td data-l="ধরন">${m.mode === 'daily' ? 'দৈনিক' : 'তাৎক্ষণিক'}</td><td>${m.unsub_at ? html`<span class="tag off">বন্ধ</span>` : Number(m.confirmed) ? html`<span class="tag on">নিশ্চিত</span>` : html`<span class="tag warn">অনিশ্চিত</span>`}</td><td data-l="তারিখ"><span class="sub">${bnDateTime(m.created_at)}</span></td><td>${m.unsub_at ? '' : html`<form method="post">${csrfField(c.csrf)}<input type="hidden" name="do" value="unsub"><input type="hidden" name="id" value="${m.id}"><button class="ibtn dan" data-confirm="আনসাবস্ক্রাইব করবেন?">${ic('x')}</button></form>`}</td></tr>`)}</tbody></table></div>` : html`<p class="sub">এখনো কেউ সাবস্ক্রাইব করেনি।</p>`)}`);
  },
};
