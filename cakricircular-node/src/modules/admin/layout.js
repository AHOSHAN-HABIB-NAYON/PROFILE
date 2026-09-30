/* ─────────────────────────────────────────────
   এডমিনের কাঠামো: সাইডবার (ডেস্কটপ) / ড্রয়ার + বটম মেনু (মোবাইল), টপ বার
   ───────────────────────────────────────────── */
import { html, raw, esc } from '../../core/html.js';
import { sprite, ic } from '../../ui/icons.js';
import { setting } from '../../core/settings.js';
import { siteLogo, assetVer } from '../../ui/layout.js';
import { bn } from '../../core/bn.js';

export const MENU = [
  { g: 'মূল' },
  { k: 'dashboard', t: 'ড্যাশবোর্ড', i: 'dash', p: '' },
  { k: 'posts', t: 'পোস্ট সমূহ', i: 'file-text', p: 'posts', badge: 'review' },
  { k: 'post', t: 'নতুন পোস্ট', i: 'plus', p: 'posts' },
  { g: 'কনটেন্ট' },
  { k: 'categories', t: 'ক্যাটাগরি', i: 'folder', p: 'categories' },
  { k: 'banners', t: 'ব্যানার', i: 'image', p: 'banners' },
  { k: 'ads', t: 'বিজ্ঞাপন (প্রিমিয়াম)', i: 'crown', p: 'posts' },
  { k: 'notices', t: 'নোটিশ', i: 'megaphone', p: 'notices' },
  { k: 'team', t: 'আমাদের টিম', i: 'users', p: 'settings' },
  { g: 'পর্যবেক্ষণ' },
  { k: 'reports', t: 'রিপোর্ট', i: 'flag', p: 'reports', badge: 'reports' },
  { k: 'analytics', t: 'অ্যানালিটিকস', i: 'activity', p: 'analytics' },
  { g: 'সিস্টেম' },
  { k: 'automation', t: 'অটোমেশন', i: 'bot', p: 'settings' },
  { k: 'notify', t: 'নোটিফিকেশন ও ইমেইল', i: 'bell', p: 'settings' },
  { k: 'users', t: 'এডমিন ও মডারেটর', i: 'shield', p: 'users' },
  { k: 'settings', t: 'সেটিংস', i: 'cog', p: 'settings' },
  { k: 'profile', t: 'আমার অ্যাকাউন্ট', i: 'user', p: '' },
];

const THEME_JS = `(function(){try{if(localStorage.getItem('cc_theme')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}})()`;

export function adminHead(title) {
  const v = assetVer;
  return html`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#0f766e">
<title>${title} — এডমিন</title><link rel="icon" href="/favicon.ico"><script>${raw(THEME_JS)}</script>
<link rel="stylesheet" href="/css/fonts.css?v=${v}"><link rel="stylesheet" href="/css/app.css?v=${v}"><link rel="stylesheet" href="/css/admin.css?v=${v}">`;
}

export function loginPage({ slug, err = '', token }) {
  return '<!doctype html>' + html`<html lang="bn"><head>${adminHead('লগইন')}</head><body class="adm">${sprite()}
<div class="login-wrap"><div class="login-card"><img src="${siteLogo()}" alt="" width="78" height="78">
<h1>${setting('site_name', 'চাকরি সার্কুলার')}</h1><p>এডমিন প্যানেলে প্রবেশ করুন</p>
${err ? html`<div class="msg err">${ic('alert')}${err}</div>` : ''}
<form method="post" action="/${slug}"><input type="hidden" name="_t" value="${token}">
<div class="f-row"><label for="u">ইউজারনেম</label><input id="u" type="text" name="username" autocomplete="username" autocapitalize="off" required autofocus></div>
<div class="f-row"><label for="p">পাসওয়ার্ড</label><input id="p" type="password" name="password" autocomplete="current-password" required></div>
<button class="btn block" type="submit">${ic('lock')}প্রবেশ করুন</button></form></div></div></body></html>`;
}

export function shell({ me, slug, nav, title, body, flash, counts = {}, can }) {
  const au = (p = '') => `/${slug}${p ? `/${p}` : ''}`;
  const items = MENU.filter((m) => m.g || (m.p === '' || can(m.p)));
  const side = items.map((m) => {
    if (m.g) return html`<div class="lbl">${m.g}</div>`;
    const c = m.badge ? counts[m.badge] : 0;
    return html`<a href="${au(m.k === 'dashboard' ? '' : m.k)}" class="${nav === m.k ? 'on' : ''}"><span class="mi">${ic(m.i)}</span>${m.t}${c ? html`<span class="cnt">${bn(c)}</span>` : ''}</a>`;
  });
  const bn5 = [['dashboard', 'dash', 'হোম', ''], ['posts', 'file-text', 'পোস্ট', 'posts'], ['post', 'plus', 'নতুন', 'posts'], ['reports', 'flag', 'রিপোর্ট', 'reports'], ['__more', 'menu', 'আরও', '']].filter((x) => !x[3] || can(x[3]));
  return '<!doctype html>' + html`<html lang="bn"><head>${adminHead(title)}</head><body class="adm" data-nav="${nav}">${sprite()}
<div class="a-wrap">
<aside class="a-side" id="aSide"><div class="a-brand"><img src="${siteLogo()}" alt="" width="42" height="42"><div><b>${setting('site_name', 'চাকরি সার্কুলার')}</b><small>এডমিন প্যানেল</small></div></div>
  <nav class="a-menu">${side}<div class="lbl">অন্যান্য</div><a href="/" target="_blank" rel="noopener"><span class="mi">${ic('external')}</span>সাইট দেখুন</a><a class="danger" href="${au('logout')}"><span class="mi">${ic('logout')}</span>লগআউট</a></nav></aside>
<div class="a-mask" id="aMask"></div>
<div class="a-main"><header class="a-top"><button class="ico-btn burger" id="admBurger" aria-label="মেনু">${ic('menu')}</button><h1>${title}</h1>
  <a class="ico-btn" href="/" target="_blank" rel="noopener" aria-label="সাইট দেখুন" title="সাইট দেখুন">${ic('external')}</a>
  <button class="ico-btn theme-btn" id="admTheme" aria-label="থিম"><svg class="i i-sun" aria-hidden="true"><use href="#i-sun"/></svg><svg class="i i-moon" aria-hidden="true"><use href="#i-moon"/></svg></button></header>
<main class="a-body">${flash ? html`<div class="msg ${flash.t}">${ic(flash.t === 'ok' ? 'check-circle' : 'alert')}${flash.m}</div>` : ''}${body}</main></div></div>
<nav class="bn a-bn" aria-label="এডমিন মেনু"><div class="bn-in">${bn5.map(([k, i, l]) => k === '__more'
    ? html`<button type="button" data-open-menu><span class="bn-ic">${ic(i)}</span>${l}</button>`
    : html`<a href="${au(k === 'dashboard' ? '' : k)}" class="${nav === k ? 'on' : ''} ${k === 'post' ? 'plus' : ''}"><span class="bn-ic">${ic(i)}</span>${l}</a>`)}</div></nav>
<div class="toast-host" id="toastHost"></div><script src="/js/admin.js?v=${assetVer}" defer></script></body></html>`;
}

/* ─── ছোট UI অংশ ─── */
export const card = (title, icon, body, cls = '') => html`<section class="a-card ${cls}">${title ? html`<h2 class="a-h"><span class="hi">${ic(icon || 'info')}</span>${title}</h2>` : ''}${body}</section>`;
export const stat = ({ icon, tone = '', label, value, sub = '', href }) => {
  const inner = html`<span class="si ${tone}">${ic(icon)}</span><span class="sx"><span class="sl">${label}</span><b>${value}</b><span>${sub}</span></span>`;
  return href ? html`<a class="stat" href="${href}">${inner}</a>` : html`<div class="stat">${inner}</div>`;
};
export const field = (label, control, hint = '') => html`<div class="f-row"><label>${label}</label>${control}${hint ? html`<div class="hint">${hint}</div>` : ''}</div>`;
export const input = (name, val = '', o = {}) => html`<input type="${o.type || 'text'}" name="${name}" value="${val ?? ''}" ${raw(o.ph ? `placeholder="${esc(o.ph)}"` : '')} ${raw(o.max ? `maxlength="${o.max}"` : '')} ${raw(o.req ? 'required' : '')} ${raw(o.extra || '')}>`;
export const sel = (name, val, opts, o = {}) => html`<select name="${name}">${o.empty !== undefined ? html`<option value="">${o.empty}</option>` : ''}${opts.map(([v, l]) => html`<option value="${v}" ${raw(String(v) === String(val ?? '') ? 'selected' : '')}>${l}</option>`)}</select>`;
export const swRow = (name, on, title, desc = '') => html`<div class="sw-row"><div class="tx"><b>${title}</b>${desc ? html`<span>${desc}</span>` : ''}</div><label class="sw"><input type="checkbox" name="${name}" value="1" ${raw(on ? 'checked' : '')}><i></i></label></div>`;
export const csrfField = (t) => html`<input type="hidden" name="_t" value="${t}">`;
export const adminPager = (page, pages, href) => {
  if (pages < 2) return '';
  const w = 2; const out = []; let prev = 0;
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= w) { if (prev && i - prev > 1) out.push(html`<span class="pg dots">…</span>`); out.push(i === page ? html`<span class="pg active">${bn(i)}</span>` : html`<a class="pg" href="${href(i)}">${bn(i)}</a>`); prev = i; }
  return html`<nav class="pager">${out}</nav>`;
};
