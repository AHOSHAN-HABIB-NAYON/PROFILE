/* Premium Aura — SPA shell: router, navigation, header, live updates. */
import {
  state, api, esc, $, $$, toast, toastError, relEl, applyTheme, brandHtml, playSound, skeleton, money, sheet,
} from './core.js';

// ------------------------------------------------------------------ routes
const USER_ROUTES = {
  '/dashboard': { mod: '/assets/js/pages/dashboard.js', nav: 'dashboard', title: 'Dashboard' },
  '/access': { mod: '/assets/js/pages/access.js', nav: 'access', title: 'Access Services' },
  '/otp': { mod: '/assets/js/pages/otp.js', nav: 'otp', title: 'OTP Services' },
  '/premium': { mod: '/assets/js/pages/premium.js', nav: 'premium', title: 'Premium Services' },
  '/news': { mod: '/assets/js/pages/news.js', nav: 'news', title: 'News' },
  '/wallet': { mod: '/assets/js/pages/wallet.js', nav: 'wallet', title: 'Wallet' },
  '/withdraw': { mod: '/assets/js/pages/withdraw.js', nav: 'withdraw', title: 'Withdraw' },
  '/profile': { mod: '/assets/js/pages/profile.js', nav: 'profile', title: 'Profile' },
  '/security': { mod: '/assets/js/pages/security.js', nav: 'security', title: 'Security' },
  '/settings': { mod: '/assets/js/pages/settings.js', nav: 'settings', title: 'Settings' },
  '/notifications': { mod: '/assets/js/pages/notifications.js', nav: 'notifications', title: 'Notifications' },
};
const ADMIN_ROUTES = {
  '/admin': { mod: '/admin-assets/js/dashboard.js', nav: 'a-dashboard', title: 'Admin Dashboard' },
  '/admin/users': { mod: '/admin-assets/js/users.js', nav: 'a-users', title: 'Users' },
  '/admin/access': { mod: '/admin-assets/js/access.js', nav: 'a-access', title: 'Access Management' },
  '/admin/events': { mod: '/admin-assets/js/events.js', nav: 'a-events', title: 'OTP / Test Events' },
  '/admin/api': { mod: '/admin-assets/js/api.js', nav: 'a-api', title: 'API Management' },
  '/admin/plans': { mod: '/admin-assets/js/plans.js', nav: 'a-plans', title: 'Premium Plans' },
  '/admin/payments': { mod: '/admin-assets/js/payments.js', nav: 'a-payments', title: 'Payments' },
  '/admin/withdrawals': { mod: '/admin-assets/js/withdrawals.js', nav: 'a-withdrawals', title: 'Withdrawals' },
  '/admin/news': { mod: '/admin-assets/js/news.js', nav: 'a-news', title: 'News' },
  '/admin/notifications': { mod: '/admin-assets/js/notifications.js', nav: 'a-notifications', title: 'Notifications' },
  '/admin/smtp': { mod: '/admin-assets/js/smtp.js', nav: 'a-smtp', title: 'SMTP' },
  '/admin/settings': { mod: '/admin-assets/js/settings.js', nav: 'a-settings', title: 'System Settings' },
  '/admin/maintenance': { mod: '/admin-assets/js/maintenance.js', nav: 'a-maintenance', title: 'Maintenance' },
  '/admin/logs': { mod: '/admin-assets/js/logs.js', nav: 'a-logs', title: 'Security Logs' },
};

const NAV_MAIN = [
  ['dashboard', '/dashboard', 'fa-solid fa-house', 'Dashboard'],
  ['access', '/access', 'fa-solid fa-sim-card', 'Access Services'],
  ['otp', '/otp', 'fa-solid fa-shield-halved', 'OTP Services'],
  ['premium', '/premium', 'fa-solid fa-crown', 'Premium Services'],
  ['news', '/news', 'fa-solid fa-newspaper', 'News'],
];
const NAV_ACCOUNT = [
  ['profile', '/profile', 'fa-solid fa-user', 'Profile'],
  ['security', '/security', 'fa-solid fa-lock', 'Security'],
  ['wallet', '/wallet', 'fa-solid fa-wallet', 'Wallet'],
  ['withdraw', '/withdraw', 'fa-solid fa-money-bill-transfer', 'Withdraw'],
  ['settings', '/settings', 'fa-solid fa-gear', 'Settings'],
];
const NAV_ADMIN = [
  ['a-dashboard', '/admin', 'fa-solid fa-gauge-high', 'Admin Dashboard'],
  ['a-users', '/admin/users', 'fa-solid fa-users', 'Users'],
  ['a-access', '/admin/access', 'fa-solid fa-sim-card', 'Access Management'],
  ['a-events', '/admin/events', 'fa-solid fa-bolt', 'OTP/Test Events'],
  ['a-api', '/admin/api', 'fa-solid fa-plug', 'API Management'],
  ['a-plans', '/admin/plans', 'fa-solid fa-gem', 'Premium Plans'],
  ['a-payments', '/admin/payments', 'fa-solid fa-credit-card', 'Payments'],
  ['a-withdrawals', '/admin/withdrawals', 'fa-solid fa-money-bill-wave', 'Withdrawals'],
  ['a-news', '/admin/news', 'fa-solid fa-newspaper', 'News'],
  ['a-notifications', '/admin/notifications', 'fa-solid fa-bullhorn', 'Notifications'],
  ['a-smtp', '/admin/smtp', 'fa-solid fa-envelope', 'SMTP'],
  ['a-settings', '/admin/settings', 'fa-solid fa-sliders', 'System Settings'],
  ['a-maintenance', '/admin/maintenance', 'fa-solid fa-screwdriver-wrench', 'Maintenance'],
  ['a-logs', '/admin/logs', 'fa-solid fa-clipboard-list', 'Security Logs'],
];
const BOTTOM = [
  ['dashboard', '/dashboard', 'fa-solid fa-house', 'Dashboard'],
  ['access', '/access', 'fa-solid fa-sim-card', 'Access'],
  ['otp', '/otp', 'fa-solid fa-shield-halved', 'OTP'],
  ['premium', '/premium', 'fa-solid fa-crown', 'Premium'],
  ['news', '/news', 'fa-solid fa-newspaper', 'News'],
];

// ------------------------------------------------------------------ live bus (Socket.IO + polling fallback)
const bus = new EventTarget();
export const live = {
  connected: false,
  on(evt, fn) {
    const h = (e) => fn(e.detail);
    bus.addEventListener(evt, h);
    return () => bus.removeEventListener(evt, h);
  },
  emit(evt, detail) { bus.dispatchEvent(new CustomEvent(evt, { detail })); },
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = resolve; s.onerror = reject;
    document.head.append(s);
  });
}

async function connectLive() {
  try {
    await loadScript('/socket.io/socket.io.js');
    const socket = window.io({ transports: ['websocket', 'polling'], withCredentials: true });
    socket.on('connect', () => { live.connected = true; live.emit('live:state', true); });
    socket.on('disconnect', () => { live.connected = false; live.emit('live:state', false); });
    socket.on('connect_error', () => { live.connected = false; live.emit('live:state', false); });
    for (const evt of ['event:new', 'events:expired', 'notification:new', 'wallet:update', 'withdrawal:update', 'payment:update', 'service:count', 'maintenance',
      'resource:returned', 'admin:event', 'admin:payment', 'admin:withdrawal', 'provider:health']) {
      socket.on(evt, (payload) => live.emit(evt, payload));
    }
  } catch {
    live.connected = false;
  }
  // Fallback: when the socket is down, refresh counters every 15s via AJAX.
  setInterval(async () => {
    if (live.connected || document.hidden) return;
    try {
      const me = await api('/me');
      if (me.unread > state.unread) { playSound('notify'); }
      setUnread(me.unread);
      setWallet(me.wallet);
    } catch { /* offline */ }
  }, 15_000);
}

// ------------------------------------------------------------------ shell rendering
function navLinks(list) {
  return list.map(([key, href, icon, label]) => `<a class="nav-link" href="${href}" data-nav="${key}"><i class="${icon}"></i><span>${label}</span></a>`).join('');
}

function renderShell() {
  const u = state.user;
  const isAdmin = u.role === 'admin';
  $('#sidebar').innerHTML = `
    <a class="brand" href="/dashboard">${brandHtml()}</a>
    <nav aria-label="Main">${navLinks(NAV_MAIN)}
      <div class="nav-section">Account</div>${navLinks(NAV_ACCOUNT)}
      ${isAdmin ? `<div class="nav-section">Administration</div>${navLinks(NAV_ADMIN)}` : ''}
    </nav>
    <div class="sidebar-foot">
      <div class="sidebar-stats">
        <div class="row"><span class="li-ic event" style="width:34px;height:34px;font-size:14px"><i class="fa-solid fa-wallet"></i></span>
          <div><div class="small muted">Wallet</div><strong data-wallet>${esc(money(state.wallet?.balance))}</strong></div></div>
        <div class="row"><span class="li-ic premium" style="width:34px;height:34px;font-size:14px"><i class="fa-solid fa-crown"></i></span>
          <div><div class="small muted">Premium</div><strong>${state.premium ? esc(state.premium.plan) : 'Free'}</strong></div></div>
      </div>
      <div class="center"><div class="theme-toggle" role="group" aria-label="Theme">
        <button data-theme-set="light"><i class="fa-solid fa-sun"></i>Light</button>
        <button data-theme-set="dark"><i class="fa-solid fa-moon"></i>Dark</button></div>
      <p class="small muted" style="margin-top:10px">${esc(state.site.site_name)} v1.0.0</p></div>
    </div>`;

  $('#topbar').innerHTML = `
    <button class="icon-btn menu-btn" data-menu aria-label="Open menu"><i class="fa-solid fa-bars"></i></button>
    <a class="brand" href="/dashboard">${brandHtml(state.site, { small: true })}</a>
    <div class="search search-box"><i class="fa-solid fa-magnifying-glass"></i>
      <input class="input" type="search" placeholder="Search services, OTPs, news…" data-global-search aria-label="Search"></div>
    <div class="topbar-actions">
      <button class="icon-btn desktop-only" data-theme-flip aria-label="Toggle theme"><i class="fa-solid fa-circle-half-stroke"></i></button>
      <button class="icon-btn" data-notifications aria-label="Notifications"><i class="fa-solid fa-bell"></i><span class="badge-dot hidden" data-unread></span></button>
      <button class="profile-chip" data-profile aria-label="Profile">
        <span class="avatar">${esc(u.initial)}</span>
        <span class="meta"><strong>${esc(u.name)}</strong><br><small><i class="fa-solid fa-circle" style="font-size:7px"></i> Online</small></span>
        <i class="fa-solid fa-chevron-down desktop-only muted" style="font-size:11px"></i>
      </button>
    </div>`;

  $('#bottom-nav').innerHTML = BOTTOM.map(([key, href, icon, label]) => `<a href="${href}" data-nav="${key}"><i class="${icon}"></i><span>${label}</span></a>`).join('');
  setUnread(state.unread);
  applyTheme(document.documentElement.dataset.theme, { persist: false });
}

function setUnread(n) {
  state.unread = Math.max(0, Number(n) || 0);
  const b = $('[data-unread]');
  if (!b) return;
  b.textContent = state.unread > 99 ? '99+' : String(state.unread);
  b.classList.toggle('hidden', !state.unread);
  b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  document.title = `${state.unread ? `(${state.unread}) ` : ''}${currentTitle} · ${state.site.site_name}`;
}
export { setUnread };

function setWallet(w) {
  if (!w) return;
  state.wallet = w;
  for (const el of $$('[data-wallet]')) el.textContent = money(w.balance);
}

// ------------------------------------------------------------------ drawer
function openDrawer(open) {
  $('#sidebar').classList.toggle('open', open);
  $('#scrim').classList.toggle('show', open);
}

// ------------------------------------------------------------------ notifications popover
let popover = null;
async function toggleNotifications() {
  if (popover) { popover.remove(); popover = null; return; }
  popover = document.createElement('div');
  popover.className = 'popover';
  popover.innerHTML = `<div class="pop-head"><h3>Notifications</h3><button class="btn btn-xs btn-soft" data-read-all>Mark all read</button></div><div data-list>${skeleton('list')}</div>
    <a class="btn btn-ghost btn-sm btn-block" href="/notifications" style="margin-top:6px">View all</a>`;
  document.body.append(popover);
  try {
    const r = await api('/notifications', { query: { pageSize: 8 } });
    setUnread(r.unread);
    $('[data-list]', popover).innerHTML = r.items.length ? r.items.map(notifItem).join('') : '<div class="empty"><i class="fa-regular fa-bell"></i><div>No notifications yet</div></div>';
  } catch (e) { toastError(e); }
}

const NOTIF_ICON = { service: 'fa-sim-card', resource: 'fa-hashtag', post: 'fa-newspaper', payment: 'fa-credit-card', premium: 'fa-crown', withdrawal: 'fa-money-bill-transfer', system: 'fa-bell' };
export function notifItem(n) {
  return `<div class="notif-item ${n.is_read ? '' : 'unread'}" data-notif="${n.id}" data-link="${esc(n.link || '')}">
    <span class="li-ic ${esc(n.type)}"><i class="fa-solid ${NOTIF_ICON[n.type] || 'fa-bell'}"></i></span>
    <div style="min-width:0"><div class="n-title">${esc(n.title)}</div>${n.body ? `<div class="n-body">${esc(n.body)}</div>` : ''}<div class="n-time">${relEl(n.created_at)}</div></div></div>`;
}

async function openNotification(el) {
  const id = el.dataset.notif;
  el.classList.remove('unread');
  try {
    const r = await api(`/notifications/${id}/read`, { method: 'POST' });
    setUnread(r.unread);
  } catch { /* ignore */ }
  const link = el.dataset.link;
  if (link && link.startsWith('/')) { popover?.remove(); popover = null; navigate(link); }
}

function profileSheet() {
  const u = state.user;
  const s = sheet({
    title: 'Account',
    body: `<div class="row-flex" style="margin-bottom:14px"><span class="avatar lg">${esc(u.initial)}</span>
      <div><strong style="font-size:17px">${esc(u.name)}</strong><div class="muted small">${esc(u.email)}</div>${u.role === 'admin' ? '<span class="chip admin">Admin</span>' : ''}</div></div>
      <div class="list">
        ${[['/profile', 'fa-user', 'Profile'], ['/security', 'fa-lock', 'Security & 2FA'], ['/wallet', 'fa-wallet', 'Wallet'], ['/withdraw', 'fa-money-bill-transfer', 'Withdraw'], ['/settings', 'fa-gear', 'Settings'],
    ...(u.role === 'admin' ? [['/admin', 'fa-gauge-high', 'Admin panel']] : [])]
    .map(([h, i, l]) => `<a class="list-item" href="${h}" data-close style="color:var(--text)"><span class="li-ic system" style="width:36px;height:36px;font-size:14px"><i class="fa-solid ${i}"></i></span><span class="li-body">${l}</span><i class="fa-solid fa-chevron-right muted"></i></a>`).join('')}
      </div>
      <div class="divider"></div>
      <div class="row-flex" style="justify-content:space-between"><div class="theme-toggle"><button data-theme-set="light"><i class="fa-solid fa-sun"></i>Light</button><button data-theme-set="dark"><i class="fa-solid fa-moon"></i>Dark</button></div>
      <button class="btn btn-danger btn-sm" data-logout><i class="fa-solid fa-right-from-bracket"></i>Logout</button></div>`,
  });
  applyTheme(document.documentElement.dataset.theme, { persist: false });
  return s;
}

async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  location.href = '/login';
}

// ------------------------------------------------------------------ router
let currentCleanup = null;
let currentTitle = 'Dashboard';
let navToken = 0;

function resolve(pathname) {
  const p = pathname.replace(/\/+$/, '') || '/dashboard';
  if (USER_ROUTES[p]) return USER_ROUTES[p];
  if (state.user?.role === 'admin' && ADMIN_ROUTES[p]) return ADMIN_ROUTES[p];
  return null;
}

export async function navigate(url, { replace = false, scroll = true } = {}) {
  const u = new URL(url, location.origin);
  const route = resolve(u.pathname);
  if (!route) { location.href = u.href; return; }
  if (replace) history.replaceState({}, '', u.pathname + u.search);
  else if (u.pathname + u.search !== location.pathname + location.search) history.pushState({}, '', u.pathname + u.search);
  await render(route, u);
  if (scroll) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

async function render(route, u) {
  const token = ++navToken;
  openDrawer(false);
  popover?.remove(); popover = null;
  for (const a of $$('[data-nav]')) a.classList.toggle('active', a.dataset.nav === route.nav);
  currentTitle = route.title;
  document.title = `${state.unread ? `(${state.unread}) ` : ''}${route.title} · ${state.site.site_name}`;
  if (typeof currentCleanup === 'function') { try { currentCleanup(); } catch { /* ignore */ } }
  currentCleanup = null;
  const view = $('#view');
  view.innerHTML = `<div class="view">${skeleton()}</div>`;
  try {
    const mod = await import(route.mod);
    if (token !== navToken) return;
    const el = document.createElement('div');
    el.className = 'view';
    view.replaceChildren(el);
    currentCleanup = await mod.mount(el, { query: Object.fromEntries(u.searchParams), navigate, live, setUnread, setWallet });
  } catch (err) {
    if (token !== navToken) return;
    view.innerHTML = `<div class="view card">${err?.status === 503 ? '<div class="empty"><i class="fa-solid fa-screwdriver-wrench"></i><strong>Maintenance in progress</strong></div>'
      : `<div class="empty"><i class="fa-solid fa-plug-circle-xmark"></i><div><strong>Could not load this page</strong></div><div class="small">${esc(err.message || '')}</div>
      <button class="btn btn-primary btn-sm" style="margin-top:12px" data-retry>Retry</button></div>`}</div>`;
    $('[data-retry]', view)?.addEventListener('click', () => render(route, u));
  }
}

// ------------------------------------------------------------------ global events
function bindGlobal() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (a && !a.target && !a.hasAttribute('download') && a.origin === location.origin && !e.metaKey && !e.ctrlKey && !e.shiftKey && resolve(a.pathname)) {
      e.preventDefault();
      navigate(a.pathname + a.search);
      return;
    }
    if (e.target.closest('[data-menu]')) return openDrawer(true);
    if (e.target.closest('#scrim')) return openDrawer(false);
    if (e.target.closest('[data-notifications]')) return toggleNotifications();
    if (e.target.closest('[data-read-all]')) {
      api('/notifications/read-all', { method: 'POST' }).then(() => { setUnread(0); $$('.notif-item.unread').forEach((x) => x.classList.remove('unread')); });
      return;
    }
    const n = e.target.closest('[data-notif]');
    if (n) return openNotification(n);
    if (e.target.closest('[data-profile]')) return profileSheet();
    if (e.target.closest('[data-logout]')) return logout();
    const t = e.target.closest('[data-theme-set]');
    if (t) return applyTheme(t.dataset.themeSet);
    if (e.target.closest('[data-theme-flip]')) return applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    if (popover && !e.target.closest('.popover')) { popover.remove(); popover = null; }
  });

  window.addEventListener('popstate', () => {
    const route = resolve(location.pathname);
    if (route) render(route, new URL(location.href)); else location.reload();
  });

  document.addEventListener('keydown', (e) => {
    const gs = e.target.closest?.('[data-global-search]');
    if (gs && e.key === 'Enter') {
      const q = gs.value.trim();
      if (/^\d{5,8}$/.test(q)) navigate(`/access?serial=${q}`);
      else if (/^[A-Za-z0-9]{3,12}$/.test(q) && /\d/.test(q)) navigate(`/otp?q=${encodeURIComponent(q)}`);
      else navigate('/access');
    }
  });

  live.on('notification:new', (n) => {
    setUnread(state.unread + 1);
    toast(n.title, 'info');
    playSound('notify');
  });
  live.on('wallet:update', (w) => setWallet({ balance: w.balance }));
  live.on('maintenance', (m) => { if (m.active && state.user.role !== 'admin') location.reload(); });
  document.addEventListener('aura:maintenance', () => { if (state.user?.role !== 'admin') location.reload(); });

  // swipe from the left edge opens the drawer on touch devices
  let sx = null;
  document.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX < 18 ? e.touches[0].clientX : null; }, { passive: true });
  document.addEventListener('touchend', (e) => { if (sx !== null && e.changedTouches[0].clientX - sx > 70) openDrawer(true); sx = null; }, { passive: true });
  $('#sidebar').addEventListener('touchstart', (e) => { sx = -e.touches[0].clientX; }, { passive: true });
}

// ------------------------------------------------------------------ PWA
let deferredInstall = null;
export function canInstall() { return !!deferredInstall; }
export async function promptInstall() {
  if (!deferredInstall) return false;
  deferredInstall.prompt();
  const r = await deferredInstall.userChoice;
  deferredInstall = null;
  return r.outcome === 'accepted';
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; live.emit('pwa:installable', true); });
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(() => {}));
}

// ------------------------------------------------------------------ boot
(async function boot() {
  try {
    const me = await api('/me');
    Object.assign(state, { user: me.user, site: me.site, csrf: me.csrfToken, wallet: me.wallet, unread: me.unread, premium: me.premium });
    if (!me.user) { location.href = `/login?next=${encodeURIComponent(location.pathname)}`; return; }
    let stored = null;
    try { stored = localStorage.getItem('aura.theme'); } catch { /* ignore */ }
    applyTheme(stored || me.user.theme || me.site.default_theme || 'light', { persist: false });
    renderShell();
    bindGlobal();
    connectLive();
    await navigate(location.pathname + location.search, { replace: true, scroll: false });
  } catch (err) {
    if (err.status !== 401) $('#view').innerHTML = `<div class="card empty"><i class="fa-solid fa-wifi"></i><div><strong>Unable to connect</strong></div><div class="small">${esc(err.message)}</div></div>`;
  }
}());
