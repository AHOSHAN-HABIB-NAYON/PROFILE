'use strict';
const db = require('../config/database');
const settings = require('../models/settings');
const v = require('../utils/validate');
const { E } = require('../utils/errors');
const { paginate, meta } = require('../utils/pagination');

const CATEGORIES = ['announcement', 'update', 'offer', 'maintenance', 'premium', 'tips', 'general'];

function shape(r, demoEnabled) {
  const icons = typeof r.app_icons === 'string' ? JSON.parse(r.app_icons || '[]') : (r.app_icons || []);
  const likes = Number(r.likes || 0);
  const shares = Number(r.shares || 0);
  const views = Number(r.views || 0);
  return {
    id: r.id, slug: r.slug, title: r.title, category: r.category, excerpt: r.excerpt, body_html: r.body_html,
    image_url: r.image_url, app_icons: icons, link_url: r.link_url, link_label: r.link_label, is_pinned: !!r.is_pinned,
    published_at: r.published_at ? new Date(r.published_at).toISOString() : null,
    liked: !!r.liked,
    stats: { likes, shares, views },
    // Demo engagement is returned separately and rendered with a DEMO label — never merged into real counts.
    demo: demoEnabled && (r.demo_likes || r.demo_shares || r.demo_views)
      ? { likes: Number(r.demo_likes), shares: Number(r.demo_shares), views: Number(r.demo_views) } : null,
  };
}

const SELECT = `SELECT n.*, (SELECT COUNT(*) FROM news_likes l WHERE l.post_id = n.id) AS likes,
  (SELECT COUNT(*) FROM news_shares s WHERE s.post_id = n.id) AS shares,
  EXISTS(SELECT 1 FROM news_likes l2 WHERE l2.post_id = n.id AND l2.user_id = ?) AS liked FROM news_posts n`;

exports.list = async (req, res) => {
  const p = paginate(req.query, { defaultSize: 10, maxSize: 30 });
  const cat = CATEGORIES.includes(req.query.category) ? req.query.category : null;
  const where = `n.status = 'published' AND n.published_at <= UTC_TIMESTAMP() ${cat ? 'AND n.category = ?' : ''}`;
  const params = cat ? [cat] : [];
  const [rows, [{ n }], demo] = await Promise.all([
    db.query(`${SELECT} WHERE ${where} ORDER BY n.is_pinned DESC, n.published_at DESC LIMIT ? OFFSET ?`, [req.user.id, ...params, p.size, p.offset]),
    db.query(`SELECT COUNT(*) AS n FROM news_posts n WHERE ${where}`, params),
    settings.getBool('news_demo_engagement_enabled'),
  ]);
  res.json({ ok: true, items: rows.map((r) => shape(r, demo)), pagination: meta(n, p), categories: CATEGORIES });
};

exports.show = async (req, res) => {
  const id = v.id(req.params.id);
  const row = await db.one(`${SELECT} WHERE n.id = ? AND n.status = 'published'`, [req.user.id, id]);
  if (!row) throw E.notFound('Post not found');
  res.json({ ok: true, item: shape(row, await settings.getBool('news_demo_engagement_enabled')) });
};

exports.like = async (req, res) => {
  const postId = v.id(req.body.post_id, 'post_id');
  const post = await db.one("SELECT id FROM news_posts WHERE id = ? AND status = 'published'", [postId]);
  if (!post) throw E.notFound('Post not found');
  // UNIQUE(post_id, user_id) makes duplicate likes impossible; a second call toggles off.
  const ins = await db.run('INSERT IGNORE INTO news_likes (post_id, user_id) VALUES (?, ?)', [postId, req.user.id]);
  let liked = true;
  if (!ins.affectedRows) {
    await db.run('DELETE FROM news_likes WHERE post_id = ? AND user_id = ?', [postId, req.user.id]);
    liked = false;
  }
  const [{ n }] = await db.query('SELECT COUNT(*) AS n FROM news_likes WHERE post_id = ?', [postId]);
  res.json({ ok: true, liked, likes: Number(n) });
};

exports.share = async (req, res) => {
  const postId = v.id(req.body.post_id, 'post_id');
  const channel = v.oneOf(req.body.channel, ['link', 'native', 'telegram', 'whatsapp', 'facebook', 'twitter'], { def: 'link' });
  const post = await db.one("SELECT id, slug FROM news_posts WHERE id = ? AND status = 'published'", [postId]);
  if (!post) throw E.notFound('Post not found');
  await db.run('INSERT INTO news_shares (post_id, user_id, channel) VALUES (?,?,?)', [postId, req.user.id, channel]);
  const [{ n }] = await db.query('SELECT COUNT(*) AS n FROM news_shares WHERE post_id = ?', [postId]);
  res.json({ ok: true, shares: Number(n), url: `/news/${post.slug}` });
};

exports.view = async (req, res) => {
  const postId = v.id(req.body.post_id, 'post_id');
  req.session.viewed = req.session.viewed || [];
  if (!req.session.viewed.includes(postId)) {
    req.session.viewed = [...req.session.viewed.slice(-200), postId];
    await db.run("UPDATE news_posts SET views = views + 1 WHERE id = ? AND status = 'published'", [postId]);
  }
  res.json({ ok: true });
};

exports.CATEGORIES = CATEGORIES;
