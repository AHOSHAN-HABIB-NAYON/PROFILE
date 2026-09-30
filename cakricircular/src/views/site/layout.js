'use strict';
const settings = require('../../settings');
const data = require('../../data');
const { html, raw, esc, jsonForScript, safeUrl } = require('../../util/html');
const { icon } = require('../icons');
const { asset } = require('../../assets');
const uploads = require('../../util/uploads');
const { bnNum } = require('../../util/bn');

function origin(req) {
  const domain = settings.get('site_domain');
  const proto = (req && (req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http'))) || 'https';
  const host = req && req.headers.host;
  if (host && !/^(localhost|127\.|0\.0\.0\.0)/.test(host) && domain && !host.includes(domain)) return `${proto.split(',')[0]}://${host}`;
  if (host && /^(localhost|127\.)/.test(host)) return `http://${host}`;
  return `https://${domain || host}`;
}

function logoUrl() { return settings.get('logo') ? uploads.url(settings.get('logo')) : asset('img/logo.svg'); }

async function shared() {
  const [cats, pages, team, notices] = await Promise.all([data.categories(), data.pages(), data.team(), data.notices(20)]);
  return { cats, pages, team, latestNotice: notices[0] ? notices[0].id : 0, noticeIds: notices.map((n) => n.id) };
}

function socials() {
  const list = [
    ['facebook', 'social_facebook', 'Facebook'], ['youtube', 'social_youtube', 'YouTube'], ['xlogo', 'social_x', 'X'],
    ['telegram', 'social_telegram', 'Telegram'], ['whatsapp', 'social_whatsapp', 'WhatsApp'], ['linkedin', 'social_linkedin', 'LinkedIn'],
  ];
  return list.filter(([, k]) => settings.get(k)).map(([ic, k, label]) => html`<a class="soc soc-${ic}" href="${safeUrl(settings.get(k))}" target="_blank" rel="noopener" aria-label="${label}">${raw(icon(ic))}</a>`);
}

function brand(tag = 'div') {
  return raw(`<${tag} class="brand-wrap"><a href="/" class="brand" aria-label="${esc(settings.get('site_name'))}">
  <img src="${esc(logoUrl())}" alt="" width="40" height="40" class="brand-logo">
  <span class="brand-txt"><b>${esc(settings.get('site_name'))}</b><small>${esc(settings.get('site_domain'))}</small></span>
</a></${tag}>`);
}

const NAV = [
  ['home', '/', 'হোম', 'home'],
  ['cats', '/categories', 'ক্যাটাগরি', 'grid'],
  ['search', '/search', 'খুঁজুন', 'search'],
  ['notices', '/notices', 'নোটিশ', 'bell'],
];

function header(s) {
  const catLinks = s.cats.slice(0, 7).map((c) => html`<a href="/category/${encodeURIComponent(c.slug)}" data-nav="cat-${c.slug}">${c.name}</a>`);
  return html`<header class="hdr" id="hdr">
  <div class="hdr-in wrap">
    <button class="icon-btn only-m" type="button" data-drawer aria-label="মেনু">${raw(icon('menu'))}</button>
    ${brand()}
    <nav class="hdr-nav only-d">
      <a href="/" data-nav="home">হোম</a><a href="/categories" data-nav="cats">ক্যাটাগরি</a>
      <a href="/trending" data-nav="trending">ট্রেন্ডিং</a><a href="/premium" data-nav="premium">প্রিমিয়াম</a>
      <a href="/notices" data-nav="notices">নোটিশ</a><a href="/saved" data-nav="saved">সেভড জব</a>
    </nav>
    <div class="hdr-act">
      <button class="icon-btn only-d" type="button" data-search-open aria-label="খুঁজুন">${raw(icon('search'))}</button>
      <button class="icon-btn only-d" type="button" data-theme-toggle aria-label="ডার্ক মোড">${raw(icon('moon', 'ic-moon'))}${raw(icon('sun', 'ic-sun'))}</button>
      <a class="icon-btn bell" href="/notices" aria-label="নোটিশ">${raw(icon('bell'))}<span class="dot-badge" id="noticeBadge" hidden></span></a>
    </div>
  </div>
  <div class="catbar"><div class="wrap catbar-in">${catLinks}</div></div>
</header>`;
}

function drawer(s) {
  const links = [
    ['/', 'home', 'হোম'], ['/categories', 'grid', 'ক্যাটাগরি'], ['/search', 'search', 'খুঁজুন'], ['/trending', 'flame', 'ট্রেন্ডিং'],
    ['/premium', 'crown', 'প্রিমিয়াম'], ['/notices', 'bell', 'নোটিশ'], ['/saved', 'bookmark', 'সেভড জব'], ['/report', 'flag', 'রিপোর্ট'],
    ...s.pages.map((p) => [`/page/${encodeURIComponent(p.slug)}`, 'info', p.title]),
  ];
  return html`<div class="drawer" id="drawer" aria-hidden="true">
  <div class="drawer-bg" data-drawer-close></div>
  <aside class="drawer-panel" role="dialog" aria-label="মেনু">
    <div class="drawer-top">${brand()}<button class="icon-btn" type="button" data-drawer-close aria-label="বন্ধ">${raw(icon('x'))}</button></div>
    <nav class="drawer-nav">${links.map(([u, ic, t]) => html`<a href="${u}">${raw(icon(ic))}<span>${t}</span></a>`)}</nav>
    <div class="drawer-sep"></div>
    <button class="drawer-row" type="button" data-theme-toggle>${raw(icon('moon'))}<span>ডার্ক মোড</span><span class="switch"><i></i></span></button>
    <button class="drawer-row" type="button" data-install hidden>${raw(icon('install'))}<span>অ্যাপ ইনস্টল করুন</span></button>
    <div class="drawer-social"><small>সোশ্যাল মিডিয়া</small><div class="socials">${socials()}</div></div>
  </aside>
</div>`;
}

function bottomNav() {
  return html`<nav class="bnav" id="bnav" aria-label="নিচের মেনু">
  ${NAV.map(([k, u, t, ic]) => html`<a href="${u}" data-nav="${k}">${raw(icon(ic))}<span>${t}</span>${k === 'notices' ? raw('<i class="dot-badge" id="noticeBadgeM" hidden></i>') : ''}</a>`)}
  <button type="button" data-drawer data-nav="more">${raw(icon('more'))}<span>আরও</span></button>
</nav>`;
}

function footer(s) {
  const year = bnNum(new Date().getFullYear());
  const team = s.team.length ? html`<section class="team">
      <h3>আমাদের টিম</h3>
      <div class="team-grid">${s.team.map((m) => html`<div class="member">
        ${m.photo ? html`<img src="${uploads.url(m.photo)}" alt="${m.name}" loading="lazy" width="72" height="72">` : raw(`<span class="avatar-ph">${icon('user')}</span>`)}
        <b>${m.name}</b><small>${m.role}</small>${m.bio ? html`<p>${m.bio}</p>` : ''}
        ${m.link ? html`<a href="${safeUrl(m.link)}" target="_blank" rel="noopener" aria-label="${m.name} প্রোফাইল">${raw(icon('external'))}</a>` : ''}
      </div>`)}</div>
    </section>` : '';
  return html`<footer class="ftr">
  <div class="wrap">
    ${team}
    <div class="ftr-grid">
      <div class="ftr-about">${brand()}<p>${settings.get('footer_about')}</p><div class="socials">${socials()}</div></div>
      <div><h4>দ্রুত লিংক</h4><ul>
        <li><a href="/posts">সকল পোস্ট</a></li><li><a href="/categories">ক্যাটাগরি</a></li><li><a href="/trending">ট্রেন্ডিং</a></li>
        <li><a href="/premium">প্রিমিয়াম</a></li><li><a href="/notices">নোটিশ</a></li><li><a href="/report">ভুল তথ্য জানান</a></li>
      </ul></div>
      <div><h4>তথ্য</h4><ul>${s.pages.filter((p) => p.in_footer).map((p) => html`<li><a href="/page/${encodeURIComponent(p.slug)}">${p.title}</a></li>`)}
        ${settings.get('contact_email') ? html`<li><a href="mailto:${settings.get('contact_email')}">${settings.get('contact_email')}</a></li>` : ''}</ul></div>
      <div class="ftr-cards">
        <div class="app-card" id="installCard">
          <div class="app-ic">${raw(`<img src="${esc(asset('icons/icon-96.png'))}" alt="" width="44" height="44" loading="lazy">`)}</div>
          <div><b>${settings.get('app_name')} অ্যাপ</b><small>ফোনে ইনস্টল করুন — দ্রুত, অফলাইনেও চলে</small></div>
          <button class="btn btn-primary btn-sm" type="button" data-install>${raw(icon('download'))}ইনস্টল</button>
        </div>
        <form class="sub-form" data-subscribe>
          <label for="subEmail"><b>দৈনিক চাকরির খবর ইমেইলে</b><small>প্রতিদিন সন্ধ্যায় সারসংক্ষেপ পাবেন</small></label>
          <div class="sub-row"><input id="subEmail" type="email" name="email" placeholder="আপনার ইমেইল" required autocomplete="email"><button class="btn btn-primary btn-sm" type="submit">${raw(icon('send'))}</button></div>
        </form>
      </div>
    </div>
    <div class="ftr-bottom"><span>${String(settings.get('copyright')).replace('{year}', year)}</span><span class="slogan">${settings.get('footer_slogan')}</span></div>
  </div>
</footer>`;
}

function shareSheet() {
  return html`<div class="sheet" id="shareSheet" aria-hidden="true">
  <div class="sheet-bg" data-sheet-close></div>
  <div class="sheet-panel" role="dialog" aria-label="শেয়ার করুন">
    <div class="sheet-grip"></div>
    <div class="sheet-head"><h3>শেয়ার করুন</h3><button class="icon-btn" type="button" data-sheet-close aria-label="বন্ধ">${raw(icon('x'))}</button></div>
    <div class="share-prev"><img alt="" id="shareImg" hidden><div><b id="shareTitle"></b><small id="shareHost"></small></div></div>
    <div class="share-grid">
      <a data-share="facebook" target="_blank" rel="noopener"><span class="s-ic s-fb">${raw(icon('facebook'))}</span>Facebook</a>
      <a data-share="x" target="_blank" rel="noopener"><span class="s-ic s-x">${raw(icon('xlogo'))}</span>X</a>
      <a data-share="whatsapp" target="_blank" rel="noopener"><span class="s-ic s-wa">${raw(icon('whatsapp'))}</span>WhatsApp</a>
      <a data-share="telegram" target="_blank" rel="noopener"><span class="s-ic s-tg">${raw(icon('telegram'))}</span>Telegram</a>
      <button type="button" data-share="copy"><span class="s-ic s-copy">${raw(icon('link'))}</span>লিংক কপি</button>
      <button type="button" data-share="native"><span class="s-ic s-more">${raw(icon('more'))}</span>আরও</button>
    </div>
    <button class="btn btn-soft btn-block" type="button" data-sheet-close>বাতিল</button>
  </div>
</div>`;
}

function searchSheet(s) {
  return html`<div class="ssheet" id="searchSheet" aria-hidden="true">
  <div class="ssheet-panel" role="dialog" aria-label="খুঁজুন">
    <form class="ssheet-bar" action="/search" method="get" data-search-form>
      <button class="icon-btn" type="button" data-search-close aria-label="বন্ধ">${raw(icon('back'))}</button>
      <div class="search-box">${raw(icon('search'))}<input type="search" name="q" placeholder="চাকরি, প্রতিষ্ঠান বা কীওয়ার্ড লিখুন…" autocomplete="off" enterkeyhint="search" data-suggest></div>
    </form>
    <div class="ssheet-body">
      <div class="suggest" data-suggest-list></div>
      <div data-recent-wrap hidden><div class="mini-head"><b>সাম্প্রতিক অনুসন্ধান</b><button type="button" class="link-btn" data-recent-clear>মুছুন</button></div><div class="recent" data-recent></div></div>
      <div class="mini-head"><b>ক্যাটাগরি</b></div>
      <div class="chips">${s.cats.map((c) => html`<a class="chip" href="/category/${encodeURIComponent(c.slug)}">${c.name}</a>`)}</div>
    </div>
  </div>
</div>`;
}

function pushPrompt() {
  return html`<div class="modal" id="pushModal" aria-hidden="true">
  <div class="modal-bg" data-push-later></div>
  <div class="modal-panel push-panel" role="dialog" aria-label="নোটিফিকেশন">
    <div class="bell-anim">${raw(icon('bell'))}</div>
    <h3>নতুন চাকরির নোটিফিকেশন পেতে চান?</h3>
    <p>সর্বশেষ চাকরি, নোটিশ ও আপডেট পেতে নোটিফিকেশন চালু করুন। সেভ করা জবের ডেডলাইনের আগে মনে করিয়ে দেব।</p>
    <button class="btn btn-primary btn-block" type="button" data-push-allow>Allow</button>
    <button class="btn btn-outline btn-block" type="button" data-push-later>না, পরে</button>
  </div>
</div>`;
}

/**
 * Full HTML document. `page` = { title, body, nav, desc, canonical, image, type, jsonld[], noindex, bodyClass, headExtra }
 */
function document(req, s, page) {
  const site = settings.get('site_name');
  const title = page.title ? `${page.title} | ${site}` : settings.get('meta_title') || site;
  const desc = page.desc || settings.get('meta_desc');
  const base = origin(req);
  const canonical = base + (page.canonical || req.path);
  const image = page.image ? (page.image.startsWith('http') ? page.image : base + page.image) : settings.get('og_image') ? base + uploads.url(settings.get('og_image')) : base + asset('icons/og-default.png').split('?')[0];
  const theme = settings.get('theme_color') || '#15803d';
  const fav = settings.get('favicon') ? uploads.url(settings.get('favicon')) : asset('icons/icon-48.png');
  const boot = {
    vapid: settings.get('vapid_public'), pushDelay: settings.int('push_prompt_delay', 8), push: settings.bool('push_enabled'),
    notices: s.noticeIds, latestNotice: s.latestNotice, sw: asset('sw.js'),
  };
  return '<!doctype html>' + html`<html lang="bn" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${desc}">
${page.keywords || settings.get('meta_keywords') ? html`<meta name="keywords" content="${page.keywords || settings.get('meta_keywords')}">` : ''}
<link rel="canonical" href="${canonical}">
${page.noindex ? raw('<meta name="robots" content="noindex,follow">') : raw('<meta name="robots" content="index,follow,max-image-preview:large">')}
<meta name="theme-color" content="${theme}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b1220" media="(prefers-color-scheme: dark)">
<meta property="og:site_name" content="${site}"><meta property="og:locale" content="bn_BD">
<meta property="og:type" content="${page.type || 'website'}"><meta property="og:title" content="${page.title || title}">
<meta property="og:description" content="${desc}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${page.title || title}">
<meta name="twitter:description" content="${desc}"><meta name="twitter:image" content="${image}">
${settings.get('google_verification') ? html`<meta name="google-site-verification" content="${settings.get('google_verification')}">` : ''}
${settings.get('bing_verification') ? html`<meta name="msvalidate.01" content="${settings.get('bing_verification')}">` : ''}
<link rel="icon" href="${fav}"><link rel="apple-touch-icon" href="${asset('icons/apple-touch-icon.png')}">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/fonts/hind-siliguri-bengali-400.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/fonts/hind-siliguri-bengali-600.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${asset('css/site.css')}">
<script>(function(){try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}})()</script>
${(page.jsonld || []).map((j) => raw(`<script type="application/ld+json">${jsonForScript(j)}</script>`))}
${raw(settings.get('head_code') || '')}
</head>
<body class="${page.bodyClass || ''}">
<a class="skip" href="#app">মূল কনটেন্টে যান</a>
${header(s)}
${drawer(s)}
<div class="progress" id="progress"></div>
<main id="app" class="app" data-nav-key="${page.nav || ''}" data-title="${title}">${raw(String(page.body))}</main>
${footer(s)}
${bottomNav()}
${shareSheet()}
${searchSheet(s)}
${pushPrompt()}
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>window.__CC=${raw(jsonForScript(boot))}</script>
<script src="${asset('js/app.js')}" defer></script>
</body></html>`;
}

module.exports = { document, shared, origin, logoUrl, brand };
