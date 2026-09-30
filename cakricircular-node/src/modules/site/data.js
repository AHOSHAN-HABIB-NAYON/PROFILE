/* ─────────────────────────────────────────────
   সাইটের ডেটা কোয়েরি — সব পাবলিক পেজ এখান থেকে ডেটা নেয়
   ───────────────────────────────────────────── */
import { all, one, col, run } from '../../db.js';
import { memo } from '../../core/cache.js';
import { setting, settingInt } from '../../core/settings.js';

export const ACTIVE = 'p.status = 1 AND p.deleted_at IS NULL';
const PREM_ON = "(p.is_premium = 1 AND (p.premium_until IS NULL OR p.premium_until >= CURDATE()))";
export const NOT_PREMIUM = ` AND NOT ${PREM_ON}`;
const POST_COLS = `p.id, p.cat_id, p.title, p.slug, p.thumb, p.division, p.district, p.vacancy, p.company, p.deadline,
  p.published_at, p.updated_at, p.is_premium, p.premium_until, p.is_job, p.salary, p.employment_type, p.views,
  c.name AS cat_name, c.slug AS cat_slug, c.icon AS cat_icon`;

export const categories = () => memo('cats', 60_000, () =>
  all('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'));
export async function categoryBySlug(slug) {
  const c = (await categories()).find((x) => x.slug === slug);
  return c || one('SELECT * FROM categories WHERE slug = ? LIMIT 1', [slug]);
}
export function perPage() {
  const n = settingInt('per_page', 20);
  return [10, 20, 30, 50, 70, 100].includes(n) ? n : 20;
}
export const isPremium = (p) => Boolean(p.is_premium) && (!p.premium_until || p.premium_until >= new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10));

/* ─── তালিকা ─── */
export async function listPosts({ where = '', args = [], order = 'p.published_at DESC, p.id DESC', limit, offset = 0, extraSelect = '', join = '' }) {
  return all(`SELECT ${POST_COLS}${extraSelect} FROM posts p LEFT JOIN categories c ON c.id = p.cat_id ${join}
              WHERE ${ACTIVE}${where ? ` AND ${where}` : ''} ORDER BY ${order} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`, args);
}
export const countPosts = (where = '', args = []) =>
  col(`SELECT COUNT(*) FROM posts p LEFT JOIN categories c ON c.id = p.cat_id WHERE ${ACTIVE}${where ? ` AND ${where}` : ''}`, args, 0);

/* প্রিমিয়াম পোস্টের তালিকা */
export const activeAds = () => memo('ads', 30_000, () =>
  all(`SELECT ${POST_COLS} FROM posts p LEFT JOIN categories c ON c.id = p.cat_id
       WHERE ${ACTIVE} AND ${PREM_ON} ORDER BY p.published_at DESC, p.id DESC LIMIT 30`));

/* প্রতি কয়েকটি সাধারণ পোস্টের পর একটি বিজ্ঞাপন গুঁজে দেয় (পেজ বদলালে অন্য বিজ্ঞাপন) */
export async function premiumFeed(rows, page = 1, gap) {
  const g = gap || Math.max(2, settingInt('promo_gap', 5));
  if (rows.length < g) return rows;
  const ads = await activeAds();
  if (!ads.length) return rows;
  const slots = Math.min(Math.floor(rows.length / g), ads.length);
  if (slots < 1) return rows;
  const start = ((page - 1) * slots) % ads.length;
  const pick = Array.from({ length: slots }, (_, i) => ads[(start + i) % ads.length]);
  const out = []; let n = 0; let k = 0;
  for (const r of rows) {
    out.push(r); n += 1;
    if (n % g === 0 && k < slots) { out.push(pick[k]); k += 1; }
  }
  return out;
}

export const banners = () => memo('banners', 30_000, () =>
  all('SELECT * FROM banners WHERE is_active = 1 ORDER BY sort_order ASC, id ASC LIMIT 10'));

export async function getPostBySlug(slug) {
  return one(`SELECT p.*, c.name AS cat_name, c.slug AS cat_slug, c.icon AS cat_icon FROM posts p
              LEFT JOIN categories c ON c.id = p.cat_id WHERE p.slug = ? AND p.status = 1 AND p.deleted_at IS NULL LIMIT 1`, [slug]);
}
export const slugRedirect = (slug) => one('SELECT p.slug FROM slug_redirects r JOIN posts p ON p.id = r.post_id WHERE r.old_slug = ? LIMIT 1', [slug]);
export const postImages = (id) => all('SELECT * FROM post_images WHERE post_id = ? ORDER BY sort_order ASC, id ASC LIMIT 5', [id]);
export const postLinks = (id) => all('SELECT * FROM post_links WHERE post_id = ? ORDER BY sort_order ASC, id ASC', [id]);
export const relatedPosts = (p) => listPosts({ where: 'p.cat_id = ? AND p.id <> ?', args: [p.cat_id, p.id], limit: 6 });

export const trendingTop = (n = 5) => memo(`trend${n}`, 120_000, () =>
  all(`SELECT p.id, p.title, p.slug, p.published_at, c.name AS cat_name FROM posts p
       LEFT JOIN categories c ON c.id = p.cat_id
       LEFT JOIN (SELECT post_id, COUNT(*) AS hot FROM post_views WHERE day >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) GROUP BY post_id) v ON v.post_id = p.id
       WHERE ${ACTIVE} ORDER BY COALESCE(v.hot,0) DESC, p.views DESC, p.published_at DESC LIMIT ${Number(n)}`));

export const latestNotices = (n) => all(`SELECT * FROM notices WHERE is_active = 1 ORDER BY created_at DESC, id DESC LIMIT ${Number(n)}`);
export const noticeLimit = () => { const n = settingInt('notice_limit', 50); return n > 0 ? n : 50; };
export async function pruneNotices() {
  const keep = noticeLimit();
  const ids = await all(`SELECT id FROM notices ORDER BY created_at DESC, id DESC LIMIT ${keep}`);
  if (!ids.length) return;
  await run(`DELETE FROM notices WHERE id NOT IN (${ids.map((r) => Number(r.id)).join(',')})`);
}
export const topSearches = (n = 8) => memo(`topsearch${n}`, 120_000, () => all(`SELECT term FROM searches ORDER BY hits DESC, last_at DESC LIMIT ${Number(n)}`));
export const promoCount = () => memo('promocount', 30_000, () => col(`SELECT COUNT(*) FROM posts p WHERE ${ACTIVE} AND ${PREM_ON}`, [], 0));
export const teamMembers = () => memo('team', 60_000, () => all('SELECT * FROM team_members WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'));

export const DIVISIONS = ['ঢাকা', 'চট্টগ্রাম', 'রাজশাহী', 'খুলনা', 'বরিশাল', 'সিলেট', 'রংপুর', 'ময়মনসিংহ'];
export const JOB_TYPES = { FULL_TIME: 'ফুল টাইম', PART_TIME: 'পার্ট টাইম', CONTRACTOR: 'চুক্তিভিত্তিক', TEMPORARY: 'অস্থায়ী', INTERN: 'ইন্টার্ন', OTHER: 'অন্যান্য' };
export const JOB_CATS = ['chakri', 'job', 'chakri-circular', 'chakrir-khobor'];

export const siteName = () => setting('site_name', 'চাকরি সার্কুলার');
