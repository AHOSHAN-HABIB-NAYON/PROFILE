/* Premium Aura — shared frontend utilities (ES module). */

export const state = { user: null, site: {}, csrf: null, wallet: null, unread: 0, premium: null };

// ------------------------------------------------------------------ escaping
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ------------------------------------------------------------------ API client
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.body = body || {};
  }
}

async function ensureCsrf() {
  if (state.csrf) return state.csrf;
  const r = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  state.csrf = (await r.json()).csrfToken;
  return state.csrf;
}

export async function api(path, { method = 'GET', body, form, query, retry = true } = {}) {
  let url = path.startsWith('/api') ? path : `/api${path}`;
  if (query) {
    const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    if ([...q].length) url += `?${q}`;
  }
  const headers = { Accept: 'application/json', 'X-Requested-With': 'fetch' };
  let payload;
  if (method !== 'GET') headers['X-CSRF-Token'] = await ensureCsrf();
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (res.status === 403 && data?.code === 'CSRF' && retry) {
    state.csrf = null;
    return api(path, { method, body, form, query, retry: false });
  }
  if (res.status === 401 && !location.pathname.match(/^\/(login|register|forgot-password|reset-password)/)) {
    location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
  }
  if (res.status === 503 && data?.maintenance) {
    document.dispatchEvent(new CustomEvent('aura:maintenance', { detail: data.maintenance }));
  }
  if (!res.ok || data?.ok === false) throw new ApiError(res.status, data);
  return data;
}

// ------------------------------------------------------------------ toasts
const TOAST_ICONS = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };
export function toast(message, type = 'success', ms = 3200) {
  let stack = $('.toast-stack');
  if (!stack) { stack = document.createElement('div'); stack.className = 'toast-stack'; stack.setAttribute('role', 'status'); document.body.append(stack); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${TOAST_ICONS[type] || TOAST_ICONS.info}"></i><span>${esc(message)}</span>`;
  stack.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}
export const toastError = (err) => toast(err?.message || 'Something went wrong', 'error', 4200);

// ------------------------------------------------------------------ bottom sheet / modal
export function sheet({ title, icon = '', body = '', foot = '', wide = false, onOpen } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const el = document.createElement('div');
  el.className = `sheet${wide ? ' wide' : ''}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="grabber"></div><div class="sheet-head">${icon ? `<span class="li-ic system" style="width:38px;height:38px;font-size:15px"><i class="${esc(icon)}"></i></span>` : ''}
    <h2>${esc(title || '')}</h2><button class="icon-btn" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="sheet-body">${body}</div>${foot ? `<div class="sheet-foot">${foot}</div>` : ''}`;
  document.body.append(backdrop, el);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => { backdrop.classList.add('show'); el.classList.add('show'); });
  let startY = null;
  const close = () => {
    backdrop.classList.remove('show'); el.classList.remove('show');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { backdrop.remove(); el.remove(); }, 320);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  // swipe-down to dismiss on touch devices
  el.addEventListener('touchstart', (e) => { if (el.scrollTop <= 0) startY = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) el.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (startY === null) return;
    const dy = e.changedTouches[0].clientY - startY;
    el.style.transform = '';
    startY = null;
    if (dy > 110) close();
  });
  const api = { el, close, body: el.querySelector('.sheet-body') };
  onOpen?.(api);
  return api;
}

export function confirmSheet({ title = 'Are you sure?', message = '', confirm = 'Confirm', danger = false, input = null }) {
  return new Promise((resolve) => {
    let done = false;
    const s = sheet({
      title,
      icon: danger ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-question',
      body: `<p class="muted">${esc(message)}</p>${input ? `<div class="field"><label>${esc(input.label)}</label><input class="input" name="value" type="${esc(input.type || 'text')}" placeholder="${esc(input.placeholder || '')}" value="${esc(input.value || '')}"></div>` : ''}`,
      foot: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(confirm)}</button>`,
    });
    s.el.querySelector('[data-ok]').addEventListener('click', () => {
      done = true;
      const val = input ? s.el.querySelector('[name=value]').value : true;
      s.close();
      resolve(val);
    });
    const obs = new MutationObserver(() => { if (!document.body.contains(s.el)) { obs.disconnect(); if (!done) resolve(null); } });
    obs.observe(document.body, { childList: true });
  });
}

// ------------------------------------------------------------------ forms
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'file') continue;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else if (el.multiple) out[el.name] = [...el.selectedOptions].map((o) => o.value);
    else out[el.name] = el.value;
  }
  return out;
}

export async function withLoading(btn, fn) {
  if (!btn) return fn();
  btn.classList.add('loading');
  btn.disabled = true;
  try { return await fn(); } finally { btn.classList.remove('loading'); btn.disabled = false; }
}

// ------------------------------------------------------------------ time
export function userTimezone() {
  const tz = state.user?.timezone;
  return !tz || tz === 'auto' ? undefined : tz;
}

export function relTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 1) return 'just now';
  if (s < 60) return `${s} sec ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return fmtDate(iso);
}

export function fmtDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return '—';
  try { return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: userTimezone() }).format(new Date(iso)); } catch { return new Date(iso).toLocaleDateString(); }
}
export const fmtDateTime = (iso) => fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtTime = (iso) => fmtDate(iso, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// keep relative timestamps fresh
// Live "x sec ago" labels: every second for the first minute, then every 30 seconds.
let relTick = 0;
setInterval(() => {
  relTick += 1;
  for (const el of $$('[data-rel]')) {
    if (relTick % 30 === 0 || Date.now() - new Date(el.dataset.rel).getTime() < 61_000) el.textContent = relTime(el.dataset.rel);
  }
}, 1000);
export const relEl = (iso) => `<time data-rel="${esc(iso)}" datetime="${esc(iso)}" title="${esc(fmtDateTime(iso))}">${esc(relTime(iso))}</time>`;

// ------------------------------------------------------------------ money / numbers
export const money = (v) => {
  const s = String(v ?? '0');
  const [i, f = ''] = s.replace('-', '').split('.');
  const frac = (f + '00').replace(/0+$/, '').padEnd(2, '0');
  return `${s.startsWith('-') ? '-' : ''}${state.site.currency_symbol || '$'}${Number(i).toLocaleString('en-US')}.${frac}`;
};
export const num = (n) => Number(n || 0).toLocaleString('en-US');

export function animateCount(el, to, { decimals = 0, prefix = '', duration = 900 } = {}) {
  const target = Number(to) || 0;
  const start = performance.now();
  const from = 0;
  const step = (t) => {
    const p = Math.min(1, (t - start) / duration);
    const eased = 1 - (1 - p) ** 3;
    const val = from + (target - from) * eased;
    el.textContent = prefix + val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ------------------------------------------------------------------ icons
const APPS = {
  TG: { i: 'fa-brands fa-telegram', c: '#229ED9', n: 'Telegram' },
  WS: { i: 'fa-brands fa-whatsapp', c: '#25D366', n: 'WhatsApp' },
  FB: { i: 'fa-brands fa-facebook-f', c: '#1877F2', n: 'Facebook' },
  IG: { i: 'fa-brands fa-instagram', c: 'linear-gradient(45deg,#f58529,#dd2a7b,#8134af)', n: 'Instagram' },
  TT: { i: 'fa-brands fa-tiktok', c: '#111111', n: 'TikTok' },
  IMO: { t: 'imo', c: '#1c8cff', n: 'IMO' },
  GG: { i: 'fa-brands fa-google', c: '#EA4335', n: 'Google' },
  MS: { i: 'fa-brands fa-microsoft', c: '#00A4EF', n: 'Microsoft' },
  TW: { i: 'fa-brands fa-x-twitter', c: '#000000', n: 'X' },
  SC: { i: 'fa-brands fa-snapchat', c: '#f7d800', n: 'Snapchat' },
  VB: { i: 'fa-brands fa-viber', c: '#7360F2', n: 'Viber' },
  DC: { i: 'fa-brands fa-discord', c: '#5865F2', n: 'Discord' },
  AP: { i: 'fa-brands fa-apple', c: '#111111', n: 'Apple' },
  AMZ: { i: 'fa-brands fa-amazon', c: '#FF9900', n: 'Amazon' },
};
const APP_ALIASES = { telegram: 'TG', whatsapp: 'WS', facebook: 'FB', instagram: 'IG', tiktok: 'TT', imo: 'IMO', google: 'GG', microsoft: 'MS', twitter: 'TW', x: 'TW', snapchat: 'SC', viber: 'VB', discord: 'DC', apple: 'AP', amazon: 'AMZ' };
export const APP_LIST = Object.entries(APPS).map(([code, a]) => ({ code, name: a.n }));

export function appInfo(codeOrName) {
  const k = String(codeOrName || '').trim();
  const code = APPS[k.toUpperCase()] ? k.toUpperCase() : APP_ALIASES[k.toLowerCase()];
  return code ? { code, ...APPS[code] } : { code: k.toUpperCase().slice(0, 4) || 'SMS', i: 'fa-solid fa-comment-sms', c: 'linear-gradient(135deg,#64748b,#334155)', n: k || 'SMS' };
}

export function appIcon(codeOrName, size = '') {
  if (String(codeOrName || '').startsWith('/uploads/public/')) {
    return `<span class="app-ic ${size}" style="background:var(--card-2);overflow:hidden"><img src="${esc(codeOrName)}" alt="" loading="lazy"></span>`;
  }
  const a = appInfo(codeOrName);
  const inner = a.i ? `<i class="${a.i}"></i>` : `<span class="txt">${esc(a.t || a.code)}</span>`;
  return `<span class="app-ic ${size}" style="background:${a.c}" title="${esc(a.n)}">${inner}</span>`;
}

/** Official Binance mark (simple-icons, CC0). */
export const BINANCE_LOGO = '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path fill="#F0B90B" d="M16.624 13.9202l2.7175 2.7154-7.353 7.353-7.353-7.352 2.7175-2.7164 4.6355 4.6595 4.6356-4.6595zm4.6366-4.6366L24 12l-2.7154 2.7164L18.5682 12l2.6924-2.7164zm-9.272.001l2.7163 2.6914-2.7164 2.7174v-.001L9.2721 12l2.7164-2.7154zm-9.2722-.001L5.4088 12l-2.6914 2.6924L0 12l2.7164-2.7164zM11.9885.0115l7.353 7.329-2.7174 2.7154-4.6356-4.6356-4.6355 4.6595-2.7174-2.7154 7.353-7.353z"/></svg>';
export const TETHER_LOGO = '<span class="tether-mark" aria-hidden="true">₮</span>';

export const flag = (code) => `<span class="flag fi fi-${esc(String(code || 'xx').toLowerCase().slice(0, 8))} fis" title="${esc(String(code || '').toUpperCase())}"></span>`;

// ------------------------------------------------------------------ misc UI
export function chip(status, label) {
  const s = String(status || '').toLowerCase();
  return `<span class="chip ${esc(s)}">${esc(label || s.replace(/_/g, ' '))}</span>`;
}

export function empty(icon, title, sub = '') {
  return `<div class="empty"><i class="${esc(icon)}"></i><div><strong>${esc(title)}</strong></div>${sub ? `<div class="small">${esc(sub)}</div>` : ''}</div>`;
}

export function skeleton(kind = 'page') {
  if (kind === 'list') return Array.from({ length: 6 }, () => '<div class="skeleton sk-line" style="height:52px;border-radius:14px"></div>').join('');
  return `<div class="skeleton sk-title"></div><div class="grid grid-stats">${'<div class="skeleton sk-card"></div>'.repeat(4)}</div>
    <div class="skeleton sk-block" style="margin-top:16px"></div>`;
}

export function pagination(p, onGo) {
  if (!p || p.pages <= 1) return '';
  const cur = p.page;
  const pages = new Set([1, p.pages, cur, cur - 1, cur + 1, cur - 2, cur + 2].filter((x) => x >= 1 && x <= p.pages));
  const sorted = [...pages].sort((a, b) => a - b);
  let html = `<nav class="pagination" aria-label="Pagination"><button data-page="${cur - 1}" ${cur <= 1 ? 'disabled' : ''} aria-label="Previous"><i class="fa-solid fa-chevron-left"></i></button>`;
  let prev = 0;
  for (const n of sorted) {
    if (n - prev > 1) html += '<span class="gap">…</span>';
    html += `<button data-page="${n}" class="${n === cur ? 'active' : ''}">${n}</button>`;
    prev = n;
  }
  html += `<button data-page="${cur + 1}" ${cur >= p.pages ? 'disabled' : ''} aria-label="Next"><i class="fa-solid fa-chevron-right"></i></button></nav>`;
  queueMicrotask(() => {
    for (const b of $$('.pagination button[data-page]')) {
      if (b.dataset.bound) continue;
      b.dataset.bound = '1';
      b.addEventListener('click', () => onGo(Number(b.dataset.page)));
    }
  });
  return html;
}

export async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(String(text));
  } catch {
    const ta = document.createElement('textarea');
    ta.value = String(text); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  if (btn) {
    btn.classList.add('done');
    const old = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i>';
    setTimeout(() => { btn.classList.remove('done'); btn.innerHTML = old; }, 1400);
  }
  navigator.vibrate?.(20);
  toast('Copied to clipboard', 'success', 1600);
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ------------------------------------------------------------------ sound (WebAudio, no asset needed)
let audioCtx = null;
let lastSound = 0;
export function playSound(kind = 'notify') {
  try {
    if (localStorage.getItem('aura.sound') === 'off') return;
    const now = Date.now();
    if (now - lastSound < 700) return; // never spam
    lastSound = now;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const tones = kind === 'event' ? [880, 1320] : [660, 990];
    tones.forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = audioCtx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.25);
    });
  } catch { /* audio unavailable */ }
}

// ------------------------------------------------------------------ theme
export function applyTheme(theme, { persist = true } = {}) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('aura.theme', t); } catch { /* ignore */ }
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = t === 'dark' ? '#060a18' : (state.site.pwa_theme_color || '#2563eb');
  for (const b of $$('[data-theme-set]')) b.classList.toggle('active', b.dataset.themeSet === t);
  if (persist && state.user) api('/profile/theme', { method: 'PUT', body: { theme: t } }).catch(() => {});
  document.dispatchEvent(new CustomEvent('aura:theme', { detail: t }));
}

// ------------------------------------------------------------------ brand
export function brandHtml(site = state.site, { small = false } = {}) {
  const mark = site.logo_url
    ? `<img src="${esc(site.logo_url)}" alt="" class="brand-logo"${small ? ' style="width:36px;height:36px"' : ''}>`
    : `<span class="brand-mark${small ? ' sm' : ''}"><i class="fa-solid fa-crown"></i></span>`;
  return `${mark}<span style="min-width:0"><strong>${esc(site.site_name || 'Premium Aura')}</strong><small>${esc(site.site_subtitle || 'Vip Acess Only')}</small></span>`;
}

export function pageHead(icon, title, sub = '', actions = '') {
  return `<div class="page-head"><span class="ph-icon"><i class="${esc(icon)}"></i></span><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
}
