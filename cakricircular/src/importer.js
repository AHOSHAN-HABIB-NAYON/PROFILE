'use strict';
/**
 * Import everything from the old PHP site's MySQL database into this app.
 *
 * - Reads the OLD database only (never writes to it), so the live PHP site keeps working.
 * - Re-runnable: rows are matched by `legacy_id`, so running it again only adds/updates —
 *   handy for a final sync right before switching the domain over.
 * - Optionally copies the old `uploads/` folder (same hosting account) and reports every
 *   referenced file that is missing.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const db = require('./db');
const cache = require('./cache');
const settings = require('./settings');
const config = require('./config');
const { clean, strip, safeUrl } = require('./util/html');

const PALETTE = ['#16a34a', '#2563eb', '#7c3aed', '#ea580c', '#e11d48', '#0d9488', '#ca8a04', '#0891b2', '#9333ea', '#15803d'];
const ICONS = [
  [/briefcase|suitcase/, 'briefcase'], [/graduation|school|university/, 'cap'], [/poll|chart|square-poll|trophy/, 'chart'],
  [/building|landmark|columns|bank/, 'building'], [/bullhorn|megaphone|bell/, 'megaphone'], [/award|medal|star/, 'star'],
  [/book/, 'book'], [/user|people|users/, 'users'], [/globe|earth/, 'globe'], [/shield/, 'shield'], [/money|coins|taka|dollar/, 'money'],
  [/file|newspaper/, 'file'], [/layer/, 'layers'], [/heart/, 'heart'], [/bolt|zap/, 'zap'],
];
const JOB_TYPE = { FULL_TIME: 'স্থায়ী', PART_TIME: 'খণ্ডকালীন', TEMPORARY: 'অস্থায়ী', CONTRACTOR: 'চুক্তিভিত্তিক', INTERN: 'ইন্টার্নশিপ' };
const UPLOAD_DIRS = ['posts', 'pdf', 'banners', 'site', 'team'];

/* ------------------------------------------------------------------ connection */
async function connectOld(o) {
  const conn = await mysql.createConnection({
    host: o.host || 'localhost', port: Number(o.port) || 3306, user: o.user, password: o.password, database: o.name,
    charset: 'utf8mb4', dateStrings: true, connectTimeout: 10000, timezone: '+06:00',
  });
  return conn;
}
async function q(conn, sql, params = []) { const [rows] = await conn.query(sql, params); return rows; }
async function tableCols(conn, table) {
  const rows = await q(conn, 'SELECT COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]);
  return new Set(rows.map((r) => r.c));
}

/** Check that this really is the old PHP database and count what will come over. */
async function inspect(conn) {
  const posts = await tableCols(conn, 'posts');
  if (!posts.has('cat_id') || !posts.has('thumb')) {
    const e = new Error('এটি পুরোনো PHP সাইটের ডাটাবেস মনে হচ্ছে না (posts টেবিলে cat_id/thumb কলাম নেই)। ডাটাবেসের নাম আবার দেখুন।');
    e.code = 'NOT_OLD_DB'; throw e;
  }
  const count = async (t, where = '') => {
    try { return Number((await q(conn, `SELECT COUNT(*) n FROM \`${t}\` ${where}`))[0].n); } catch (_) { return 0; }
  };
  return {
    posts: await count('posts'),
    published: await count('posts', 'WHERE status = 1 AND deleted_at IS NULL AND review_pending = 0'),
    categories: await count('categories'), links: await count('post_links'), images: await count('post_images'),
    banners: await count('banners'), notices: await count('notices'), admins: await count('admins'),
    redirects: await count('slug_redirects'), reports: await count('reports'), sourceItems: await count('source_posts'),
  };
}

/* ------------------------------------------------------------------ helpers */
function iconFor(fa, name) {
  const s = `${fa || ''} ${name || ''}`.toLowerCase();
  for (const [re, ic] of ICONS) if (re.test(s)) return ic;
  if (/ভর্তি/.test(name)) return 'cap';
  if (/রেজাল্ট|ফলাফল/.test(name)) return 'chart';
  if (/নোটিশ/.test(name)) return 'megaphone';
  if (/স্কলারশিপ|বৃত্তি/.test(name)) return 'star';
  return 'briefcase';
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function linkify(t) {
  let out = ''; let last = 0;
  const re = /https?:\/\/[^\s<]+/g; let m;
  while ((m = re.exec(t))) {
    out += esc(t.slice(last, m.index));
    const url = m[0].replace(/[.,;)।]+$/, '');
    out += `<a href="${esc(url)}" target="_blank" rel="noopener nofollow">${esc(url)}</a>`;
    last = m.index + url.length;
  }
  return out + esc(t.slice(last));
}
/** Same rules as the PHP site's format_content() for posts written as plain text. */
function formatContent(raw) {
  raw = String(raw || '').trim();
  if (!raw) return '';
  if (/<(style|[a-z][a-z0-9]*)(\s|>|\/)/i.test(raw)) return clean(raw.replace(/<style[\s\S]*?<\/style>/gi, ''));
  let out = ''; let list = false;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim().replace(/\*\*(.+?)\*\*/g, '\u0001$1\u0002');
    const fix = (s) => s.replace(/\u0001/g, '<b>').replace(/\u0002/g, '</b>');
    if (!t) { if (list) { out += '</ul>'; list = false; } continue; }
    let m = t.match(/^(\*|-|•|·)\s*(.+)$/u);
    if (m) { if (!list) { out += '<ul>'; list = true; } out += `<li>${fix(esc(m[2]))}</li>`; continue; }
    if (list) { out += '</ul>'; list = false; }
    m = t.match(/^(#{1,3})\s*(.+)$/u);
    if (m) { const lv = Math.min(4, m[1].length + 1); out += `<h${lv}>${fix(esc(m[2]))}</h${lv}>`; }
    else if ([...t].length < 60 && /[:ঃ]$/.test(t)) out += `<h3>${fix(esc(t.replace(/[:ঃ\s]+$/, '')))}</h3>`;
    else out += `<p>${fix(linkify(t))}</p>`;
  }
  if (list) out += '</ul>';
  return clean(out);
}
const dt = (v) => (v && !String(v).startsWith('0000') ? String(v).replace('T', ' ').slice(0, 19) : null);
const endOfDay = (d) => (d && !String(d).startsWith('0000') ? `${String(d).slice(0, 10)} 23:59:00` : null);
const rel = (dir, f) => (f ? `${dir}/${String(f).replace(/^\/+/, '').split('/').pop()}` : null);

async function upsertLegacy(table, legacyId, row) {
  const ex = await db.one(`SELECT id FROM \`${table}\` WHERE legacy_id = ?`, [legacyId]);
  if (ex) { await db.update(table, row, 'id = ?', [ex.id]); return { id: ex.id, created: false }; }
  const id = await db.insert(table, { ...row, legacy_id: legacyId });
  return { id, created: true };
}

/* ------------------------------------------------------------------ main */
/**
 * @param {object} o { db: {host,port,name,user,password}, uploadsFrom?: string, withSettings?: bool, withUsers?: bool, onStep?: fn }
 */
async function run(o) {
  const step = o.onStep || (() => {});
  const report = { counts: {}, created: {}, missing: [], copied: 0, warnings: [] };
  const inc = (k, created) => { report.counts[k] = (report.counts[k] || 0) + 1; if (created) report.created[k] = (report.created[k] || 0) + 1; };
  const conn = await connectOld(o.db);
  try {
    report.source = await inspect(conn);
    const oldSettings = Object.fromEntries((await q(conn, 'SELECT k, v FROM settings')).map((r) => [r.k, r.v]));

    /* categories */
    step('ক্যাটাগরি');
    const catMap = new Map();
    const oldCats = await q(conn, 'SELECT * FROM categories ORDER BY sort_order, id');
    for (const [i, c] of oldCats.entries()) {
      const row = { name: c.name, icon: iconFor(c.icon, c.name), meta_title: c.meta_title || null, meta_desc: c.meta_desc || null, sort: c.sort_order || 0, active: c.is_active ? 1 : 0 };
      let ex = await db.one('SELECT id, legacy_id FROM categories WHERE legacy_id = ?', [c.id]);
      if (!ex) ex = await db.one('SELECT id, legacy_id FROM categories WHERE slug = ? AND legacy_id IS NULL', [c.slug]);
      if (ex) {
        await db.update('categories', { ...row, legacy_id: c.id }, 'id = ?', [ex.id]);
        catMap.set(c.id, ex.id); inc('categories', false);
      } else {
        const id = await db.insert('categories', { ...row, slug: c.slug, color: PALETTE[i % PALETTE.length], legacy_id: c.id });
        catMap.set(c.id, id); inc('categories', true);
      }
    }

    /* posts + links + gallery */
    step('পোস্ট');
    const linksBy = groupBy(await q(conn, 'SELECT * FROM post_links ORDER BY post_id, sort_order, id').catch(() => []), 'post_id');
    const imagesBy = groupBy(await q(conn, 'SELECT * FROM post_images ORDER BY post_id, sort_order, id').catch(() => []), 'post_id');
    const postMap = new Map();
    const posts = await q(conn, 'SELECT * FROM posts ORDER BY id');
    for (const p of posts) {
      const links = (linksBy.get(p.id) || []).map((l) => ({ label: strip(l.label).slice(0, 180), url: safeUrl(l.url).slice(0, 600), is_apply: l.is_apply ? 1 : 0 })).filter((l) => /^(https?:|tel:|mailto:)/i.test(l.url));
      const apply = links.find((l) => l.is_apply);
      const status = p.deleted_at ? 'trash' : (Number(p.status) === 1 && !Number(p.review_pending)) ? 'published' : 'draft';
      const content = formatContent(p.content);
      const row = {
        title: strip(p.title).slice(0, 500), category_id: catMap.get(p.cat_id) || null,
        organization: strip(p.company || '').slice(0, 250), vacancies: strip(p.vacancy || '').slice(0, 100), salary: strip(p.salary || '').slice(0, 180),
        division: strip(p.division || '').slice(0, 80), district: strip(p.district || '').slice(0, 80),
        job_type: Number(p.is_job) ? (JOB_TYPE[p.employment_type] || '') : '',
        start_date: p.application_start && !String(p.application_start).startsWith('0000') ? String(p.application_start).slice(0, 10) : null,
        deadline: endOfDay(p.deadline), content, excerpt: strip(content).slice(0, 300),
        thumbnail: rel('posts', p.thumb), pdf: rel('pdf', p.pdf), apply_url: apply ? apply.url : '',
        source_url: safeUrl(p.source_url || '').slice(0, 500), keywords: strip(p.keywords || '').slice(0, 500),
        meta_title: strip(p.meta_title || '').slice(0, 250), meta_desc: strip(p.meta_desc || '').slice(0, 500),
        status, is_premium: Number(p.is_premium) ? 1 : 0, premium_until: endOfDay(p.premium_until),
        views: Number(p.views) || 0, auto_generated: Number(p.is_auto) ? 1 : 0,
        published_at: dt(p.published_at), created_at: dt(p.published_at) || new Date(), updated_at: dt(p.updated_at) || dt(p.published_at) || new Date(),
        deleted_at: dt(p.deleted_at), notified: 1, // never push-notify old posts
      };
      const existing = await db.one('SELECT id FROM posts WHERE legacy_id = ?', [p.id]);
      let slug = String(p.slug);
      const clash = await db.one('SELECT id FROM posts WHERE slug = ? AND (legacy_id IS NULL OR legacy_id <> ?)', [slug, p.id]);
      if (clash) { slug = `${slug}-${p.id}`; report.warnings.push(`স্লাগ মিলে যাওয়ায় পোস্ট #${p.id} এর স্লাগ বদলানো হয়েছে: ${slug}`); }
      let id;
      if (existing) { id = existing.id; await db.update('posts', { ...row, slug }, 'id = ?', [id]); inc('posts', false); }
      else { id = await db.insert('posts', { ...row, slug, legacy_id: p.id }); inc('posts', true); }
      postMap.set(p.id, id);
      if (slug !== p.slug) await db.query('INSERT INTO slug_redirects (old_slug, post_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE post_id = VALUES(post_id)', [p.slug, id]);

      await db.query('DELETE FROM post_links WHERE post_id = ?', [id]);
      for (const [i, l] of links.entries()) { await db.insert('post_links', { post_id: id, label: l.label || hostOf(l.url), url: l.url, is_apply: l.is_apply, sort: i }); inc('links', false); }
      await db.query('DELETE FROM post_images WHERE post_id = ?', [id]);
      for (const [i, im] of (imagesBy.get(p.id) || []).entries()) { await db.insert('post_images', { post_id: id, image: rel('posts', im.image), sort: i }); inc('images', false); }
    }

    step('পুরোনো লিংক (রিডাইরেক্ট)');
    for (const r of await q(conn, 'SELECT * FROM slug_redirects').catch(() => [])) {
      const id = postMap.get(r.post_id);
      if (!id) continue;
      const taken = await db.one('SELECT id FROM posts WHERE slug = ?', [r.old_slug]);
      if (taken) continue;
      await db.query('INSERT INTO slug_redirects (old_slug, post_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE post_id = VALUES(post_id)', [r.old_slug, id]);
      inc('redirects', true);
    }

    step('ব্যানার ও নোটিশ');
    for (const b of await q(conn, 'SELECT * FROM banners ORDER BY sort_order, id').catch(() => [])) {
      const r = await upsertLegacy('banners', b.id, { title: b.title || '', image: rel('banners', b.image), link: safeUrl(b.link || ''), sort: b.sort_order || 0, active: b.is_active ? 1 : 0, created_at: dt(b.created_at) || new Date() });
      inc('banners', r.created);
    }
    for (const n of await q(conn, 'SELECT * FROM notices ORDER BY id').catch(() => [])) {
      const r = await upsertLegacy('notices', n.id, { title: strip(n.title).slice(0, 500), body: n.body || '', link: safeUrl(n.link || ''), active: n.is_active ? 1 : 0, created_at: dt(n.created_at) || new Date() });
      inc('notices', r.created);
    }
    for (const r0 of await q(conn, 'SELECT * FROM reports ORDER BY id').catch(() => [])) {
      const r = await upsertLegacy('reports', r0.id, { type: 'অন্যান্য', message: [r0.title, r0.details].filter(Boolean).join('\n').slice(0, 2000), contact: r0.email || '', ip: r0.ip || '', status: r0.status === 'new' ? 'new' : 'done', created_at: dt(r0.created_at) || new Date() });
      inc('reports', r.created);
    }

    if (o.withUsers !== false) {
      step('এডমিন ইউজার');
      const domain = settings.get('site_domain') || 'cakricircular.com';
      for (const a of await q(conn, 'SELECT * FROM admins ORDER BY id').catch(() => [])) {
        const exists = await db.one('SELECT id FROM users WHERE username = ?', [a.username]);
        if (exists) { report.warnings.push(`ইউজার "${a.username}" আগে থেকেই আছে — বদলানো হয়নি`); continue; }
        let perms = [];
        try { perms = JSON.parse(a.perms || '[]'); } catch (_) { perms = []; }
        const role = a.role === 'super' || perms.includes('all') ? 'admin' : a.role === 'admin' ? 'admin2' : 'moderator';
        let email = `${a.username}@${domain}`.toLowerCase();
        if (await db.one('SELECT id FROM users WHERE email = ?', [email])) email = `${a.username}.${a.id}@${domain}`.toLowerCase();
        await db.insert('users', { username: a.username, email, name: a.name || a.username, password_hash: a.pass, role, permissions: JSON.stringify(perms.filter((x) => x !== 'all')), active: a.is_active ? 1 : 0, last_login: dt(a.last_login), created_at: dt(a.created_at) || new Date() });
        inc('users', true);
      }
    }

    step('অটোমেশনের ইতিহাস');
    const src = oldSettings.auto_source || '';
    const site = hostOf(src);
    if (site) {
      const map = { done: 'processed', needs_review: 'processed', update_pending: 'processed', skipped_duplicate: 'duplicate', baseline: 'skipped', skipped: 'skipped', expired: 'expired', failed: 'failed' };
      for (const sp of await q(conn, 'SELECT * FROM source_posts').catch(() => [])) {
        const postId = postMap.get(sp.my_post_id) || postMap.get(sp.match_post_id) || null;
        let status = map[sp.status] || (postId ? 'processed' : null);
        if (!status) continue; // still "new" on the old site → let the new automation handle it
        if (status === 'processed' && !postId) status = 'skipped';
        const iso = (v) => (v ? String(v).replace(' ', 'T') : '');
        await db.query(
          `INSERT INTO automation_items (source_site, source_id, source_modified, source_date, title, link, status, reason, post_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE status = VALUES(status), post_id = COALESCE(VALUES(post_id), post_id)`,
          [site, String(sp.source_id), iso(sp.source_modified), iso(sp.source_date), String(sp.title_raw || '').slice(0, 500), String(sp.source_link || '').slice(0, 500), status, 'পুরোনো সাইট থেকে আনা', postId],
        );
        inc('automation', false);
      }
    }

    if (o.withSettings !== false) {
      step('সেটিংস');
      await importSettings(conn, oldSettings, report);
    }

    if (o.uploadsFrom) {
      step('ছবি ও PDF কপি');
      report.copied = copyUploads(o.uploadsFrom, report);
    }
    step('ফাইল যাচাই');
    report.missing = await missingFiles();
  } finally {
    await conn.end().catch(() => {});
  }
  cache.clear();
  await settings.load();
  await settings.set({ import_last: JSON.stringify({ at: new Date().toISOString(), counts: report.counts, missing: report.missing.length }) });
  return report;
}

async function importSettings(conn, s, report) {
  const pick = (k) => (s[k] !== undefined && s[k] !== null && String(s[k]).trim() !== '' ? String(s[k]) : undefined);
  const vals = {
    site_name: pick('site_name'), app_name: pick('app_name'), tagline: pick('tagline'), contact_email: pick('contact_email'),
    footer_about: pick('footer_about'), footer_slogan: pick('footer_slogan'), copyright: pick('copyright'),
    meta_title: pick('meta_title'), meta_desc: pick('meta_description'), meta_keywords: pick('meta_keywords'),
    google_verification: pick('google_verification'), per_page: pick('per_page'), notice_limit: pick('notice_limit'), promo_gap: pick('promo_gap'),
    maintenance_title: pick('maintenance_title'), maintenance_text: pick('maintenance_text'),
    social_facebook: pick('fb'), social_x: pick('twitter'), social_telegram: pick('telegram'), social_whatsapp: pick('whatsapp'),
    smtp_host: pick('smtp_host'), smtp_port: pick('smtp_port'), smtp_user: pick('smtp_user'), smtp_pass: pick('smtp_pass'),
    mail_from: pick('smtp_from'), mail_from_name: pick('smtp_from_name'),
    openai_key: pick('auto_openai_key'), openai_model: pick('auto_model'), auto_sources: pick('auto_source'),
    auto_start_date: pick('auto_start_date'), auto_notify_email: pick('auto_notify_email'),
    geo_lookup: pick('geo_lookup'),
  };
  if (pick('smtp_secure')) vals.smtp_secure = /ssl|1|true/i.test(s.smtp_secure) ? '1' : '0';
  if (pick('home_h1')) vals.meta_title = vals.meta_title || s.home_h1;
  for (const k of ['logo', 'favicon']) if (pick(k)) vals[k] = rel('site', s[k]);
  if (pick('default_og')) vals.og_image = rel('site', s.default_og);
  // the old site's automation stays in charge until you switch over — never enable it here
  for (const k of Object.keys(vals)) if (vals[k] === undefined) delete vals[k];
  await settings.set(vals);
  report.counts.settings = Object.keys(vals).length;
  // about / privacy pages
  for (const [key, slug, title] of [['page_about', 'about', 'আমাদের সম্পর্কে'], ['page_privacy', 'privacy', 'গোপনীয়তা নীতি']]) {
    if (!pick(key)) continue;
    const content = formatContent(s[key]);
    const ex = await db.one('SELECT id FROM pages WHERE slug = ?', [slug]);
    if (ex) await db.update('pages', { content, updated_at: new Date() }, 'id = ?', [ex.id]);
    else await db.insert('pages', { slug, title, content, sort: slug === 'about' ? 1 : 2, active: 1, in_footer: 1 });
    report.counts.pages = (report.counts.pages || 0) + 1;
  }
}

/* ------------------------------------------------------------------ files */
function copyUploads(from, report) {
  const src = path.resolve(String(from).trim());
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) { report.warnings.push(`আপলোড ফোল্ডার পাওয়া যায়নি: ${src}`); return 0; }
  const dest = config.uploadsDir();
  if (path.resolve(dest) === src) return 0;
  let n = 0;
  for (const dir of UPLOAD_DIRS) {
    const d = path.join(src, dir);
    if (!fs.existsSync(d)) continue;
    fs.mkdirSync(path.join(dest, dir), { recursive: true });
    for (const f of fs.readdirSync(d)) {
      if (!/\.(webp|jpe?g|png|gif|avif|pdf)$/i.test(f)) continue;
      const a = path.join(d, f); const b = path.join(dest, dir, f);
      try {
        const sa = fs.statSync(a);
        if (!sa.isFile()) continue;
        if (fs.existsSync(b) && fs.statSync(b).size === sa.size) continue;
        fs.copyFileSync(a, b); n++;
      } catch (e) { report.warnings.push(`কপি করা যায়নি: ${dir}/${f} (${e.code || e.message})`); }
    }
  }
  return n;
}

/** Every file referenced by imported rows that is not present in the uploads folder. */
async function missingFiles() {
  const base = config.uploadsDir();
  const refs = [];
  for (const r of await db.query("SELECT id, legacy_id, title, thumbnail, pdf FROM posts WHERE legacy_id IS NOT NULL AND status <> 'trash'")) {
    if (r.thumbnail) refs.push({ file: r.thumbnail, kind: 'ছবি', post: r.id, old: r.legacy_id, title: r.title });
    if (r.pdf) refs.push({ file: r.pdf, kind: 'PDF', post: r.id, old: r.legacy_id, title: r.title });
  }
  for (const r of await db.query('SELECT i.image, p.id, p.title FROM post_images i JOIN posts p ON p.id = i.post_id WHERE p.legacy_id IS NOT NULL')) refs.push({ file: r.image, kind: 'গ্যালারি ছবি', post: r.id, title: r.title });
  for (const r of await db.query('SELECT image FROM banners WHERE legacy_id IS NOT NULL')) refs.push({ file: r.image, kind: 'ব্যানার' });
  return refs.filter((r) => r.file && !/^https?:/.test(r.file) && !fs.existsSync(path.join(base, r.file)));
}

function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); }
  return m;
}
function hostOf(u) { try { return new URL(u).host; } catch (_) { return ''; } }

module.exports = { run, inspect, connectOld, formatContent, missingFiles };
