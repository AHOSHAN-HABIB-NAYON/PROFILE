/* ─────────────────────────────────────────────
   পেজের কাঠামো: <head> (SEO, PWA, থিম), হেডার, সাইডবার, ফুটার, বটম মেনু
   ───────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { html, raw, esc, str } from '../core/html.js';
import { setting } from '../core/settings.js';
import { config } from '../config.js';
import { contentVersion, memo } from '../core/cache.js';
import { sprite, ic } from './icons.js';
import { uploadUrl } from './components.js';
import { categories, trendingTop, promoCount, teamMembers, topSearches, DIVISIONS, activeAds } from '../modules/site/data.js';
import { bn, timeAgo } from '../core/bn.js';

/* অ্যাসেটের ভার্সন — ফাইল বদলালে নিজে থেকেই বদলায়, তাই ব্রাউজার সবসময় নতুনটা পায় */
export const assetVer = (() => {
  const h = crypto.createHash('md5');
  for (const f of ['css/app.css', 'js/app.js', 'js/sw.js']) {
    try { h.update(fs.readFileSync(path.join(config.publicDir, f))); } catch { /* ফাইল নেই */ }
  }
  return h.digest('hex').slice(0, 8);
})();

const THEME_JS = `(function(){try{var t=localStorage.getItem('cc_theme');if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content','#0b1211')}}catch(e){}})()`;

export const siteLogo = () => { const l = setting('logo'); return l ? uploadUrl(l, 'site') : '/img/logo.svg'; };
export const appIcon = (size) => `/icons/icon-${size}.png`;

export function defaultOg(base) {
  const d = setting('default_og');
  if (d && !/\.svg$/i.test(d)) return base + uploadUrl(d, 'site');
  return `${base}/img/default-og.png`;
}

/* ─── হেডার ─── */
async function header(ctx, P) {
  const cats = await categories();
  const tops = await topSearches(6);
  const name = setting('site_name', 'চাকরি সার্কুলার');
  const nav = P.nav || '';
  const promoN = await promoCount();
  const activeCat = nav === 'category' ? P.catSlug : '';
  let promoShown = false;
  const catLinks = [];
  cats.forEach((c, i) => {
    catLinks.push(html`<a href="/category/${c.slug}" class="${activeCat === c.slug ? 'active' : ''}" data-nav-key="cat:${c.slug}">${ic(c.icon)}${c.name}</a>`);
    if (promoN && !promoShown && (['chakri', 'job', 'chakri-circular'].includes(c.slug) || i === 0)) {
      promoShown = true;
      catLinks.push(html`<a href="/promoted" class="promo-link ${nav === 'promoted' ? 'active' : ''}" data-nav-key="promoted">${ic('crown')}বিজ্ঞাপন</a>`);
    }
  });
  const link = (key, href, icon, label) => html`<a href="${href}" class="${nav === key ? 'on' : ''}" data-nav-key="${key}">${ic(icon)}${label}</a>`;
  return html`
<header class="hd"><div class="hd-in">
  <a class="brand" href="/" data-nav-key="home"><img src="${siteLogo()}" alt="${name}" width="40" height="40" fetchpriority="high"><span style="min-width:0"><b>${name}</b><small>${setting('tagline', 'সঠিক তথ্য, আপনার সফলতা')}</small></span></a>
  <nav class="hd-nav" aria-label="প্রধান মেনু">
    ${link('home', '/', 'home', 'হোম')}${link('trending', '/trending', 'flame', 'ট্রেন্ডিং')}${link('notices', '/notices', 'megaphone', 'নোটিশ')}${link('saved', '/saved', 'bookmark', 'সেভড')}
  </nav>
  <span class="hd-sp"></span>
  <button class="ico-btn" id="hdSearchBtn" aria-label="খুঁজুন" aria-expanded="false">${ic('search')}</button>
  <button class="ico-btn theme-btn" id="themeBtn" aria-label="ডার্ক মোড টগল করুন"><svg class="i i-sun" aria-hidden="true"><use href="#i-sun"/></svg><svg class="i i-moon" aria-hidden="true"><use href="#i-moon"/></svg></button>
  <button class="ico-btn" id="sideBtn" aria-label="মেনু খুলুন">${ic('menu')}</button>
</div></header>

<div class="hs" id="hdSearch" aria-hidden="true">
  <div class="hs-mask" data-hs-close></div>
  <div class="hs-panel" role="dialog" aria-label="খুঁজুন"><div class="hs-wrap">
    <form action="/search" method="get" id="hsForm"><div class="hs-row">
      <div class="hs-field">${ic('search', 'mg')}<input type="search" name="q" id="hsInput" placeholder="চাকরি, প্রতিষ্ঠান বা কীওয়ার্ড খুঁজুন…" autocomplete="off" aria-label="সার্চ" enterkeyhint="search"><button type="button" class="hs-clear" id="hsClear" aria-label="বন্ধ করুন">${ic('x')}</button></div>
      <button class="hs-go" type="submit" aria-label="খুঁজুন">${ic('search')}</button>
    </div></form>
    <div id="hsRecentBox" hidden><div class="hs-lbl">${ic('history')}সাম্প্রতিক অনুসন্ধান</div><div class="hs-chips" id="hsRecent"></div></div>
    ${tops.length ? html`<div class="hs-lbl">${ic('trend')}সবাই যা খুঁজছে</div><div class="hs-chips">${tops.map((t) => html`<a class="hs-chip" href="/search?q=${encodeURIComponent(t.term)}">${ic('search')}${t.term}</a>`)}</div>` : ''}
    <div class="hs-lbl">${ic('folder')}ক্যাটাগরি</div><div class="hs-chips">${cats.map((c) => html`<a class="hs-chip" href="/category/${c.slug}">${ic(c.icon)}${c.name}</a>`)}</div>
    <div class="hs-lbl">${ic('pin')}বিভাগ অনুযায়ী</div><div class="hs-chips">${DIVISIONS.map((d) => html`<a class="hs-chip" href="/search?div=${encodeURIComponent(d)}">${ic('map')}${d}</a>`)}</div>
  </div></div>
</div>

<nav class="catbar" aria-label="ক্যাটাগরি"><div class="catbar-in" id="catbar">
  <a href="/" class="${nav === 'home' ? 'active' : ''}" data-nav-key="home">${ic('home')}হোম</a>${catLinks}
</div></nav>`;
}

/* ─── সাইডবার (ড্রয়ার) ─── */
async function sidebar() {
  const cats = await categories();
  const name = setting('site_name', 'চাকরি সার্কুলার');
  const soc = [['fb', 'facebook', 'Facebook'], ['twitter', 'twitter', 'X'], ['telegram', 'send', 'Telegram'], ['whatsapp', 'chat', 'WhatsApp']]
    .filter(([k]) => setting(k));
  return html`
<div class="sb-mask" id="sbMask"></div>
<aside class="sb" id="sb" aria-label="সাইডবার" aria-hidden="true">
  <div class="sb-top"><img src="${siteLogo()}" alt="" width="40" height="40"><div><b>${name}</b><small>${setting('tagline', 'সঠিক তথ্য, আপনার সফলতা')}</small></div><button class="sb-close" id="sbClose" aria-label="বন্ধ করুন">${ic('x')}</button></div>
  <div class="sb-body">
    <button class="sb-toggle" id="themeRow" type="button"><span style="display:flex;gap:10px;align-items:center">${ic('moon')}ডার্ক মোড</span><span class="switch"></span></button>
    <div class="sb-lbl">মূল মেনু</div>
    <a class="sb-i" href="/">${ic('home')}হোম</a>
    <a class="sb-i" href="/trending">${ic('flame')}ট্রেন্ডিং</a>
    <a class="sb-i" href="/search">${ic('search')}খুঁজুন</a>
    <a class="sb-i" href="/saved">${ic('bookmark')}সেভ করা পোস্ট</a>
    <a class="sb-i" href="/notices">${ic('megaphone')}নোটিশ</a>
    <button class="sb-i" type="button" data-open-notify style="width:100%">${ic('bell')}নতুন চাকরির খবর পান</button>
    <div class="sb-lbl">ক্যাটাগরি</div>
    ${cats.map((c) => html`<a class="sb-i" href="/category/${c.slug}">${ic(c.icon)}${c.name}</a>`)}
    <div class="sb-lbl">ইনফরমেশন</div>
    <a class="sb-i" href="/about">${ic('info')}আমাদের সম্পর্কে</a>
    <a class="sb-i" href="/team">${ic('users')}আমাদের টিম</a>
    <a class="sb-i" href="/privacy">${ic('shield')}গোপনীয়তা ও নিরাপত্তা</a>
    <a class="sb-i" href="/report">${ic('flag')}রিপোর্ট বা প্রমোশন</a>
    ${soc.length ? html`<div class="sb-social">${soc.map(([k, i, l]) => html`<a href="${setting(k)}" target="_blank" rel="noopener" aria-label="${l}">${ic(i)}</a>`)}</div>` : ''}
  </div>
</aside>`;
}

/* ─── টিম (ফুটারে) ─── */
export function teamCard(m) {
  const soc = [['facebook', 'facebook'], ['linkedin', 'linkedin'], ['whatsapp', 'chat']].filter(([k]) => m[k]);
  const ini = Array.from(String(m.name || '?'))[0];
  return html`<div class="tm">
    <div class="tm-ph">${m.photo ? html`<img src="${uploadUrl(m.photo, 'team')}" alt="${m.name}" loading="lazy" width="76" height="76">` : html`<span class="ini">${ini}</span>`}</div>
    <b>${m.name}</b>${m.role ? html`<small>${m.role}</small>` : ''}
    ${m.bio ? html`<p class="tm-bio">${m.bio}</p>` : ''}
    ${soc.length ? html`<div class="tm-soc">${soc.map(([k, i]) => html`<a href="${m[k]}" target="_blank" rel="noopener nofollow" aria-label="${k}">${ic(i)}</a>`)}</div>` : ''}
  </div>`;
}

async function footer() {
  const cats = await categories();
  const team = await teamMembers();
  const name = setting('site_name', 'চাকরি সার্কুলার');
  const email = setting('contact_email', 'cakricircular.support@gmail.com');
  const appName = setting('app_name', 'Cakricircular');
  const soc = [['fb', 'facebook', 'Facebook'], ['twitter', 'twitter', 'X'], ['telegram', 'send', 'Telegram'], ['whatsapp', 'chat', 'WhatsApp']].filter(([k]) => setting(k));
  const showTeam = team.length && setting('team_show', '1') !== '0';
  return html`
<footer class="ft">
  ${showTeam ? html`<div class="ft-in" style="display:block;margin-bottom:8px"><section class="team" aria-label="আমাদের টিম">
    <div class="team-h"><div><h3>${ic('users')}${setting('team_title', 'আমাদের টিম')}</h3><p>${setting('team_sub', 'যাদের পরিশ্রমে প্রতিদিন নতুন তথ্য আপনার কাছে পৌঁছায়')}</p></div></div>
    <div class="team-row">${team.map(teamCard)}</div></section></div>` : ''}
  <div class="ft-in">
    <div>
      <div class="ft-brand"><img src="${siteLogo()}" alt="" width="44" height="44" loading="lazy"><span><b>${name}</b><small>${setting('tagline', 'সঠিক তথ্য, আপনার সফলতা')}</small></span></div>
      <p>${setting('footer_about', 'বাংলাদেশের সরকারি-বেসরকারি চাকরির সার্কুলার, ভর্তি বিজ্ঞপ্তি ও পরীক্ষার ফলাফল — প্রতিদিন হালনাগাদ, এক জায়গায়।')}</p>
      <h4 style="margin-top:18px">${ic('headset')}যোগাযোগ করুন</h4>
      <ul><li>${ic('mail')}<a href="mailto:${email}">${email}</a></li><li>${ic('pin')}${setting('location', 'Bangladesh')}</li></ul>
      ${soc.length ? html`<div class="soc">${soc.map(([k, i, l]) => html`<a href="${setting(k)}" target="_blank" rel="noopener" aria-label="${l}">${ic(i)}</a>`)}</div>` : ''}
    </div>
    <div><h4>${ic('link')}দ্রুত লিংক</h4><ul>
      <li>${ic('home')}<a href="/">হোম</a></li>
      ${cats.slice(0, 6).map((c) => html`<li>${ic(c.icon)}<a href="/category/${c.slug}">${c.name}</a></li>`)}
    </ul></div>
    <div><h4>${ic('info')}ইনফরমেশন</h4><ul>
      <li>${ic('info')}<a href="/about">আমাদের সম্পর্কে</a></li>
      <li>${ic('users')}<a href="/team">আমাদের টিম</a></li>
      <li>${ic('shield')}<a href="/privacy">গোপনীয়তা ও নিরাপত্তা</a></li>
      <li>${ic('flag')}<a href="/report">রিপোর্ট বা প্রমোশন</a></li>
      <li>${ic('megaphone')}<a href="/notices">নোটিশ</a></li>
      <li>${ic('bookmark')}<a href="/saved">সেভ করা পোস্ট</a></li>
    </ul>
    <div class="appcard" id="appCard" hidden><button class="ac-btn" id="appInstallBtn" type="button" aria-label="${appName} অ্যাপ ইনস্টল করুন">
      <span class="ac-ico"><svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="20,12 20,88 54,50" fill="#4285F4"/><polygon points="20,12 62,35 54,50" fill="#34A853"/><polygon points="62,35 88,50 62,65 54,50" fill="#FBBC04"/><polygon points="20,88 54,50 62,65" fill="#EA4335"/></svg></span>
      <span class="ac-tx"><small>এখনই ইনস্টল করুন</small><b>App Install</b></span><span class="ac-dl">${ic('arrow-d')}</span></button></div>
    </div>
  </div>
  <div class="ft-bot"><span>${setting('copyright', `© ${bn(new Date().getFullYear())} চাকরি সার্কুলার — সর্বস্বত্ব সংরক্ষিত।`)}</span>${setting('footer_slogan', 'ডিজিটাল বাংলাদেশ, স্বচ্ছ বাংলাদেশ') ? html`<span class="ft-slogan">${setting('footer_slogan', 'ডিজিটাল বাংলাদেশ, স্বচ্ছ বাংলাদেশ')}</span>` : ''}</div>
</footer>`;
}

const bottomNav = (nav) => html`
<nav class="bn" id="bottomNav" aria-label="মোবাইল মেনু"><div class="bn-in">
  <a href="/" data-nav-key="home" class="${nav === 'home' ? 'on' : ''}"><span class="bn-ic">${ic('home')}</span>হোম</a>
  <a href="/trending" data-nav-key="trending" class="${nav === 'trending' ? 'on' : ''}"><span class="bn-ic">${ic('flame')}</span>ট্রেন্ডিং</a>
  <a href="/search" data-nav-key="search" class="${nav === 'search' ? 'on' : ''}"><span class="bn-ic">${ic('search')}</span>খুঁজুন</a>
  <a href="/saved" data-nav-key="saved" class="${nav === 'saved' ? 'on' : ''}"><span class="bn-ic">${ic('bookmark')}</span>সেভড</a>
  <a href="/notices" data-nav-key="notices" class="${nav === 'notices' ? 'on' : ''}"><span class="badge" id="noticeBadge" data-n="0"></span><span class="bn-ic">${ic('bell')}</span>নোটিশ</a>
</div></nav>`;

/* ─── ডেস্কটপের ডান পাশের কলাম ─── */
export async function asideHtml() {
  return memo('aside', 60_000, async () => {
    const cats = await categories();
    const tops = await trendingTop(5);
    const ads = await activeAds();
    const ad = ads[0];
    return html`<aside class="aside" aria-label="পাশের তথ্য">
      <div class="card"><h4>${ic('folder')}ক্যাটাগরি</h4><div class="a-cats">${cats.map((c) => html`<a class="a-cat" href="/category/${c.slug}">${ic(c.icon)}${c.name}</a>`)}</div></div>
      <div class="card"><h4>${ic('flame')}এখন ট্রেন্ডিং</h4><div class="a-list">${tops.map((t, i) => html`<a class="a-it" href="/post/${t.slug}"><span class="n">${bn(i + 1)}</span><span><b>${t.title}</b><small>${timeAgo(t.published_at)}</small></span></a>`)}</div></div>
      ${ad ? html`<div class="card a-ad"><h4>${ic('crown')}প্রমোটেড</h4><a class="a-it" href="/post/${ad.slug}"><span class="n">${ic('star')}</span><span><b>${ad.title}</b><small>${ad.company || ad.cat_name || ''}</small></span></a><a class="btn sm ghost block" style="margin-top:8px" href="/promoted">সব বিজ্ঞাপন দেখুন</a></div>` : ''}
      <div class="card"><h4>${ic('bell')}নতুন চাকরির খবর</h4><p style="font-size:.84rem;color:var(--muted);margin:-4px 0 12px">নতুন বিজ্ঞপ্তি এলেই সবার আগে জানুন — নোটিফিকেশন বা ইমেইলে।</p><button class="btn block" type="button" data-open-notify>${ic('bell')}চালু করুন</button></div>
    </aside>`;
  });
}

function jsonLd(ctx, P) {
  const name = setting('site_name', 'চাকরি সার্কুলার');
  const b = ctx.base;
  const graph = [
    { '@type': 'Organization', '@id': `${b}/#organization`, name: 'চাকরি সার্কুলার', alternateName: ['CakriCircular', 'CakriCircular.com', 'চাকরির সার্কুলার', 'চাকরির খবর', 'আজকের চাকরি'], url: `${b}/`,
      logo: { '@type': 'ImageObject', url: b + siteLogo() }, email: setting('contact_email', ''),
      address: { '@type': 'PostalAddress', addressCountry: 'BD', addressLocality: setting('location', 'Bangladesh') },
      sameAs: [setting('fb'), setting('twitter'), setting('telegram')].filter(Boolean) },
    { '@type': 'WebSite', '@id': `${b}/#website`, url: `${b}/`, name, inLanguage: 'bn-BD', publisher: { '@id': `${b}/#organization` },
      potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${b}/search?q={search_term_string}` }, 'query-input': 'required name=search_term_string' } },
    ...(P.schema || []),
  ];
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

/** পুরো HTML পেজ */
export async function renderPage(ctx, P) {
  const name = setting('site_name', 'চাকরি সার্কুলার');
  const b = ctx.base;
  const title = P.title || name;
  const desc = P.desc || setting('meta_description', '');
  const canonical = P.canonical ? (P.canonical.startsWith('http') ? P.canonical : b + P.canonical) : b + ctx.path;
  const robots = P.robots || 'index, follow';
  const og = P.og ? (P.og.startsWith('http') ? P.og : b + P.og) : defaultOg(b);
  const v = assetVer;
  const [hdr, sb, ft, aside] = await Promise.all([header(ctx, P), sidebar(), footer(), P.noAside ? '' : asideHtml()]);
  const appName = setting('app_name', 'Cakricircular');
  return '<!doctype html>' + html`<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0f766e">
<meta name="color-scheme" content="light dark">
<title>${title}</title>
<meta name="description" content="${desc}">
${setting('meta_keywords') ? html`<meta name="keywords" content="${setting('meta_keywords')}">` : ''}
<link rel="canonical" href="${canonical}">
<meta name="robots" content="${robots}, max-image-preview:large">
<meta property="og:site_name" content="${name}"><meta property="og:type" content="${P.ogType || 'website'}">
<meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:url" content="${canonical}">
<meta property="og:image" content="${og}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:locale" content="bn_BD">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${desc}"><meta name="twitter:image" content="${og}">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="192x192" href="${appIcon(192)}">
<link rel="apple-touch-icon" href="${appIcon(180)}">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${appName}"><meta name="apple-mobile-web-app-status-bar-style" content="default">
${setting('google_verification') ? html`<meta name="google-site-verification" content="${setting('google_verification')}">` : ''}
<link rel="preload" href="/fonts/hind-siliguri-bengali-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/hind-siliguri-bengali-600.woff2" as="font" type="font/woff2" crossorigin>
<script>${raw(THEME_JS)}</script>
<link rel="stylesheet" href="/css/fonts.css?v=${v}"><link rel="stylesheet" href="/css/app.css?v=${v}">
${P.fa ? html`<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css" media="print" onload="this.media='all'">` : ''}
<script type="application/ld+json">${raw(jsonLd(ctx, P))}</script>
</head>
<body data-nav="${P.nav || ''}">
<a class="skip" href="#app">মূল কনটেন্টে যান</a>
${sprite()}
${hdr}${sb}
<div id="spa-progress"><span></span></div>
<div class="offline-bar" id="offlineBar">${ic('wifioff')}ইন্টারনেট নেই — সেভ করা পোস্ট দেখা যাবে</div>
<div class="container${P.noAside ? ' solo' : ''}" id="pageWrap">
<main id="app" data-page="${P.page || ''}" data-cat="${P.catSlug || ''}">${P.body}</main>
${aside}
</div>
${ft}
${bottomNav(P.nav || '')}
<div class="toast-host" id="toastHost" aria-live="polite"></div>
<script>window.CC={siteName:${raw(JSON.stringify(name))},appName:${raw(JSON.stringify(appName))},ver:${raw(JSON.stringify(contentVersion()))},asset:${raw(JSON.stringify(v))},vapid:${raw(JSON.stringify(setting('vapid_public', '')))},cats:${raw(JSON.stringify((await categories()).map((c) => ({ id: c.id, name: c.name }))))}};
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__ccBIP=e});
window.addEventListener('appinstalled',function(){try{localStorage.setItem('cc_installed','1')}catch(x){}});</script>
<script src="/js/app.js?v=${v}" defer></script>
</body></html>`.toString();
}
