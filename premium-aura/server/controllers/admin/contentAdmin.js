'use strict';
const sanitizeHtml = require('sanitize-html');
const db = require('../../config/database');
const audit = require('../../models/auditLog');
const notifications = require('../../models/notification');
const fileStorage = require('../../services/fileStorage');
const { CATEGORIES } = require('../newsController');
const v = require('../../utils/validate');
const { E } = require('../../utils/errors');
const { paginate, meta } = require('../../utils/pagination');

const SANITIZE = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'a', 'h2', 'h3', 'h4', 'blockquote', 'code', 'pre', 'img', 'span', 'hr'],
  allowedAttributes: { a: ['href', 'title', 'target', 'rel'], img: ['src', 'alt', 'width', 'height', 'loading'], span: ['class'] },
  allowedClasses: { span: ['badge', 'hl'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
    img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: 'lazy' } }),
  },
  // Images must be absolute http(s) or our own public uploads.
  exclusiveFilter: (frame) => frame.tag === 'img' && !/^(https?:\/\/|\/uploads\/public\/)/.test(frame.attribs.src || ''),
};

function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 180) || 'post';
}

async function uniqueSlug(base, id = 0) {
  let slug = base;
  for (let i = 2; await db.one('SELECT id FROM news_posts WHERE slug = ? AND id <> ?', [slug, id]); i += 1) slug = `${base}-${i}`;
  return slug;
}

function textOnly(html) {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
}

async function input(b, id = 0) {
  const title = v.str(b.title, { name: 'Title', required: true, max: 200 });
  const bodyRaw = v.str(b.body_html, { name: 'Content', required: true, max: 100_000, trim: false });
  const body = sanitizeHtml(bodyRaw, SANITIZE);
  if (!textOnly(body) && !/<img/.test(body)) throw E.badRequest('Content is empty after sanitising');
  const icons = (Array.isArray(b.app_icons) ? b.app_icons : String(b.app_icons || '').split(','))
    .map((x) => String(x).trim().toLowerCase()).filter((x) => /^[a-z0-9-]{1,30}$/.test(x)).slice(0, 12);
  const publishedAt = b.published_at ? new Date(b.published_at) : new Date();
  if (Number.isNaN(publishedAt.getTime())) throw E.badRequest('Invalid publish date');
  return {
    title,
    slug: await uniqueSlug(slugify(v.str(b.slug, { max: 200 }) || title), id),
    category: v.oneOf(b.category, CATEGORIES, { def: 'general' }),
    body_html: body,
    excerpt: (v.str(b.excerpt, { max: 300 }) || textOnly(body).slice(0, 280)) || null,
    image_url: v.url(b.image_url, { name: 'Image URL' }) || null,
    app_icons: JSON.stringify(icons),
    link_url: v.url(b.link_url, { name: 'Link URL' }) || null,
    link_label: v.str(b.link_label, { max: 80 }) || null,
    status: v.oneOf(b.status, ['draft', 'published'], { def: 'published' }),
    is_pinned: v.bool(b.is_pinned) ? 1 : 0,
    demo_likes: v.int(b.demo_likes, { name: 'Demo likes', min: 0, max: 1e7, def: 0 }),
    demo_shares: v.int(b.demo_shares, { name: 'Demo shares', min: 0, max: 1e7, def: 0 }),
    demo_views: v.int(b.demo_views, { name: 'Demo views', min: 0, max: 1e8, def: 0 }),
    meta_title: v.str(b.meta_title, { max: 200 }) || null,
    meta_description: v.str(b.meta_description, { max: 300 }) || null,
    canonical_url: v.url(b.canonical_url, { name: 'Canonical URL', allowRelative: false }) || null,
    og_title: v.str(b.og_title, { max: 200 }) || null,
    og_description: v.str(b.og_description, { max: 300 }) || null,
    og_image: v.url(b.og_image, { name: 'OG image' }) || null,
    twitter_card: v.oneOf(b.twitter_card, ['summary', 'summary_large_image'], { def: 'summary_large_image' }),
    published_at: publishedAt,
  };
}

exports.list = async (req, res) => {
  const p = paginate(req.query, { defaultSize: 30 });
  const where = ['1=1'];
  const params = [];
  if (req.query.q) { where.push('title LIKE ?'); params.push(`%${String(req.query.q).slice(0, 100)}%`); }
  if (CATEGORIES.includes(req.query.category)) { where.push('category = ?'); params.push(req.query.category); }
  const [items, [{ n }]] = await Promise.all([
    db.query(`SELECT n.id, n.title, n.slug, n.category, n.status, n.is_pinned, n.views, n.published_at, n.created_at,
                (SELECT COUNT(*) FROM news_likes l WHERE l.post_id = n.id) AS likes, (SELECT COUNT(*) FROM news_shares s WHERE s.post_id = n.id) AS shares
              FROM news_posts n WHERE ${where.join(' AND ')} ORDER BY n.id DESC LIMIT ? OFFSET ?`, [...params, p.size, p.offset]),
    db.query(`SELECT COUNT(*) AS n FROM news_posts WHERE ${where.join(' AND ')}`, params),
  ]);
  res.json({ ok: true, items, pagination: meta(n, p), categories: CATEGORIES });
};

exports.show = async (req, res) => {
  const row = await db.one('SELECT * FROM news_posts WHERE id = ?', [v.id(req.params.id)]);
  if (!row) throw E.notFound('Post not found');
  res.json({ ok: true, item: { ...row, app_icons: typeof row.app_icons === 'string' ? JSON.parse(row.app_icons || '[]') : row.app_icons || [] } });
};

exports.create = async (req, res) => {
  const d = await input(req.body);
  d.author_id = req.user.id;
  const r = await db.run('INSERT INTO news_posts SET ?', [d]);
  if (d.status === 'published' && v.bool(req.body.notify)) {
    await notifications.broadcast({ type: 'post', title: `New post: ${d.title}`, body: d.excerpt?.slice(0, 200), link: '/news' });
  }
  await audit.log(req, 'news.create', { targetType: 'news', targetId: r.insertId, details: { title: d.title } });
  res.status(201).json({ ok: true, id: r.insertId, slug: d.slug, message: 'Post published' });
};

exports.update = async (req, res) => {
  const id = v.id(req.params.id);
  const d = await input(req.body, id);
  const r = await db.run('UPDATE news_posts SET ? WHERE id = ?', [d, id]);
  if (!r.affectedRows) throw E.notFound('Post not found');
  await audit.log(req, 'news.update', { targetType: 'news', targetId: id, details: { title: d.title } });
  res.json({ ok: true, message: 'Post saved' });
};

exports.remove = async (req, res) => {
  const id = v.id(req.params.id);
  await db.run('DELETE FROM news_posts WHERE id = ?', [id]);
  await audit.log(req, 'news.delete', { targetType: 'news', targetId: id });
  res.json({ ok: true, message: 'Post deleted' });
};

exports.uploadImage = async (req, res) => {
  const saved = await fileStorage.saveImage(req.file, { userId: req.user.id, purpose: 'news_image', visibility: 'public', maxWidth: 1600 });
  res.status(201).json({ ok: true, url: saved.url });
};

// -------------------------------------------------------------- notifications
exports.notifications = async (req, res) => {
  const p = paginate(req.query, { defaultSize: 30 });
  const [items, [{ n }]] = await Promise.all([
    db.query(`SELECT n.id, n.type, n.title, n.body, n.is_read, n.created_at, u.email FROM notifications n JOIN users u ON u.id = n.user_id
              ORDER BY n.id DESC LIMIT ? OFFSET ?`, [p.size, p.offset]),
    db.query('SELECT COUNT(*) AS n FROM notifications'),
  ]);
  res.json({ ok: true, items, pagination: meta(n, p) });
};

exports.sendNotification = async (req, res) => {
  const type = v.oneOf(req.body.type, notifications.TYPES, { def: 'system' });
  const title = v.str(req.body.title, { name: 'Title', required: true, max: 160 });
  const body = v.str(req.body.body, { name: 'Message', max: 500 }) || null;
  const link = v.str(req.body.link, { name: 'Link', max: 255, pattern: /^\/[\w\-/?=&.]*$/ }) || null;
  let count;
  if (req.body.user_email) {
    const u = await db.one('SELECT id FROM users WHERE email = ?', [v.email(req.body.user_email)]);
    if (!u) throw E.notFound('User not found');
    await notifications.notify(u.id, { type, title, body, link });
    count = 1;
  } else {
    count = await notifications.broadcast({ type, title, body, link });
  }
  await audit.log(req, 'notification.send', { details: { type, title, count } });
  res.json({ ok: true, message: `Sent to ${count} user(s)` });
};
