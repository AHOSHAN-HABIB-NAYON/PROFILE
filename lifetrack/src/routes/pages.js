'use strict';
/** Server-rendered shells (SEO-friendly landing, app & admin shells), manifest, service worker, robots, sitemap. */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const settings = require('../services/settings');
const i18n = require('../services/i18n');
const config = require('../config');

const r = express.Router();
const VIEWS = path.join(__dirname, '..', '..', 'views');
const PUB = path.join(__dirname, '..', '..', 'public');

// Asset version = hash of public file mtimes (cache-busting + SW cache name)
function computeVersion() {
  const h = crypto.createHash('md5');
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else h.update(p + fs.statSync(p).mtimeMs); } };
  walk(PUB); ['landing.html', 'app.html', 'admin.html', 'install.html'].forEach((v) => { try { h.update(v + fs.statSync(path.join(VIEWS, v)).mtimeMs); } catch {} });
  return h.digest('hex').slice(0, 10);
}
const VERSION = computeVersion();
let SPRITE = '';
function sprite() { if (!SPRITE || !config.isProd) SPRITE = fs.readFileSync(path.join(PUB, 'img', 'icons.svg'), 'utf8'); return SPRITE; }

const cache = {};
function tpl(name) {
  if (!cache[name] || !config.isProd) cache[name] = fs.readFileSync(path.join(VIEWS, name), 'utf8');
  return cache[name];
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function iconSet() {
  const custom = settings.get('pwa_icon_url');
  const base = custom || '/icons';
  return {
    i192: `${base}/icon-192.png`, i512: `${base}/icon-512.png`, apple: custom ? `${custom}/apple-touch-icon.png` : '/icons/apple-touch-icon.png',
    m192: custom ? `${custom}/maskable-192.png` : '/icons/maskable-192.png', m512: custom ? `${custom}/maskable-512.png` : '/icons/maskable-512.png', base,
  };
}

function vars(req, extra = {}) {
  const site = settings.get('site_name') || 'LifeTrack';
  const url = settings.siteUrl(req);
  const icons = iconSet();
  const og = settings.get('og_image_url') || '/img/og-image.png';
  const logo = settings.get('logo_url');
  return {
    v: VERSION, site: esc(site), tagline: esc(settings.get('site_tagline')), url: esc(url), canonical: esc(url + (extra.path || '/')),
    title: esc(extra.title || settings.get('seo_title') || site), description: esc(settings.get('seo_description')), keywords: esc(settings.get('seo_keywords')),
    og: esc(og.startsWith('http') ? og : url + og), theme: esc(settings.get('theme_color') || '#1E4FD8'), bg: esc(settings.get('background_color') || '#F5F7FB'),
    favicon: esc(settings.get('favicon_url') || '/icons/favicon.svg'), apple: esc(icons.apple), lang: 'en',
    logo: logo ? `<img src="${esc(logo)}" alt="" class="brand-img" width="30" height="30">` : '<svg class="brand-mark" aria-hidden="true"><use href="#logo"/></svg>',
    logoShowName: settings.bool('logo_show_name') || !logo ? '' : 'hidden',
    heroTitle: esc(settings.get('landing_hero_title')), heroSubtitle: esc(settings.get('landing_hero_subtitle')), cta: esc(settings.get('landing_cta')),
    faqHidden: settings.bool('landing_show_faq') ? '' : 'hidden', year: new Date().getFullYear(),
    googleOn: settings.bool('auth_google_enabled') ? '1' : '0', sprite: sprite(), ...extra,
  };
}
function render(name, v) { return tpl(name).replace(/\{\{(\w+)\}\}/g, (_, k) => (v[k] !== undefined ? v[k] : '')); }

const html = (res, body) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-cache'); res.send(body); };

r.get('/', (req, res) => html(res, render('landing.html', vars(req, { path: '/' }))));
r.get(['/app', '/app/*'], (req, res) => html(res, render('app.html', vars(req, { path: '/app', title: esc(settings.get('site_name')) }))));
r.get(['/admin', '/admin/*'], (req, res) => html(res, render('admin.html', vars(req, { path: '/admin', title: 'Admin · ' + esc(settings.get('site_name')) }))));

r.get('/manifest.webmanifest', (req, res) => {
  const i = iconSet(); const site = settings.get('site_name') || 'LifeTrack';
  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(JSON.stringify({
    id: '/app', name: site, short_name: site.slice(0, 12), description: settings.get('seo_description'),
    start_url: '/app?source=pwa', scope: '/', display: 'standalone', display_override: ['window-controls-overlay', 'standalone'], orientation: 'any',
    theme_color: settings.get('theme_color') || '#1E4FD8', background_color: settings.get('background_color') || '#F5F7FB', lang: 'en', dir: 'ltr',
    categories: ['finance', 'productivity', 'lifestyle'],
    icons: [
      ...sizes.map((s) => ({ src: `${i.base}/icon-${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any' })),
      { src: i.m192, sizes: '192x192', type: 'image/png', purpose: 'maskable' }, { src: i.m512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    screenshots: [
      { src: '/img/screens/mobile-home.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: 'Dashboard' },
      { src: '/img/screens/mobile-reports.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: 'Reports' },
      { src: '/img/screens/desktop-dashboard.png', sizes: '1440x900', type: 'image/png', form_factor: 'wide', label: 'Desktop dashboard' },
    ],
    shortcuts: [
      { name: 'Add transaction', short_name: 'Add', url: '/app?quick=expense', icons: [{ src: '/icons/icon-96.png', sizes: '96x96' }] },
      { name: 'Reports', url: '/app/reports', icons: [{ src: '/icons/icon-96.png', sizes: '96x96' }] },
      { name: 'Goals', url: '/app/goals', icons: [{ src: '/icons/icon-96.png', sizes: '96x96' }] },
    ],
    launch_handler: { client_mode: ['focus-existing', 'auto'] },
    prefer_related_applications: false,
  }));
});

r.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Service-Worker-Allowed', '/');
  res.send(fs.readFileSync(path.join(PUB, 'sw-src.js'), 'utf8').replace(/__VERSION__/g, VERSION));
});

r.get('/robots.txt', (req, res) => { res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /admin\nDisallow: /api/\nSitemap: ${settings.siteUrl(req)}/sitemap.xml\n`); });
r.get('/sitemap.xml', (req, res) => {
  const u = settings.siteUrl(req);
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${esc(u)}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url><url><loc>${esc(u)}/app/login</loc><priority>0.5</priority></url><url><loc>${esc(u)}/app/register</loc><priority>0.6</priority></url></urlset>`);
});
r.get('/favicon.ico', (req, res) => res.redirect(301, settings.get('favicon_url') || '/icons/favicon-32.png'));
r.get('/.well-known/change-password', (req, res) => res.redirect('/app/settings/security'));

module.exports = { router: r, VERSION, render, vars, html, sprite };
