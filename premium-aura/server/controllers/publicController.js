'use strict';
/** Public, cacheable endpoints: manifest, dynamic brand CSS, SEO news pages, robots/sitemap. */
const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const paths = require('../config/paths');
const config = require('../config/env');
const settings = require('../models/settings');
const esc = require('../utils/escape');
const errorPage = require('../utils/errorPage');

exports.manifest = async (req, res) => {
  const s = await settings.loadAll();
  const icon = s.pwa_icon_url || s.logo_url;
  const icons = icon
    ? [{ src: icon, sizes: '512x512', type: icon.endsWith('.png') ? 'image/png' : 'image/webp', purpose: 'any maskable' }, { src: icon, sizes: '192x192', type: icon.endsWith('.png') ? 'image/png' : 'image/webp' }]
    : [{ src: '/assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }];
  // public/manifest.json is the template; admin PWA settings override it.
  let base = {};
  try { base = JSON.parse(fs.readFileSync(path.join(paths.PUBLIC_DIR, 'manifest.json'), 'utf8')); } catch { base = {}; }
  res.set('Cache-Control', 'public, max-age=300');
  res.type('application/manifest+json').send(JSON.stringify({
    ...base,
    name: s.pwa_name || s.site_name,
    short_name: s.pwa_short_name || 'Aura',
    description: s.site_subtitle,
    start_url: '/dashboard?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: s.pwa_theme_color,
    background_color: s.pwa_background_color,
    icons,
    shortcuts: [
      { name: 'OTP Services', url: '/otp' },
      { name: 'Access Services', url: '/access' },
      { name: 'Premium', url: '/premium' },
    ],
  }));
};

exports.brandCss = async (req, res) => {
  const s = await settings.loadAll();
  const bg = s.login_background_url ? `--login-bg: url("${String(s.login_background_url).replace(/["\\()]/g, '')}");` : '';
  res.set('Cache-Control', 'public, max-age=60');
  res.type('text/css').send(`:root{--primary:${s.primary_color};--accent:${s.accent_color};${bg}}`);
};

exports.site = async (req, res) => {
  res.set('Cache-Control', 'public, max-age=30');
  res.json({ ok: true, site: await settings.publicSettings() });
};

function absolute(req, u) {
  if (!u) return '';
  if (/^https?:\/\//.test(u)) return u;
  return `${config.appUrl || `${req.protocol}://${req.get('host')}`}${u}`;
}

/** Server-rendered, crawlable news article with full SEO/OG/Twitter meta. */
exports.newsPage = async (req, res) => {
  const slug = String(req.params.slug || '').slice(0, 220);
  const [s, post] = await Promise.all([
    settings.loadAll(),
    db.one("SELECT * FROM news_posts WHERE slug = ? AND status = 'published' AND published_at <= UTC_TIMESTAMP()", [slug]),
  ]);
  if (!post) return res.status(404).type('html').send(errorPage.render(404, { siteName: s.site_name }));
  const title = post.meta_title || `${post.title} · ${s.site_name}`;
  const desc = post.meta_description || post.excerpt || s.site_subtitle;
  const canonical = post.canonical_url || absolute(req, `/news/${post.slug}`);
  const img = absolute(req, post.og_image || post.image_url || s.logo_url || '/assets/icons/icon-512.png');
  const date = new Date(post.published_at);
  const ld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'NewsArticle', headline: post.title, datePublished: date.toISOString(),
    dateModified: new Date(post.updated_at).toISOString(), image: [img], author: { '@type': 'Organization', name: s.site_name },
  }).replace(/</g, '\\u003c');
  res.set('Cache-Control', 'public, max-age=120');
  res.type('html').send(`<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="${esc(s.site_name)}">
<meta property="og:title" content="${esc(post.og_title || post.title)}"><meta property="og:description" content="${esc(post.og_description || desc)}">
<meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(img)}">
<meta property="article:published_time" content="${esc(date.toISOString())}">
<meta name="twitter:card" content="${esc(post.twitter_card)}"><meta name="twitter:title" content="${esc(post.og_title || post.title)}">
<meta name="twitter:description" content="${esc(post.og_description || desc)}"><meta name="twitter:image" content="${esc(img)}">
<meta name="theme-color" content="${esc(s.pwa_theme_color)}">
<link rel="icon" href="${esc(s.favicon_url || '/assets/icons/favicon.svg')}">
<link rel="stylesheet" href="/vendor/fontawesome/css/all.min.css"><link rel="stylesheet" href="/assets/css/app.css"><link rel="stylesheet" href="/brand.css">
<script type="application/ld+json">${ld}</script>
<script src="/assets/js/theme-boot.js"></script>
</head><body class="public-article"><main class="article-wrap">
<a class="brand article-brand" href="/">${s.logo_url ? `<img src="${esc(s.logo_url)}" alt="" class="brand-logo">` : '<span class="brand-mark"><i class="fa-solid fa-crown"></i></span>'}
<span><strong>${esc(s.site_name)}</strong><small>${esc(s.site_subtitle)}</small></span></a>
<article class="card news-card article">
<header class="news-head"><span class="brand-mark sm">${s.logo_url ? `<img src="${esc(s.logo_url)}" alt="">` : '<i class="fa-solid fa-crown"></i>'}</span>
<div><strong>${esc(s.site_name)} <i class="fa-solid fa-circle-check verified"></i></strong><small>Admin · <time datetime="${esc(date.toISOString())}">${esc(date.toUTCString().slice(5, 16))}</time></small></div>
<span class="chip">${esc(post.category)}</span></header>
<h1>${esc(post.title)}</h1>
${post.image_url ? `<img class="news-image" src="${esc(post.image_url)}" alt="" loading="lazy">` : ''}
<div class="news-body">${post.body_html}</div>
${post.link_url ? `<a class="btn btn-primary" href="${esc(post.link_url)}" rel="noopener nofollow" target="_blank">${esc(post.link_label || 'Learn more')}</a>` : ''}
</article><p class="muted center"><a href="/login">Sign in</a> to like and share updates.</p></main></body></html>`);
};

exports.robots = async (req, res) => {
  res.type('text').send(`User-agent: *\nAllow: /news/\nDisallow: /api/\nDisallow: /admin\nDisallow: /install\nSitemap: ${absolute(req, '/sitemap.xml')}\n`);
};

exports.sitemap = async (req, res) => {
  const rows = await db.query("SELECT slug, updated_at FROM news_posts WHERE status = 'published' AND published_at <= UTC_TIMESTAMP() ORDER BY published_at DESC LIMIT 5000");
  const urls = rows.map((r) => `<url><loc>${esc(absolute(req, `/news/${r.slug}`))}</loc><lastmod>${new Date(r.updated_at).toISOString()}</lastmod></url>`).join('');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${esc(absolute(req, '/login'))}</loc></url>${urls}</urlset>`);
};
