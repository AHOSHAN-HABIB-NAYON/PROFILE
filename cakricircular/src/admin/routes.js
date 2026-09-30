'use strict';
const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const cache = require('../cache');
const settings = require('../settings');
const config = require('../config');
const uploads = require('../util/uploads');
const mailer = require('../util/mailer');
const push = require('../util/push');
const formtoken = require('../util/formtoken');
const { clean, strip, safeUrl } = require('../util/html');
const { slugify, isBrokenSlug, bnDay, bnNum, bnCount } = require('../util/bn');
const { verifyPassword, hashPassword, clientIp } = require('../util/security');
const auth = require('./auth');
const L = require('../views/admin/layout');
const V = require('../views/admin/pages');
const automation = require('../automation');
const notify = require('../notify');
const migrate = require('../migrate');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024, files: 6, fields: 200, fieldSize: 4 * 1024 * 1024 } });

const ok = (res, message, extra = {}) => res.json({ ok: true, message, ...extra });
const fail = (res, error, status = 400) => res.status(status).json({ ok: false, error });
const A = () => settings.adminPath();
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const flag = (v) => (Array.isArray(v) ? v.includes('1') : v === '1' || v === 'on' || v === true) ? 1 : 0;
const file = (req, name) => (req.files || []).find((f) => f.fieldname === name) || null;
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- page render (full or partial for SPA-like admin navigation) ---------- */
async function render(req, res, page) {
  const [unread, counts] = await Promise.all([
    db.val('SELECT COUNT(*) FROM admin_notifications WHERE is_read = 0'),
    cache.remember('adm-counts', 30000, async () => ({
      reports: Number(await db.val("SELECT COUNT(*) FROM reports WHERE status = 'new'")),
      posts: Number(await db.val("SELECT COUNT(*) FROM posts WHERE status = 'draft' AND auto_generated = 1")),
    })),
  ]);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.headers['x-partial'] === '1') return res.json({ title: page.title, body: String(page.body), nav: page.nav, docTitle: `${page.title} — এডমিন` });
  return res.send(L.document(req, { ...page, unread: Number(unread), counts }));
}

/* ---------- auth ---------- */
router.get('/login', (req, res) => {
  if (req.admin) return res.redirect(A());
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.send(L.loginDoc({ next: String(req.query.next || ''), csrf: formtoken.create() }));
});
router.post('/login', express.urlencoded({ extended: false, limit: '10kb' }), wrap(async (req, res) => {
  const ip = clientIp(req);
  const b = req.body || {};
  const again = (error, status = 401) => res.status(status).send(L.loginDoc({ error, next: b.next, csrf: formtoken.create() }));
  if (!formtoken.verify(b._t, { maxAgeMs: 6 * 3600000 })) return again('পেজের মেয়াদ শেষ, আবার চেষ্টা করুন।', 400);
  const allowed = await auth.loginAllowed(ip);
  if (!allowed.ok) return again(`অনেকবার ভুল চেষ্টা হয়েছে। ${bnNum(allowed.wait)} মিনিট পর আবার চেষ্টা করুন।`, 429);
  const login = String(b.username || '').trim().slice(0, 191);
  const user = await db.one('SELECT id, password_hash, active FROM users WHERE username = ? OR email = ?', [login, login]);
  const valid = user && user.active && await verifyPassword(b.password, user.password_hash);
  if (!valid) {
    const locked = await auth.loginFailed(ip);
    return again(locked ? `অনেকবার ভুল চেষ্টা হয়েছে। ${bnNum(locked)} মিনিটের জন্য লগইন বন্ধ।` : 'ইউজারনেম বা পাসওয়ার্ড ভুল।');
  }
  await auth.loginSucceeded(ip);
  // upgrade legacy PHP $2y$ hashes transparently
  if (/^\$2y\$/.test(user.password_hash)) await db.update('users', { password_hash: await hashPassword(b.password) }, 'id = ?', [user.id]);
  await auth.createSession(req, res, user.id);
  const next = String(b.next || '');
  res.redirect(next.startsWith(A()) && !next.startsWith('//') ? next : A());
}));

router.use(auth.requireAuth);
router.use(upload.any());
router.use(auth.csrf);

router.post('/logout', wrap(async (req, res) => { await auth.destroySession(req, res); res.redirect(`${A()}/login`); }));

/* ---------- dashboard ---------- */
router.get('/', wrap(async (req, res) => {
  const q = (sql, p) => db.val(sql, p).then(Number);
  const [total, published, drafts, autoDrafts, expired, today, week] = await Promise.all([
    q("SELECT COUNT(*) FROM posts WHERE status <> 'trash'"), q("SELECT COUNT(*) FROM posts WHERE status = 'published'"),
    q("SELECT COUNT(*) FROM posts WHERE status = 'draft'"), q("SELECT COUNT(*) FROM posts WHERE status = 'draft' AND auto_generated = 1"),
    q("SELECT COUNT(*) FROM posts WHERE status = 'published' AND deadline < NOW()"),
    q("SELECT COUNT(*) FROM posts WHERE status = 'published' AND published_at >= CURDATE()"),
    q("SELECT COUNT(*) FROM posts WHERE status <> 'trash' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"),
  ]);
  const series = await db.query('SELECT day, visits, uniques, pageviews FROM stats_daily WHERE day >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) ORDER BY day');
  const visits = fillDays(series, 7, 'visits');
  const todayRow = series.find((r) => sameDay(r.day, new Date())) || {};
  const cats = await db.query("SELECT c.name, c.icon, c.color, COUNT(p.id) AS n FROM categories c LEFT JOIN posts p ON p.category_id = c.id AND p.status = 'published' GROUP BY c.id ORDER BY c.sort");
  const pending = await db.query("SELECT id, title, created_at FROM posts WHERE status = 'draft' AND auto_generated = 1 ORDER BY id DESC LIMIT 6");
  const reports = await db.query("SELECT type, message, created_at FROM reports WHERE status = 'new' ORDER BY id DESC LIMIT 5");
  const top = await db.query("SELECT title, slug, views FROM posts WHERE status = 'published' AND published_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) ORDER BY views DESC LIMIT 6");
  const lastRun = await db.one('SELECT * FROM automation_runs ORDER BY id DESC LIMIT 1');
  const [pushSubs, emailSubs] = await Promise.all([q('SELECT COUNT(*) FROM push_subs'), q('SELECT COUNT(*) FROM email_subs WHERE confirmed = 1')]);
  await render(req, res, {
    title: 'ড্যাশবোর্ড', nav: 'dashboard',
    body: V.dashboard({
      user: req.admin, dayName: bnDay(new Date()), total, published, drafts, autoDrafts, expired, today, week, visits, cats, pending, reports, top, lastRun, pushSubs, emailSubs,
      todayVisits: todayRow.visits || 0, todayUniques: todayRow.uniques || 0, pageviews: series.reduce((a, r) => a + Number(r.pageviews || 0), 0), autoOn: settings.bool('auto_enabled'),
    }),
  });
}));

function sameDay(a, b) { a = new Date(a); return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function fillDays(rows, days, key) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const r = rows.find((x) => sameDay(x.day, d));
    out.push({ label: bnNum(d.getDate()), value: r ? Number(r[key]) || 0 : 0 });
  }
  return out;
}

/* ---------- posts ---------- */
const POST_PER_PAGE = 25;
router.get('/posts', auth.can('posts'), wrap(async (req, res) => {
  const status = ['all', 'published', 'draft', 'auto', 'premium', 'expired', 'trash'].includes(req.query.status) ? req.query.status : 'all';
  const q = String(req.query.q || '').trim().slice(0, 100);
  const cat = int(req.query.cat) || '';
  const page = Math.max(1, int(req.query.page, 1));
  const conds = {
    all: "p.status <> 'trash'", published: "p.status = 'published'", draft: "p.status = 'draft'", auto: "p.status = 'draft' AND p.auto_generated = 1",
    premium: "p.status <> 'trash' AND p.is_premium = 1", expired: "p.status = 'published' AND p.deadline < NOW()", trash: "p.status = 'trash'",
  };
  const where = [conds[status]]; const params = [];
  if (q) {
    if (/^\d+$/.test(q)) { where.push('p.id = ?'); params.push(Number(q)); } else { where.push('(p.title LIKE ? OR p.organization LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  }
  if (cat) { where.push('p.category_id = ?'); params.push(cat); }
  const w = where.join(' AND ');
  const [rows, total, cats] = await Promise.all([
    db.query(`SELECT p.id, p.title, p.slug, p.status, p.thumbnail, p.views, p.deadline, p.published_at, p.created_at, p.auto_generated,
      (p.is_premium = 1 AND (p.premium_until IS NULL OR p.premium_until > NOW())) AS premium, c.name AS cat_name, c.color AS cat_color, c.icon AS cat_icon
      FROM posts p LEFT JOIN categories c ON c.id = p.category_id WHERE ${w} ORDER BY ${status === 'trash' ? 'p.deleted_at' : 'COALESCE(p.published_at, p.created_at)'} DESC, p.id DESC LIMIT ${POST_PER_PAGE} OFFSET ${(page - 1) * POST_PER_PAGE}`, params),
    db.val(`SELECT COUNT(*) FROM posts p WHERE ${w}`, params),
    db.query('SELECT id, name FROM categories ORDER BY sort'),
  ]);
  const countRows = await db.query(`SELECT
    SUM(status <> 'trash') AS \`all\`, SUM(status = 'published') AS published, SUM(status = 'draft') AS draft, SUM(status = 'draft' AND auto_generated = 1) AS auto,
    SUM(status <> 'trash' AND is_premium = 1) AS premium, SUM(status = 'published' AND deadline < NOW()) AS expired, SUM(status = 'trash') AS trash FROM posts`);
  const counts = Object.fromEntries(Object.entries(countRows[0] || {}).map(([k, v]) => [k, Number(v) || 0]));
  await render(req, res, { title: 'পোস্ট তালিকা', nav: 'posts', body: V.postsList({ rows, total: Number(total), page, perPage: POST_PER_PAGE, status, q, cat, cats, counts }) });
}));

async function postFormData() {
  const [cats, orgs] = await Promise.all([
    db.query('SELECT id, name FROM categories ORDER BY sort'),
    cache.remember('adm-orgs', 600000, async () => (await db.query("SELECT organization FROM posts WHERE organization <> '' GROUP BY organization ORDER BY COUNT(*) DESC LIMIT 200")).map((r) => r.organization)),
  ]);
  return { cats, orgs };
}
router.get('/posts/new', auth.can('posts'), wrap(async (req, res) => {
  await render(req, res, { title: 'পোস্ট যোগ', nav: 'posts', body: V.postForm({ ...(await postFormData()), post: null }) });
}));
router.get('/posts/:id(\\d+)', auth.can('posts'), wrap(async (req, res) => {
  const post = await db.one('SELECT * FROM posts WHERE id = ?', [req.params.id]);
  if (!post) return res.redirect(`${A()}/posts`);
  await render(req, res, { title: 'পোস্ট এডিট', nav: 'posts', body: V.postForm({ ...(await postFormData()), post }) });
}));

async function uniqueSlug(base, excludeId = 0) {
  let slug = base || `post-${Date.now().toString(36)}`;
  for (let i = 2; ; i++) {
    const row = await db.one('SELECT id FROM posts WHERE slug = ? AND id <> ?', [slug, excludeId]);
    const redirect = await db.one('SELECT post_id FROM slug_redirects WHERE old_slug = ? AND post_id <> ?', [slug, excludeId]);
    if (!row && !redirect) return slug;
    slug = `${base}-${bnNum(i)}`;
  }
}
function parseDate(v, endOfDay = false) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T${endOfDay ? '23:59:00' : '00:00:00'}`);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

router.post('/posts/:id(new|\\d+)', auth.can('posts'), wrap(async (req, res) => {
  const b = req.body;
  const isNew = req.params.id === 'new';
  const existing = isNew ? null : await db.one('SELECT * FROM posts WHERE id = ?', [req.params.id]);
  if (!isNew && !existing) return fail(res, 'পোস্টটি পাওয়া যায়নি', 404);
  const title = strip(b.title).slice(0, 500);
  if (!title) return fail(res, 'শিরোনাম দিন');
  const status = b.status === 'published' ? 'published' : 'draft';
  if (status === 'published' && !int(b.category_id)) return fail(res, 'ক্যাটাগরি নির্বাচন করুন');

  const wantedSlug = slugify(b.slug || title);
  const slug = await uniqueSlug(wantedSlug, existing ? existing.id : 0);
  const row = {
    title, slug, category_id: int(b.category_id) || null,
    organization: strip(b.organization).slice(0, 250), vacancies: strip(b.vacancies).slice(0, 100), salary: strip(b.salary).slice(0, 180),
    division: strip(b.division).slice(0, 80), district: strip(b.district).slice(0, 80), job_type: strip(b.job_type).slice(0, 80), education: strip(b.education).slice(0, 250),
    start_date: parseDate(b.start_date), deadline: parseDate(b.deadline, true),
    content: clean(b.content), excerpt: strip(b.excerpt).slice(0, 600),
    apply_url: safeUrl(b.apply_url).slice(0, 500), source_url: safeUrl(b.source_url).slice(0, 500),
    keywords: strip(b.keywords).slice(0, 500), meta_title: strip(b.meta_title).slice(0, 250), meta_desc: strip(b.meta_desc).slice(0, 500),
    is_premium: flag(b.is_premium), premium_until: parseDate(b.premium_until),
    status, updated_at: new Date(),
  };
  if (!row.excerpt) row.excerpt = strip(row.content).slice(0, 300);
  const pubAt = parseDate(b.published_at);
  if (status === 'published') row.published_at = pubAt || (existing && existing.published_at) || new Date();
  else if (pubAt) row.published_at = pubAt;

  try {
    const img = file(req, 'thumbnail');
    if (img) { row.thumbnail = await uploads.saveImage(img.buffer, 'thumb'); if (existing && existing.thumbnail) uploads.removeFile(existing.thumbnail); } else if (flag(b.remove_thumbnail)) { row.thumbnail = null; if (existing) uploads.removeFile(existing.thumbnail); }
    const pdf = file(req, 'pdf');
    if (pdf) { row.pdf = await uploads.savePdf(pdf.buffer); if (existing && existing.pdf) uploads.removeFile(existing.pdf); } else if (flag(b.remove_pdf)) { row.pdf = null; if (existing) uploads.removeFile(existing.pdf); }
  } catch (e) { return fail(res, e.message); }

  let id;
  if (isNew) {
    id = await db.insert('posts', { ...row, author_id: req.admin.id, created_at: new Date() });
  } else {
    id = existing.id;
    if (existing.slug !== slug) {
      await db.query('INSERT INTO slug_redirects (old_slug, post_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE post_id = VALUES(post_id)', [existing.slug, id]);
      await db.query('DELETE FROM slug_redirects WHERE old_slug = ?', [slug]);
    }
    await db.update('posts', row, 'id = ?', [id]);
  }
  cache.clear();
  if (status === 'published') notify.postPublished(id).catch((e) => console.error('[notify]', e.message));
  return ok(res, status === 'published' ? 'পোস্ট প্রকাশিত হয়েছে ✓' : 'খসড়া সেভ হয়েছে ✓', isNew ? { redirect: `${A()}/posts/${id}` } : { slug });
}));

router.post('/posts/bulk', auth.can('posts'), wrap(async (req, res) => {
  let ids = req.body.ids || [];
  if (!Array.isArray(ids)) ids = [ids];
  ids = ids.map(Number).filter((n) => n > 0).slice(0, 500);
  if (!ids.length) return fail(res, 'কোনো পোস্ট নির্বাচন করা হয়নি');
  const action = req.body.action;
  let msg = '';
  if (action === 'trash') { await db.raw("UPDATE posts SET status = 'trash', deleted_at = NOW() WHERE id IN (?)", [ids]); msg = 'ট্র্যাশে পাঠানো হয়েছে'; }
  else if (action === 'restore') { await db.raw("UPDATE posts SET status = 'draft', deleted_at = NULL WHERE id IN (?)", [ids]); msg = 'রিস্টোর হয়েছে (খসড়া হিসেবে)'; }
  else if (action === 'publish') {
    await db.raw("UPDATE posts SET status = 'published', published_at = COALESCE(published_at, NOW()), deleted_at = NULL WHERE id IN (?) AND category_id IS NOT NULL", [ids]);
    for (const id of ids) notify.postPublished(id).catch(() => {});
    msg = 'প্রকাশিত হয়েছে';
  } else if (action === 'draft') { await db.raw("UPDATE posts SET status = 'draft' WHERE id IN (?)", [ids]); msg = 'খসড়া করা হয়েছে'; }
  else if (action === 'destroy') {
    const files = await db.raw("SELECT thumbnail, pdf FROM posts WHERE id IN (?) AND status = 'trash'", [ids]);
    await db.raw("DELETE FROM posts WHERE id IN (?) AND status = 'trash'", [ids]);
    await db.raw('DELETE FROM slug_redirects WHERE post_id IN (?)', [ids]);
    for (const f of files) { uploads.removeFile(f.thumbnail); uploads.removeFile(f.pdf); }
    msg = 'স্থায়ীভাবে মুছে ফেলা হয়েছে';
  } else return fail(res, 'অজানা অ্যাকশন');
  cache.clear();
  ok(res, `${bnNum(ids.length)} টি পোস্ট ${msg}`, { reload: true });
}));
router.post('/posts/:id(\\d+)/:action(trash|restore)', auth.can('posts'), wrap(async (req, res) => {
  if (req.params.action === 'trash') await db.query("UPDATE posts SET status = 'trash', deleted_at = NOW() WHERE id = ?", [req.params.id]);
  else await db.query("UPDATE posts SET status = 'draft', deleted_at = NULL WHERE id = ?", [req.params.id]);
  cache.clear();
  ok(res, req.params.action === 'trash' ? 'ট্র্যাশে পাঠানো হয়েছে' : 'রিস্টোর হয়েছে', { redirect: `${A()}/posts${req.params.action === 'trash' ? '?status=trash' : `/${req.params.id}`}` });
}));
router.post('/posts/fix-slugs', auth.can('posts'), wrap(async (req, res) => {
  const rows = await db.query('SELECT id, title, slug FROM posts');
  let fixed = 0;
  for (const r of rows) {
    let current = r.slug;
    try { current = decodeURIComponent(r.slug); } catch (_) { /* keep */ }
    if (!isBrokenSlug(r.slug) && current === r.slug) continue;
    const candidate = !isBrokenSlug(slugify(current)) && slugify(current) ? slugify(current) : slugify(r.title);
    const slug = await uniqueSlug(candidate, r.id);
    if (slug === r.slug) continue;
    await db.query('INSERT INTO slug_redirects (old_slug, post_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE post_id = VALUES(post_id)', [String(r.slug).slice(0, 191), r.id]);
    await db.update('posts', { slug }, 'id = ?', [r.id]);
    fixed++;
  }
  cache.clear();
  ok(res, fixed ? `${bnNum(fixed)} টি স্লাগ ঠিক করা হয়েছে (পুরোনো লিংক রিডাইরেক্ট হবে)` : 'কোনো ভাঙা স্লাগ পাওয়া যায়নি ✓');
}));
router.post('/cache/clear', wrap(async (req, res) => { cache.clear(); await settings.load(); ok(res, 'ক্যাশ পরিষ্কার হয়েছে ✓'); }));

/* ---------- categories ---------- */
router.get('/categories', auth.can('categories'), wrap(async (req, res) => {
  const cats = await db.query("SELECT c.*, (SELECT COUNT(*) FROM posts p WHERE p.category_id = c.id AND p.status <> 'trash') AS n FROM categories c ORDER BY c.sort, c.id");
  await render(req, res, { title: 'ক্যাটাগরি ম্যানেজমেন্ট', nav: 'categories', body: V.categories({ cats }) });
}));
router.post('/categories/:id(new|\\d+)', auth.can('categories'), wrap(async (req, res) => {
  const b = req.body;
  const name = strip(b.name).slice(0, 120);
  if (!name) return fail(res, 'নাম দিন');
  const id = req.params.id === 'new' ? 0 : Number(req.params.id);
  let slug = slugify(b.slug || name) || `cat-${Date.now().toString(36)}`;
  if (await db.one('SELECT id FROM categories WHERE slug = ? AND id <> ?', [slug, id])) slug = `${slug}-${bnNum(Date.now() % 1000)}`;
  const row = {
    name, slug, icon: /^[a-zA-Z]+$/.test(b.icon || '') ? b.icon : 'briefcase', color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#16a34a',
    description: strip(b.description).slice(0, 500), meta_title: strip(b.meta_title).slice(0, 250), meta_desc: strip(b.meta_desc).slice(0, 500),
    sort: int(b.sort), active: flag(b.active),
  };
  if (id) await db.update('categories', row, 'id = ?', [id]); else await db.insert('categories', row);
  cache.clear();
  ok(res, 'ক্যাটাগরি সেভ হয়েছে ✓', { reload: true });
}));
router.post('/categories/:id(\\d+)/toggle', auth.can('categories'), wrap(async (req, res) => {
  await db.query('UPDATE categories SET active = 1 - active WHERE id = ?', [req.params.id]);
  cache.clear(); ok(res, 'আপডেট হয়েছে');
}));
router.post('/categories/:id(\\d+)/delete', auth.can('categories'), wrap(async (req, res) => {
  await db.query('UPDATE posts SET category_id = NULL WHERE category_id = ?', [req.params.id]);
  await db.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
  cache.clear(); ok(res, 'ক্যাটাগরি মুছে ফেলা হয়েছে', { reload: true });
}));

/* ---------- banners ---------- */
router.get('/banners', auth.can('banners'), wrap(async (req, res) => {
  await render(req, res, { title: 'ব্যানার ম্যানেজমেন্ট', nav: 'banners', body: V.banners({ rows: await db.query('SELECT * FROM banners ORDER BY sort, id') }) });
}));
router.post('/banners/:id(new|\\d+)', auth.can('banners'), wrap(async (req, res) => {
  const b = req.body;
  const isNew = req.params.id === 'new';
  const row = { title: strip(b.title).slice(0, 250), link: safeUrl(b.link).slice(0, 500) };
  if (!isNew) { row.sort = int(b.sort); row.active = flag(b.active); }
  const img = file(req, 'image');
  if (isNew && !img) return fail(res, 'ব্যানারের ছবি দিন');
  if (isNew && Number(await db.val('SELECT COUNT(*) FROM banners')) >= 10) return fail(res, 'সর্বোচ্চ ১০টি ব্যানার রাখা যাবে');
  try { if (img) row.image = await uploads.saveImage(img.buffer, 'banner'); } catch (e) { return fail(res, e.message); }
  if (isNew) { row.sort = Number(await db.val('SELECT COALESCE(MAX(sort),0)+1 FROM banners')); await db.insert('banners', row); } else {
    if (row.image) { const old = await db.one('SELECT image FROM banners WHERE id = ?', [req.params.id]); if (old) uploads.removeFile(old.image); }
    await db.update('banners', row, 'id = ?', [req.params.id]);
  }
  cache.clear(); ok(res, 'ব্যানার সেভ হয়েছে ✓', { reload: true });
}));
router.post('/banners/:id(\\d+)/delete', auth.can('banners'), wrap(async (req, res) => {
  const old = await db.one('SELECT image FROM banners WHERE id = ?', [req.params.id]);
  await db.query('DELETE FROM banners WHERE id = ?', [req.params.id]);
  if (old) uploads.removeFile(old.image);
  cache.clear(); ok(res, 'ব্যানার মুছে ফেলা হয়েছে', { reload: true });
}));

/* ---------- ads ---------- */
router.get('/ads', auth.can('ads'), wrap(async (req, res) => {
  await render(req, res, { title: 'বিজ্ঞাপন', nav: 'ads', body: V.ads({ rows: await db.query('SELECT * FROM ads ORDER BY slot, sort, id') }) });
}));
router.post('/ads/:id(new|\\d+)', auth.can('ads'), wrap(async (req, res) => {
  const b = req.body;
  const row = {
    slot: Object.keys(V.AD_SLOTS).includes(b.slot) ? b.slot : 'home_top', type: b.type === 'html' ? 'html' : 'image',
    title: strip(b.title).slice(0, 250), link: safeUrl(b.link).slice(0, 500), html: String(b.html || '').slice(0, 20000), sort: int(b.sort), active: flag(b.active),
  };
  const img = file(req, 'image');
  try { if (img) row.image = await uploads.saveImage(img.buffer, 'ad'); } catch (e) { return fail(res, e.message); }
  if (flag(b.remove_image)) row.image = null;
  if (req.params.id === 'new') await db.insert('ads', row); else await db.update('ads', row, 'id = ?', [req.params.id]);
  cache.clear(); ok(res, 'বিজ্ঞাপন সেভ হয়েছে ✓', { reload: true });
}));
router.post('/ads/:id(\\d+)/toggle', auth.can('ads'), wrap(async (req, res) => { await db.query('UPDATE ads SET active = 1 - active WHERE id = ?', [req.params.id]); cache.clear(); ok(res, 'আপডেট হয়েছে'); }));
router.post('/ads/:id(\\d+)/delete', auth.can('ads'), wrap(async (req, res) => { await db.query('DELETE FROM ads WHERE id = ?', [req.params.id]); cache.clear(); ok(res, 'মুছে ফেলা হয়েছে', { reload: true }); }));

/* ---------- notices ---------- */
router.get('/notices', auth.can('notices'), wrap(async (req, res) => {
  await render(req, res, { title: 'নোটিশ ম্যানেজমেন্ট', nav: 'notices', body: V.notices({ rows: await db.query('SELECT * FROM notices ORDER BY pinned DESC, created_at DESC LIMIT 300') }) });
}));
router.post('/notices/:id(new|\\d+)', auth.can('notices'), wrap(async (req, res) => {
  const b = req.body;
  const title = strip(b.title).slice(0, 500);
  if (!title) return fail(res, 'শিরোনাম দিন');
  const row = { title, body: clean(b.body), link: safeUrl(b.link).slice(0, 500), expires_at: parseDate(b.expires_at), pinned: flag(b.pinned), active: flag(b.active) };
  if (req.params.id === 'new') await db.insert('notices', row); else await db.update('notices', row, 'id = ?', [req.params.id]);
  cache.clear(); ok(res, 'নোটিশ সেভ হয়েছে ✓', { reload: true });
}));
router.post('/notices/:id(\\d+)/delete', auth.can('notices'), wrap(async (req, res) => { await db.query('DELETE FROM notices WHERE id = ?', [req.params.id]); cache.clear(); ok(res, 'মুছে ফেলা হয়েছে', { reload: true }); }));

/* ---------- reports ---------- */
router.get('/reports', auth.can('reports'), wrap(async (req, res) => {
  const status = ['all', 'new', 'done'].includes(req.query.status) ? req.query.status : 'all';
  const rows = await db.query(`SELECT r.*, p.title AS post_title FROM reports r LEFT JOIN posts p ON p.id = r.post_id ${status === 'all' ? '' : 'WHERE r.status = ?'} ORDER BY r.id DESC LIMIT 200`, status === 'all' ? [] : [status]);
  const c = await db.one("SELECT COUNT(*) AS `all`, SUM(status = 'new') AS `new`, SUM(status = 'done') AS done FROM reports");
  await render(req, res, { title: 'রিপোর্ট', nav: 'reports', body: V.reports({ rows, status, counts: { all: Number(c.all), new: Number(c.new || 0), done: Number(c.done || 0) } }) });
}));
router.post('/reports/:id(\\d+)/done', auth.can('reports'), wrap(async (req, res) => { await db.query("UPDATE reports SET status = 'done' WHERE id = ?", [req.params.id]); cache.clear(); ok(res, 'সমাধান হিসেবে চিহ্নিত', { reload: true }); }));
router.post('/reports/:id(\\d+)/delete', auth.can('reports'), wrap(async (req, res) => { await db.query('DELETE FROM reports WHERE id = ?', [req.params.id]); cache.clear(); ok(res, 'মুছে ফেলা হয়েছে', { reload: true }); }));
router.post('/reports/clear', auth.can('reports'), wrap(async (req, res) => { await db.query('DELETE FROM reports'); cache.clear(); ok(res, 'সব রিপোর্ট মুছে ফেলা হয়েছে', { reload: true }); }));

/* ---------- automation ---------- */
router.get('/automation', auth.can('automation'), wrap(async (req, res) => {
  const lastRun = await db.one('SELECT * FROM automation_runs ORDER BY id DESC LIMIT 1');
  const logs = (await db.query('SELECT * FROM automation_logs ORDER BY id DESC LIMIT 60')).reverse();
  const items = await db.query('SELECT * FROM automation_items ORDER BY updated_at DESC LIMIT 30');
  const today = await db.one('SELECT COALESCE(SUM(ai_calls),0) AS ai, COALESCE(SUM(drafts),0) AS drafts, COALESCE(SUM(cost),0) AS cost FROM automation_runs WHERE started_at >= CURDATE()');
  const month = await db.one("SELECT COALESCE(SUM(cost),0) AS cost FROM automation_runs WHERE started_at >= DATE_FORMAT(NOW(), '%Y-%m-01')");
  const cats = await db.query('SELECT id, name FROM categories ORDER BY sort');
  const base = require('../views/site/layout').origin(req);
  await render(req, res, {
    title: 'অটোমেশন', nav: 'automation',
    body: V.automation({ lastRun, logs, items, today, month, cats, locked: await automation.isLocked(), cronUrl: `${base}/cron/run?key=${settings.get('cron_key')}` }),
  });
}));
router.get('/automation/poll', auth.can('automation'), wrap(async (req, res) => {
  const since = int(req.query.since);
  const logs = await db.query('SELECT * FROM automation_logs WHERE id > ? ORDER BY id LIMIT 200', [since]);
  const run = await db.one('SELECT id, status, step, found, fresh, skipped, drafts, ai_calls FROM automation_runs ORDER BY id DESC LIMIT 1');
  res.setHeader('Cache-Control', 'no-store');
  res.json({ logs: logs.map((l) => ({ id: l.id, html: String(V.logLine(l)) })), run, locked: await automation.isLocked() });
}));
router.post('/automation/toggle', auth.can('automation'), wrap(async (req, res) => {
  const on = flag(req.body.auto_enabled);
  await settings.set({ auto_enabled: on ? '1' : '0' });
  ok(res, on ? 'অটোমেশন চালু হয়েছে' : 'অটোমেশন বন্ধ হয়েছে', { reload: true });
}));
router.post('/automation/run', auth.can('automation'), wrap(async (req, res) => {
  const started = await automation.start('manual');
  if (!started.ok) return fail(res, started.error);
  ok(res, 'অটোমেশন শুরু হয়েছে — লাইভ লগ দেখুন', { poll: true });
}));
router.post('/automation/unlock', auth.can('automation'), wrap(async (req, res) => { await automation.unlock(); ok(res, 'লক মুক্ত করা হয়েছে', { reload: true }); }));
router.post('/automation/settings', auth.can('automation'), wrap(async (req, res) => {
  const b = req.body;
  const vals = {
    openai_model: strip(b.openai_model).slice(0, 80) || 'gpt-4o-mini',
    openai_base: safeUrl(b.openai_base).replace(/\/+$/, '') || 'https://api.openai.com/v1',
    auto_sources: String(b.auto_sources || '').split(/\s+/).map((u) => safeUrl(u).replace(/\/+$/, '')).filter(Boolean).slice(0, 20).join('\n'),
    auto_start_date: /^\d{4}-\d{2}-\d{2}$/.test(b.auto_start_date || '') ? b.auto_start_date : '',
    auto_batch: String(Math.min(50, Math.max(1, int(b.auto_batch, 6)))),
    auto_daily_limit: String(Math.min(1000, Math.max(0, int(b.auto_daily_limit, 40)))),
    auto_parallel: String(Math.min(3, Math.max(1, int(b.auto_parallel, 2)))),
    auto_interval_min: String(Math.min(1440, Math.max(10, int(b.auto_interval_min, 60)))),
    auto_price_in: String(parseFloat(b.auto_price_in) || 0), auto_price_out: String(parseFloat(b.auto_price_out) || 0),
    auto_notify_email: strip(b.auto_notify_email).slice(0, 190), auto_default_category: String(int(b.auto_default_category) || ''),
    auto_prompt_extra: strip(b.auto_prompt_extra).slice(0, 1000),
  };
  const key = String(b.openai_key || '').trim();
  if (key && !key.startsWith('••')) vals.openai_key = key;
  await settings.set(vals);
  if (b._test) {
    const r = await automation.testKey();
    return r.ok ? ok(res, `সেভ হয়েছে ✓ — API কী সঠিক (${r.model})`) : fail(res, `সেভ হয়েছে, কিন্তু কী যাচাই ব্যর্থ: ${r.error}`);
  }
  ok(res, 'অটোমেশন সেটিংস সেভ হয়েছে ✓');
}));

/* ---------- analytics ---------- */
router.get('/analytics', auth.can('analytics'), wrap(async (req, res) => {
  const days = [7, 30, 90].includes(int(req.query.days)) ? int(req.query.days) : 7;
  const rows = await db.query(`SELECT day, visits, uniques, pageviews FROM stats_daily WHERE day >= DATE_SUB(CURDATE(), INTERVAL ${days - 1} DAY) ORDER BY day`);
  const prevRows = await db.query(`SELECT COALESCE(SUM(visits),0) AS visits, COALESCE(SUM(uniques),0) AS uniques, COALESCE(SUM(pageviews),0) AS pageviews FROM stats_daily WHERE day >= DATE_SUB(CURDATE(), INTERVAL ${days * 2 - 1} DAY) AND day < DATE_SUB(CURDATE(), INTERVAL ${days - 1} DAY)`);
  const sum = rows.reduce((a, r) => ({ visits: a.visits + Number(r.visits), uniques: a.uniques + Number(r.uniques), pageviews: a.pageviews + Number(r.pageviews) }), { visits: 0, uniques: 0, pageviews: 0 });
  const uniqueDevices = Number(await db.val(`SELECT COUNT(DISTINCT device) FROM stats_devices WHERE day >= DATE_SUB(CURDATE(), INTERVAL ${days - 1} DAY)`));
  if (uniqueDevices) sum.uniques = uniqueDevices;
  const geo = await db.query(`SELECT country, SUM(visits) AS v FROM stats_geo WHERE day >= DATE_SUB(CURDATE(), INTERVAL ${days - 1} DAY) GROUP BY country ORDER BY v DESC LIMIT 8`);
  const pages = await db.query(`SELECT path, SUM(views) AS v FROM stats_pages WHERE day >= DATE_SUB(CURDATE(), INTERVAL ${days - 1} DAY) GROUP BY path ORDER BY v DESC LIMIT 12`);
  const posts = await db.query("SELECT id, title, views FROM posts WHERE status = 'published' ORDER BY views DESC LIMIT 10");
  const searches = await db.query('SELECT q, hits FROM search_log ORDER BY hits DESC LIMIT 20');
  const series = fillDays(rows, days, 'visits');
  const p = prevRows[0] || {};
  await render(req, res, {
    title: 'অ্যানালিটিক্স', nav: 'analytics',
    body: V.analytics({ days, sum, prev: { visits: Number(p.visits), uniques: Number(p.uniques), pageviews: Number(p.pageviews) }, series, geo, pages, posts, searches }),
  });
}));

/* ---------- pages & team ---------- */
router.get('/pages', auth.can('pages'), wrap(async (req, res) => {
  const [pages, team] = await Promise.all([db.query('SELECT * FROM pages ORDER BY sort, id'), db.query('SELECT * FROM team ORDER BY sort, id')]);
  await render(req, res, { title: 'পেজ ও টিম', nav: 'pages', body: V.pagesTeam({ pages, team }) });
}));
router.post('/pages/:id(new|\\d+)', auth.can('pages'), wrap(async (req, res) => {
  const b = req.body;
  const title = strip(b.title).slice(0, 250);
  if (!title) return fail(res, 'শিরোনাম দিন');
  const id = req.params.id === 'new' ? 0 : Number(req.params.id);
  let slug = slugify(b.slug || title);
  if (await db.one('SELECT id FROM pages WHERE slug = ? AND id <> ?', [slug, id])) slug = `${slug}-${Date.now() % 1000}`;
  const row = { title, slug, content: clean(b.content), sort: int(b.sort), in_footer: flag(b.in_footer), active: flag(b.active), updated_at: new Date() };
  if (id) await db.update('pages', row, 'id = ?', [id]); else await db.insert('pages', row);
  cache.clear(); ok(res, 'পেজ সেভ হয়েছে ✓', { reload: true });
}));
router.post('/pages/:id(\\d+)/delete', auth.can('pages'), wrap(async (req, res) => { await db.query('DELETE FROM pages WHERE id = ?', [req.params.id]); cache.clear(); ok(res, 'মুছে ফেলা হয়েছে', { reload: true }); }));
router.post('/team/:id(new|\\d+)', auth.can('pages'), wrap(async (req, res) => {
  const b = req.body;
  const name = strip(b.name).slice(0, 120);
  if (!name) return fail(res, 'নাম দিন');
  const row = { name, role: strip(b.role).slice(0, 120), bio: strip(b.bio).slice(0, 500), link: safeUrl(b.link).slice(0, 500), sort: int(b.sort), active: flag(b.active) };
  const img = file(req, 'photo');
  try { if (img) row.photo = await uploads.saveImage(img.buffer, 'avatar'); } catch (e) { return fail(res, e.message); }
  if (flag(b.remove_photo)) row.photo = null;
  if (req.params.id === 'new') await db.insert('team', row); else await db.update('team', row, 'id = ?', [req.params.id]);
  cache.clear(); ok(res, 'সদস্য সেভ হয়েছে ✓', { reload: true });
}));
router.post('/team/:id(\\d+)/delete', auth.can('pages'), wrap(async (req, res) => { await db.query('DELETE FROM team WHERE id = ?', [req.params.id]); cache.clear(); ok(res, 'মুছে ফেলা হয়েছে', { reload: true }); }));

/* ---------- subscribers ---------- */
router.get('/subscribers', auth.can('subscribers'), wrap(async (req, res) => {
  const [pushN, conf, pend, emails] = await Promise.all([
    db.val('SELECT COUNT(*) FROM push_subs'), db.val('SELECT COUNT(*) FROM email_subs WHERE confirmed = 1'), db.val('SELECT COUNT(*) FROM email_subs WHERE confirmed = 0'),
    db.query('SELECT id, email, confirmed, created_at FROM email_subs ORDER BY id DESC LIMIT 300'),
  ]);
  await render(req, res, { title: 'সাবস্ক্রাইবার', nav: 'subscribers', body: V.subscribers({ push: Number(pushN), emailConfirmed: Number(conf), emailPending: Number(pend), emails }) });
}));
router.post('/subscribers/push', auth.can('subscribers'), wrap(async (req, res) => {
  const title = strip(req.body.title).slice(0, 120);
  if (!title) return fail(res, 'শিরোনাম দিন');
  const r = await push.broadcast({ title, body: strip(req.body.body).slice(0, 240), url: safeUrl(req.body.url) || '/' });
  ok(res, `${bnCount(r.sent)} জনকে নোটিফিকেশন পাঠানো হয়েছে`);
}));
router.post('/subscribers/digest', auth.can('subscribers'), wrap(async (req, res) => {
  const r = await notify.sendDigest(true);
  r.ok ? ok(res, r.message) : fail(res, r.message);
}));
router.post('/subscribers/email/:id(\\d+)/delete', auth.can('subscribers'), wrap(async (req, res) => { await db.query('DELETE FROM email_subs WHERE id = ?', [req.params.id]); ok(res, 'মুছে ফেলা হয়েছে', { reload: true }); }));

/* ---------- users ---------- */
router.get('/users', auth.can('users'), wrap(async (req, res) => {
  const rows = (await db.query('SELECT id, username, email, name, role, permissions, avatar, active, last_login FROM users ORDER BY id')).map((u) => {
    let permsArr = []; try { permsArr = JSON.parse(u.permissions || '[]'); } catch (_) { /* */ }
    return { ...u, permsArr };
  });
  await render(req, res, { title: 'ইউজার ম্যানেজমেন্ট', nav: 'users', body: V.users({ rows, me: req.admin.id }) });
}));
router.post('/users/:id(new|\\d+)', auth.can('users'), wrap(async (req, res) => {
  const b = req.body;
  const id = req.params.id === 'new' ? 0 : Number(req.params.id);
  const username = String(b.username || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[A-Za-z0-9_.-]{3,64}$/.test(username)) return fail(res, 'ইউজারনেম শুধু ইংরেজি অক্ষর/সংখ্যা (৩-৬৪)');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 'সঠিক ইমেইল দিন');
  if (await db.one('SELECT id FROM users WHERE (username = ? OR email = ?) AND id <> ?', [username, email, id])) return fail(res, 'এই ইউজারনেম/ইমেইল আগে থেকেই আছে');
  const role = Object.keys(auth.ROLES).includes(b.role) ? b.role : 'moderator';
  let perms = b.perms || []; if (!Array.isArray(perms)) perms = [perms];
  perms = perms.filter((p) => auth.PERMISSIONS[p] && p !== 'users');
  const row = { username, email, name: strip(b.name).slice(0, 120), role, permissions: JSON.stringify(perms), active: id === req.admin.id ? 1 : flag(b.active) };
  if (id === req.admin.id && role !== req.admin.role) return fail(res, 'নিজের ভূমিকা পরিবর্তন করা যাবে না');
  if (b.password) { if (String(b.password).length < 8) return fail(res, 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষর'); row.password_hash = await hashPassword(b.password); } else if (!id) return fail(res, 'পাসওয়ার্ড দিন');
  if (id) { await db.update('users', row, 'id = ?', [id]); auth.forgetUser(id); } else await db.insert('users', row);
  ok(res, 'ইউজার সেভ হয়েছে ✓', { reload: true });
}));
router.post('/users/:id(\\d+)/toggle', auth.can('users'), wrap(async (req, res) => {
  if (Number(req.params.id) === req.admin.id) return fail(res, 'নিজেকে নিষ্ক্রিয় করা যাবে না');
  await db.query('UPDATE users SET active = 1 - active WHERE id = ?', [req.params.id]);
  await db.query('DELETE FROM sessions WHERE user_id = ?', [req.params.id]);
  auth.forgetUser(Number(req.params.id)); ok(res, 'আপডেট হয়েছে');
}));
router.post('/users/:id(\\d+)/delete', auth.can('users'), wrap(async (req, res) => {
  if (Number(req.params.id) === req.admin.id) return fail(res, 'নিজেকে মুছে ফেলা যাবে না');
  const admins = Number(await db.val("SELECT COUNT(*) FROM users WHERE role = 'admin' AND id <> ?", [req.params.id]));
  const target = await db.one('SELECT role FROM users WHERE id = ?', [req.params.id]);
  if (target && target.role === 'admin' && !admins) return fail(res, 'শেষ এডমিনকে মুছে ফেলা যাবে না');
  await db.query('DELETE FROM sessions WHERE user_id = ?', [req.params.id]);
  await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
  auth.forgetUser(Number(req.params.id)); ok(res, 'ইউজার মুছে ফেলা হয়েছে', { reload: true });
}));

/* ---------- profile ---------- */
router.get('/profile', wrap(async (req, res) => {
  await render(req, res, { title: 'প্রোফাইল', nav: 'profile', body: V.profile({ user: req.admin }) });
}));
router.post('/profile', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 'সঠিক ইমেইল দিন');
  if (await db.one('SELECT id FROM users WHERE email = ? AND id <> ?', [email, req.admin.id])) return fail(res, 'এই ইমেইল অন্য কেউ ব্যবহার করছে');
  const row = { name: strip(req.body.name).slice(0, 120), email };
  const img = file(req, 'avatar');
  try { if (img) row.avatar = await uploads.saveImage(img.buffer, 'avatar'); } catch (e) { return fail(res, e.message); }
  if (flag(req.body.remove_avatar)) row.avatar = null;
  await db.update('users', row, 'id = ?', [req.admin.id]);
  auth.forgetUser(req.admin.id); ok(res, 'প্রোফাইল আপডেট হয়েছে ✓', { reload: true });
}));
router.post('/profile/password', wrap(async (req, res) => {
  const b = req.body;
  const u = await db.one('SELECT password_hash FROM users WHERE id = ?', [req.admin.id]);
  if (!await verifyPassword(b.current, u.password_hash)) return fail(res, 'বর্তমান পাসওয়ার্ড ভুল');
  if (String(b.password || '').length < 8) return fail(res, 'নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষর');
  if (b.password !== b.confirm) return fail(res, 'নতুন পাসওয়ার্ড দুটি মেলেনি');
  await db.update('users', { password_hash: await hashPassword(b.password) }, 'id = ?', [req.admin.id]);
  await db.query('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [req.admin.id, req.admin.sid]);
  ok(res, 'পাসওয়ার্ড পরিবর্তন হয়েছে ✓ (অন্য ডিভাইস থেকে লগআউট করা হয়েছে)');
}));
router.post('/profile/logout-all', wrap(async (req, res) => {
  await db.query('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [req.admin.id, req.admin.sid]);
  auth.forgetUser(req.admin.id); ok(res, 'অন্য সব ডিভাইস থেকে লগআউট হয়েছে');
}));

/* ---------- notifications ---------- */
router.get('/notifications', wrap(async (req, res) => {
  const type = ['all', 'automation', 'report', 'system'].includes(req.query.type) ? req.query.type : 'all';
  const rows = await db.query(`SELECT * FROM admin_notifications ${type === 'all' ? '' : 'WHERE type = ?'} ORDER BY id DESC LIMIT 100`, type === 'all' ? [] : [type]);
  await render(req, res, { title: 'নোটিফিকেশন', nav: 'notifications', body: V.notifications({ rows, type }) });
}));
router.post('/notifications/read', wrap(async (req, res) => { await db.query('UPDATE admin_notifications SET is_read = 1'); ok(res, 'সব পড়া হয়েছে', { reload: true }); }));

/* ---------- settings ---------- */
router.get('/settings', auth.can('settings'), wrap(async (req, res) => {
  await render(req, res, {
    title: 'সেটিংস', nav: 'settings',
    body: V.settingsPage({ me: req.admin, dataDir: path.dirname(config.uploadsDir()), uploadsDir: config.uploadsDir(), schema: migrate.latest, version: require('../../package.json').version }),
  });
}));
const TEXT_KEYS = ['site_name', 'app_name', 'tagline', 'site_domain', 'contact_email', 'footer_about', 'copyright', 'footer_slogan', 'hero_title', 'hero_subtitle',
  'per_page', 'notice_limit', 'promo_gap', 'related_count', 'trash_days', 'report_limit_per_hour', 'push_prompt_delay', 'digest_hour',
  'meta_title', 'meta_desc', 'meta_keywords', 'google_verification', 'bing_verification',
  'social_facebook', 'social_youtube', 'social_x', 'social_telegram', 'social_whatsapp', 'social_linkedin',
  'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'mail_from', 'mail_from_name', 'maintenance_title', 'maintenance_text', 'theme_color'];
const FLAG_KEYS = ['push_enabled', 'digest_enabled', 'reminder_enabled', 'install_screenshots', 'maintenance', 'analytics_enabled', 'geo_lookup'];
const NUM_RANGES = { per_page: [4, 60], notice_limit: [5, 500], promo_gap: [2, 30], related_count: [0, 24], trash_days: [1, 365], report_limit_per_hour: [1, 100], push_prompt_delay: [0, 600], digest_hour: [0, 23], smtp_port: [1, 65535] };

router.post('/settings', auth.can('settings'), wrap(async (req, res) => {
  const b = req.body;
  if (b._testmail) {
    try { await mailer.send({ to: b._test_to || req.admin.email, subject: 'পরীক্ষামূলক মেইল', html: '<p>অভিনন্দন! আপনার SMTP সেটিংস সঠিকভাবে কাজ করছে। ✓</p>' }); return ok(res, 'পরীক্ষামূলক মেইল পাঠানো হয়েছে ✓ (আগে সেভ করা সেটিংস দিয়ে)'); } catch (e) { return fail(res, e.message); }
  }
  const vals = {};
  for (const k of TEXT_KEYS) if (b[k] !== undefined) vals[k] = String(b[k]).trim().slice(0, 5000);
  for (const [k, [min, max]] of Object.entries(NUM_RANGES)) if (vals[k] !== undefined) vals[k] = String(Math.min(max, Math.max(min, int(vals[k], min))));
  for (const k of FLAG_KEYS) if (b[k] !== undefined) vals[k] = flag(b[k]) ? '1' : '0';
  if (b.head_code !== undefined) vals.head_code = String(b.head_code).slice(0, 20000);
  if (b.smtp_pass && !String(b.smtp_pass).startsWith('••')) vals.smtp_pass = b.smtp_pass;
  if (vals.theme_color && !/^#[0-9a-f]{6}$/i.test(vals.theme_color)) delete vals.theme_color;
  for (const k of ['social_facebook', 'social_youtube', 'social_x', 'social_telegram', 'social_whatsapp', 'social_linkedin']) if (vals[k] !== undefined) vals[k] = safeUrl(vals[k]);
  let newPath = null;
  if (b.admin_path !== undefined) {
    const p = String(b.admin_path).replace(/[^A-Za-z0-9_-]/g, '');
    if (p.length < 3) return fail(res, 'এডমিন পথ কমপক্ষে ৩ অক্ষরের হতে হবে');
    if (['api', 'post', 'category', 'page', 'uploads', 'search', 'install', 'cron', 'css', 'js', 'img', 'icons'].includes(p.toLowerCase())) return fail(res, 'এই নামটি ব্যবহার করা যাবে না');
    if (p !== settings.get('admin_path')) { vals.admin_path = p; newPath = `/${p}/settings`; }
  }
  try {
    for (const [name, kind] of [['logo', 'logo'], ['favicon', 'favicon'], ['og_image', 'thumb']]) {
      const f = file(req, name);
      if (f) {
        vals[name] = await uploads.saveImage(f.buffer, kind);
        if (name === 'logo') await rebuildIcons(f.buffer);
      } else if (flag(b[`remove_${name}`])) vals[name] = '';
    }
  } catch (e) { return fail(res, e.message); }
  await settings.set(vals);
  ok(res, 'সেটিংস সেভ হয়েছে ✓ সাইটে সাথে সাথে পরিবর্তন দেখা যাবে', newPath ? { redirect: newPath } : {});
}));

async function rebuildIcons(buf) {
  try {
    await uploads.makeIcons(buf, require('../assets').customIconsDir(), '#ffffff');
    require('../assets').reset();
  } catch (e) { console.error('[icons]', e.message); }
}

module.exports = router;
