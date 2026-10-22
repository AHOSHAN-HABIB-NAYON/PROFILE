import { api } from './api.js';
import {
  html, mount, icon, avatar, $, $$, modal, toast, ago, fitAll,
} from './ui.js';
import * as market from './market.js';
import * as native from './native.js';
import { initLock } from './lock.js';

// ---------- State ----------
export const state = { me: null, stage: 'logged_out', watchlist: [] };
export const isAdmin = () => ['admin', 'super_admin'].includes(state.me?.role);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

export async function refreshMe() {
  const r = await api.get('/auth/me', { fresh: true });
  state.me = r.user;
  state.stage = r.stage;
  return r;
}

export function setTheme(t) {
  document.documentElement.dataset.theme = t;
  store.set('ox-theme', t);
  $('meta[name="theme-color"]').content = t === 'light' ? '#f3f6fb' : '#081226';
}
export const themeChosen = () => !!store.get('ox-theme-chosen');
export const markThemeChosen = () => store.set('ox-theme-chosen', '1');

// ---------- Routes ----------
const PUBLIC = {
  welcome: () => import('./pages/auth.js').then((m) => m.welcome),
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
  theme: () => import('./pages/auth.js').then((m) => m.chooseTheme),
  disabled: () => import('./pages/auth.js').then((m) => m.disabled),
  kyc: () => import('./pages/kyc.js').then((m) => m.kyc),
  kyc_pending: () => import('./pages/kyc.js').then((m) => m.kycPending),
  kyc_rejected: () => import('./pages/kyc.js').then((m) => m.kycRejected),
  reverify: () => import('./pages/kyc.js').then((m) => m.reverify),
  reverify_locked: () => import('./pages/kyc.js').then((m) => m.reverifyLocked),
};
// tab: shown in the bottom bar. back: inner page with a back arrow on phones.
const PAGES = {
  home: { title: 'Home', short: 'Home', icon: 'home', tab: true, load: () => import('./pages/home.js') },
  trading: { title: 'Market', short: 'Market', icon: 'chart', tab: true, load: () => import('./pages/trading.js') },
  invest: { title: 'Main Flow Invest', short: 'Invest', icon: 'invest', tab: true, load: () => import('./pages/invest.js') },
  history: { title: 'Trade History', short: 'History', icon: 'history', tab: true, load: () => import('./pages/history.js') },
  profile: { title: 'Profile', short: 'Profile', icon: 'user', tab: true, load: () => import('./pages/profile.js') },
  loans: { title: 'Loan Monitor', icon: 'loan', back: true, load: () => import('./pages/loans.js') },
  members: { title: 'Members & Payments', icon: 'users', back: true, load: () => import('./pages/members.js') },
  settings: { title: 'Settings', icon: 'settings', back: true, load: () => import('./pages/settings.js') },
  notifications: { title: 'Notifications', icon: 'bell', back: true, load: () => import('./pages/notifications.js') },
  coin: { title: 'Chart', icon: 'chart', back: true, nav: 'trading', load: () => import('./pages/coin.js') },
  admin: { title: 'Admin Panel', icon: 'admin', admin: true, load: () => import('./pages/admin.js') },
};
const SIDEBAR = ['home', 'trading', 'invest', 'history', 'loans', 'members', '-', 'profile', 'settings', 'notifications'];
const BOTTOM = ['home', 'trading', 'invest', 'history', 'profile'];

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || '', sub: parts.slice(1), query: new URLSearchParams(qs || '') };
}

// replace: switch screens without adding a Back step (used inside the admin area).
export const go = (path, { replace = false } = {}) => {
  if (replace) { history.replaceState(null, '', `#/${path}`); render(); } else location.hash = `#/${path}`;
};

let cleanup = null;
let shell = null; // 'app' | 'admin' | null
let unread = 0;

async function mountBare(loader, route) {
  shell = null;
  const page = await loader();
  const root = mount($('#app'), html`<div class="bare"></div>`).firstElementChild;
  cleanup = await page({ el: root, query: route.query }) || null;
}

async function render() {
  const route = parseHash();
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  $$('.overlay').forEach((o) => o.remove());

  if (PUBLIC[route.name] && !(state.me && ['welcome', 'login', 'signup', 'forgot'].includes(route.name))) {
    native.secureFor('route', false);
    return mountBare(PUBLIC[route.name], route);
  }
  if (!state.me) return go(store.get('ox-seen-welcome') ? 'login' : 'welcome', { replace: true });

  if (state.stage !== 'ready') {
    native.secureFor('route', state.stage !== 'privacy');
    return mountBare(GATES[state.stage], route);
  }
  if (!themeChosen()) return mountBare(GATES.theme, route);

  const def = PAGES[route.name];
  if (!def || (def.admin && !isAdmin())) return go('home', { replace: true });
  native.secureFor('route', ['profile', 'settings', 'admin'].includes(route.name));
  const want = def.admin ? 'admin' : 'app';
  if (shell !== want) (want === 'admin' ? mountAdminShell : mountShell)();
  updateNav(def.admin ? (route.sub[0] || 'dashboard') : (def.nav || route.name));
  const title = $('#page-title');
  if (title) title.textContent = def.title;
  document.body.classList.toggle('inner-page', !!def.back);
  document.title = `${def.title} · OryzenX BD`;
  const el = $('#page');
  el.className = 'page';
  void el.offsetWidth; // restart the page-in animation
  mount(el, '');
  window.scrollTo({ top: 0 });
  try {
    const mod = await def.load();
    if (parseHash().name !== route.name) return; // navigated away while loading
    cleanup = await mod.render({ el, sub: route.sub, query: route.query }) || null;
  } catch (err) {
    console.error(err);
    mount(el, html`<div class="card empty">${icon('x')}<div>${err.message}</div><button class="btn mt" id="reload">Reload</button></div>`);
    $('#reload', el).onclick = () => location.reload();
  }
}

// ---------- App shell (members) ----------
function mountShell() {
  shell = 'app';
  const me = state.me;
  const link = (k) => (k === '-' ? html`<div class="nav-sep"></div>`
    : html`<a class="nav-item" href="#/${k}" data-nav="${k}">${icon(PAGES[k].icon)}<span>${PAGES[k].title}</span></a>`);
  mount($('#app'), html`<div class="shell">
    <aside class="sidebar">
      <a class="brand" href="#/home"><img src="/icons/logo.svg" width="36" height="36" alt=""><span>OryzenX <b>BD</b></span></a>
      <a class="side-user" href="#/profile">${avatar(me)}<span class="grow"><b>${me.name}</b><small>${me.email}</small>
        ${me.kyc_status === 'approved' || me.role !== 'user' ? html`<em class="verified">${icon('check')} Verified</em>` : ''}</span></a>
      <nav class="side-nav">${SIDEBAR.map(link)}
        ${isAdmin() ? html`<div class="nav-sep"></div><a class="nav-item admin-link" href="#/admin">${icon('admin')}<span>Admin Panel</span></a>` : ''}</nav>
      <button class="nav-item" id="logout">${icon('logout')}<span>Log out</span></button>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn back-btn" id="back-btn" aria-label="Back">${icon('back')}</button>
        <a class="mobile-brand" href="#/home" aria-label="Home"><img src="/icons/logo.svg" width="30" height="30" alt=""></a>
        <div class="title" id="page-title"></div>
        <span class="live-tag hide-m"><span class="live-dot off" id="live-dot"></span><span id="live-text">Connecting</span></span>
        <button class="icon-btn" id="theme-btn" aria-label="Switch theme" title="Switch theme">${icon(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun')}</button>
        <a class="icon-btn" href="#/notifications" aria-label="Notifications" title="Notifications">${icon('bell')}<span class="dot hidden" id="notif-dot"></span></a>
        <a href="#/profile" class="top-avatar" aria-label="My profile">${avatar(me, 'sm')}</a>
      </header>
      <main id="page" class="page"></main>
    </div>
    <nav class="bottom-nav" aria-label="Main">${BOTTOM.map((k) => html`<a href="#/${k}" data-nav="${k}">${icon(PAGES[k].icon)}<span>${PAGES[k].short}</span></a>`)}</nav>
  </div>`);
  $('#logout').onclick = logout;
  $('#back-btn').onclick = () => (history.length > 1 ? history.back() : go('home'));
  $('#theme-btn').onclick = toggleTheme;
  market.subscribe(() => {
    const live = market.isLive();
    $('#live-dot')?.classList.toggle('off', !live);
    const t = $('#live-text'); if (t) t.textContent = live ? 'Live' : 'Reconnecting';
  });
  checkNotifications();
}

function toggleTheme() {
  const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  setTheme(t);
  $$('#theme-btn').forEach((b) => mount(b, icon(t === 'light' ? 'moon' : 'sun')));
  window.dispatchEvent(new Event('ox:theme'));
}

// ---------- Admin shell (dark sidebar on desktop, dark list + bottom bar on phones) ----------
export const ADMIN_NAV = [
  ['dashboard', 'Dashboard', 'home'], ['users', 'Users', 'users'], ['kyc', 'KYC Verification', 'shield'],
  ['payments', 'Payments', 'calendar'], ['deposits', 'Deposits', 'download'], ['trades', 'Trading', 'chart'],
  ['investments', 'Investments', 'invest'], ['loans', 'Loan Monitor', 'loan'],
  ['notices', 'Notifications', 'bell'], ['logs', 'Email & Logs', 'mail'], ['settings', 'Settings', 'settings'],
];
let adminClicks = false;
function mountAdminShell() {
  shell = 'admin';
  const me = state.me;
  mount($('#app'), html`<div class="ashell">
    <aside class="asidebar">
      <a class="abrand" href="#/admin" data-admin="dashboard"><img src="/icons/logo.svg" width="34" height="34" alt=""><span>OryzenX <b>BD</b><small>Admin Panel</small></span></a>
      <nav>${ADMIN_NAV.map(([k, l, ic]) => html`<a class="anav" href="#/admin/${k === 'dashboard' ? '' : k}" data-admin="${k}" data-nav="${k}">${icon(ic)}<span>${l}</span><em class="abadge hidden" data-badge="${k}"></em></a>`)}</nav>
      <a class="anav exit" href="#/home">${icon('back')}<span>Back to app</span></a>
    </aside>
    <div class="amain">
      <header class="atop">
        <a class="icon-btn dark" href="#/home" aria-label="Back to app" title="Back to app">${icon('back')}</a>
        <div class="grow"><div class="atitle">Admin Panel</div><div class="asub" id="page-title"></div></div>
        <button class="icon-btn dark" id="theme-btn" aria-label="Switch theme">${icon(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun')}</button>
        <a class="icon-btn dark" href="#/notifications" aria-label="Notifications">${icon('bell')}<span class="dot hidden" id="notif-dot"></span></a>
        <span class="admin-who hide-m">${avatar(me, 'sm')}<span><b>${me.name}</b><small>${me.role === 'super_admin' ? 'Super Admin' : 'Admin'}</small></span></span>
      </header>
      <main id="page" class="page apage"></main>
    </div>
    <nav class="abottom" aria-label="Admin">
      <a href="#/admin" data-admin="dashboard" data-nav="dashboard">${icon('home')}<span>Home</span></a>
      <a href="#/admin/users" data-admin="users" data-nav="users">${icon('users')}<span>Users</span></a>
      <a href="#/admin/logs" data-admin="logs" data-nav="logs">${icon('clock')}<span>Logs</span></a>
      <a href="#/admin/menu" data-admin="menu" data-nav="menu">${icon('more')}<span>More</span></a>
    </nav>
  </div>`);
  // Moving between admin sections replaces the screen, so Back leaves the admin area
  // instead of stepping through every section you opened.
  if (!adminClicks) $('#app').addEventListener('click', (e) => {
    const a = e.target.closest('[data-admin]');
    if (!a || shell !== 'admin') return;
    e.preventDefault();
    const k = a.dataset.admin;
    go(k === 'dashboard' ? 'admin' : `admin/${k}`, { replace: parseHash().name === 'admin' });
  });
  adminClicks = true;
  $('#theme-btn').onclick = toggleTheme;
  checkNotifications();
}
export function setAdminBadges(b) {
  for (const [k, n] of Object.entries(b)) {
    $$(`[data-badge="${k}"]`).forEach((e) => { e.textContent = n; e.classList.toggle('hidden', !n); });
  }
}

function updateNav(name) {
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
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
  readyDone = false;
  await api.post('/auth/logout').catch(() => {});
  state.me = null; state.stage = 'logged_out';
  api.clear();
  go('login');
}

window.addEventListener('ox:logged-out', () => { state.me = null; state.stage = 'logged_out'; if (!PUBLIC[parseHash().name]) go('login'); });
window.addEventListener('hashchange', render);
window.addEventListener('ox:theme', native.syncStatusBar);

// Runs once the member can use the app: live prices, app lock, push notifications.
let readyDone = false;
function onReady() {
  startMarket();
  if (readyDone) return;
  readyDone = true;
  initLock(state.me, { logout });
  native.setupPush((token) => api.post('/me/push-token', { token, platform: 'android' }).catch(() => {}));
}

// After login or any onboarding step, re-check where the user is and route there.
export async function afterAuth() {
  await refreshMe();
  shell = null;
  if (state.stage === 'ready') {
    onReady();
    if (!PAGES[parseHash().name]) go('home', { replace: true }); else render();
  } else render();
}

export async function startMarket() {
  try {
    const r = await api.get('/coins');
    state.watchlist = r.watchlist;
    market.watch(r.watchlist);
  } catch { /* not ready yet */ }
}

// ---------- "New version available" ----------
let loadedVersion = null;
async function checkVersion() {
  try {
    const { version } = await (await fetch('/api/version', { cache: 'no-store' })).json();
    if (!loadedVersion) { loadedVersion = version; return; }
    if (version !== loadedVersion && !$('#update-bar')) {
      const bar = document.createElement('div');
      bar.id = 'update-bar';
      bar.className = 'update-bar';
      mount(bar, html`${icon('download')}<span><b>New version available</b><small>Tap update to get the latest OryzenX BD.</small></span><button class="btn sm" id="upd">Update</button>`);
      document.body.append(bar);
      $('#upd', bar).onclick = async () => {
        $('#upd', bar).disabled = true;
        try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch { /* ignore */ }
        location.reload();
      };
    }
  } catch { /* offline */ }
}

// Money amounts shrink to fit their box instead of overflowing.
let fitQueued = false;
new MutationObserver(() => {
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(() => { fitQueued = false; fitAll(); });
}).observe(document.getElementById('app'), { childList: true, subtree: true, characterData: true });
window.addEventListener('resize', () => fitAll());

(async function boot() {
  try { await refreshMe(); } catch { /* offline: show login */ }
  if (state.stage === 'ready') onReady();
  native.setupBackButton();
  native.syncStatusBar();
  await render();
  checkVersion();
  setInterval(() => { if (!document.hidden) { checkVersion(); if (state.stage === 'ready') checkNotifications(); } }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });
  const splash = $('#splash');
  splash.classList.add('gone');
  setTimeout(() => splash.remove(), 500);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
}());

export { ago };
