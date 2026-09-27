/* LifeTrack SPA: fetch-driven navigation with directional transitions, lazy-loaded views, PWA wiring. */
import { $, $$, el, html, raw, icon, api, state, t, loadLang, on, emit, toast, closeAllSheets, topSheet, reduceMotion, clearCache, money, skipPop, switchTheme, sleep } from './core.js';

const ROUTES = [
  // [pattern, module, export, {depth, idx, auth}]
  ['/app/login', 'auth', 'login', { pub: true }], ['/app/register', 'auth', 'register', { pub: true }], ['/app/forgot', 'auth', 'forgot', { pub: true }],
  ['/app/reset-password', 'auth', 'reset', { pub: true }], ['/app/verify-email', 'auth', 'verify', { pub: true, any: true }], ['/app/2fa', 'auth', 'mfa', { pub: true }],
  ['/app', 'home', 'default', { idx: 0, tab: 'home' }],
  ['/app/accounts', 'accounts', 'list', { idx: 1, tab: 'accounts' }], ['/app/accounts/:id', 'accounts', 'detail', { depth: 2, idx: 1, tab: 'accounts' }],
  ['/app/transactions', 'transactions', 'default', { idx: 2, tab: 'transactions' }],
  ['/app/goals', 'goals', 'default', { idx: 3, tab: 'goals' }],
  ['/app/reports', 'reports', 'default', { idx: 4, tab: 'reports' }],
  ['/app/calendar', 'calendar', 'default', { idx: 5, tab: 'calendar' }],
  ['/app/loans', 'loans', 'list', { idx: 6, tab: 'loans' }], ['/app/loans/:kind/:id', 'loans', 'detail', { depth: 2, idx: 6, tab: 'loans' }],
  ['/app/investments', 'misc', 'investments', { idx: 7, tab: 'investments' }],
  ['/app/mood', 'mood', 'default', { idx: 8, tab: 'mood' }],
  ['/app/notes', 'misc', 'notes', { idx: 9, tab: 'notes' }],
  ['/app/reminders', 'misc', 'reminders', { idx: 10, tab: 'reminders' }],
  ['/app/notifications', 'misc', 'notifications', { idx: 11, tab: 'notifications' }],
  ['/app/more', 'more', 'default', { idx: 12, tab: 'more' }],
  ['/app/settings', 'settings', 'index', { idx: 13, tab: 'settings' }], ['/app/settings/:section', 'settings', 'section', { depth: 2, idx: 13, tab: 'settings' }],
];
const MORE_TABS = ['more', 'settings', 'reports', 'calendar', 'loans', 'investments', 'mood', 'notes', 'reminders', 'notifications', 'transactions'];

function match(path) {
  const clean = path.replace(/\/+$/, '') || '/app';
  for (const [pat, mod, exp, meta] of ROUTES) {
    const pp = pat.split('/'); const cp = clean.split('/');
    if (pp.length !== cp.length) continue;
    const params = {}; let okm = true;
    pp.forEach((p, i) => { if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(cp[i]); else if (p !== cp[i]) okm = false; });
    if (okm) return { mod, exp, meta: { depth: 1, ...meta }, params };
  }
  return null;
}

let current = null; // { el, route, view }
let navToken = 0;
const modules = {};
const loadModule = (name) => (modules[name] = modules[name] || import(`./views/${name}.js`));

export async function navigate(path, { replace = false, dir = null } = {}) {
  const url = new URL(path, location.origin);
  if (url.pathname === location.pathname && url.search === location.search && current && !replace) { current.view?.refresh?.(); return; }
  if (replace) history.replaceState({ depth: 0 }, '', url.pathname + url.search);
  else history.pushState({}, '', url.pathname + url.search);
  await render(dir);
}
export const go = navigate;

async function render(forcedDir = null) {
  const token = ++navToken;
  let r = match(location.pathname);
  if (!r) { history.replaceState({}, '', '/app'); r = match('/app'); }
  const loggedIn = !!state.me;
  if (!r.meta.pub && !loggedIn) { history.replaceState({}, '', '/app/login?next=' + encodeURIComponent(location.pathname + location.search)); r = match('/app/login'); }
  else if (r.meta.pub && !r.meta.any && loggedIn && r.exp !== 'mfa') { history.replaceState({}, '', '/app'); r = match('/app'); }

  document.body.classList.toggle('auth-mode', !!r.meta.pub);
  closeAllSheets();
  const mod = await loadModule(r.mod);
  if (token !== navToken) return;
  const query = Object.fromEntries(new URLSearchParams(location.search));
  const ctx = { params: r.params, query, path: location.pathname, navigate, meta: r.meta };
  const view = await mod[r.exp](ctx);
  if (token !== navToken) { view?.destroy?.(); return; }
  const page = view.el; page.classList.add('page');

  // Direction: deeper → forward, shallower → back, siblings by tab order.
  let dir = forcedDir;
  if (!dir && current) {
    const a = current.meta; const b = r.meta;
    if (a.pub || b.pub) dir = 'fade';
    else if (b.depth > a.depth) dir = 'fwd';
    else if (b.depth < a.depth) dir = 'back';
    else if (b.idx !== a.idx) dir = b.idx > a.idx ? 'fwd' : 'back';
    else dir = 'fade';
  }
  const stack = $('#view');
  const prev = current;
  if (prev && !reduceMotion()) {
    const y = window.scrollY;
    prev.el.style.marginTop = `-${y}px`;
    prev.el.classList.add(`page-out-${dir}`);
    setTimeout(() => prev.el.remove(), 300);
  } else if (prev) prev.el.remove();
  prev?.view?.destroy?.();
  window.scrollTo(0, 0);
  page.classList.add(`page-in-${dir || 'up'}`);
  stack.appendChild(page);
  page.addEventListener('animationend', () => page.classList.remove(`page-in-${dir || 'up'}`), { once: true });
  current = { el: page, meta: r.meta, view };
  document.title = (view.title ? view.title + ' · ' : '') + (state.config?.site || 'LifeTrack');
  highlightNav(r.meta.tab);
  paintToggles();
  setUnread(state.unread || 0);
  requestAnimationFrame(() => { const h = page.querySelector('h1'); if (h && document.activeElement === document.body) { h.setAttribute('tabindex', '-1'); } });
}

function highlightNav(tab) {
  $$('.tabbar .tab').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab || (a.dataset.tab === 'more' && MORE_TABS.includes(tab))));
  $$('.side-nav a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
}

/* ---------- Link interception (AJAX navigation) ---------- */
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank' || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith('/app')) return;
  e.preventDefault();
  navigate(url.pathname + url.search, { dir: a.dataset.dir || null });
});
window.addEventListener('popstate', () => {
  if (skipPop.n > 0) { skipPop.n--; return; } // a sheet closed itself — the page stays as is
  // Back button closes the top sheet first (native-app feel)
  const s = topSheet();
  if (s) { s.close(true); return; }
  render(null);
});

/* ---------- Theme ---------- */
export function applyTheme(theme, { save = true, animate = true, ev = null } = {}) {
  const th = theme === 'dark' ? 'dark' : 'light';
  const root = document.documentElement;
  if (animate) switchTheme(th, ev); else root.setAttribute('data-theme', th);
  $('meta[name="theme-color"]')?.setAttribute('content', th === 'dark' ? '#070C18' : '#F4F6FB');
  try { localStorage.setItem('lt-theme', th); } catch {}
  paintToggles();
  if (save && state.me) api.patch('/api/me/profile', { theme: th }).then((d) => { state.profile = d.profile; }).catch(() => {});
  emit('theme', th);
}
function paintToggles() {
  const th = document.documentElement.getAttribute('data-theme');
  $$('[data-theme-toggle]').forEach((b) => { b.innerHTML = String(icon(th === 'dark' ? 'sun' : 'moon')); b.setAttribute('aria-label', t(th === 'dark' ? 'theme.to_light' : 'theme.to_dark')); b.title = b.getAttribute('aria-label'); });
}
export const toggleTheme = (ev) => applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', { ev });
document.addEventListener('click', (e) => { if (e.target.closest('[data-theme-toggle]')) toggleTheme(e); });

/* ---------- Session ---------- */
export async function refreshMe() {
  try {
    const d = await api.get('/api/me', { force: true });
    state.me = d.user; state.profile = d.profile;
    setUnread(d.unread);
    try { localStorage.setItem('lt-me', JSON.stringify({ user: d.user, profile: d.profile })); } catch {}
    return d;
  } catch (e) {
    if (e.status === 401 || e.status === 403) { state.me = null; state.profile = null; try { localStorage.removeItem('lt-me'); } catch {} return null; }
    if (e.status === 0) throw e; // network problem — not a logout
    state.me = null; state.profile = null;
    return null;
  }
}
export async function afterLogin(next) {
  await refreshMe();
  if (state.profile) {
    applyTheme(state.profile.theme, { save: false });
    if (state.profile.language !== state.lang) await loadLang(state.profile.language);
  }
  renderChrome();
  import('./push.js').then((m) => m.syncSubscription()).catch(() => {});
  if (next === '/admin' || (next && next.startsWith('/admin/'))) { location.href = next; return; }
  navigate(next && next.startsWith('/app') ? next : '/app', { replace: true, dir: 'fade' });
}
on('auth:lost', () => {
  if (!state.me) return;
  state.me = null; state.profile = null; clearCache(); try { localStorage.removeItem('lt-me'); } catch {} renderChrome();
  toast(t('auth.session_expired'), { type: 'info' });
  navigate('/app/login', { replace: true });
});

export function setUnread(n) {
  state.unread = n;
  $$('[data-unread]').forEach((b) => {
    let d = b.querySelector('.dot, .count');
    if (!n) { d?.remove(); return; }
    if (!d) { d = el(b.closest('.side-nav') ? '<span class="count"></span>' : '<span class="dot"></span>'); b.appendChild(d); }
    d.textContent = n > 99 ? '99+' : n;
  });
}
async function pollUnread() {
  if (!state.me || document.hidden) return;
  try { const d = await api.get('/api/notifications/unread'); if (d.unread > (state.unread || 0)) emit('notifications:new', d.unread); setUnread(d.unread); } catch {}
}
setInterval(pollUnread, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollUnread(); });

/* ---------- Chrome: sidebar + tabbar + topbar ---------- */
const initials = (n) => (n || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
export const avatar = (u, size = '') => (u?.avatar ? html`<img class="avatar ${size}" src="${u.avatar}" alt="" referrerpolicy="no-referrer">` : html`<span class="avatar ${size}">${initials(u?.name)}</span>`);

function brandHtml() {
  const c = state.config || {};
  const mark = c.logo ? html`<img src="${c.logo}" alt="">` : html`<svg aria-hidden="true"><use href="#logo"/></svg>`;
  return html`${mark}<span ${c.logo && !c.logoShowName ? 'hidden' : ''}><b>${c.site || 'LifeTrack'}</b><small>${c.tagline || ''}</small></span>`;
}

export function renderChrome() {
  const side = $('.sidebar'); const tabbar = $('.tabbar'); const top = $('.topbar');
  if (!state.me) { side.innerHTML = ''; tabbar.innerHTML = ''; top.innerHTML = ''; return; }
  const nav = [
    ['home', '/app', 'home', 'nav.dashboard'], ['transactions', '/app/transactions', 'layers', 'nav.transactions'], ['accounts', '/app/accounts', 'wallet', 'nav.accounts'],
    ['goals', '/app/goals', 'target', 'nav.goals'], ['reports', '/app/reports', 'pie', 'nav.reports'], ['calendar', '/app/calendar', 'calendar', 'nav.calendar'],
    'sep:nav.life', ['loans', '/app/loans', 'lend', 'nav.loans'], ['investments', '/app/investments', 'trend-up', 'nav.investments'], ['mood', '/app/mood', 'smile', 'nav.mood'],
    ['notes', '/app/notes', 'note', 'nav.notes'], ['reminders', '/app/reminders', 'alarm', 'nav.reminders'],
    'sep:nav.account', ['notifications', '/app/notifications', 'bell', 'nav.notifications'], ['settings', '/app/settings', 'settings', 'nav.settings'],
  ];
  side.innerHTML = String(html`<a class="side-brand" href="/app">${brandHtml()}</a>
    <nav class="side-nav" aria-label="${t('nav.main')}">${nav.map((n) => typeof n === 'string' ? html`<div class="sep">${t(n.slice(4))}</div>` : html`<a href="${n[1]}" data-tab="${n[0]}" ${n[0] === 'notifications' ? raw('data-unread') : ''}>${icon(n[2])}<span>${t(n[3])}</span></a>`)}
    ${state.me.canAdmin ? html`<div class="sep">${t('nav.admin')}</div><a href="/admin" data-external>${icon('shield')}<span>${t('nav.admin_panel')}</span></a>` : ''}</nav>
    <a class="side-user" href="/app/settings/profile">${avatar(state.me)}<span style="min-width:0;flex:1"><b class="ellipsis" style="display:block;font-size:13px">${state.me.name}</b><small class="muted ellipsis" style="display:block;font-size:11px">${state.me.email}</small></span>${icon('chevron-right', 'i-sm muted')}</a>`);
  tabbar.innerHTML = String(html`
    <a class="tab" href="/app" data-tab="home">${icon('home')}<span>${t('nav.home')}</span></a>
    <a class="tab" href="/app/accounts" data-tab="accounts">${icon('wallet')}<span>${t('nav.accounts')}</span></a>
    <div class="fab-wrap"><button class="fab" data-quick aria-label="${t('quick.title')}">${icon('plus')}</button></div>
    <a class="tab" href="/app/goals" data-tab="goals">${icon('target')}<span>${t('nav.goals')}</span></a>
    <a class="tab" href="/app/more" data-tab="more">${icon('grid')}<span>${t('nav.more')}</span></a>`);
  top.innerHTML = String(html`
    <form class="search input-group" role="search" data-search>${icon('search', 'i-sm')}<input class="input" name="q" placeholder="${t('search.placeholder')}" aria-label="${t('search.placeholder')}"></form>
    <span class="spacer"></span>
    <button class="icon-btn bordered" data-theme-toggle></button>
    <a class="icon-btn bordered" href="/app/notifications" data-unread aria-label="${t('nav.notifications')}">${icon('bell')}</a>
    <button class="btn btn-primary" data-quick>${icon('plus', 'i-sm')}${t('quick.add')}</button>
    <a href="/app/settings/profile" aria-label="${t('nav.profile')}">${avatar(state.me)}</a>`);
  top.querySelector('[data-search]').onsubmit = (e) => { e.preventDefault(); const q = e.target.q.value.trim(); navigate('/app/transactions' + (q ? '?q=' + encodeURIComponent(q) : '')); };
  $$('.side-nav [data-external]').forEach((a) => a.addEventListener('click', (e) => { e.stopPropagation(); }));
  applyTheme(document.documentElement.getAttribute('data-theme'), { save: false, animate: false });
  setUnread(state.unread || 0);
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-quick]')) { import('./forms.js').then((m) => m.quickAdd()); }
});
window.addEventListener('scroll', () => { $('.topbar')?.classList.toggle('scrolled', window.scrollY > 4); }, { passive: true });
// Hide the tab bar while scrolling down on mobile (more room), show on scroll up
let lastY = 0;
window.addEventListener('scroll', () => { const y = window.scrollY; const bar = $('.tabbar'); if (bar) bar.classList.toggle('hide', y > lastY + 4 && y > 120); if (Math.abs(y - lastY) > 4) lastY = y; }, { passive: true });

/* ---------- Network status + offline outbox ---------- */
function netBanner(online) {
  $('.net-banner')?.remove();
  if (online === null) return;
  const b = el(html`<div class="net-banner ${online ? 'online' : ''}" role="status">${icon(online ? 'check' : 'wifi-off', 'i-sm')}${t(online ? 'net.back_online' : 'net.offline')}</div>`);
  document.body.appendChild(b);
  if (online) setTimeout(() => b.remove(), 2500);
}
window.addEventListener('offline', () => netBanner(false));
window.addEventListener('online', () => { netBanner(true); import('./outbox.js').then((m) => m.flush()); });

/* ---------- Pull to refresh (mobile) ---------- */
(function ptr() {
  const ind = el(html`<div class="ptr" aria-hidden="true">${icon('refresh')}</div>`); document.body.appendChild(ind);
  let y0 = null; let dy = 0;
  window.addEventListener('touchstart', (e) => { if (window.scrollY <= 0 && !topSheet() && !document.body.classList.contains('auth-mode')) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (y0 === null) return; dy = e.touches[0].clientY - y0;
    if (dy <= 0) { ind.style.opacity = 0; return; }
    const d = Math.min(90, dy * 0.5);
    ind.style.opacity = Math.min(1, d / 50); ind.style.transform = `translateY(${d - 40}px) rotate(${d * 3}deg)`;
    ind.classList.toggle('ready', d > 60);
  }, { passive: true });
  window.addEventListener('touchend', async () => {
    if (y0 === null) return; y0 = null;
    if (dy * 0.5 > 60 && current?.view?.refresh) {
      ind.classList.add('loading'); ind.style.transform = 'translateY(24px)';
      clearCache();
      try { await current.view.refresh(); } finally { ind.classList.remove('loading', 'ready'); ind.style.opacity = 0; ind.style.transform = ''; }
    } else { ind.style.opacity = 0; ind.style.transform = ''; ind.classList.remove('ready'); }
  });
})();

/* ---------- PWA install + service worker ---------- */
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installPrompt = e; emit('installable'); });
window.addEventListener('appinstalled', () => { state.installPrompt = null; toast(t('pwa.installed')); });
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller; // first install must not trigger a reload
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) toast(t('pwa.update_ready'), { type: 'info', timeout: 10000, action: { label: t('pwa.reload'), fn: () => { w.postMessage('skipWaiting'); } } });
        });
      });
    }).catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'navigate' && e.data.url) navigate(e.data.url); if (e.data?.type === 'push') { pollUnread(); } });
  });
}

/* ---------- Boot ---------- */
const hideSplash = () => { const s = $('.boot'); if (!s || s.classList.contains('hide')) return; s.classList.add('hide'); setTimeout(() => s.remove(), 400); };
setTimeout(hideSplash, 4000); // never keep the logo on screen longer than this
const readLS = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
/** Resolve with the network value, or with `fallback` after `ms` (the network copy still updates later). */
const within = (p, ms, fallback) => Promise.race([p, sleep(ms).then(() => fallback)]);

(async function boot() {
  try {
    const cachedCfg = readLS('lt-config');
    const cfgP = api.get('/api/public/config', { timeout: 10000 }).then((c) => { writeLS('lt-config', c); state.config = c; return c; }).catch(() => null);
    const cfg = cachedCfg || await within(cfgP, 3500, null);
    state.config = state.config || cfg || { site: 'LifeTrack', currencies: [{ code: 'BDT', symbol: '৳', rate: 1 }], languages: [] };
    const storedLang = (() => { try { return localStorage.getItem('lt-lang'); } catch { return null; } })();
    // Language + session check run in parallel
    const meP = refreshMe().catch(() => 'offline'); // 'offline' = network problem, not a logout
    await loadLang(storedLang || cfg?.defaultLanguage || (navigator.language || 'en').slice(0, 2));
    const cachedMe = readLS('lt-me');
    let me = await within(meP, cachedMe ? 2500 : 6000, undefined);
    if ((me === undefined || me === 'offline') && cachedMe) {
      // Slow/offline network: open with the last known account; the real check finishes in the background
      state.me = cachedMe.user; state.profile = cachedMe.profile; me = cachedMe;
      meP.then((fresh) => { if (fresh === null) emit('auth:lost'); else if (fresh && fresh !== 'offline') renderChrome(); });
    } else if (me === undefined) me = await meP;
    if (me === 'offline') me = null;
    if (me?.user) writeLS('lt-me', { user: me.user, profile: me.profile }); else if (me === null) { try { localStorage.removeItem('lt-me'); } catch {} }
    if (me?.profile) {
      applyTheme(me.profile.theme, { save: false, animate: false });
      if (me.profile.language && me.profile.language !== state.lang) await loadLang(me.profile.language);
    }
    renderChrome();
    await render('up');
    hideSplash();
    if (state.me) {
      import('./outbox.js').then((m) => m.flush());
      import('./push.js').then((m) => m.syncSubscription()).catch(() => {});
      const q = new URLSearchParams(location.search).get('quick');
      if (q) import('./forms.js').then((m) => m.openTxForm(q));
      // warm up the most-used views (code-split chunks)
      (window.requestIdleCallback || setTimeout)(() => ['accounts', 'goals', 'transactions', 'more', 'reports'].forEach(loadModule));
    }
    if (!navigator.onLine) netBanner(false);
  } catch (e) {
    console.error(e);
    $('#view').innerHTML = String(html`<div class="empty" style="margin-top:20vh">${icon('wifi-off', 'i-lg')}<h4>${t('state.error_title')}</h4><p>${e.message}</p><button class="btn btn-primary btn-sm" data-reload>${t('common.retry')}</button></div>`);
    $('[data-reload]')?.addEventListener('click', () => location.reload());
  } finally {
    hideSplash();
  }
})();

export { money };
