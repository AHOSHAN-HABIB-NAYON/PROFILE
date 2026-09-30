'use strict';
/** Outgoing notifications: push on publish, deadline reminders, daily digest mail. */
const db = require('./db');
const settings = require('./settings');
const push = require('./util/push');
const mailer = require('./util/mailer');
const uploads = require('./util/uploads');
const { esc } = require('./util/html');
const { bnDate, bnNum } = require('./util/bn');

function siteUrl() { return `https://${settings.get('site_domain') || 'localhost'}`; }

async function adminNotice(type, title, body = '', link = '') {
  await db.insert('admin_notifications', { type, title: String(title).slice(0, 250), body: String(body).slice(0, 500), link });
}

/** Push a newly published post once (and only if it is fresh, not an old post being re-saved). */
async function postPublished(id) {
  const p = await db.one(
    `SELECT id, title, slug, organization, deadline, thumbnail, notified, published_at FROM posts
     WHERE id = ? AND status = 'published' AND published_at <= NOW()`, [id],
  );
  if (!p || p.notified) return false;
  await db.query('UPDATE posts SET notified = 1 WHERE id = ?', [id]);
  if (Date.now() - new Date(p.published_at).getTime() > 2 * 86400000) return false;
  await push.broadcast({
    title: p.title,
    body: [p.organization, p.deadline ? `আবেদনের শেষ তারিখ: ${bnDate(p.deadline)}` : ''].filter(Boolean).join(' · ') || 'নতুন সার্কুলার প্রকাশিত হয়েছে',
    url: `/post/${encodeURIComponent(p.slug)}`,
    image: p.thumbnail ? uploads.url(p.thumbnail) : undefined,
    tag: `post-${p.id}`,
  });
  return true;
}

/** Scheduled posts whose time has come. */
async function publishDue() {
  const rows = await db.query("SELECT id FROM posts WHERE status = 'published' AND notified = 0 AND published_at <= NOW() AND published_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) LIMIT 20");
  for (const r of rows) await postPublished(r.id);
  return rows.length;
}

/** Push reminders for saved jobs whose deadline is within ~36 hours. */
async function deadlineReminders() {
  if (!settings.bool('reminder_enabled') || !settings.bool('push_enabled') || !push.configure()) return 0;
  const due = await db.query("SELECT id, title, slug, deadline FROM posts WHERE status = 'published' AND deadline BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 36 HOUR)");
  if (!due.length) return 0;
  const dueMap = new Map(due.map((p) => [p.id, p]));
  let sent = 0; let lastId = 0;
  for (;;) {
    const subs = await db.query("SELECT id, endpoint, p256dh, auth, saved_ids, reminded_ids FROM push_subs WHERE id > ? AND saved_ids IS NOT NULL AND saved_ids <> '[]' ORDER BY id LIMIT 200", [lastId]);
    if (!subs.length) break;
    lastId = subs[subs.length - 1].id;
    for (const s of subs) {
      let saved = []; let reminded = [];
      try { saved = JSON.parse(s.saved_ids || '[]'); reminded = JSON.parse(s.reminded_ids || '[]'); } catch (_) { continue; }
      const todo = saved.filter((id) => dueMap.has(id) && !reminded.includes(id));
      for (const id of todo.slice(0, 3)) {
        const p = dueMap.get(id);
        const ok = await push.sendOne(s, { title: '⏰ আবেদনের সময় শেষ হয়ে আসছে', body: `${p.title} — শেষ তারিখ ${bnDate(p.deadline)}`, url: `/post/${encodeURIComponent(p.slug)}`, tag: `remind-${p.id}` });
        if (ok) sent++;
        reminded.push(id);
      }
      if (todo.length) await db.query('UPDATE push_subs SET reminded_ids = ? WHERE id = ?', [JSON.stringify(reminded.slice(-300)), s.id]);
    }
  }
  return sent;
}

/** Daily digest mail. force=true sends now regardless of hour / already-sent. */
async function sendDigest(force = false) {
  if (!mailer.configured()) return { ok: false, message: 'SMTP সেটিংস দেওয়া নেই' };
  if (!force && (!settings.bool('digest_enabled') || new Date().getHours() < settings.int('digest_hour', 20))) return { ok: false, message: 'এখন সময় নয়' };
  const posts = await db.query(`SELECT p.title, p.slug, p.organization, p.deadline, c.name AS cat FROM posts p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.status = 'published' AND p.published_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND p.published_at <= NOW() ORDER BY p.published_at DESC LIMIT 30`);
  if (!posts.length) return { ok: false, message: 'গত ২৪ ঘণ্টায় কোনো নতুন পোস্ট নেই' };
  const base = siteUrl();
  const list = posts.map((p) => `<li style="margin:0 0 12px"><a href="${base}/post/${encodeURIComponent(p.slug)}" style="color:#15803d;font-weight:700;text-decoration:none">${esc(p.title)}</a><br><small style="color:#64748b">${esc(p.cat || '')}${p.organization ? ` · ${esc(p.organization)}` : ''}${p.deadline ? ` · শেষ: ${bnDate(p.deadline)}` : ''}</small></li>`).join('');
  let sent = 0; let lastId = 0;
  const cond = force ? '' : 'AND (last_digest IS NULL OR last_digest < CURDATE())';
  for (;;) {
    const subs = await db.query(`SELECT id, email, token FROM email_subs WHERE confirmed = 1 AND id > ? ${cond} ORDER BY id LIMIT 50`, [lastId]);
    if (!subs.length) break;
    lastId = subs[subs.length - 1].id;
    for (const s of subs) {
      try {
        await mailer.send({
          to: s.email, subject: `আজকের চাকরির খবর — ${bnNum(posts.length)} টি নতুন পোস্ট`,
          html: `<p>আজ প্রকাশিত নতুন সার্কুলারগুলো:</p><ol style="padding-left:18px">${list}</ol><p style="font-size:12px;color:#94a3b8">আর ইমেইল পেতে না চাইলে <a href="${base}/unsubscribe?t=${s.token}">আনসাবস্ক্রাইব করুন</a>।</p>`,
        });
        sent++;
      } catch (e) { console.error('[digest]', e.message); }
      await db.query('UPDATE email_subs SET last_digest = CURDATE() WHERE id = ?', [s.id]);
    }
  }
  return { ok: true, message: `${bnNum(sent)} জনকে দৈনিক সারসংক্ষেপ পাঠানো হয়েছে` };
}

module.exports = { adminNotice, postPublished, publishDue, deadlineReminders, sendDigest };
