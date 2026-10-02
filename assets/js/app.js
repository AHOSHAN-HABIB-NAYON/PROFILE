/*!
 * App runtime — SPA navigation (Fetch + History API), page cache & prefetch,
 * AJAX forms, toasts, modals, share, search, notifications (poll + push),
 * PWA install/update, AI & live chat, passkeys. No dependencies.
 */
(() => {
  'use strict';

  const CFG = JSON.parse(document.getElementById('app-config').textContent);
  const BASE = CFG.base || '';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const T = (k, vars = {}) => (CFG.i18n['js.' + k] || k).replace(/\{(\w+)\}/g, (_, n) => vars[n] ?? '');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const csrf = () => document.querySelector('meta[name="csrf-token"]').content;
  const main = $('#app-main');
  const LAYOUT = CFG.admin ? 'admin' : (document.body.classList.contains('is-bare') ? 'bare' : 'app');
  const actions = {};
  const inits = {};
  let cleanups = [];

  // ------------------------------------------------------------------
  // Network helpers
  // ------------------------------------------------------------------
  function toForm(data) {
    if (data instanceof FormData) return data;
    const fd = new FormData();
    Object.entries(data || {}).forEach(([k, v]) => {
      if (Array.isArray(v)) v.forEach((x) => fd.append(k + '[]', x));
      else if (v !== undefined && v !== null) fd.append(k, typeof v === 'object' && !(v instanceof Blob) ? JSON.stringify(v) : v);
    });
    return fd;
  }

  async function api(url, { method = 'GET', data, signal, headers = {} } = {}) {
    const opts = { method, credentials: 'same-origin', signal, headers: { 'X-Requested-With': 'fetch', Accept: 'application/json', ...headers } };
    if (method !== 'GET') {
      opts.headers['X-CSRF-Token'] = csrf();
      opts.body = toForm(data);
    }
    let res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      return { ok: false, network: true, message: navigator.onLine ? T('network_error') : T('offline') };
    }
    let json;
    try { json = await res.json(); } catch { json = { ok: false, message: T('server_error') }; }
    if (typeof json !== 'object' || json === null) json = { ok: false, message: T('server_error') };
    json.status = json.status || res.status;
    if (res.status === 419) json.message = T('session_expired');
    return json;
  }

  /** POST with upload progress (XHR). */
  function xhrPost(url, fd, onProgress) {
    return new Promise((resolve) => {
      const x = new XMLHttpRequest();
      x.open('POST', url);
      x.setRequestHeader('X-Requested-With', 'fetch');
      x.setRequestHeader('X-CSRF-Token', csrf());
      x.setRequestHeader('Accept', 'application/json');
      x.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
      x.onload = () => {
        let j;
        try { j = JSON.parse(x.responseText); } catch { j = { ok: false, message: T('server_error') }; }
        j.status = j.status || x.status;
        resolve(j);
      };
      x.onerror = () => resolve({ ok: false, message: T('network_error') });
      x.send(fd);
    });
  }

  // ------------------------------------------------------------------
  // Top progress bar
  // ------------------------------------------------------------------
  const bar = $('#top-progress');
  let barTimer;
  const progress = {
    start() {
      clearTimeout(barTimer);
      bar.className = '';
      bar.style.transform = 'scaleX(0)';
      void bar.offsetWidth;
      bar.className = 'run';
      bar.style.transform = 'scaleX(.85)';
    },
    done() {
      bar.className = 'done';
      barTimer = setTimeout(() => { bar.className = ''; bar.style.transform = 'scaleX(0)'; }, 500);
    },
  };

  // ------------------------------------------------------------------
  // Toasts
  // ------------------------------------------------------------------
  const ICONS = { success: 'fa-check', error: 'fa-xmark', warning: 'fa-exclamation', info: 'fa-bell' };
  function toast(message, type = 'info', { duration = 3200, action, icon } = {}) {
    if (!message) return;
    const stack = $('#toast-stack');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `<span class="t-icon"><i class="fa-solid ${esc(icon || ICONS[type] || ICONS.info)}"></i></span><span class="grow">${esc(message)}</span>`;
    if (action) {
      const b = document.createElement('button');
      b.className = 'btn btn-sm btn-soft';
      b.textContent = action.label;
      b.onclick = () => { action.fn(); close(); };
      el.appendChild(b);
    }
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 260); };
    el.addEventListener('click', (e) => { if (!e.target.closest('button')) close(); });
    stack.appendChild(el);
    while (stack.children.length > 3) stack.firstElementChild.remove();
    if (duration) setTimeout(close, duration);
    return close;
  }

  // ------------------------------------------------------------------
  // Modal (bottom sheet on mobile, dialog on desktop)
  // ------------------------------------------------------------------
  function modal({ title = '', html = '', actions: btns = [], onOpen, wide = false } = {}) {
    return new Promise((resolve) => {
      const back = document.createElement('div');
      back.className = 'modal-backdrop';
      back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"${wide ? ' style="max-width:640px"' : ''}>
        <div class="grabber"></div>
        <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="${esc(T('close'))}"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">${html}</div>
        ${btns.length ? `<div class="modal-actions">${btns.map((b, i) => `<button class="btn ${esc(b.class || '')}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>` : ''}
      </div>`;
      const prevFocus = document.activeElement;
      let done = false;
      const close = (val = null) => {
        if (done) return;
        done = true;
        back.classList.remove('open');
        document.removeEventListener('keydown', onKey);
        setTimeout(() => back.remove(), 250);
        prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true });
        resolve(val);
      };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      back.addEventListener('click', (e) => {
        if (e.target === back || e.target.closest('[data-close]')) return close(null);
        const b = e.target.closest('[data-i]');
        if (b) {
          const def = btns[+b.dataset.i];
          if (def.onClick) { const r = def.onClick(back, close); if (r === false) return; }
          close(def.value ?? true);
        }
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(back);
      requestAnimationFrame(() => back.classList.add('open'));
      const f = back.querySelector('input,textarea,select,[data-i]');
      setTimeout(() => f && f.focus({ preventScroll: true }), 60);
      onOpen && onOpen(back, close);
    });
  }

  function confirmDialog(text, { title = T('confirm'), danger = false, ok = T('confirm'), input = null } = {}) {
    const field = input ? `<textarea class="textarea mt-2" id="confirm-input" rows="3" placeholder="${esc(input)}"></textarea>` : '';
    let val = '';
    return modal({
      title,
      html: `<p class="muted mb-0">${esc(text)}</p>${field}`,
      actions: [
        { label: T('cancel'), class: 'btn-ghost', value: false },
        { label: ok, class: danger ? 'btn-danger' : '', onClick: (m) => { if (input) val = m.querySelector('#confirm-input').value; }, value: true },
      ],
    }).then((r) => (r ? (input ? { value: val } : true) : false));
  }

  // ------------------------------------------------------------------
  // Page cache (memory + sessionStorage) — never caches private pages
  // ------------------------------------------------------------------
  const TTL = 5 * 60 * 1000;
  const mem = new Map();
  const SKEY = 'pc:' + CFG.uid + ':';
  try {
    if (sessionStorage.getItem('pc-uid') !== String(CFG.uid) || sessionStorage.getItem('pc-ver') !== CFG.version) clearCache();
    sessionStorage.setItem('pc-uid', String(CFG.uid));
    sessionStorage.setItem('pc-ver', CFG.version);
  } catch {}

  function clearCache() {
    mem.clear();
    try { Object.keys(sessionStorage).filter((k) => k.startsWith('pc:')).forEach((k) => sessionStorage.removeItem(k)); } catch {}
  }
  function cacheGet(key) {
    let hit = mem.get(key);
    if (!hit) { try { hit = JSON.parse(sessionStorage.getItem(SKEY + key) || 'null'); } catch {} }
    if (hit && Date.now() - hit.t < TTL && hit.d.version === CFG.version) return hit.d;
    return null;
  }
  function cachePut(key, d) {
    if (!d.cache || !d.ok) return;
    const v = { t: Date.now(), d };
    mem.set(key, v);
    try { sessionStorage.setItem(SKEY + key, JSON.stringify(v)); } catch { /* quota: memory only */ }
  }
  function checkVersion(v) {
    if (v && v !== CFG.version) {
      CFG.version = v;
      clearCache();
      try { sessionStorage.setItem('pc-ver', v); } catch {}
    }
  }

  // ------------------------------------------------------------------
  // SPA navigation
  // ------------------------------------------------------------------
  const EXCLUDE = /^\/(api|auth|file|assets|cron|install|uploads)(\/|$)|^\/(sitemap\.xml|robots\.txt|manifest\.json|sw\.js)$|\.(pdf|zip|png|jpe?g|webp|svg)$/i;
  function appPath(u) { return u.pathname.startsWith(BASE) ? u.pathname.slice(BASE.length) || '/' : null; }

  function isSpaLink(a, e) {
    if (e && (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return false;
    if (a.target && a.target !== '_self') return false;
    if (a.hasAttribute('download') || a.hasAttribute('data-no-spa') || a.getAttribute('rel') === 'external') return false;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin) return false;
    const p = appPath(u);
    if (p === null || EXCLUDE.test(p)) return false;
    if (u.pathname === location.pathname && u.search === location.search && u.hash) return false;
    if (p.startsWith('/admin') !== (LAYOUT === 'admin')) return false; // switching shells → full load
    return true;
  }

  let navCtrl = null;
  async function fetchPage(key, { signal, prefetch = false } = {}) {
    const res = await fetch(BASE + '/api/navigation?path=' + encodeURIComponent(key), {
      credentials: 'same-origin', signal, headers: { 'X-Requested-With': 'fetch', Accept: 'application/json', ...(prefetch ? { 'X-Prefetch': '1' } : {}) },
    });
    const d = await res.json();
    checkVersion(d.version);
    if (!d.redirect) cachePut(key, d);
    return d;
  }

  async function navigate(href, { replace = false, pop = false, scroll = null, force = false } = {}) {
    const u = new URL(href, location.href);
    const key = appPath(u) + u.search;
    if (navCtrl) navCtrl.abort();
    navCtrl = new AbortController();
    const signal = navCtrl.signal;
    progress.start();
    const page = main.querySelector('.page');
    page && page.classList.add('leaving');
    let d = force ? null : cacheGet(key);
    try {
      if (!d) d = await fetchPage(key, { signal });
    } catch (e) {
      if (e.name === 'AbortError') return;
      progress.done();
      if (!navigator.onLine) { page && page.classList.remove('leaving'); toast(T('offline'), 'warning'); return; }
      location.href = u.href; // let the browser handle it
      return;
    }
    if (signal.aborted) return;
    if (d.redirect) {
      const r = new URL(d.redirect, location.href);
      progress.done();
      if (isSpaLink({ href: r.href, target: '', hasAttribute: () => false, getAttribute: () => null })) return navigate(r.href, { replace: true });
      location.href = r.href;
      return;
    }
    if (d.layout && d.layout !== LAYOUT) { location.href = u.href; return; }

    if (!pop) {
      try { history.replaceState({ ...(history.state || {}), spa: true, scroll: scrollY }, ''); } catch {}
      history[replace ? 'replaceState' : 'pushState']({ spa: true, scroll: 0 }, '', u.href);
    }
    render(d);
    if (pop && scroll !== null) window.scrollTo(0, scroll);
    else if (u.hash && document.getElementById(u.hash.slice(1))) document.getElementById(u.hash.slice(1)).scrollIntoView();
    else window.scrollTo(0, 0);
    progress.done();
    track(d.track);
  }

  function setMeta(sel, attr, val) {
    const el = document.head.querySelector(sel);
    if (el && val !== undefined) el.setAttribute(attr, val);
  }

  function render(d) {
    cleanups.forEach((fn) => { try { fn(); } catch {} });
    cleanups = [];
    document.title = d.title;
    const m = d.meta || {};
    setMeta('meta[name="description"]', 'content', m.description);
    setMeta('meta[property="og:description"]', 'content', m.description);
    setMeta('meta[property="og:title"]', 'content', d.title);
    setMeta('meta[property="og:url"]', 'content', m.canonical);
    setMeta('meta[property="og:image"]', 'content', m.image);
    setMeta('link[rel="canonical"]', 'href', m.canonical);
    if (m.robots) setMeta('meta[name="robots"]', 'content', m.robots);
    main.innerHTML = d.html;
    main.dataset.nav = d.nav || '';
    closeDrawer();
    afterRender();
  }

  /** Move page <style data-css> into <head> once (no duplicate CSS). */
  function hoistStyles(root) {
    $$('style[data-css]', root).forEach((s) => {
      const id = 'css-' + s.dataset.css;
      if (!document.getElementById(id)) { s.id = id; document.head.appendChild(s); } else s.remove();
    });
  }

  function setActiveNav(nav) {
    $$('[data-nav-link]').forEach((a) => {
      const on = a.dataset.navLink === nav;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function afterRender() {
    hoistStyles(main);
    setActiveNav(main.dataset.nav);
    initPage(main);
  }

  function initPage(root) {
    $$('[data-init]', root).forEach((el) => {
      el.dataset.init.split(' ').forEach((name) => { if (inits[name]) { try { inits[name](el); } catch (e) { console.error(e); } } });
    });
    genericInit(root);
  }

  window.addEventListener('popstate', (e) => {
    if (!e.state || !e.state.spa) { location.reload(); return; }
    navigate(location.href, { pop: true, scroll: e.state.scroll || 0 });
  });

  // ------------------------------------------------------------------
  // Prefetch (hover / touch; idle prefetch of main tabs on good networks)
  // ------------------------------------------------------------------
  const prefetched = new Set();
  let inflight = 0;
  const goodNet = () => {
    const c = navigator.connection;
    return !(c && (c.saveData || /(^|-)2g/.test(c.effectiveType || '')));
  };
  function prefetch(a) {
    if (!goodNet() || inflight > 1) return;
    const u = new URL(a.href, location.href);
    const key = appPath(u) + u.search;
    if (prefetched.has(key) || cacheGet(key) || key === appPath(location) + location.search) return;
    prefetched.add(key);
    inflight++;
    fetchPage(key, { prefetch: true }).catch(() => prefetched.delete(key)).finally(() => inflight--);
  }
  let hoverTimer;
  document.addEventListener('mouseover', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || !isSpaLink(a)) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => prefetch(a), 70);
  }, { passive: true });
  document.addEventListener('touchstart', (e) => {
    const a = e.target.closest('a[href]');
    if (a && isSpaLink(a)) prefetch(a);
  }, { passive: true });
  function idlePrefetch() {
    const c = navigator.connection;
    if (!goodNet() || (c && c.effectiveType && c.effectiveType !== '4g')) return;
    const run = () => $$('.bottom-nav a, .sb-link[data-nav-link]').slice(0, 4).forEach(prefetch);
    ('requestIdleCallback' in window) ? requestIdleCallback(run, { timeout: 4000 }) : setTimeout(run, 2500);
  }

  // ------------------------------------------------------------------
  // Global click / change / submit delegation (registered exactly once)
  // ------------------------------------------------------------------
  document.addEventListener('click', (e) => {
    const act = e.target.closest('[data-action]');
    if (act && act.tagName !== 'INPUT' && actions[act.dataset.action]) {
      e.preventDefault();
      actions[act.dataset.action](act, e);
      return;
    }
    const a = e.target.closest('a[href]');
    if (a && isSpaLink(a, e)) {
      e.preventDefault();
      navigate(a.href);
    }
  });
  document.addEventListener('change', (e) => {
    const act = e.target.closest('input[data-action],select[data-action]');
    if (act && actions[act.dataset.action]) actions[act.dataset.action](act, e);
  });
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.matches('form[data-ajax]')) { e.preventDefault(); submitForm(f); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.target.closest('input,textarea,select,[contenteditable]')) { e.preventDefault(); actions['search-open'](); }
  });

  // ------------------------------------------------------------------
  // AJAX forms
  // ------------------------------------------------------------------
  function clearErrors(f) {
    $$('.field-error', f).forEach((x) => x.remove());
    $$('.invalid', f).forEach((x) => x.classList.remove('invalid'));
  }
  function showErrors(f, errors) {
    Object.entries(errors || {}).forEach(([name, msg]) => {
      const el = f.querySelector(`[name="${CSS.escape(name)}"]`);
      if (!el) return;
      el.classList.add('invalid');
      const div = document.createElement('div');
      div.className = 'field-error';
      div.textContent = msg;
      (el.closest('.input-icon') || el).after(div);
    });
    const first = f.querySelector('.invalid');
    first && first.focus({ preventScroll: false });
  }

  async function submitForm(f, extra = {}) {
    if (f.dataset.busy) return;
    clearErrors(f);
    if (f.dataset.confirm && !(await confirmDialog(f.dataset.confirm, { danger: f.dataset.danger === '1' }))) return;
    const btn = f.querySelector('[type=submit]');
    f.dataset.busy = '1';
    btn && btn.classList.add('loading');
    const fd = new FormData(f);
    Object.entries(extra).forEach(([k, v]) => fd.set(k, v));
    let res;
    try {
      if (f.dataset.recaptcha && CFG.recaptcha) fd.set('g_token', await recaptchaToken(f.dataset.recaptcha));
      const hasFile = $$('input[type=file]', f).some((i) => i.files && i.files.length);
      if (hasFile) {
        const pb = f.querySelector('.upload-progress');
        if (pb) pb.style.display = 'block';
        res = await xhrPost(f.action, fd, (p) => { if (pb) pb.firstElementChild.style.width = Math.round(p * 100) + '%'; });
        if (pb) pb.style.display = 'none';
      } else {
        res = await api(f.action, { method: 'POST', data: fd });
      }
    } catch (err) {
      res = { ok: false, message: T('network_error') };
    }
    delete f.dataset.busy;
    btn && btn.classList.remove('loading');
    handleResult(res, f);
    return res;
  }

  function handleResult(res, f) {
    if (f) f.dispatchEvent(new CustomEvent('ajax:done', { detail: res }));
    if (!res.ok) {
      toast(res.message || T('server_error'), 'error');
      if (f) {
        showErrors(f, res.errors);
        const btn = f.querySelector('[type=submit]');
        btn && (btn.classList.remove('shake'), void btn.offsetWidth, btn.classList.add('shake'));
      }
      if (res.redirect) setTimeout(() => go(res.redirect, res.full), 600);
      return;
    }
    if (res.message) toast(res.message, 'success');
    if (f && (f.dataset.reset !== undefined || res.reset)) f.reset();
    if (res.clearCache) clearCache();
    if (res.redirect) go(res.redirect, res.full);
    else if (res.reload) { clearCache(); navigate(location.href, { replace: true, force: true }); }
  }

  function go(url, full) {
    if (full) { clearCache(); location.href = url; return; }
    const u = new URL(url, location.href);
    if (isSpaLink({ href: u.href, target: '', hasAttribute: () => false, getAttribute: () => null })) navigate(u.href, { force: true });
    else location.href = u.href;
  }

  // ------------------------------------------------------------------
  // reCAPTCHA v3 (lazy loaded)
  // ------------------------------------------------------------------
  let rcLoad;
  function recaptchaToken(action) {
    if (!CFG.recaptcha) return Promise.resolve('');
    rcLoad = rcLoad || new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://www.google.com/recaptcha/api.js?render=' + encodeURIComponent(CFG.recaptcha);
      s.onload = () => window.grecaptcha.ready(res);
      s.onerror = rej;
      document.head.appendChild(s);
    });
    return rcLoad.then(() => window.grecaptcha.execute(CFG.recaptcha, { action }));
  }

  // ------------------------------------------------------------------
  // Theme & language
  // ------------------------------------------------------------------
  function applyTheme(pref) {
    let t = pref;
    if (!CFG.theme.dark) t = 'light';
    if (t === 'system') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    $$('.theme-icon').forEach((i) => { i.className = 'fa-solid theme-icon ' + (t === 'dark' ? 'fa-sun' : 'fa-moon'); });
    $$('[data-action="theme-set"]').forEach((b) => b.classList.toggle('active', b.dataset.theme === pref));
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc) { tc.dataset.light = tc.dataset.light || tc.content; tc.content = t === 'dark' ? '#0b1120' : tc.dataset.light; }
  }
  const themePref = () => { try { return localStorage.getItem('theme') || CFG.theme.default; } catch { return CFG.theme.default; } };
  actions['theme-toggle'] = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('theme', next); } catch {}
    applyTheme(next);
  };
  actions['theme-set'] = (el) => { try { localStorage.setItem('theme', el.dataset.theme); } catch {} applyTheme(el.dataset.theme); };
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => themePref() === 'system' && applyTheme('system'));

  async function setLang(l) {
    progress.start();
    await api(BASE + '/api/auth?action=lang', { method: 'POST', data: { lang: l } });
    clearCache();
    location.reload();
  }
  actions['lang-toggle'] = (el) => setLang(el.dataset.lang);
  actions['lang-set'] = (el) => el.dataset.lang !== CFG.lang && setLang(el.dataset.lang);

  // ------------------------------------------------------------------
  // Drawer, search, back-to-top
  // ------------------------------------------------------------------
  const drawer = $('#app-sidebar');
  const scrim = $('.drawer-scrim');
  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove('open');
    scrim && scrim.classList.remove('open');
    const b = $('[data-action="drawer-open"]');
    b && b.setAttribute('aria-expanded', 'false');
  }
  actions['drawer-open'] = (el) => {
    drawer.classList.add('open');
    scrim && scrim.classList.add('open');
    el.setAttribute('aria-expanded', 'true');
  };
  actions['drawer-close'] = closeDrawer;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); actions['search-close'](); } });

  const sheet = $('#search-sheet');
  const sInput = $('#search-input');
  const sResults = $('#search-results');
  let sCtrl, sTimer;
  actions['search-open'] = () => {
    if (!sheet) return;
    sheet.classList.add('open');
    setTimeout(() => sInput.focus(), 30);
  };
  actions['search-close'] = () => sheet && sheet.classList.remove('open');
  if (sheet) {
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) actions['search-close']();
      if (e.target.closest('a[href]')) actions['search-close']();
    });
    sInput.addEventListener('input', () => {
      clearTimeout(sTimer);
      sTimer = setTimeout(runSearch, 220);
    });
    sInput.addEventListener('keydown', (e) => {
      const items = $$('.sr-item', sResults);
      let i = items.findIndex((x) => x.classList.contains('focus'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[i] && items[i].classList.remove('focus');
        i = e.key === 'ArrowDown' ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
        items[i] && (items[i].classList.add('focus'), items[i].scrollIntoView({ block: 'nearest' }));
      } else if (e.key === 'Enter' && items[Math.max(0, i)]) {
        e.preventDefault();
        items[Math.max(0, i)].click();
      }
    });
  }
  async function runSearch() {
    const q = sInput.value.trim();
    if (q.length < 2) { sResults.innerHTML = `<p class="muted small center mt-2">${esc(T('search_hint'))}</p>`; return; }
    if (sCtrl) sCtrl.abort();
    sCtrl = new AbortController();
    sResults.innerHTML = '<div class="skeleton" style="height:52px;margin:8px 0"></div><div class="skeleton" style="height:52px"></div>';
    try {
      const r = await api(BASE + '/api/search?q=' + encodeURIComponent(q), { signal: sCtrl.signal });
      const groups = r.groups || [];
      if (!groups.length) { sResults.innerHTML = `<div class="empty"><div class="icon-box"><i class="fa-solid fa-magnifying-glass"></i></div>${esc(T('no_results'))}</div>`; return; }
      sResults.innerHTML = groups.map((g) => `<div class="sr-group">${esc(g.label)}</div>` + g.items.map((it) =>
        `<a class="sr-item" href="${esc(it.url)}"${it.admin ? ' data-no-spa' : ''}><span class="icon-box sm"><i class="${esc(it.icon || 'fa-solid fa-circle')}"></i></span>
          <span class="grow"><strong class="truncate" style="display:block">${esc(it.title)}</strong>${it.sub ? `<span class="small muted truncate" style="display:block">${esc(it.sub)}</span>` : ''}</span>
          ${it.meta ? `<span class="badge">${esc(it.meta)}</span>` : ''}</a>`).join('')).join('');
    } catch (e) { /* aborted */ }
  }

  const toTop = $('#to-top');
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { toTop && toTop.classList.toggle('show', scrollY > 420); ticking = false; });
  }, { passive: true });
  actions['to-top'] = (el) => {
    el.classList.remove('launch');
    void el.offsetWidth;
    el.classList.add('launch');
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  // ------------------------------------------------------------------
  // Clipboard, share, password toggle, generic POST actions
  // ------------------------------------------------------------------
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    }
  }
  actions.copy = async (el) => {
    if (await copyText(el.dataset.copy)) {
      toast(T('copied'), 'success', { icon: 'fa-copy' });
      const i = el.querySelector('i');
      if (i) { const c = i.className; i.className = 'fa-solid fa-check'; setTimeout(() => (i.className = c), 1400); }
    }
  };

  actions.share = (el) => {
    const url = el.dataset.url || location.href;
    const title = el.dataset.title || document.title;
    const enc = encodeURIComponent;
    const targets = [
      ['Facebook', 'fa-brands fa-facebook-f', '#1877f2', `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`],
      ['X', 'fa-brands fa-x-twitter', '#111', `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}`],
      ['WhatsApp', 'fa-brands fa-whatsapp', '#25d366', `https://wa.me/?text=${enc(title + ' ' + url)}`],
      ['Telegram', 'fa-brands fa-telegram', '#229ed9', `https://t.me/share/url?url=${enc(url)}&text=${enc(title)}`],
      ['TikTok', 'fa-brands fa-tiktok', '#000', 'copy:https://www.tiktok.com/'],
      ['Instagram', 'fa-brands fa-instagram', '#e1306c', 'copy:https://www.instagram.com/'],
    ];
    const html = `<style>.share-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px 8px;margin:6px 0 16px}
      .share-grid a,.share-grid button{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:.74rem;color:var(--text);background:none;border:0;cursor:pointer}
      .share-grid span{width:52px;height:52px;border-radius:18px;display:grid;place-items:center;color:#fff;font-size:1.3rem;transition:transform .15s}
      .share-grid a:active span,.share-grid button:active span{transform:scale(.9)}
      .share-link{display:flex;gap:8px;align-items:center;background:var(--soft);border-radius:12px;padding:6px 6px 6px 12px;font-size:.84rem}</style>
      <div class="share-grid">${targets.map(([n, ic, bg, href]) => href.startsWith('copy:')
        ? `<button data-copy-open="${esc(href.slice(5))}"><span style="background:${bg}"><i class="${ic}"></i></span>${n}</button>`
        : `<a href="${esc(href)}" target="_blank" rel="noopener"><span style="background:${bg}"><i class="${ic}"></i></span>${n}</a>`).join('')}
        <button data-share-copy><span style="background:var(--primary)"><i class="fa-solid fa-link"></i></span>${esc(T('copy_link'))}</button>
        ${navigator.share ? `<button data-share-more><span style="background:var(--muted)"><i class="fa-solid fa-ellipsis"></i></span>${esc(T('more'))}</button>` : ''}
      </div>
      <div class="share-link"><span class="truncate grow">${esc(url)}</span><button class="btn btn-sm" data-share-copy><i class="fa-regular fa-copy"></i></button></div>`;
    modal({
      title: T('share'), html, onOpen: (m, close) => {
        m.addEventListener('click', async (e) => {
          if (e.target.closest('[data-share-copy]')) { (await copyText(url)) && toast(T('copied'), 'success', { icon: 'fa-link' }); close(); }
          const co = e.target.closest('[data-copy-open]');
          if (co) { await copyText(url); toast(T('copied_paste'), 'success'); window.open(co.dataset.copyOpen, '_blank', 'noopener'); close(); }
          if (e.target.closest('[data-share-more]')) { try { await navigator.share({ title, url }); } catch {} close(); }
        });
      },
    });
  };

  actions['toggle-pw'] = (el) => {
    const inp = el.closest('.input-icon').querySelector('input');
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    el.querySelector('i').className = 'fa-regular ' + (show ? 'fa-eye-slash' : 'fa-eye');
  };

  /** <button data-action="post" data-url="..." data-confirm="..." data-params='{"id":1}'> */
  actions.post = async (el) => {
    let extra = {};
    if (el.dataset.confirm) {
      const r = await confirmDialog(el.dataset.confirm, { danger: el.dataset.danger === '1', input: el.dataset.input || null });
      if (!r) return;
      if (r.value !== undefined) extra = { [el.dataset.inputName || 'note']: r.value };
    }
    el.classList.add('loading');
    const res = await api(el.dataset.url, { method: 'POST', data: { ...JSON.parse(el.dataset.params || '{}'), ...extra } });
    el.classList.remove('loading');
    handleResult(res, null);
  };

  actions.logout = async () => {
    if (!(await confirmDialog(T('logout_confirm'), { title: T('logout'), ok: T('logout'), danger: true }))) return;
    await api(BASE + '/api/auth?action=logout', { method: 'POST' });
    clearCache();
    location.href = BASE + '/';
  };

  actions.buy = async (el) => {
    el.classList.add('loading');
    const res = await api(BASE + '/api/payment?action=create_order', { method: 'POST', data: { product: el.dataset.product } });
    el.classList.remove('loading');
    handleResult(res, null);
  };

  actions.react = async (el) => {
    const res = await api(BASE + '/api/notification?action=react', { method: 'POST', data: { news: el.dataset.news, reaction: el.dataset.reaction } });
    if (!res.ok) return toast(res.message, 'error');
    const wrap = el.closest('[data-reactions]');
    $$('[data-reaction]', wrap).forEach((b) => {
      b.classList.toggle('active', b.dataset.reaction === res.mine);
      const c = b.querySelector('b');
      if (c) c.textContent = res.counts[b.dataset.reaction] || 0;
    });
    clearCache();
  };

  actions['load-more'] = async (el) => {
    el.classList.add('loading');
    const u = new URL(el.dataset.url, location.href);
    try {
      const d = await fetchPage(appPath(u) + u.search);
      const tmp = document.createElement('div');
      tmp.innerHTML = d.html;
      const items = $(el.dataset.items, tmp);
      const target = $(el.dataset.target);
      if (items && target) {
        Array.from(items.children).forEach((c) => { c.style.animation = 'pageIn .3s var(--ease) both'; target.appendChild(c); });
        initPage(target);
      }
      const next = $('[data-action="load-more"]', tmp);
      if (next) { el.dataset.url = next.dataset.url; el.classList.remove('loading'); } else el.remove();
    } catch { el.classList.remove('loading'); toast(T('network_error'), 'error'); }
  };

  /** Client-side tabs: <div data-tabs> <button data-tab-btn="x"> … <div data-tab-panel="x"> */
  actions['local-tab'] = (el) => {
    const wrap = el.closest('[data-tabs]');
    $$('[data-tab-btn]', wrap).forEach((b) => b.classList.toggle('active', b === el));
    $$('[data-tab-panel]', wrap).forEach((p) => (p.hidden = p.dataset.tabPanel !== el.dataset.tabBtn));
  };

  // ------------------------------------------------------------------
  // Sound (WebAudio chime — no file, respects autoplay rules)
  // ------------------------------------------------------------------
  let actx = null;
  const unlockAudio = () => {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch {}
  };
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, unlockAudio, { once: true, passive: true }));
  let soundOn = (() => { try { const v = localStorage.getItem('sound'); return v === null ? !!CFG.sound : v === '1'; } catch { return !!CFG.sound; } })();
  function chime(soft = false) {
    if (!soundOn || !actx || actx.state !== 'running') return;
    const t = actx.currentTime;
    [[880, 0], [1318.5, 0.11]].forEach(([f, d]) => {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(soft ? 0.05 : 0.12, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.45);
      o.connect(g).connect(actx.destination);
      o.start(t + d);
      o.stop(t + d + 0.5);
    });
  }
  function syncSoundToggles() { $$('[data-action="sound-toggle"]').forEach((i) => (i.checked = soundOn)); }
  actions['sound-toggle'] = (el) => {
    soundOn = el.checked;
    try { localStorage.setItem('sound', soundOn ? '1' : '0'); } catch {}
    syncSoundToggles();
    if (soundOn) { unlockAudio(); setTimeout(() => chime(), 50); }
    if (CFG.uid) api(BASE + '/api/notification?action=prefs', { method: 'POST', data: { sound: soundOn ? 1 : 0 } });
  };

  // ------------------------------------------------------------------
  // Notifications: smart polling (pauses when hidden, backs off when idle)
  // ------------------------------------------------------------------
  let pollTimer = null;
  let pollDelay = CFG.poll * 1000;
  let lastNotif = (() => { try { return +localStorage.getItem('lastNotif:' + CFG.uid) || 0; } catch { return 0; } })();
  function setUnread(n) {
    $$('[data-unread]').forEach((b) => {
      const prev = b.textContent;
      b.textContent = n > 99 ? '99+' : n;
      b.hidden = !n;
      if (String(n) !== prev && n) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
    });
  }
  function setChatUnread(n) {
    $$('[data-chat-unread]').forEach((b) => { b.textContent = n; b.hidden = !n; });
  }
  async function poll() {
    clearTimeout(pollTimer);
    if (document.hidden) return;
    const r = await api(BASE + '/api/notification?action=poll&since=' + lastNotif).catch(() => null);
    let changed = false;
    if (r && r.ok) {
      setUnread(r.unread || 0);
      setChatUnread(r.chat_unread || 0);
      checkVersion(r.version);
      (r.latest || []).forEach((n) => {
        if (n.id <= lastNotif) return;
        changed = true;
        if (lastNotif) {
          toast(n.title, 'info', { icon: n.icon || 'fa-bell', duration: 5000, action: n.link ? { label: T('open'), fn: () => go(n.link) } : null });
          if (n.sound) chime();
        }
      });
      const max = Math.max(lastNotif, ...(r.latest || []).map((n) => n.id));
      if (max !== lastNotif) { lastNotif = max; try { localStorage.setItem('lastNotif:' + CFG.uid, String(max)); } catch {} }
      if (r.chat_unread) changed = true;
    }
    pollDelay = changed ? CFG.poll * 1000 : Math.min(pollDelay * 1.4, 180000);
    pollTimer = setTimeout(poll, pollDelay);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && (CFG.uid || hasSupportThread())) { pollDelay = CFG.poll * 1000; poll(); }
  });

  actions['mark-read'] = async (el) => {
    const item = el.closest('[data-notif]');
    const res = await api(BASE + '/api/notification?action=read', { method: 'POST', data: { id: el.dataset.id } });
    if (res.ok) {
      item && item.classList.remove('unread');
      setUnread(res.unread);
      if (el.dataset.link) go(el.dataset.link);
    }
  };
  actions['mark-all-read'] = async () => {
    const res = await api(BASE + '/api/notification?action=read_all', { method: 'POST' });
    if (res.ok) {
      $$('[data-notif].unread').forEach((x) => x.classList.remove('unread'));
      setUnread(0);
      toast(res.message, 'success');
    }
  };

  // ------------------------------------------------------------------
  // Service worker, Web Push, install prompt
  // ------------------------------------------------------------------
  let swReg = null;
  let reloading = false;
  if (CFG.pwa && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(BASE + '/sw.js?v=' + encodeURIComponent(CFG.asset), { scope: BASE + '/' }).then((reg) => {
        swReg = reg;
        const watch = (w) => w && w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            toast(T('update_ready'), 'info', { duration: 0, icon: 'fa-rotate', action: { label: T('refresh'), fn: () => { reloading = true; w.postMessage('skipWaiting'); } } });
          }
        });
        if (reg.waiting && navigator.serviceWorker.controller) watch(reg.waiting), reg.waiting.postMessage('check');
        reg.addEventListener('updatefound', () => watch(reg.installing));
      }).catch(() => {});
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) location.reload(); });
      navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'navigate') go(e.data.url); });
    });
  } else if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  }

  function b64ToU8(s) {
    const pad = '='.repeat((4 - (s.length % 4)) % 4);
    const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }
  async function enablePush(silent = false) {
    if (!CFG.push || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      if (!silent) toast(T('push_unsupported'), 'warning');
      return false;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { if (!silent) toast(T('push_denied'), 'warning'); return false; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CFG.push) });
    const j = sub.toJSON();
    const res = await api(BASE + '/api/notification?action=subscribe', { method: 'POST', data: { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth } });
    if (!silent) toast(res.message || T('push_enabled'), res.ok ? 'success' : 'error');
    refreshPushButtons();
    return res.ok;
  }
  async function refreshPushButtons() {
    const btns = $$('[data-action="push-enable"]');
    if (!btns.length) return;
    let on = false;
    try { on = Notification.permission === 'granted' && !!(await (await navigator.serviceWorker.ready).pushManager.getSubscription()); } catch {}
    btns.forEach((b) => { b.hidden = on || !CFG.push; });
    $$('[data-push-on]').forEach((x) => (x.hidden = !on));
  }
  actions['push-enable'] = () => enablePush(false);

  let deferredInstall = null;
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    $$('[data-install-link]').forEach((b) => (b.hidden = false));
    scheduleInstallPopup();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    $$('[data-install-link]').forEach((b) => (b.hidden = true));
    toast(T('installed'), 'success');
  });
  let installScheduled = false;
  function scheduleInstallPopup() {
    if (installScheduled || !CFG.install || isStandalone() || LAYOUT !== 'app') return;
    try { if (Date.now() - (+localStorage.getItem('pwa-dismiss') || 0) < 7 * 864e5) return; } catch {}
    installScheduled = true;
    setTimeout(() => { if (!document.querySelector('.modal-backdrop')) installPopup(); }, CFG.install * 1000);
  }
  async function installPopup() {
    const benefits = [['fa-expand', T('pwa_fullscreen')], ['fa-bolt', T('pwa_faster')], ['fa-hand-pointer', T('pwa_easy')], ['fa-bell', T('pwa_notify')]];
    const html = `<div class="row" style="margin-bottom:12px"><span class="icon-box lg"><i class="fa-solid fa-mobile-screen-button"></i></span><p class="muted mb-0">${esc(T('pwa_text'))}</p></div>
      <div class="list">${benefits.map(([i, t]) => `<div class="list-row"><span class="icon-box sm"><i class="fa-solid ${i}"></i></span>${esc(t)}</div>`).join('')}</div>
      ${isIOS && !deferredInstall ? `<p class="alert mt-2"><i class="fa-solid fa-arrow-up-from-bracket"></i><span>${esc(T('pwa_ios'))}</span></p>` : ''}`;
    const r = await modal({
      title: T('pwa_title'), html,
      actions: [{ label: T('not_now'), class: 'btn-ghost', value: false }, ...(deferredInstall ? [{ label: T('install'), value: true }] : [])],
    });
    if (r && deferredInstall) {
      deferredInstall.prompt();
      const c = await deferredInstall.userChoice.catch(() => null);
      if (c && c.outcome !== 'accepted') try { localStorage.setItem('pwa-dismiss', String(Date.now())); } catch {}
      deferredInstall = null;
    } else {
      try { localStorage.setItem('pwa-dismiss', String(Date.now())); } catch {}
    }
  }
  actions['install-app'] = () => installPopup();
  if (isIOS && !isStandalone()) scheduleInstallPopup();

  // ------------------------------------------------------------------
  // Analytics beacon (one per real view; prefetches never count)
  // ------------------------------------------------------------------
  let firstView = true;
  function track(t = {}) {
    if (LAYOUT !== 'app') return;
    const fd = new FormData();
    fd.append('path', location.pathname.slice(BASE.length) || '/');
    fd.append('type', t.type || '');
    fd.append('ref', t.ref || '');
    if (firstView) { fd.append('referrer', document.referrer); new URLSearchParams(location.search).get('utm_source') && fd.append('utm_source', new URLSearchParams(location.search).get('utm_source')); }
    firstView = false;
    if (!(navigator.sendBeacon && navigator.sendBeacon(BASE + '/api/analytics', fd))) {
      fetch(BASE + '/api/analytics', { method: 'POST', body: fd, credentials: 'same-origin', keepalive: true }).catch(() => {});
    }
  }

  // ------------------------------------------------------------------
  // AI assistant + live support chat
  // ------------------------------------------------------------------
  const panel = $('#chat-panel');
  const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<)]+)/g, (u) => `<a href="${u}"${u.startsWith(location.origin) ? '' : ' target="_blank" rel="noopener"'}>${u}</a>`);
  function addMsg(body, text, who, meta = '') {
    const d = document.createElement('div');
    d.className = 'msg ' + (who === 'me' ? 'me' : 'bot');
    d.innerHTML = linkify(text) + (meta ? `<span class="meta">${esc(meta)}</span>` : '');
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
    return d;
  }
  function typing(body) {
    const d = document.createElement('div');
    d.className = 'msg bot typing';
    d.innerHTML = '<i></i><i></i><i></i>';
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
    return d;
  }
  let chatTab = $('.chat-head .tab.active') ? $('.chat-head .tab.active').dataset.tab : 'ai';
  actions['chat-open'] = (el) => {
    if (!panel) return;
    hideHint();
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('open'));
    if (el && el.dataset && el.dataset.tab) switchChat(el.dataset.tab);
    else switchChat(chatTab);
    try { sessionStorage.setItem('ai-hint', '1'); } catch {}
  };
  actions['chat-close'] = () => {
    if (!panel) return;
    panel.classList.remove('open');
    setTimeout(() => (panel.hidden = true), 300);
    stopSupportPoll();
  };
  actions['chat-tab'] = (el) => switchChat(el.dataset.tab);
  function switchChat(tab) {
    if (!panel || !panel.querySelector(`[data-pane="${tab}"]`)) return;
    chatTab = tab;
    $$('.chat-head .tab', panel).forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    $$('[data-pane]', panel).forEach((p) => (p.style.display = p.dataset.pane === tab ? 'flex' : 'none'));
    if (tab === 'support') loadSupport(true); else stopSupportPoll();
    const ta = panel.querySelector(`[data-pane="${tab}"] textarea`);
    ta && setTimeout(() => ta.focus({ preventScroll: true }), 250);
  }
  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }
  if (panel) {
    $$('textarea', panel).forEach((ta) => {
      ta.addEventListener('input', () => autosize(ta));
      ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); ta.form.requestSubmit(); } });
    });
  }

  // AI
  const aiBody = $('#ai-body');
  let aiHistory = [];
  try { aiHistory = JSON.parse(sessionStorage.getItem('ai-history') || '[]'); } catch {}
  if (aiBody) aiHistory.forEach((m) => addMsg(aiBody, m.content, m.role === 'user' ? 'me' : 'bot'));
  async function askAI(text) {
    addMsg(aiBody, text, 'me');
    aiHistory.push({ role: 'user', content: text });
    const t = typing(aiBody);
    const r = await api(BASE + '/api/ai', { method: 'POST', data: { message: text } });
    t.remove();
    const reply = r.ok ? r.reply : (r.message || T('server_error'));
    addMsg(aiBody, reply, 'bot');
    if (r.ok) aiHistory.push({ role: 'assistant', content: reply });
    try { sessionStorage.setItem('ai-history', JSON.stringify(aiHistory.slice(-20))); } catch {}
    chime(true);
  }
  const aiForm = $('#ai-form');
  aiForm && aiForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const ta = aiForm.message;
    const text = ta.value.trim();
    if (!text) return;
    ta.value = '';
    autosize(ta);
    askAI(text);
  });
  actions['ai-suggest'] = (el) => askAI(el.textContent.trim());

  // hint bubble
  const hint = $('#ai-hint');
  function hideHint() { hint && (hint.hidden = true); }
  if (hint && CFG.aiHint && LAYOUT === 'app') {
    let seen = false;
    try { seen = !!sessionStorage.getItem('ai-hint'); } catch {}
    if (!seen) setTimeout(() => {
      if (panel && panel.classList.contains('open')) return;
      hint.querySelector('span').textContent = CFG.aiHint;
      hint.hidden = false;
      chime(true);
      try { sessionStorage.setItem('ai-hint', '1'); } catch {}
      setTimeout(hideHint, 9000);
    }, 4000);
  }

  // Live support
  const supBody = $('#support-body');
  let supLast = 0;
  let supTimer = null;
  const hasSupportThread = () => { try { return !!localStorage.getItem('support-thread'); } catch { return false; } };
  function stopSupportPoll() { clearTimeout(supTimer); supTimer = null; }
  async function loadSupport(first = false) {
    if (!supBody) return;
    stopSupportPoll();
    if (first) { supLast = 0; supBody.innerHTML = ''; }
    const r = await api(BASE + '/api/support?action=messages&after=' + supLast).catch(() => null);
    if (r && r.ok) {
      const st = $('#support-status');
      if (st) {
        st.querySelector('.dot').classList.toggle('off', !r.online);
        st.querySelector('span:last-child').textContent = r.online ? T('support_online') : T('support_offline');
      }
      if (first && !r.messages.length) addMsg(supBody, T('support_welcome'), 'bot');
      r.messages.forEach((m) => {
        addMsg(supBody, m.message, m.sender === 'user' ? 'me' : 'bot', m.time);
        supLast = Math.max(supLast, m.id);
        if (!first && m.sender === 'admin') chime();
      });
      if (r.has_thread) { try { localStorage.setItem('support-thread', '1'); } catch {} $('#support-guest') && ($('#support-guest').hidden = true); }
      setChatUnread(0);
    }
    if (panel && panel.classList.contains('open') && chatTab === 'support' && !document.hidden) supTimer = setTimeout(() => loadSupport(), 6000);
  }
  const supForm = $('#support-form');
  supForm && supForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ta = supForm.message;
    const text = ta.value.trim();
    if (!text) return;
    const data = { message: text };
    const g = $('#support-guest');
    if (g && !g.hidden) { data.guest_name = g.querySelector('[name=guest_name]').value; data.guest_email = g.querySelector('[name=guest_email]').value; }
    const btn = supForm.querySelector('button');
    btn.classList.add('loading');
    const r = await api(BASE + '/api/support?action=send', { method: 'POST', data });
    btn.classList.remove('loading');
    if (!r.ok) return toast(r.message, 'error');
    ta.value = '';
    autosize(ta);
    loadSupport();
  });

  // ------------------------------------------------------------------
  // Passkeys (WebAuthn)
  // ------------------------------------------------------------------
  const b64u = {
    dec: (s) => b64ToU8(s).buffer,
    enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  };
  const passkeySupported = () => !!(window.PublicKeyCredential && navigator.credentials);
  actions['passkey-login'] = async (el) => {
    if (!passkeySupported()) return toast(T('passkey_unsupported'), 'warning');
    el.classList.add('loading');
    try {
      const o = await api(BASE + '/api/auth?action=passkey_options', { method: 'POST' });
      if (!o.ok) throw new Error(o.message);
      const pk = o.options;
      pk.challenge = b64u.dec(pk.challenge);
      pk.allowCredentials = (pk.allowCredentials || []).map((c) => ({ ...c, id: b64u.dec(c.id) }));
      const cred = await navigator.credentials.get({ publicKey: pk });
      const r = cred.response;
      const res = await api(BASE + '/api/auth?action=passkey_login', { method: 'POST', data: { next: el.dataset.next || '', credential: JSON.stringify({
        id: cred.id, clientDataJSON: b64u.enc(r.clientDataJSON), authenticatorData: b64u.enc(r.authenticatorData),
        signature: b64u.enc(r.signature), userHandle: r.userHandle ? b64u.enc(r.userHandle) : null,
      }) } });
      handleResult(res, null);
    } catch (e) {
      if (e && e.name !== 'NotAllowedError') toast(e.message || T('passkey_failed'), 'error');
    }
    el.classList.remove('loading');
  };
  actions['passkey-register'] = async (el) => {
    if (!passkeySupported()) return toast(T('passkey_unsupported'), 'warning');
    el.classList.add('loading');
    try {
      const o = await api(BASE + '/api/auth?action=passkey_register_options', { method: 'POST' });
      if (!o.ok) throw new Error(o.message);
      const pk = o.options;
      pk.challenge = b64u.dec(pk.challenge);
      pk.user.id = b64u.dec(pk.user.id);
      pk.excludeCredentials = (pk.excludeCredentials || []).map((c) => ({ ...c, id: b64u.dec(c.id) }));
      const cred = await navigator.credentials.create({ publicKey: pk });
      const res = await api(BASE + '/api/auth?action=passkey_register', { method: 'POST', data: { credential: JSON.stringify({
        id: cred.id, clientDataJSON: b64u.enc(cred.response.clientDataJSON), attestationObject: b64u.enc(cred.response.attestationObject),
      }) } });
      handleResult(res, null);
    } catch (e) {
      if (e && e.name !== 'NotAllowedError') toast(e.message || T('passkey_failed'), 'error');
    }
    el.classList.remove('loading');
  };

  // ------------------------------------------------------------------
  // Generic per-page behaviours
  // ------------------------------------------------------------------
  function genericInit(root) {
    // file inputs with live preview
    $$('input[type=file][data-preview]', root).forEach((inp) => {
      inp.addEventListener('change', () => {
        const drop = inp.closest('.file-drop');
        const f = inp.files[0];
        if (!drop || !f) return;
        const label = drop.querySelector('[data-file-label]');
        if (label) label.textContent = f.name + ' · ' + (f.size / 1024 / 1024).toFixed(2) + ' MB';
        let img = drop.querySelector('img');
        if (f.type.startsWith('image/')) {
          if (!img) { img = document.createElement('img'); drop.appendChild(img); }
          img.src = URL.createObjectURL(f);
        }
      });
    });
    // countdowns: <span data-countdown="ISO date">
    const cds = $$('[data-countdown]', root);
    if (cds.length) {
      const tick = () => cds.forEach((el) => {
        const left = Math.max(0, Math.floor((new Date(el.dataset.countdown) - Date.now()) / 1000));
        const p = (n) => String(n).padStart(2, '0');
        const parts = [Math.floor(left / 86400), Math.floor(left % 86400 / 3600), Math.floor(left % 3600 / 60), left % 60];
        const out = $$('[data-cd]', el);
        if (out.length) out.forEach((o, i) => (o.textContent = p(parts[i])));
        else el.textContent = (parts[0] ? parts[0] + 'd ' : '') + p(parts[1]) + ':' + p(parts[2]) + ':' + p(parts[3]);
      });
      tick();
      const iv = setInterval(tick, 1000);
      cleanups.push(() => clearInterval(iv));
    }
    // auto-grow textareas
    $$('textarea[data-autosize]', root).forEach((ta) => ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }));
    syncSoundToggles();
    refreshPushButtons();
  }

  // ------------------------------------------------------------------
  // Page modules
  // ------------------------------------------------------------------
  inits.services = (root) => {
    const cards = $$('[data-service]', root);
    const q = $('[data-filter-q]', root);
    const sort = $('[data-filter-sort]', root);
    const empty = $('[data-filter-empty]', root);
    const grid = cards.length ? cards[0].parentElement : null;
    let cat = new URL(location.href).searchParams.get('category') || 'all';
    const apply = () => {
      const term = (q.value || '').trim().toLowerCase();
      let shown = 0;
      cards.forEach((c) => {
        const ok = (cat === 'all' || (cat === 'featured' ? c.dataset.featured === '1' : c.dataset.cat === cat)) && (!term || c.dataset.search.includes(term));
        c.hidden = !ok;
        if (ok) shown++;
      });
      if (empty) empty.hidden = shown > 0;
      const cmp = {
        default: (a, b) => a.dataset.sort - b.dataset.sort,
        popular: (a, b) => b.dataset.views - a.dataset.views,
        newest: (a, b) => b.dataset.created - a.dataset.created,
        price: (a, b) => a.dataset.price - b.dataset.price,
      }[sort.value] || (() => 0);
      if (grid) cards.slice().sort(cmp).forEach((c) => grid.appendChild(c));
      $$('[data-cat-chip]', root).forEach((ch) => ch.setAttribute('aria-pressed', String(ch.dataset.catChip === cat)));
    };
    root.addEventListener('click', (e) => {
      const ch = e.target.closest('[data-cat-chip]');
      if (!ch) return;
      cat = ch.dataset.catChip;
      const u = new URL(location.href);
      cat === 'all' ? u.searchParams.delete('category') : u.searchParams.set('category', cat);
      history.replaceState(history.state, '', u.href);
      apply();
    });
    q && q.addEventListener('input', apply);
    sort && sort.addEventListener('change', apply);
    apply();
  };

  inits.payment = (root) => {
    const form = $('form[data-pay-form]', root);
    if (!form) return;
    const methodInput = form.querySelector('[name=method]');
    const amountInput = form.querySelector('[name=amount]');
    const select = (code) => {
      $$('[data-method-card]', root).forEach((c) => c.classList.toggle('active', c.dataset.methodCard === code));
      $$('[data-method-panel]', root).forEach((p) => (p.hidden = p.dataset.methodPanel !== code));
      methodInput.value = code;
      const card = $(`[data-method-card="${code}"]`, root);
      if (card && amountInput) amountInput.value = card.dataset.amount;
      $$('[data-pay-amount]', root).forEach((x) => (x.textContent = card ? card.dataset.amountLabel : ''));
      const bal = code === 'balance';
      $$('[data-hide-for-balance]', form).forEach((x) => (x.hidden = bal));
      $$('[data-hide-for-balance] input', form).forEach((x) => (x.required = !bal && x.dataset.req === '1'));
    };
    root.addEventListener('click', (e) => {
      const c = e.target.closest('[data-method-card]');
      if (c) select(c.dataset.methodCard);
    });
    const first = $('[data-method-card]', root);
    first && select(first.dataset.methodCard);
  };

  inits.login = (root) => {
    const forms = { password: $('[data-step-form="password"]', root), '2fa': $('[data-step-form="2fa"]', root), email: $('[data-step-form="email"]', root) };
    const show = (step) => Object.entries(forms).forEach(([k, f]) => {
      if (!f) return;
      f.hidden = k !== step;
      if (k === step) setTimeout(() => { const i = f.querySelector('input:not([type=hidden])'); i && i.focus(); }, 50);
    });
    Object.values(forms).forEach((f) => f && f.addEventListener('ajax:done', (e) => {
      const r = e.detail;
      if (r.ok && r.step && r.step !== 'done') show(r.step);
    }));
    const initial = root.dataset.step;
    if (initial && forms[initial]) show(initial);
    $$('[data-passkey-only]', root).forEach((b) => (b.hidden = !(CFG.passkeys && passkeySupported())));
  };

  inits.twofa = (root) => {
    const box = $('[data-qr]', root);
    if (!box) return;
    const draw = () => { box.innerHTML = ''; new window.QRCode(box, { text: box.dataset.qr, width: 180, height: 180, correctLevel: window.QRCode.CorrectLevel.M }); };
    if (window.QRCode) return draw();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = draw;
    document.head.appendChild(s);
  };

  inits['recovery-codes'] = (root) => {
    root.addEventListener('ajax:done', (e) => {
      const r = e.detail;
      if (r.ok && r.codes) {
        modal({
          title: T('recovery_title'),
          html: `<p class="muted">${esc(T('recovery_text'))}</p><pre style="background:var(--soft);padding:14px;border-radius:12px;font-size:1rem;line-height:1.9;text-align:center">${r.codes.map(esc).join('\n')}</pre>`,
          actions: [{ label: T('copy'), class: 'btn-soft', onClick: () => { copyText(r.codes.join('\n')); toast(T('copied'), 'success'); return false; } }, { label: T('done'), value: true }],
        }).then(() => go(location.href));
      }
    });
  };

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  function boot() {
  history.scrollRestoration = 'manual';
  try { history.replaceState({ ...(history.state || {}), spa: true, scroll: history.state && history.state.scroll || 0 }, ''); } catch {}
  applyTheme(themePref());
  afterRender();
  track({ type: main.dataset.trackType, ref: main.dataset.trackRef });
  const flashEl = $('#flash-data');
  if (flashEl) JSON.parse(flashEl.textContent).forEach((f) => toast(f.message, f.type === 'error' ? 'error' : f.type));
  if (CFG.uid || hasSupportThread()) setTimeout(poll, 2500);
  idlePrefetch();
  const off = $('#offline-bar');
  window.addEventListener('offline', () => off && off.classList.add('show'));
  window.addEventListener('online', () => { off && off.classList.remove('show'); toast(T('back_online'), 'success'); });
  }
  // admin.js (also deferred) registers its page modules before DOMContentLoaded
  document.addEventListener('DOMContentLoaded', boot, { once: true });

  window.App = { CFG, api, xhrPost, toast, modal, confirm: confirmDialog, navigate, go, actions, inits, initPage, clearCache, submitForm, handleResult, copyText, esc, T, onCleanup: (fn) => cleanups.push(fn), enablePush };
})();
