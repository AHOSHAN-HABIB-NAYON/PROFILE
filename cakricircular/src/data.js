'use strict';
/** Read-side data access for the public site (memoised; cache is cleared on every admin write). */
const db = require('./db');
const cache = require('./cache');
const settings = require('./settings');
const { normalizeText } = require('./util/bn');

const CARD_COLS = `p.id, p.title, p.slug, p.thumbnail, p.organization, p.district, p.division, p.vacancies,
  p.deadline, p.published_at, p.updated_at, p.views, p.job_type,
  (SELECT pi.image FROM post_images pi WHERE pi.post_id = p.id ORDER BY pi.sort, pi.id LIMIT 1) AS gallery_thumb,
  (p.is_premium = 1 AND (p.premium_until IS NULL OR p.premium_until > NOW())) AS premium,
  c.name AS cat_name, c.slug AS cat_slug, c.color AS cat_color, c.icon AS cat_icon`;
const FROM = 'FROM posts p LEFT JOIN categories c ON c.id = p.category_id';
const LIVE = "p.status = 'published' AND p.published_at <= NOW()";

const MIN = 60000;

function categories() {
  return cache.remember('cats', 10 * MIN, async () => db.query(
    `SELECT c.*, (SELECT COUNT(*) FROM posts p WHERE p.category_id = c.id AND ${LIVE}) AS post_count
     FROM categories c WHERE c.active = 1 ORDER BY c.sort, c.id`,
  ));
}
async function categoryBySlug(slug) {
  return (await categories()).find((c) => c.slug === slug) || null;
}

function totalPosts() {
  return cache.remember('total', 5 * MIN, () => db.val(`SELECT COUNT(*) FROM posts p WHERE ${LIVE}`));
}
function todayPosts() {
  return cache.remember('today', 5 * MIN, () => db.val(`SELECT COUNT(*) FROM posts p WHERE ${LIVE} AND p.published_at >= CURDATE()`));
}

async function latest({ page = 1, perPage, categoryId = null } = {}) {
  perPage = perPage || settings.int('per_page', 20);
  const offset = (Math.max(1, page) - 1) * perPage;
  const key = `latest:${categoryId || 0}:${page}:${perPage}`;
  return cache.remember(key, 5 * MIN, async () => {
    const where = categoryId ? `${LIVE} AND p.category_id = ?` : LIVE;
    const params = categoryId ? [categoryId] : [];
    const rows = await db.query(`SELECT ${CARD_COLS} ${FROM} WHERE ${where} ORDER BY p.published_at DESC, p.id DESC LIMIT ${Number(perPage) + 1} OFFSET ${Number(offset)}`, params);
    const total = await db.val(`SELECT COUNT(*) FROM posts p WHERE ${where}`, params);
    return { rows: rows.slice(0, perPage), hasMore: rows.length > perPage, total: Number(total), page, perPage };
  });
}

function premium(limit = 20) {
  return cache.remember(`premium:${limit}`, 5 * MIN, () => db.query(
    `SELECT ${CARD_COLS} ${FROM} WHERE ${LIVE} AND p.is_premium = 1 AND (p.premium_until IS NULL OR p.premium_until > NOW())
     ORDER BY p.published_at DESC LIMIT ${Number(limit)}`,
  ));
}

/** Weave premium posts into a normal list every `promo_gap` items (no duplicates). */
function weavePremium(rows, promos, gap) {
  gap = Math.max(2, gap || settings.int('promo_gap', 5));
  if (!promos.length) return rows;
  const seen = new Set(rows.map((r) => r.id));
  const pool = promos.filter((p) => !seen.has(p.id));
  if (!pool.length) return rows;
  const out = [];
  let pi = 0;
  rows.forEach((r, i) => {
    out.push(r);
    if ((i + 1) % gap === 0 && pi < pool.length) out.push({ ...pool[pi++], promoted: true });
  });
  return out;
}

function trending(limit = 20, days = 7) {
  return cache.remember(`trending:${limit}:${days}`, 10 * MIN, async () => {
    const rows = await db.query(
      `SELECT ${CARD_COLS} ${FROM} WHERE ${LIVE} AND p.published_at >= DATE_SUB(NOW(), INTERVAL ${Number(days)} DAY)
       ORDER BY p.views DESC, p.published_at DESC LIMIT ${Number(limit)}`,
    );
    if (rows.length >= Math.min(limit, 6)) return rows;
    return db.query(`SELECT ${CARD_COLS} ${FROM} WHERE ${LIVE} ORDER BY p.views DESC LIMIT ${Number(limit)}`);
  });
}

async function postBySlug(slug) {
  return cache.remember(`post:${slug}`, 5 * MIN, async () => {
    const post = await db.one(
      `SELECT p.*, (p.is_premium = 1 AND (p.premium_until IS NULL OR p.premium_until > NOW())) AS premium,
        c.name AS cat_name, c.slug AS cat_slug, c.color AS cat_color, c.icon AS cat_icon
       ${FROM} WHERE p.slug = ? AND ${LIVE}`, [slug],
    );
    if (post) {
      const { links, images } = await require('./postextras').forPost(post.id);
      post.links = links;
      post.images = images;
      return { post };
    }
    const redirect = await db.one(
      `SELECT p.slug FROM slug_redirects r JOIN posts p ON p.id = r.post_id WHERE r.old_slug = ? AND ${LIVE}`, [slug],
    );
    return redirect ? { redirect: redirect.slug } : null;
  });
}

function related(post, limit) {
  limit = limit || settings.int('related_count', 6);
  return cache.remember(`related:${post.id}:${limit}`, 10 * MIN, () => db.query(
    `SELECT ${CARD_COLS} ${FROM} WHERE ${LIVE} AND p.id <> ? AND (p.category_id <=> ?)
     ORDER BY p.published_at DESC LIMIT ${Number(limit)}`, [post.id, post.category_id],
  ));
}

async function search({ q = '', categoryId = null, division = '', page = 1 } = {}) {
  const perPage = settings.int('per_page', 20);
  const offset = (Math.max(1, page) - 1) * perPage;
  const where = [LIVE];
  const params = [];
  const terms = normalizeText(q).split(' ').filter((t) => t.length > 0).slice(0, 6);
  for (const t of terms) {
    where.push('(p.title LIKE ? OR p.organization LIKE ? OR p.keywords LIKE ? OR p.district LIKE ?)');
    const like = `%${t.replace(/[%_]/g, '')}%`;
    params.push(like, like, like, like);
  }
  if (categoryId) { where.push('p.category_id = ?'); params.push(categoryId); }
  if (division) { where.push('(p.division = ? OR p.district = ?)'); params.push(division, division); }
  const sql = `SELECT ${CARD_COLS} ${FROM} WHERE ${where.join(' AND ')} ORDER BY p.published_at DESC LIMIT ${perPage + 1} OFFSET ${offset}`;
  const key = `search:${JSON.stringify([terms, categoryId, division, page])}`;
  return cache.remember(key, 2 * MIN, async () => {
    const rows = await db.query(sql, params);
    const total = await db.val(`SELECT COUNT(*) FROM posts p WHERE ${where.join(' AND ')}`, params);
    return { rows: rows.slice(0, perPage), hasMore: rows.length > perPage, total: Number(total), page };
  });
}

function suggestions(q) {
  const t = normalizeText(q);
  if (t.length < 2) return [];
  return cache.remember(`suggest:${t}`, 2 * MIN, () => db.query(
    `SELECT p.title, p.slug FROM posts p WHERE ${LIVE} AND p.title LIKE ? ORDER BY p.published_at DESC LIMIT 8`, [`%${t}%`],
  ));
}

function topSearches(limit = 10) {
  return cache.remember(`topsearch:${limit}`, 10 * MIN, () => db.query(
    `SELECT q, hits FROM search_log WHERE last_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) ORDER BY hits DESC LIMIT ${Number(limit)}`,
  ));
}
async function logSearch(q) {
  q = normalizeText(q).slice(0, 120);
  if (q.length < 2) return;
  await db.query('INSERT INTO search_log (q, hits, last_at) VALUES (?, 1, NOW()) ON DUPLICATE KEY UPDATE hits = hits + 1, last_at = NOW()', [q]);
}

function notices(limit) {
  limit = limit || settings.int('notice_limit', 50);
  return cache.remember(`notices:${limit}`, 5 * MIN, () => db.query(
    `SELECT id, title, body, link, pinned, created_at FROM notices
     WHERE active = 1 AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY pinned DESC, created_at DESC LIMIT ${Number(limit)}`,
  ));
}

function banners() {
  return cache.remember('banners', 10 * MIN, () => db.query('SELECT id, title, image, link FROM banners WHERE active = 1 ORDER BY sort, id LIMIT 10'));
}

function ads() {
  return cache.remember('ads', 10 * MIN, async () => {
    const rows = await db.query('SELECT id, slot, title, type, image, link, html FROM ads WHERE active = 1 ORDER BY sort, id');
    const bySlot = {};
    for (const r of rows) (bySlot[r.slot] = bySlot[r.slot] || []).push(r);
    return bySlot;
  });
}

function pages() {
  return cache.remember('pages', 10 * MIN, () => db.query('SELECT id, slug, title, in_footer FROM pages WHERE active = 1 ORDER BY sort, id'));
}
function page(slug) {
  return cache.remember(`page:${slug}`, 10 * MIN, () => db.one('SELECT * FROM pages WHERE slug = ? AND active = 1', [slug]));
}
function team() {
  return cache.remember('team', 10 * MIN, () => db.query('SELECT * FROM team WHERE active = 1 ORDER BY sort, id'));
}
function postsByIds(ids) {
  ids = (ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 100);
  if (!ids.length) return Promise.resolve([]);
  return db.raw(`SELECT ${CARD_COLS} ${FROM} WHERE ${LIVE} AND p.id IN (?) ORDER BY p.deadline IS NULL, p.deadline`, [ids]);
}

module.exports = {
  categories, categoryBySlug, totalPosts, todayPosts, latest, premium, weavePremium, trending,
  postBySlug, related, search, suggestions, topSearches, logSearch, notices, banners, ads, pages, page, team, postsByIds,
  CARD_COLS, FROM, LIVE,
};
