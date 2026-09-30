/* ─────────────────────────────────────────────
   নোটিফিকেশন কাজ: নতুন পোস্ট, দৈনিক সারসংক্ষেপ, ডেডলাইন রিমাইন্ডার
   সবকিছুই ছোট ব্যাচে — সাইট বা সার্ভারে চাপ পড়ে না।
   ───────────────────────────────────────────── */
import { all, one, run, col } from '../../db.js';
import { setting, setSetting } from '../../core/settings.js';
import { sendPush } from './push.js';
import { enqueueMail, emailShell, btn, smtpConfigured } from './mailer.js';
import { esc } from '../../core/html.js';
import { bn, dhaka, bnDate, deadlineInfo } from '../../core/bn.js';
import { config } from '../../config.js';
import { excerpt } from '../../core/content.js';

const baseUrl = () => config.baseUrl || setting('site_url', '') || '';
const csvHas = (csv, id) => { const l = String(csv || '').split(',').filter(Boolean); return !l.length || l.includes(String(id)); };
const PUSH_BATCH = 60;

/** নতুন প্রকাশিত পোস্টের জন্য কাজ তৈরি (একবারই) */
export async function enqueueNewPost(postId) {
  await run("INSERT IGNORE INTO notify_jobs (post_id, kind, status, created_at) VALUES (?, 'new_post', 'pending', NOW())", [postId]);
}

async function pushPayload(post) {
  const b = baseUrl();
  return { title: `নতুন: ${Array.from(post.title).slice(0, 80).join('')}`, body: [post.company, post.district || post.division, post.deadline ? `শেষ ${bn(String(post.deadline).slice(0, 10).split('-').reverse().join('/'))}` : ''].filter(Boolean).join(' · ') || 'বিস্তারিত দেখতে চাপুন',
    url: `/post/${post.slug}`, tag: `post-${post.id}`, image: post.thumb ? `${b}/uploads/posts/${post.thumb}` : undefined };
}

export function postMailHtml(post, unsub) {
  const b = baseUrl();
  const facts = [post.company, post.district || post.division, post.vacancy ? `পদ ${bn(post.vacancy)} টি` : '', post.deadline ? `শেষ তারিখ ${bnDate(post.deadline)}` : ''].filter(Boolean);
  return emailShell({ title: post.title, preheader: facts.join(' · '), base: b,
    body: `<div style="font-size:12px;font-weight:700;color:#0f766e;margin-bottom:6px">নতুন বিজ্ঞপ্তি</div><h2 style="margin:0 0 10px;font-size:19px;line-height:1.5">${esc(post.title)}</h2>
      ${facts.length ? `<p style="margin:0 0 12px;color:#4a5d59">${facts.map(esc).join(' &nbsp;•&nbsp; ')}</p>` : ''}
      <p style="margin:0 0 14px;color:#4a5d59">${esc(excerpt(post.content, 180))}</p>${btn(`${b}/post/${post.slug}`, 'বিস্তারিত দেখুন')}`,
    footer: `আপনি ইমেইলে নতুন চাকরির খবর পেতে সাবস্ক্রাইব করেছেন। <a href="${unsub}" style="color:#0f766e">এক ক্লিকে বন্ধ করুন</a>` });
}

/** একটি কাজের এক ধাপ (ব্যাচ) */
export async function processNotifyJobs() {
  const job = await one("SELECT * FROM notify_jobs WHERE status IN ('pending','running') ORDER BY id ASC LIMIT 1");
  if (!job) return { idle: true };
  const post = await one('SELECT p.*, c.id cid FROM posts p LEFT JOIN categories c ON c.id = p.cat_id WHERE p.id = ? AND p.status = 1 AND p.deleted_at IS NULL', [job.post_id]);
  if (!post) { await run("UPDATE notify_jobs SET status='failed', updated_at=NOW() WHERE id=?", [job.id]); return { skipped: true }; }
  await run("UPDATE notify_jobs SET status='running', updated_at=NOW() WHERE id=?", [job.id]);

  let pushLeft = false; let mailLeft = false; let sentPush = 0; let failed = 0; let lastPush = job.push_cursor;
  /* ১) পুশ */
  const subs = await all('SELECT * FROM push_subscriptions WHERE id > ? AND fails < 5 ORDER BY id ASC LIMIT ?', [job.push_cursor, PUSH_BATCH]);
  if (subs.length) {
    const payload = await pushPayload(post);
    const mine = subs.filter((s) => csvHas(s.cats, post.cat_id));
    for (let i = 0; i < mine.length; i += 6) {
      const res = await Promise.all(mine.slice(i, i + 6).map((s) => sendPush(s, payload)));
      sentPush += res.filter((r) => r === 'ok').length; failed += res.filter((r) => r === 'fail').length;
    }
    lastPush = subs[subs.length - 1].id; pushLeft = subs.length === PUSH_BATCH;
  }
  /* ২) ইমেইল (তাৎক্ষণিক মোড) — কিউতে */
  let sentMail = 0; let lastMail = job.mail_cursor;
  if (smtpConfigured()) {
    const ms = await all("SELECT * FROM email_subscribers WHERE id > ? AND confirmed = 1 AND unsub_at IS NULL AND mode = 'instant' ORDER BY id ASC LIMIT 100", [job.mail_cursor]);
    for (const m of ms) {
      if (csvHas(m.cats, post.cat_id)) {
        const unsub = `${baseUrl()}/notify/unsub?t=${m.token}`;
        await enqueueMail(m.email, `নতুন: ${Array.from(post.title).slice(0, 90).join('')}`, postMailHtml(post, unsub)); sentMail += 1;
      }
      lastMail = m.id;
    }
    mailLeft = ms.length === 100;
  }
  const done = !pushLeft && !mailLeft;
  await run(`UPDATE notify_jobs SET push_cursor=?, mail_cursor=?, push_sent=push_sent+?, mail_sent=mail_sent+?, failed=failed+?, status=?, updated_at=NOW() WHERE id=?`,
    [lastPush, lastMail, sentPush, sentMail, failed, done ? 'done' : 'running', job.id]);
  return { job: job.id, sentPush, sentMail, done };
}

/** দৈনিক সারসংক্ষেপ — সকাল ৮টায় (ঢাকা) */
export async function sendDailyDigest(force = false) {
  const t = dhaka(); const today = `${t.y}-${t.m}-${t.d}`;
  if (!force && (t.h < 8 || setting('digest_last') === today)) return { skipped: true };
  await setSetting('digest_last', today);
  if (!smtpConfigured()) return { skipped: 'smtp' };
  const posts = await all(`SELECT p.id, p.title, p.slug, p.company, p.district, p.division, p.deadline, p.cat_id, p.content FROM posts p
    WHERE p.status = 1 AND p.deleted_at IS NULL AND p.published_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY p.published_at DESC LIMIT 40`);
  if (!posts.length) return { empty: true };
  const subs = await all("SELECT * FROM email_subscribers WHERE confirmed = 1 AND unsub_at IS NULL AND mode = 'daily'");
  const b = baseUrl(); let n = 0;
  for (const s of subs) {
    const mine = posts.filter((p) => csvHas(s.cats, p.cat_id));
    if (!mine.length) continue;
    const unsub = `${b}/notify/unsub?t=${s.token}`;
    const rows = mine.slice(0, 15).map((p) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eef3f2"><a href="${b}/post/${p.slug}" style="color:#0f1f1c;text-decoration:none;font-weight:700;font-size:15px;line-height:1.5">${esc(p.title)}</a><div style="font-size:12px;color:#5f716d;margin-top:2px">${[p.company, p.district || p.division, p.deadline ? `শেষ ${bnDate(p.deadline)}` : ''].filter(Boolean).map(esc).join(' • ')}</div></td></tr>`).join('');
    const body = `<h2 style="margin:0 0 4px;font-size:19px">আজকের নতুন ${bn(mine.length)}টি বিজ্ঞপ্তি</h2><p style="margin:0 0 10px;color:#5f716d;font-size:13px">${bnDate(Date.now())}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table><p style="margin:16px 0 0">${btn(b, 'সব দেখুন')}</p>`;
    await enqueueMail(s.email, `আজকের ${bn(mine.length)}টি নতুন চাকরির খবর — ${setting('site_name', 'চাকরি সার্কুলার')}`, emailShell({ title: 'দৈনিক সারসংক্ষেপ', preheader: mine[0].title, base: b, body, footer: `আপনি দৈনিক সারসংক্ষেপ পেতে সাবস্ক্রাইব করেছেন। <a href="${unsub}" style="color:#0f766e">এক ক্লিকে বন্ধ করুন</a>` }));
    n += 1;
  }
  return { queued: n };
}

/** সেভ করা পোস্টের ডেডলাইন রিমাইন্ডার — সকাল ৯টায় (ঢাকা) */
export async function sendReminders(force = false) {
  const t = dhaka(); const today = `${t.y}-${t.m}-${t.d}`;
  if (!force && (t.h < 9 || setting('remind_last') === today)) return { skipped: true };
  await setSetting('remind_last', today);
  const rows = await all(`SELECT s.id sub_id, s.endpoint, s.p256dh, s.auth, p.id post_id, p.title, p.slug, p.company, DATEDIFF(p.deadline, CURDATE()) AS d
    FROM push_saved ps JOIN push_subscriptions s ON s.id = ps.sub_id AND s.remind = 1 AND s.fails < 5
    JOIN posts p ON p.id = ps.post_id AND p.status = 1 AND p.deleted_at IS NULL
    WHERE p.deadline IS NOT NULL AND DATEDIFF(p.deadline, CURDATE()) IN (0, 1, 3)`);
  let sent = 0;
  for (const r of rows) {
    const stage = Number(r.d);
    const dup = await col('SELECT 1 FROM reminder_log WHERE sub_id=? AND post_id=? AND stage=?', [r.sub_id, r.post_id, stage]);
    if (dup) continue;
    const when = stage === 0 ? 'আজই শেষ দিন' : stage === 1 ? 'আগামীকাল শেষ' : `আর ${bn(3)} দিন বাকি`;
    const res = await sendPush({ id: r.sub_id, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }, { title: `⏰ ${when}`, body: Array.from(r.title).slice(0, 100).join(''), url: `/post/${r.slug}`, tag: `remind-${r.post_id}` });
    if (res === 'ok') { sent += 1; await run('INSERT IGNORE INTO reminder_log (sub_id, post_id, stage, sent_at) VALUES (?,?,?,NOW())', [r.sub_id, r.post_id, stage]); }
  }
  await run('DELETE FROM reminder_log WHERE sent_at < DATE_SUB(NOW(), INTERVAL 30 DAY)').catch(() => {});
  return { sent };
}

export { deadlineInfo };
