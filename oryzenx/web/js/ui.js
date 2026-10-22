// Small UI toolkit: safe HTML templates, formatting, toasts, modals.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));

const part = (v) => {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
};

// Tagged template: every ${value} is escaped unless it is raw() or another html`` result.
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += part(v) + strings[i + 1]; });
  return new Raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function mount(el, content) { el.innerHTML = part(content); return el; }

export const icon = (name, cls = '') => raw(`<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`);

// ---------- Formatting ----------
export function usd(n, { sign = false, compact = false } = {}) {
  const v = Number(n || 0);
  const s = Math.abs(v).toLocaleString('en-US', compact && Math.abs(v) >= 1e6
    ? { notation: 'compact', maximumFractionDigits: 2 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pre = v < 0 ? '-' : sign && v > 0 ? '+' : '';
  return `${pre}$${s}`;
}

export function price(p) {
  const v = Number(p || 0);
  if (!v) return '0.00';
  const a = Math.abs(v);
  const d = a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : a >= 0.0001 ? 7 : 10;
  return v.toLocaleString('en-US', { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d });
}

export const qty = (q) => Number(q || 0).toLocaleString('en-US', { maximumFractionDigits: 8 });
export const pct = (p, sign = true) => `${sign && p > 0 ? '+' : ''}${Number(p || 0).toFixed(2)}%`;
export const cls = (n) => (Number(n) > 0 ? 'up' : Number(n) < 0 ? 'down' : '');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Server sends "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS" in the group's time zone; show as-is.
export function date(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}
export function dateTime(s) {
  if (!s) return '—';
  return `${date(s)}, ${String(s).slice(11, 16)}`;
}
export function monthName(m) {
  const [y, mm] = String(m).split('-');
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(mm) - 1]} ${y}`;
}
export function ordinal(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
}
export function ago(s) {
  if (!s) return '';
  const t = Date.parse(String(s).replace(' ', 'T') + '+06:00');
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return date(s);
}

// ---------- Pieces ----------
const COIN_COLORS = {
  BTC: '#f7931a', ETH: '#627eea', SOL: '#9945ff', BNB: '#f0b90b', XRP: '#23292f', SUI: '#4da2ff', ZEC: '#e5a93d',
  PEPE: '#3d9a37', DOGE: '#c2a633', ADA: '#0033ad', USDT: '#26a17b', TRX: '#eb0029', LINK: '#2a5ada', AVAX: '#e84142',
};
export function coinIcon(c) {
  let color = COIN_COLORS[c];
  if (!color) { let h = 0; for (const ch of c) h = (h * 31 + ch.charCodeAt(0)) % 360; color = `hsl(${h} 60% 45%)`; }
  return html`<span class="coin-ico" style="background:${color}">${c.slice(0, 4)}</span>`;
}

export function avatar(u, size = '') {
  if (u?.avatar_url) return html`<img class="avatar ${size}" src="${u.avatar_url}" alt="" loading="lazy">`;
  const initials = String(u?.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return html`<span class="avatar ${size}">${initials}</span>`;
}

export const empty = (text, ic = 'history') => html`<div class="empty">${icon(ic)}<div>${text}</div></div>`;
export const skeleton = (h = 90, n = 1) => html`${Array.from({ length: n }, () => html`<div class="skel" style="height:${h}px;margin-bottom:12px"></div>`)}`;

// ---------- Toasts ----------
export function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  mount(el, html`${icon(type === 'ok' ? 'check' : 'x')}<span>${msg}</span>`);
  $('#toasts').append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, type === 'ok' ? 2600 : 4200);
}

// ---------- Modal ----------
export function modal({ title, body, foot = null, wide = false, onMount }) {
  const ov = document.createElement('div');
  ov.className = 'overlay sheet';
  mount(ov, html`<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${title}">
    <div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>${foot ? html`<div class="modal-foot">${foot}</div>` : ''}</div>`);
  const prev = document.activeElement;
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(ov);
  (ov.querySelector('input,select,textarea,button:not([data-close])') || ov.querySelector('button'))?.focus();
  const api = { el: ov, close };
  onMount?.(api);
  return api;
}

export function confirmDialog(title, text, { okLabel = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title,
      body: html`<p class="muted" style="margin:0">${text}</p>`,
      foot: html`<button class="btn ghost" data-close>Cancel</button><button class="btn ${danger ? 'danger' : ''}" data-ok>${okLabel}</button>`,
    });
    m.el.querySelector('[data-ok]').onclick = () => { done = true; m.close(); resolve(true); };
    new MutationObserver((_, obs) => { if (!m.el.isConnected) { obs.disconnect(); if (!done) resolve(false); } }).observe(document.body, { childList: true });
  });
}

// ---------- Forms ----------
export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else out[el.name] = el.value.trim();
  }
  return out;
}

// Runs an async action with a spinner on the button and shows errors in the form.
export async function busy(btn, fn, errorEl) {
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>';
  if (errorEl) errorEl.classList.add('hidden');
  try {
    return await fn();
  } catch (err) {
    if (errorEl) { errorEl.textContent = err.message; errorEl.classList.remove('hidden'); } else toast(err.message, 'err');
    return undefined;
  } finally {
    if (btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
  }
}

export function passwordField(name, label, autocomplete) {
  return html`<div class="field"><label for="f-${name}">${label}</label><div class="pw-wrap">
    <input class="input" id="f-${name}" name="${name}" type="password" autocomplete="${autocomplete}" required minlength="8">
    <button type="button" aria-label="Show password" data-toggle-pw>${icon('eye')}</button></div></div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-toggle-pw]');
  if (!b) return;
  const input = b.previousElementSibling;
  input.type = input.type === 'password' ? 'text' : 'password';
});

// Resize and compress an image in the browser before upload (keeps uploads tiny).
export function compressImage(file, maxSide = 512, type = 'image/webp', quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL(type, quality));
    };
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = URL.createObjectURL(file);
  });
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Could not read that file'));
    r.readAsDataURL(file);
  });
}

export function pager(page, limit, total) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return html`<div class="row between" style="padding:12px 16px">
    <span class="faint">Page ${page} of ${pages} · ${total} total</span>
    <span class="row"><button class="btn ghost sm" data-page="${page - 1}" ${page <= 1 ? raw('disabled') : ''}>Previous</button>
    <button class="btn ghost sm" data-page="${page + 1}" ${page >= pages ? raw('disabled') : ''}>Next</button></span></div>`;
}
