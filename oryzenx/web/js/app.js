import { api } from './api.js';
import {
  html, mount, icon, avatar, $, $$, modal, toast, ago,
} from './ui.js';
import * as market from './market.js';

// ---------- State ----------
export const state = { me: null, stage: 'logged_out', watchlist: [] };
export const isAdmin = () => ['admin', 'super_admin'].includes(state.me?.role);

export async function refreshMe() {
  const r = await api.get('/auth/me', { fresh: true });
  state.me = r.user;
  state.stage = r.stage;
  return r;
}

export function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('ox-theme', t); } catch { /* private mode */ }
  $('meta[name="theme-color"]').content = t === 'light' ? '#f4f6fa' : '#0b0e11';
}

// ---------- Routes ----------
const PUBLIC = {
  login: () => import('./pages/auth.js').then((m) => m.login),
  signup: () => import('./pages/auth.js').then((m) => m.signup),
  forgot: () => import('./pages/auth.js').then((m) => m.forgot),
  'reset-password': () => import('./pages/auth.js').then((m) => m.resetPassword),
  'verify-email': () => import('./pages/auth.js').then((m) => m.verifyEmail),
};
const GATES = {
  verify_email: () => import('./pages/auth.js').then((m) => m.checkEmail),
  pending_approval: () => import('./pages/auth.js').then((m) => m.pending),
  privacy: () => import('./pages/auth.js').then((m) => m.privacy),
  disabled: () => import('./pages/auth.js').then((m) => m.disabled),
};
const PAGES = {
  home: { title: 'Home', icon: 'home', load: () => import('./pages/home.js') },
  trading: { title: 'Trading', icon: 'chart', load: () => import('./pages/trading.js') },
  invest: { title: 'Main Flow Invest', icon: 'invest', load: () => import('./pages/invest.js') },
  history: { title: 'Trade History', icon: 'history', load: () => import('./pages/history.js') },
  loans: { title: 'Loan Monitor', icon: 'loan', load: () => import('./pages/loans.js') },
  members: { title: 'Members & Payments', icon: 'users', load: () => import('./pages/members.js') },
  profile: { title: 'My Profile', icon: 'user', load: () => import('./pages/profile.js') },
  settings: { title: 'Settings', icon: 'settings', load: () => import('./pages/settings.js') },
  notifications: { title: 'Notifications', icon: 'bell', load: () => import('./pages/notifications.js'), hidden: true },
  admin: { title: 'Admin Panel', icon: 'admin', load: () => import('./pages/admin.js'), admin: true },
};
const SIDEBAR = ['home', 'trading', 'invest', 'history', 'loans', 'members', '-', 'profile', 'settings', 'admin'];
const BOTTOM = ['home', 'trading', 'invest', 'history'];

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || '', sub: parts.slice(1), query: new URLSearchParams(qs || '') };
}

export const go = (path) => { location.hash = `#/${path}`; };

let cleanup = null;
let shellMounted = false;
let unread = 0;

async function render() {
  const route = parseHash();
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }

  // Public pages (login, reset links...) always render, except login/signup when already signed in.
  if (PUBLIC[route.name] && !(state.me && ['login', 'signup', 'forgot'].includes(route.name))) {
    shellMounted = false;
    const page = await PUBLIC[route.name]();
    const root = mount($('#app'), html`<div></div>`).firstElementChild;
    cleanup = await page({ el: root, query: route.query }) || null;
    return;
  }
  if (!state.me) return go('login');

  if (state.stage !== 'ready') {
    shellMounted = false;
    const page = await GATES[state.stage]();
    const root = mount($('#app'), html`<div></div>`).firstElementChild;
    cleanup = await page({ el: root, query: route.query }) || null;
    return;
  }

  const def = PAGES[route.name];
  if (!def || (def.admin && !isAdmin())) return go('home');
  if (!shellMounted) mountShell();
  updateNav(route.name);
  $('#page-title').textContent = def.title;
  document.title = `${def.title} · OryzenX BD`;
  const el = $('#page');
  el.className = 'page';
  void el.offsetWidth; // restart the page-in animation
  mount(el, '');
  window.scrollTo({ top: 0 });
  try {
    const mod = await def.load();
    if (parseHash().name !== route.name) return; // user navigated away while loading
    cleanup = await mod.render({ el, sub: route.sub, query: route.query }) || null;
  } catch (err) {
    console.error(err);
    mount(el, html`<div class="card empty">${icon('x')}<div>${err.message}</div><button class="btn mt" onclick="location.reload()">Reload</button></div>`);
  }
}

function navLinks(keys, mobile = false) {
  return keys.filter((k) => k === '-' || (!PAGES[k].admin || isAdmin())).map((k) => (k === '-'
    ? html`<div class="nav-sep"></div>`
    : mobile
      ? html`<a href="#/${k}" data-nav="${k}">${icon(PAGES[k].icon)}<span>${PAGES[k].title.replace('Main Flow ', '').replace('Trade ', '')}</span></a>`
      : html`<a class="nav-item" href="#/${k}" data-nav="${k}">${icon(PAGES[k].icon)}<span>${PAGES[k].title}</span></a>`));
}

function mountShell() {
  shellMounted = true;
  const me = state.me;
  mount($('#app'), html`<div class="shell">
    <aside class="sidebar">
      <a class="brand" href="#/home"><img src="/icons/logo.svg" width="34" height="34" alt="">OryzenX <b>BD</b></a>
      ${navLinks(SIDEBAR)}
      <div class="spacer"></div>
      <div class="row" style="padding:10px;gap:10px">${avatar(me, 'sm')}<div class="grow"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis">${me.name}</div><div class="faint" style="font-size:12px">${me.role.replace('_', ' ')}</div></div>
        <button class="icon-btn" id="logout" aria-label="Log out" title="Log out">${icon('logout')}</button></div>
    </aside>
    <div class="main">
      <header class="topbar">
        <a class="mobile-brand" href="#/home" aria-label="Home"><img src="/icons/logo.svg" width="32" height="32" alt=""></a>
        <div class="title" id="page-title"></div>
        <span class="row faint hide-m" style="font-size:12px;gap:6px"><span class="live-dot off" id="live-dot"></span><span id="live-text">Connecting</span></span>
        <button class="icon-btn" id="theme-btn" aria-label="Switch theme" title="Switch theme">${icon(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun')}</button>
        <a class="icon-btn" href="#/notifications" aria-label="Notifications" title="Notifications">${icon('bell')}<span class="dot hidden" id="notif-dot"></span></a>
        <a href="#/profile" class="hide-d" aria-label="My profile">${avatar(me, 'sm')}</a>
      </header>
      <main id="page" class="page"></main>
    </div>
    <nav class="bottom-nav" aria-label="Main">${navLinks(BOTTOM, true)}<button id="more-btn">${icon('more')}<span>More</span></button></nav>
  </div>`);

  $('#logout').onclick = logout;
  $('#theme-btn').onclick = () => {
    const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    setTheme(t);
    mount($('#theme-btn'), icon(t === 'light' ? 'moon' : 'sun'));
    window.dispatchEvent(new Event('ox:theme'));
  };
  $('#more-btn').onclick = () => {
    const m = modal({
      title: 'More',
      body: html`<div class="stack" style="gap:4px">${navLinks(['loans', 'members', 'profile', 'settings', 'notifications', 'admin'].filter((k) => !PAGES[k].admin || isAdmin()))}
        <button class="nav-item" style="border:0;background:none;font:inherit;cursor:pointer;width:100%" id="m-logout">${icon('logout')}<span>Log out</span></button></div>`,
    });
    m.el.addEventListener('click', (e) => { if (e.target.closest('a')) m.close(); });
    $('#m-logout', m.el).onclick = () => { m.close(); logout(); };
  };
  market.subscribe(() => {
    const live = market.isLive();
    $('#live-dot')?.classList.toggle('off', !live);
    const t = $('#live-text'); if (t) t.textContent = live ? 'Live' : 'Reconnecting';
  });
  checkNotifications();
}

function updateNav(name) {
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
  $('#more-btn')?.classList.toggle('active', !BOTTOM.includes(name));
}

export async function checkNotifications() {
  try {
    const r = await api.get('/notifications', { fresh: true });
    unread = r.unread;
    $('#notif-dot')?.classList.toggle('hidden', !unread);
  } catch { /* ignore */ }
}

export function setUnreadZero() { unread = 0; $('#notif-dot')?.classList.add('hidden'); }

export async function logout() {
  await api.post('/auth/logout').catch(() => {});
  state.me = null; state.stage = 'logged_out';
  api.clear();
  go('login');
}

window.addEventListener('ox:logged-out', () => { state.me = null; state.stage = 'logged_out'; if (!PUBLIC[parseHash().name]) go('login'); });
window.addEventListener('hashchange', render);

// After login or any onboarding step, re-check where the user is and route there.
export async function afterAuth() {
  await refreshMe();
  shellMounted = false;
  if (state.stage === 'ready') {
    startMarket();
    if (!PAGES[parseHash().name]) go('home'); else render();
  } else if (parseHash().name === 'onboarding') render(); else go('onboarding');
}

export async function startMarket() {
  try {
    const r = await api.get('/coins');
    state.watchlist = r.watchlist;
    market.watch(r.watchlist);
  } catch { /* not ready yet */ }
}

(async function boot() {
  try { await refreshMe(); } catch { /* offline: show login */ }
  if (state.stage === 'ready') startMarket();
  await render();
  setInterval(() => { if (state.stage === 'ready' && !document.hidden) checkNotifications(); }, 60000);
  const splash = $('#splash');
  splash.classList.add('gone');
  setTimeout(() => splash.remove(), 500);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
}());

export { ago };
