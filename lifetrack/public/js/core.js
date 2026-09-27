/* LifeTrack core: API client, i18n, formatting, DOM helpers, sheets, toasts, micro-animations. */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion');

/* ---------- Safe HTML templating ---------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) {
      const v = vals[i];
      if (v instanceof Raw) out += v.s;
      else if (Array.isArray(v)) out += v.map((x) => (x instanceof Raw ? x.s : esc(x))).join('');
      else if (v === false || v === null || v === undefined) out += '';
      else out += esc(v);
    }
  });
  return raw(out);
}
export function el(markup) {
  const t = document.createElement('template');
  t.innerHTML = String(markup).trim();
  return t.content.childElementCount === 1 ? t.content.firstElementChild : t.content;
}
export const icon = (name, cls = '') => raw(`<svg class="i ${cls}" aria-hidden="true"><use href="#${name}"/></svg>`);
const PAY = ['bkash', 'nagad', 'rocket', 'bank', 'card', 'cash', 'wallet'];
export const payMark = (type, cls = '') => raw(`<svg class="pm ${cls}" aria-hidden="true"><use href="#pay-${PAY.includes(type) ? type : 'wallet'}"/></svg>`);
export const moodIcon = (n, cls = '') => raw(`<svg class="mood-i ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#mood-${Math.min(5, Math.max(1, n || 3))}"/></svg>`);

/* ---------- Events ---------- */
const bus = new EventTarget();
export const on = (ev, fn) => { const h = (e) => fn(e.detail); bus.addEventListener(ev, h); return () => bus.removeEventListener(ev, h); };
export const emit = (ev, detail) => bus.dispatchEvent(new CustomEvent(ev, { detail }));

/* ---------- State ---------- */
export const state = { config: null, me: null, profile: null, accounts: null, categories: null, dict: {}, lang: 'en' };

/* ---------- i18n ---------- */
export function t(key, vars) {
  let s = state.dict[key];
  if (s === undefined) s = key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
  return s;
}
export async function loadLang(lang) {
  const l = ['en', 'bn', 'hi'].includes(lang) ? lang : 'en';
  const cacheKey = 'lt-dict-' + l;
  try { const c = JSON.parse(localStorage.getItem(cacheKey) || 'null'); if (c && !Object.keys(state.dict).length) state.dict = c; } catch {}
  try {
    const r = await fetch(`/api/public/i18n/${l}`, { credentials: 'same-origin' });
    if (r.ok) { state.dict = await r.json(); try { localStorage.setItem(cacheKey, JSON.stringify(state.dict)); } catch {} }
  } catch { /* offline: cached dictionary */ }
  state.lang = l;
  document.documentElement.lang = l;
  try { localStorage.setItem('lt-lang', l); } catch {}
  $$('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  $$('[data-i18n-title]').forEach((n) => { n.title = t(n.dataset.i18nTitle); n.setAttribute('aria-label', t(n.dataset.i18nTitle)); });
}

/* ---------- API client ---------- */
export class ApiError extends Error {
  constructor(status, code, message, fields) { super(message); this.status = status; this.code = code; this.fields = fields || null; }
}
const getCookie = (n) => document.cookie.split('; ').find((c) => c.startsWith(n + '='))?.split('=')[1] || '';
const cache = new Map();
export function clearCache(prefix) { for (const k of [...cache.keys()]) if (!prefix || k.startsWith(prefix)) cache.delete(k); }

async function request(method, url, body, opts = {}) {
  const headers = { Accept: 'application/json' };
  const csrf = getCookie('lt_csrf');
  if (csrf) headers['X-CSRF-Token'] = csrf;
  if (opts.idem) headers['Idempotency-Key'] = opts.idem;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || 20000);
  let res;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin', signal: ctrl.signal });
  } catch (e) {
    clearTimeout(timer);
    throw new ApiError(0, navigator.onLine ? 'network' : 'offline', navigator.onLine ? t('err.network') : t('err.offline'));
  }
  clearTimeout(timer);
  let data = null;
  try { data = await res.json(); } catch { /* non-json */ }
  if (!res.ok || !data || data.ok === false) {
    const e = data?.error || {};
    if (res.status === 403 && e.code === 'csrf_failed' && !opts._retried) {
      await fetch('/api/public/config', { credentials: 'same-origin' });
      return request(method, url, body, { ...opts, _retried: true });
    }
    if (res.status === 401 && ['unauthenticated'].includes(e.code) && !opts.noAuthRedirect) emit('auth:lost');
    const msg = state.dict['err.' + e.code] || e.message || t('err.server');
    throw new ApiError(res.status, e.code || 'server_error', msg, e.fields);
  }
  return data.data;
}

export const api = {
  async get(url, { maxAge = 0, force = false } = {}) {
    const c = cache.get(url);
    if (!force && c && Date.now() - c.at < maxAge) return c.data;
    const d = await request('GET', url);
    cache.set(url, { at: Date.now(), data: d });
    return d;
  },
  peek: (url) => cache.get(url)?.data,
  post: (url, body, opts) => { clearCache(); return request('POST', url, body ?? {}, opts); },
  patch: (url, body, opts) => { clearCache(); return request('PATCH', url, body ?? {}, opts); },
  put: (url, body, opts) => { clearCache(); return request('PUT', url, body ?? {}, opts); },
  del: (url, opts) => { clearCache(); return request('DELETE', url, undefined, opts); },
  upload: (url, file, field = 'file') => { const f = new FormData(); f.append(field, file); clearCache(); return request('POST', url, f, { timeout: 60000 }); },
};

/* ---------- Formatting ---------- */
const LOCALE = () => ({ bn: 'bn-BD', hi: 'hi-IN' }[state.lang] || 'en-US');
export function currencyOf(code) {
  const list = state.config?.currencies || [];
  return list.find((c) => c.code === code) || { code, symbol: code + ' ' };
}
export function money(amount, code, { sign = false, compact = false, decimals } = {}) {
  const cur = code || state.profile?.currency || 'BDT';
  const n = Number(amount) || 0;
  const abs = Math.abs(n);
  let s;
  if (compact && abs >= 1e5) s = new Intl.NumberFormat(LOCALE(), { notation: 'compact', maximumFractionDigits: 1 }).format(abs);
  else s = new Intl.NumberFormat(LOCALE(), { minimumFractionDigits: decimals ?? (abs % 1 ? 2 : 0), maximumFractionDigits: decimals ?? 2 }).format(abs);
  const sym = currencyOf(cur).symbol;
  const pre = n < 0 ? '−' : sign && n > 0 ? '+' : '';
  return `${pre}${sym}${s}`;
}
export const num = (n, d = 0) => new Intl.NumberFormat(LOCALE(), { maximumFractionDigits: d }).format(Number(n) || 0);
const tz = () => state.profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
export function fmtDate(d, style) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return '';
  const f = style || state.profile?.date_format || 'DD MMM YYYY';
  const parts = Object.fromEntries(new Intl.DateTimeFormat(LOCALE(), { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map((p) => [p.type, p.value]));
  if (f === 'DD/MM/YYYY') return `${parts.day}/${parts.month}/${parts.year}`;
  if (f === 'MM/DD/YYYY') return `${parts.month}/${parts.day}/${parts.year}`;
  if (f === 'YYYY-MM-DD') return `${parts.year}-${parts.month}-${parts.day}`;
  if (f === 'short') return new Intl.DateTimeFormat(LOCALE(), { timeZone: tz(), day: 'numeric', month: 'short' }).format(date);
  if (f === 'long') return new Intl.DateTimeFormat(LOCALE(), { timeZone: tz(), weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  return new Intl.DateTimeFormat(LOCALE(), { timeZone: tz(), day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}
/** Parse a server DATE (YYYY-MM-DD or midnight UTC ISO) as a calendar day (no timezone shift). */
export function fmtDay(d, style) {
  if (!d) return '';
  const s = String(d).slice(0, 10);
  const date = new Date(s + 'T12:00:00Z');
  const saved = state.profile; state.profile = { ...(saved || {}), timezone: 'UTC' };
  try { return fmtDate(date, style); } finally { state.profile = saved; }
}
export function fmtTime(d) {
  const date = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat(LOCALE(), { timeZone: tz(), hour: 'numeric', minute: '2-digit', hour12: (state.profile?.time_format || '12') === '12' }).format(date);
}
export function localDateStr(d = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
export function localDateTimeInput(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
/** Convert a datetime-local value interpreted in the user's timezone into an ISO instant */
export function inputToIso(v) {
  if (!v) return new Date().toISOString();
  const [d, tm = '00:00'] = v.split('T');
  const guess = new Date(`${d}T${tm}:00Z`);
  const off = tzOffset(guess);
  return new Date(guess.getTime() - off * 60000).toISOString();
}
export function tzOffset(at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz(), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}
export function relTime(d) {
  const date = d instanceof Date ? d : new Date(d);
  const diff = (date.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(LOCALE(), { numeric: 'auto' });
  const a = Math.abs(diff);
  if (a < 60) return rtf.format(Math.round(diff), 'second');
  if (a < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (a < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return fmtDate(date);
}
export function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz(), hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return t(h < 5 ? 'greet.night' : h < 12 ? 'greet.morning' : h < 17 ? 'greet.afternoon' : h < 21 ? 'greet.evening' : 'greet.night');
}

/* ---------- Micro animations ---------- */
export function countUp(node, to, format = (v) => num(v), dur = 900) {
  if (!node) return;
  const from = Number(node.dataset.val || 0);
  node.dataset.val = to;
  if (reduceMotion() || from === to) { node.textContent = format(to); return; }
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - p, 4);
    node.textContent = format(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step); else node.textContent = format(to);
  };
  requestAnimationFrame(step);
}
export function animateProgress(root = document) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('.progress > span[data-w]', root).forEach((s) => { s.style.width = Math.min(100, Number(s.dataset.w)) + '%'; });
    $$('.ring .fg[data-p]', root).forEach((c) => { const len = Number(c.getAttribute('stroke-dasharray')); c.style.strokeDashoffset = String(len - (len * Math.min(100, Number(c.dataset.p))) / 100); });
  }));
}
export function ring(p, color = 'var(--primary)', size = 48) {
  const r = (size - 6) / 2; const len = 2 * Math.PI * r;
  return raw(`<div class="ring" style="--rc:${esc(color)};width:${size}px;height:${size}px"><svg width="${size}" height="${size}"><circle class="bg" cx="${size / 2}" cy="${size / 2}" r="${r}"/><circle class="fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-dasharray="${len}" stroke-dashoffset="${len}" data-p="${Number(p) || 0}"/></svg><span>${Math.round(Number(p) || 0)}%</span></div>`);
}
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.btn, .icon-btn, .qa button, .qadd button');
  if (!b || reduceMotion()) return;
  const r = b.getBoundingClientRect(); const s = Math.max(r.width, r.height);
  const sp = document.createElement('span');
  sp.className = 'ripple';
  sp.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
  if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
  b.style.overflow = 'hidden';
  b.appendChild(sp); setTimeout(() => sp.remove(), 600);
}, { passive: true });
export function shake(node) { if (!node) return; node.classList.remove('shake'); void node.offsetWidth; node.classList.add('shake'); }

/* ---------- Toasts ---------- */
export function toast(message, { type = 'success', action, timeout = 3200 } = {}) {
  let wrap = $('.toasts');
  if (!wrap) { wrap = el('<div class="toasts" role="status" aria-live="polite"></div>'); document.body.appendChild(wrap); }
  const map = { success: ['check-circle', 'var(--green)'], error: ['alert', 'var(--red)'], info: ['info', 'var(--primary)'], warn: ['alert', 'var(--orange)'] };
  const [ic, c] = map[type] || map.info;
  const n = el(html`<div class="toast"><span class="tile" style="--c:${c}">${icon(ic)}</span><span>${message}</span>${action ? html`<button class="btn btn-sm btn-soft t-actions">${action.label}</button>` : ''}</div>`);
  if (action) n.querySelector('button').onclick = () => { action.fn(); close(); };
  wrap.appendChild(n);
  const close = () => { n.classList.add('out'); setTimeout(() => n.remove(), 260); };
  setTimeout(close, timeout);
  return close;
}

/* ---------- Bottom sheets / modals ---------- */
const sheets = [];
export function openSheet({ title = '', body, foot, wide = false, onClose, className = '' } = {}) {
  const id = uid();
  const overlay = el('<div class="overlay"></div>');
  const sheet = el(html`<section class="sheet ${wide ? 'wide' : ''} ${className}" role="dialog" aria-modal="true" aria-label="${title}">
    <div class="sheet-grip"></div>
    ${title ? html`<header class="sheet-head"><h3>${title}</h3><button class="icon-btn" data-close aria-label="${t('common.close')}">${icon('x')}</button></header>` : ''}
    <div class="sheet-body"></div>${foot ? raw('<footer class="sheet-foot"></footer>') : ''}</section>`);
  const bodyEl = sheet.querySelector('.sheet-body');
  if (body) bodyEl.append(typeof body === 'string' || body instanceof Raw ? el(body) : body);
  if (foot) sheet.querySelector('.sheet-foot').append(typeof foot === 'string' || foot instanceof Raw ? el(foot) : foot);
  document.body.append(overlay, sheet);
  const prevFocus = document.activeElement;
  let closed = false;
  const api = {
    id, el: sheet, body: bodyEl,
    close(fromPop = false) {
      if (closed) return; closed = true;
      const i = sheets.indexOf(api); if (i >= 0) sheets.splice(i, 1);
      overlay.classList.remove('show'); sheet.classList.remove('show');
      setTimeout(() => { overlay.remove(); sheet.remove(); }, 420);
      document.removeEventListener('keydown', onKey);
      if (!fromPop && history.state?.sheet === id) history.back();
      if (!sheets.length) document.body.style.overflow = '';
      prevFocus?.focus?.({ preventScroll: true });
      onClose?.();
    },
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && sheets[sheets.length - 1] === api) api.close();
    if (e.key === 'Tab') { // focus trap
      const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', sheet).filter((x) => !x.disabled && x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  document.addEventListener('keydown', onKey);
  overlay.onclick = () => api.close();
  sheet.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => api.close(); });
  // drag-to-dismiss on the grip (mobile)
  const grip = sheet.querySelector('.sheet-grip');
  let startY = null;
  const head = sheet.querySelector('.sheet-head') || grip;
  [grip, head].forEach((g) => g && g.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; sheet.style.transition = 'none'; }, { passive: true }));
  sheet.addEventListener('touchmove', (e) => { if (startY === null) return; const dy = Math.max(0, e.touches[0].clientY - startY); sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
  sheet.addEventListener('touchend', (e) => { if (startY === null) return; const dy = e.changedTouches[0].clientY - startY; startY = null; sheet.style.transition = ''; sheet.style.transform = ''; if (dy > 90) api.close(); });
  sheets.push(api);
  document.body.style.overflow = 'hidden';
  history.pushState({ ...(history.state || {}), sheet: id }, '');
  requestAnimationFrame(() => requestAnimationFrame(() => { overlay.classList.add('show'); sheet.classList.add('show'); }));
  setTimeout(() => { const f = sheet.querySelector('[autofocus], input:not([type=hidden]), select, textarea'); if (f && matchMedia('(min-width: 720px)').matches) f.focus({ preventScroll: true }); }, 380);
  return api;
}
export const topSheet = () => sheets[sheets.length - 1];
export const closeAllSheets = () => [...sheets].reverse().forEach((s) => s.close(true));

export function confirmDialog({ title, message, confirm = t('common.confirm'), danger = false, input = null }) {
  return new Promise((resolve) => {
    let done = false;
    const body = el(html`<div><p class="t2" style="font-size:13.5px">${message}</p>${input ? html`<div class="field" style="margin-top:12px"><label>${input.label}</label><input class="input" type="${input.type || 'text'}" autocomplete="${input.autocomplete || 'off'}"></div>` : ''}</div>`);
    const foot = el(html`<div style="display:flex;gap:10px;width:100%"><button class="btn btn-outline btn-block" data-no>${t('common.cancel')}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block" data-yes>${confirm}</button></div>`);
    const s = openSheet({ title, body, foot, onClose: () => { if (!done) resolve(false); } });
    foot.querySelector('[data-no]').onclick = () => s.close();
    foot.querySelector('[data-yes]').onclick = () => { done = true; const v = input ? body.querySelector('input').value : true; s.close(); resolve(v); };
  });
}

/* ---------- Forms ---------- */
export function formErrors(form, e) {
  $$('.field.error', form).forEach((f) => { f.classList.remove('error'); f.querySelector('.err')?.remove(); });
  if (e?.fields) {
    for (const [name, code] of Object.entries(e.fields)) {
      const input = form.querySelector(`[name="${name}"]`);
      const field = input?.closest('.field');
      if (field) { field.classList.add('error'); field.append(el(html`<span class="err">${t('val.' + code)}</span>`)); }
    }
  }
  shake(form.closest('.sheet') || form);
}
export async function withBusy(btn, fn) {
  if (!btn || btn.disabled) return;
  btn.disabled = true; btn.classList.add('loading');
  if (!btn.querySelector('.spinner')) btn.append(el('<span class="spinner"></span>'));
  try { return await fn(); } finally { btn.disabled = false; btn.classList.remove('loading'); btn.querySelector('.spinner')?.remove(); }
}
export function segmented(container, onChange) {
  const btns = $$('button', container);
  let thumb = container.querySelector('.seg-thumb');
  if (!thumb) { thumb = el('<span class="seg-thumb"></span>'); container.prepend(thumb); }
  const move = (b) => { thumb.style.width = b.offsetWidth + 'px'; thumb.style.transform = `translateX(${b.offsetLeft - 3}px)`; };
  btns.forEach((b) => b.addEventListener('click', () => { btns.forEach((x) => x.classList.toggle('active', x === b)); move(b); onChange?.(b.dataset.v); }));
  const act = btns.find((b) => b.classList.contains('active')) || btns[0];
  requestAnimationFrame(() => move(act));
  new ResizeObserver(() => { const a = btns.find((b) => b.classList.contains('active')); if (a) move(a); }).observe(container);
}

/* ---------- Empty/error state helpers ---------- */
export const emptyIllus = raw(`<svg class="illus" viewBox="0 0 120 90" aria-hidden="true"><defs><linearGradient id="eg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5B8CFF"/><stop offset="1" stop-color="#2DD4BF"/></linearGradient></defs><ellipse cx="60" cy="80" rx="40" ry="5" fill="currentColor" opacity=".08"/><rect x="28" y="28" width="64" height="44" rx="10" fill="url(#eg)" opacity=".18"/><rect x="34" y="20" width="52" height="40" rx="9" fill="var(--surface)" stroke="url(#eg)" stroke-width="2"/><path d="M44 34h32M44 42h22" stroke="url(#eg)" stroke-width="3" stroke-linecap="round" opacity=".7"/><circle cx="86" cy="22" r="9" fill="url(#eg)"/><path d="M82.5 22h7M86 18.5v7" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`);
export const emptyState = (title, text, actionHtml = '') => html`<div class="empty">${emptyIllus}<h4>${title}</h4><p>${text}</p>${raw(String(actionHtml))}</div>`;
export const errorState = (message) => html`<div class="empty"><span class="tile tile-lg" style="--c:var(--red)">${icon('wifi-off')}</span><h4>${t('state.error_title')}</h4><p>${message}</p><button class="btn btn-soft btn-sm" data-retry>${icon('refresh', 'i-sm')}${t('common.retry')}</button></div>`;
export const skeletonRows = (n = 4) => raw(Array.from({ length: n }, () => '<div class="li"><div class="sk sk-circle" style="width:36px;height:36px;border-radius:11px"></div><div class="li-main" style="display:grid;gap:6px"><div class="sk sk-line" style="width:55%"></div><div class="sk sk-line" style="width:35%;height:9px"></div></div><div class="sk sk-line" style="width:60px"></div></div>').join(''));

/* ---------- Transaction helpers ---------- */
export const TX_META = {
  income: { icon: 'income', c: 'var(--green)', sign: 1 }, expense: { icon: 'expense', c: 'var(--red)', sign: -1 },
  investment: { icon: 'trend-up', c: 'var(--violet)', sign: -1 }, transfer: { icon: 'transfer', c: 'var(--primary)', sign: 0 },
  deposit: { icon: 'piggy', c: 'var(--teal)', sign: 1 }, lend: { icon: 'lend', c: 'var(--orange)', sign: -1 }, borrow: { icon: 'borrow', c: 'var(--pink)', sign: 1 },
  repay_in: { icon: 'arrow-down-left', c: 'var(--green)', sign: 1 }, repay_out: { icon: 'arrow-up-right', c: 'var(--orange)', sign: -1 }, adjustment: { icon: 'edit', c: 'var(--muted)', sign: 1 },
};
export function txRow(tx, { swipe = false, pending = false } = {}) {
  const m = TX_META[tx.type] || TX_META.expense;
  const sign = tx.type === 'adjustment' ? Math.sign(Number(tx.amount)) : m.sign;
  const title = tx.category_name || (tx.type === 'transfer' ? `${tx.account_name} → ${tx.to_account_name}` : t('tx.type.' + tx.type));
  const sub = [tx.type === 'transfer' ? t('tx.type.transfer') : tx.account_name, tx.note].filter(Boolean).join(' · ');
  const ic = tx.category_icon || m.icon;
  const col = tx.category_color || m.c;
  const amt = money(Math.abs(Number(tx.amount)) * (sign || 1), tx.currency, { sign: sign > 0 });
  const row = html`<button class="li" data-tx="${tx.id || ''}"><span class="tile" style="--c:${col}">${icon(ic)}</span><span class="li-main"><span class="li-title">${title}</span><span class="li-sub">${sub}</span></span><span class="li-end"><span class="li-amt ${sign > 0 ? 'pos' : sign < 0 ? 'neg' : ''}">${amt}</span><span class="li-sub">${pending ? html`<span class="pending-pill">${icon('clock', 'i-xs')}${t('tx.pending')}</span>` : fmtTime(tx.occurred_at)}</span></span></button>`;
  if (!swipe) return row;
  return html`<div class="swipe" data-swipe="${tx.id || ''}"><div class="swipe-bg">${icon('trash', 'i-sm')}${t('common.delete')}</div>${row}</div>`;
}

/** Swipe-left to delete (touch/pointer), with slide-out animation */
export function enableSwipe(root, onDelete) {
  $$('.swipe', root).forEach((w) => {
    if (w.dataset.bound) return; w.dataset.bound = '1';
    const row = w.querySelector('.li'); let x0 = null; let y0 = 0; let dx = 0; let locked = null;
    row.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; x0 = e.clientX; y0 = e.clientY; dx = 0; locked = null; });
    row.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      const mx = e.clientX - x0; const my = e.clientY - y0;
      if (locked === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) locked = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if (locked !== 'x') return;
      dx = Math.min(0, mx); w.classList.add('dragging'); row.style.transform = `translateX(${dx}px)`;
    });
    const end = async () => {
      if (x0 === null) return; x0 = null; w.classList.remove('dragging');
      if (dx < -110) {
        row.style.transform = 'translateX(-100%)';
        const okDel = await onDelete(w.dataset.swipe, w);
        if (okDel) { w.classList.add('removing'); setTimeout(() => w.remove(), 400); } else row.style.transform = '';
      } else row.style.transform = '';
      if (Math.abs(dx) > 8) { row.dataset.noclick = '1'; setTimeout(() => delete row.dataset.noclick, 50); }
    };
    row.addEventListener('pointerup', end); row.addEventListener('pointercancel', end);
  });
}
