'use strict';
const settings = require('../../settings');
const { html, raw, esc, jsonForScript } = require('../../util/html');
const { icon } = require('../icons');
const { asset } = require('../../assets');
const uploads = require('../../util/uploads');
const { bnNum } = require('../../util/bn');

const MENU = [
  ['dashboard', '', 'ড্যাশবোর্ড', 'home', null],
  ['posts', '/posts', 'পোস্ট ম্যানেজমেন্ট', 'file', 'posts'],
  ['categories', '/categories', 'ক্যাটাগরি', 'grid', 'categories'],
  ['banners', '/banners', 'ব্যানার', 'image', 'banners'],
  ['ads', '/ads', 'বিজ্ঞাপন', 'ad', 'ads'],
  ['notices', '/notices', 'নোটিশ', 'bell', 'notices'],
  ['reports', '/reports', 'রিপোর্ট', 'flag', 'reports'],
  ['automation', '/automation', 'অটোমেশন', 'bot', 'automation'],
  ['analytics', '/analytics', 'অ্যানালিটিক্স', 'analytics', 'analytics'],
  ['pages', '/pages', 'পেজ ও টিম', 'layers', 'pages'],
  ['subscribers', '/subscribers', 'সাবস্ক্রাইবার', 'mail', 'subscribers'],
  ['users', '/users', 'ইউজার', 'users', 'users'],
  ['settings', '/settings', 'সেটিংস', 'settings', 'settings'],
  ['import', '/import', 'পুরোনো সাইট থেকে আনুন', 'database', 'settings'],
];

function avatar(u, size = 36) {
  if (u.avatar) return html`<img class="avatar" src="${uploads.url(u.avatar)}" alt="" width="${size}" height="${size}">`;
  const letter = [...String(u.name || u.username || 'A')][0].toUpperCase();
  return html`<span class="avatar avatar-ph" style="width:${size}px;height:${size}px">${letter}</span>`;
}

function brand(base) {
  const logo = settings.get('logo') ? uploads.url(settings.get('logo')) : asset('img/logo.svg');
  return html`<a class="a-brand" href="${base}"><img src="${logo}" alt="" width="36" height="36"><span><b>${settings.get('site_name')}</b><small>Admin Panel</small></span></a>`;
}

function sidebar(req, active, counts) {
  const base = settings.adminPath();
  const u = req.admin;
  return html`<aside class="a-side" id="aSide">
  <div class="a-side-top">${brand(base)}<button class="icon-btn only-m" type="button" data-drawer-close aria-label="বন্ধ">${raw(icon('x'))}</button></div>
  <div class="a-user">${avatar(u, 42)}<div><b>${u.name || u.username}</b><small>${u.email}</small></div></div>
  <nav class="a-nav">${MENU.filter((m) => !m[4] || u.perms.has(m[4])).map(([k, p, t, ic]) => html`<a href="${base}${p}" class="${active === k ? 'on' : ''}" data-nav="${k}">${raw(icon(ic))}<span>${t}</span>${counts && counts[k] ? html`<em class="cnt">${bnNum(counts[k])}</em>` : ''}</a>`)}</nav>
  <div class="a-side-foot">
    <button class="a-nav-row" type="button" data-theme-toggle>${raw(icon('moon'))}<span>ডার্ক মোড</span><span class="switch"><i></i></span></button>
    <a class="a-nav-row" href="/" target="_blank">${raw(icon('globe'))}<span>সাইট দেখুন</span></a>
    <a class="a-nav-row" href="${base}/profile">${raw(icon('user'))}<span>প্রোফাইল</span></a>
    <form method="post" action="${base}/logout" data-plain><input type="hidden" name="_csrf" value="${u.csrf}"><button class="a-nav-row danger" type="submit">${raw(icon('logout'))}<span>লগআউট</span></button></form>
  </div>
</aside>`;
}

function bottom(req, active) {
  const base = settings.adminPath();
  const items = [['dashboard', '', 'হোম', 'home'], ['posts', '/posts', 'পোস্ট', 'file'], ['new', '/posts/new', 'নতুন', 'plus'], ['automation', '/automation', 'অটো', 'bot']];
  return html`<nav class="a-bnav">${items.map(([k, p, t, ic]) => html`<a href="${base}${p}" class="${active === k ? 'on' : ''} ${k === 'new' ? 'fab' : ''}" data-nav="${k}">${raw(icon(ic))}<span>${t}</span></a>`)}
  <button type="button" data-drawer>${raw(icon('menu'))}<span>মেনু</span></button></nav>`;
}

function topbar(req, title, unread) {
  const base = settings.adminPath();
  return html`<header class="a-top">
  <button class="icon-btn only-m" type="button" data-drawer aria-label="মেনু">${raw(icon('menu'))}</button>
  <h1 class="a-title" id="aTitle">${title}</h1>
  <div class="a-top-act">
    <button class="icon-btn" type="button" data-theme-toggle aria-label="ডার্ক মোড">${raw(icon('moon', 'ic-moon'))}${raw(icon('sun', 'ic-sun'))}</button>
    <a class="icon-btn bell" href="${base}/notifications" aria-label="নোটিফিকেশন">${raw(icon('bell'))}${unread ? html`<span class="dot-badge">${bnNum(unread)}</span>` : ''}</a>
    <a href="${base}/profile" class="only-d">${avatar(req.admin, 34)}</a>
  </div>
</header>`;
}

/** page = { title, body, nav, counts, unread } */
function document(req, page) {
  const base = settings.adminPath();
  return '<!doctype html>' + html`<html lang="bn" data-theme="light"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${page.title} — এডমিন</title><meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#15803d">
<link rel="icon" href="${asset('icons/icon-48.png')}">
<link rel="preload" href="/fonts/hind-siliguri-bengali-400.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/fonts/hind-siliguri-bengali-600.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${asset('css/admin.css')}">
<script>(function(){try{if(localStorage.getItem('theme')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}})()</script>
</head><body class="adm">
<div class="a-shell">
${sidebar(req, page.nav, page.counts)}
<div class="a-drawer-bg" data-drawer-close></div>
<div class="a-main">
${topbar(req, page.title, page.unread)}
<div class="progress" id="progress"></div>
<main class="a-content" id="adm" data-nav="${page.nav}">${raw(String(page.body))}</main>
</div>
</div>
${bottom(req, page.nav)}
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="modal" id="confirmModal" aria-hidden="true"><div class="modal-bg" data-cancel></div><div class="modal-panel"><h3 id="cfTitle">নিশ্চিত?</h3><p id="cfText"></p><div class="row-gap end"><button class="btn btn-soft" type="button" data-cancel>বাতিল</button><button class="btn btn-danger" type="button" data-ok>হ্যাঁ, নিশ্চিত</button></div></div></div>
<script>window.__ADM=${raw(jsonForScript({ base, csrf: req.admin.csrf }))}</script>
<script src="${asset('js/admin.js')}" defer></script>
</body></html>`;
}

function loginDoc({ error = '', next = '', csrf = '' }) {
  const base = settings.adminPath();
  const logo = settings.get('logo') ? uploads.url(settings.get('logo')) : asset('img/logo.svg');
  return '<!doctype html>' + html`<html lang="bn" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>এডমিন লগইন — ${settings.get('site_name')}</title><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#15803d">
<link rel="icon" href="${asset('icons/icon-48.png')}">
<link rel="preload" href="/fonts/hind-siliguri-bengali-400.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/fonts/hind-siliguri-bengali-600.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${asset('css/admin.css')}">
<script>(function(){try{if(localStorage.getItem('theme')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}})()</script>
</head><body class="login-body">
<main class="login">
  <div class="login-brand"><div class="login-logo"><img src="${logo}" alt="" width="84" height="84"></div><h1>${settings.get('site_name')}</h1><p>Admin Panel</p></div>
  <form method="post" action="${base}/login" class="login-form">
    <h2>অ্যাডমিন লগইন</h2><p class="muted">সাইট পরিচালনার জন্য লগইন করুন</p>
    ${error ? html`<div class="alert alert-err">${error}</div>` : ''}
    <input type="hidden" name="next" value="${next}"><input type="hidden" name="_t" value="${csrf}">
    <label class="ifield">${raw(icon('user'))}<input name="username" placeholder="ইমেইল বা ইউজারনেম" required autocomplete="username" autofocus></label>
    <label class="ifield">${raw(icon('lock'))}<input name="password" type="password" placeholder="পাসওয়ার্ড" required autocomplete="current-password" id="pw"><button type="button" class="pw-eye" onclick="var p=document.getElementById('pw');p.type=p.type==='password'?'text':'password'" aria-label="পাসওয়ার্ড দেখুন">${raw(icon('eye'))}</button></label>
    <div class="login-row"><label class="check"><input type="checkbox" name="remember" value="1" checked> মনে রাখুন</label><span class="muted small">পাসওয়ার্ড ভুলে গেলে মূল এডমিনের সাথে যোগাযোগ করুন</span></div>
    <button class="btn btn-primary btn-block btn-lg" type="submit">লগইন</button>
  </form>
  <p class="login-foot">${String(settings.get('copyright')).replace('{year}', bnNum(new Date().getFullYear()))}</p>
</main></body></html>`;
}

function denied() {
  return '<!doctype html><html lang="bn"><meta charset="utf-8"><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>অনুমতি নেই</h2><p>এই পেজ দেখার অনুমতি আপনার নেই।</p><a href="javascript:history.back()">ফিরে যান</a></body></html>';
}

module.exports = { document, loginDoc, denied, avatar, MENU, esc };
