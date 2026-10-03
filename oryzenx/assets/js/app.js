/* Oryzenx — client runtime: SPA navigation, forms, UI components, notifications, AI chat, PWA. */
(() => {
  'use strict';
  const O = window.OZX || {};
  const BASE = O.base || '';
  const S = O.strings || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const csrf = () => $('meta[name="csrf-token"]')?.content || '';
  const components = (window.OZXComponents = window.OZXComponents || {});
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  /* ---------------- Progress bar ---------------- */
  const progress = {
    el: null, timer: 0, w: 0,
    start() {
      this.el = this.el || $('#progress');
      if (!this.el) return;
      clearInterval(this.timer);
      this.w = 8; this.el.style.width = '8%'; this.el.classList.add('active');
      this.timer = setInterval(() => { this.w = Math.min(90, this.w + (90 - this.w) * 0.12); this.el.style.width = this.w + '%'; }, 120);
    },
    done() {
      if (!this.el) return;
      clearInterval(this.timer);
      this.el.style.width = '100%';
      setTimeout(() => { this.el.classList.remove('active'); this.el.style.width = '0'; }, 220);
    },
  };

  /* ---------------- Toasts & dialogs ---------------- */
  function toast(msg, type = 'info', ms = 3200, action = null) {
    if (!msg) return;
    const box = $('#toasts'); if (!box) return;
    const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.setAttribute('role', type === 'error' ? 'alert' : 'status');
    t.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span class="grow">${esc(msg)}</span>`;
    if (action) {
      const b = document.createElement('button');
      b.className = 'btn btn-xs btn-white'; b.textContent = action.label; b.onclick = action.fn;
      t.appendChild(b);
    }
    box.appendChild(t);
    setTimeout(() => { t.classList.add('leaving'); setTimeout(() => t.remove(), 200); }, ms);
  }

  function modal(html, { title = '', onClose } = {}) {
    const root = $('#modal-root');
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn icon-btn-sm" type="button" data-modal-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-content">${html}</div></div>`;
    const prevFocus = document.activeElement;
    const close = () => { bd.remove(); document.removeEventListener('keydown', onKey); prevFocus?.focus?.(); onClose && onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    bd.addEventListener('click', (e) => { if (e.target === bd || e.target.closest('[data-modal-close]')) close(); });
    document.addEventListener('keydown', onKey);
    root.appendChild(bd);
    setTimeout(() => bd.querySelector('button, a, input')?.focus(), 30);
    return { el: bd, close };
  }

  // Centered confirmation popup (logout, deletes, etc.)
  function confirmDialog(text) {
    return new Promise((resolve) => {
      const danger = /log ?out|লগআউট|delete|মুছ|disable|বন্ধ|suspend|স্থগিত/i.test(text);
      const bd = document.createElement('div');
      bd.className = 'confirm-backdrop';
      bd.innerHTML = `<div class="confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="cf-t">
        <span class="confirm-ic ${danger ? 'danger' : ''}"><i class="fa-solid ${/log ?out|লগআউট/i.test(text) ? 'fa-right-from-bracket' : danger ? 'fa-triangle-exclamation' : 'fa-circle-question'}"></i></span>
        <h3 id="cf-t">${esc(S.confirm || 'Are you sure?')}</h3><p>${esc(text)}</p>
        <div class="confirm-actions"><button class="btn btn-outline" type="button" data-c="0">${esc(S.cancel || 'Cancel')}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-c="1">${esc(S.ok || 'OK')}</button></div></div>`;
      const done = (v) => { bd.classList.add('leaving'); setTimeout(() => bd.remove(), 150); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') done(false); };
      bd.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) done(b.dataset.c === '1'); else if (e.target === bd) done(false); });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(bd);
      setTimeout(() => bd.querySelector('[data-c="1"]').focus(), 30);
    });
  }

  /* ---------------- HTTP ---------------- */
  async function api(url, { method = 'GET', body = null, json = null } = {}) {
    const headers = { 'X-Requested-With': 'fetch', Accept: 'application/json' };
    if (method !== 'GET') headers['X-CSRF-Token'] = csrf();
    if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    const res = await fetch(url.startsWith('http') ? url : BASE + url, { method, headers, body, credentials: 'same-origin' });
    let data = {};
    try { data = await res.json(); } catch { data = { ok: false, message: S.error }; }
    if (res.status === 419) { toast(data.message || S.error, 'error'); setTimeout(() => location.reload(), 1200); }
    data.status = res.status;
    return data;
  }

  /* ---------------- SPA navigation ---------------- */
  const main = () => $('#main');
  const cache = new Map();
  const inflight = new Map();
  const TTL = 5 * 60 * 1000;
  let navToken = 0;
  const layout = document.documentElement.dataset.layout || 'app';
  history.scrollRestoration = 'manual';

  const keyOf = (u) => { const x = new URL(u, location.href); return x.pathname + x.search; };
  function spaEligible(a) {
    if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download') || a.dataset.noSpa !== undefined) return false;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin) return false;
    if (BASE && !u.pathname.startsWith(BASE + '/') && u.pathname !== BASE) return false;
    const p = u.pathname.slice(BASE.length) || '/';
    if (/\.(xml|txt|json|js|css|png|jpe?g|webp|gif|svg|pdf|zip)$/i.test(p)) return false;
    if (/^\/(auth\/google|files\/|logout|install)/.test(p)) return false;
    if (layout === 'app' && p.startsWith('/admin')) return false;
    if (layout === 'admin' && !p.startsWith('/admin')) return false;
    if (u.hash && u.pathname === location.pathname && u.search === location.search) return false;
    return true;
  }

  async function fetchPage(url, prefetch = false) {
    const k = keyOf(url);
    if (inflight.has(k)) return inflight.get(k);
    const p = (async () => {
      const res = await fetch(url, { headers: { 'X-SPA': '1', ...(prefetch ? { 'X-Prefetch': '1' } : {}) }, credentials: 'same-origin' });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) throw Object.assign(new Error('hard'), { hard: true });
      const data = await res.json();
      if (data.cache && data.html && !data.redirect) cache.set(keyOf(BASE + data.url), { data, t: Date.now() });
      return data;
    })();
    inflight.set(k, p);
    try { return await p; } finally { inflight.delete(k); }
  }

  function prefetch(url) {
    const k = keyOf(url);
    const c = cache.get(k);
    if ((c && Date.now() - c.t < TTL) || inflight.has(k)) return;
    fetchPage(url, true).catch(() => {});
  }

  async function navigate(url, { push = true, replace = false, restoreY = null, depth = 0 } = {}) {
    const token = ++navToken;
    const m = main();
    if (!m) { location.href = url; return; }
    closeOverlays();
    if (push) history.replaceState({ ...(history.state || {}), y: scrollY }, '');
    const k = keyOf(url);
    const hit = cache.get(k);
    let data; let fromCache = false;
    progress.start();
    m.classList.add('is-leaving');
    try {
      if (hit && Date.now() - hit.t < TTL) { data = hit.data; fromCache = true; }
      else data = await fetchPage(url);
    } catch (e) {
      progress.done(); m.classList.remove('is-leaving');
      if (!navigator.onLine) { toast(S.offline, 'error'); return; }
      location.href = url; return;
    }
    if (token !== navToken) return;
    if (data.redirect) {
      progress.done(); m.classList.remove('is-leaving');
      if (depth > 3) { location.href = data.redirect; return; }
      const tmp = document.createElement('a'); tmp.href = data.redirect;
      if (!spaEligible(tmp)) { location.href = data.redirect; return; }
      return navigate(data.redirect, { push, replace, depth: depth + 1 });
    }
    if (!data.html || data.layout !== layout) { location.href = url; return; }
    await loadAssets(data.css, data.js);
    if (token !== navToken) return;
    render(data, url, { push, replace, restoreY });
    if (fromCache) track(data);
  }

  function render(data, url, { push, replace, restoreY }) {
    const m = main();
    const hash = new URL(url, location.href).hash;
    m.innerHTML = data.html;
    m.classList.remove('is-leaving');
    if (!reduceMotion) { m.classList.remove('is-entering'); void m.offsetWidth; m.classList.add('is-entering'); }
    document.title = data.title;
    setMeta('description', data.meta?.description);
    setMeta('robots', data.meta?.robots);
    const can = $('link[rel="canonical"]'); if (can && data.meta?.canonical) can.href = data.meta.canonical;
    setMeta('og:title', data.title, true); setMeta('og:description', data.meta?.description, true); setMeta('og:url', data.meta?.canonical, true);
    const finalUrl = BASE + data.url + hash;
    if (replace) history.replaceState({ spa: 1 }, '', finalUrl);
    else if (push) history.pushState({ spa: 1 }, '', finalUrl);
    setActiveNav(data.nav);
    initComponents(m);
    if (hash && $(hash)) $(hash).scrollIntoView();
    else window.scrollTo({ top: restoreY || 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    m.focus({ preventScroll: true });
    progress.done();
    document.dispatchEvent(new CustomEvent('ozx:navigated', { detail: data }));
  }

  function setMeta(name, content, prop = false) {
    if (content == null) return;
    const el = $(`meta[${prop ? 'property' : 'name'}="${name}"]`);
    if (el) el.setAttribute('content', content);
  }

  const loaded = new Set();
  function loadAssets(css = [], js = []) {
    $$('link[rel="stylesheet"]').forEach((l) => loaded.add(l.href));
    $$('script[src]').forEach((s) => loaded.add(s.src));
    const jobs = [];
    css.forEach((href) => {
      const abs = new URL(href, location.href).href;
      if (loaded.has(abs)) return;
      loaded.add(abs);
      jobs.push(new Promise((res) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = l.onerror = res; document.head.appendChild(l); }));
    });
    js.forEach((src) => {
      const abs = new URL(src, location.href).href;
      if (loaded.has(abs)) return;
      loaded.add(abs);
      jobs.push(new Promise((res) => { const s = document.createElement('script'); s.src = src; s.onload = s.onerror = res; document.body.appendChild(s); }));
    });
    return Promise.all(jobs);
  }

  function setActiveNav(nav) {
    $$('[data-nav]').forEach((a) => {
      const on = !!nav && a.dataset.nav === nav;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function track(data) {
    if (!data.track) return;
    const body = JSON.stringify({ path: data.url, key: data.track.key, ref: data.track.ref || null });
    fetch(BASE + '/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() }, body, keepalive: true, credentials: 'same-origin' }).catch(() => {});
  }

  window.addEventListener('popstate', (e) => navigate(location.href, { push: false, restoreY: e.state?.y ?? 0 }));

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || !spaEligible(a)) return;
    if (a.dataset.confirm) return; // handled by action handler
    e.preventDefault();
    navigate(a.href);
  });

  // Prefetch on hover (desktop) / touchstart (mobile)
  let hoverTimer = 0;
  document.addEventListener('mouseover', (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a || !spaEligible(a)) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => prefetch(a.href), 65);
  }, { passive: true });
  document.addEventListener('mouseout', () => clearTimeout(hoverTimer), { passive: true });
  document.addEventListener('touchstart', (e) => {
    const a = e.target.closest?.('a[href]');
    if (a && spaEligible(a)) prefetch(a.href);
  }, { passive: true });
  document.addEventListener('focusin', (e) => { const a = e.target.closest?.('a[href]'); if (a && spaEligible(a)) prefetch(a.href); });

  function idlePrefetch() {
    const c = navigator.connection;
    if (c && (c.saveData || /2g/.test(c.effectiveType || ''))) return;
    const run = () => $$('.bottom-nav a, .side-nav a').slice(0, 6).forEach((a, i) => setTimeout(() => spaEligible(a) && prefetch(a.href), i * 400));
    ('requestIdleCallback' in window) ? requestIdleCallback(run, { timeout: 4000 }) : setTimeout(run, 2500);
  }

  /* ---------------- Forms ---------------- */
  function clearErrors(form) {
    $$('.is-invalid', form).forEach((el) => el.classList.remove('is-invalid'));
    $$('.field .error[data-js]', form).forEach((el) => el.remove());
  }
  function showErrors(form, errors) {
    let first = null;
    Object.entries(errors || {}).forEach(([name, msg]) => {
      const input = form.querySelector(`[name="${CSS.escape(name)}"]`) || form.querySelector(`[name="${CSS.escape(name)}[]"]`);
      if (!input) return;
      input.classList.add('is-invalid');
      input.setAttribute('aria-invalid', 'true');
      const field = input.closest('.field') || input.parentElement;
      const d = document.createElement('div'); d.className = 'error'; d.dataset.js = '1'; d.textContent = msg;
      field.appendChild(d);
      first = first || input;
    });
    first?.focus();
  }

  document.addEventListener('submit', async (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    // GET forms (filters, search) navigate without reload
    if ((form.getAttribute('method') || 'get').toLowerCase() === 'get' && form.dataset.noSpa === undefined && !form.matches('[data-chat-form]')) {
      e.preventDefault();
      const u = new URL(form.getAttribute('action') || location.href, location.href);
      u.search = new URLSearchParams(new FormData(form)).toString();
      const a = document.createElement('a'); a.href = u.href;
      spaEligible(a) ? navigate(u.href) : (location.href = u.href);
      return;
    }
    if (form.dataset.ajax === undefined) return;
    e.preventDefault();
    if (form.dataset.confirm && !(await confirmDialog(form.dataset.confirm))) return;
    const btn = e.submitter || form.querySelector('[type="submit"]');
    clearErrors(form);
    btn?.classList.add('is-loading');
    const fd = new FormData(form);
    if (e.submitter?.name) fd.append(e.submitter.name, e.submitter.value);
    form.dispatchEvent(new CustomEvent('ozx:before-submit', { detail: fd }));
    let data;
    try {
      const res = await fetch(form.getAttribute('action') || location.href, { method: 'POST', body: fd, credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrf(), 'X-Requested-With': 'fetch', Accept: 'application/json' } });
      try { data = await res.json(); } catch { data = { ok: false, message: S.error }; }
      if (res.status === 419) setTimeout(() => location.reload(), 1200);
    } catch {
      data = { ok: false, message: navigator.onLine ? S.error : S.offline };
    }
    btn?.classList.remove('is-loading');
    if (window.grecaptcha && form.querySelector('.recaptcha')) try { grecaptcha.reset(form.querySelector('.recaptcha').dataset.wid); } catch { /* noop */ }
    if (data.ok) {
      cache.clear();
      if (data.message) toast(data.message, 'success');
      form.dispatchEvent(new CustomEvent('ozx:success', { detail: data, bubbles: true }));
      if (form.dataset.fullReload !== undefined || data.reload) { location.href = data.redirect || location.href; return; }
      if (data.redirect) { navigate(data.redirect); return; }
      if (form.dataset.reset !== undefined) form.reset();
      if (form.dataset.refresh !== undefined) navigate(location.href, { push: false, restoreY: scrollY });
    } else {
      toast(data.message || S.error, 'error', 4200);
      showErrors(form, data.errors);
      if (data.redirect) setTimeout(() => navigate(data.redirect), 600);
    }
  });

  /* ---------------- Actions (event delegation) ---------------- */
  const actions = {
    drawer() { toggleDrawer(); },
    'drawer-close'() { toggleDrawer(false); },
    search() { openSearch(); },
    'search-close'() { closeSearch(); },
    async lang(el) { await api('/lang/' + el.dataset.lang, { method: 'POST' }); location.reload(); },
    theme() {
      const d = document.documentElement;
      const next = d.dataset.theme === 'dark' ? 'light' : 'dark';
      d.dataset.theme = next; store.set('ozx-theme', next);
      $('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0b1220' : getComputedStyle(d).getPropertyValue('--primary').trim());
    },
    fs(el) { const v = el.dataset.fs; v ? document.documentElement.setAttribute('data-fs', v) : document.documentElement.removeAttribute('data-fs'); store.set('ozx-fs', v); syncFs(); },
    'scroll-top'(el) {
      el.classList.add('flying');
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      const done = () => { if (scrollY < 40) { el.classList.remove('flying'); window.removeEventListener('scroll', done); } };
      window.addEventListener('scroll', done, { passive: true });
      setTimeout(() => { el.classList.remove('flying'); window.removeEventListener('scroll', done); }, 1600);
    },
    notifications() { toggleNotif(); },
    async 'notif-read-all'() { await api('/notifications/read-all', { method: 'POST' }); setBadge(0); $$('.notif-item.unread').forEach((n) => n.classList.remove('unread')); },
    async copy(el) { await copyText(el.dataset.copy); },
    share(el) { openShare(el.dataset.shareUrl || location.href, el.dataset.shareTitle || document.title); },
    'pw-toggle'(el) { const i = el.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; el.querySelector('i').className = 'fa-solid ' + (i.type === 'password' ? 'fa-eye' : 'fa-eye-slash'); },
    'push-enable'() { unlockAudio(); enablePush(true).then(() => { if (window.Notification && Notification.permission === 'denied') showEngage('denied'); }); },
    async like(el) {
      if (el.dataset.busy) return; el.dataset.busy = '1';
      const was = el.classList.contains('liked');
      const cnt = el.querySelector('[data-like-count]');
      el.classList.toggle('liked', !was); el.classList.remove('pop'); void el.offsetWidth; if (!was) el.classList.add('pop');
      const d = await api(`/news/${el.dataset.id}/like`, { method: 'POST' }).catch(() => ({ ok: false }));
      delete el.dataset.busy;
      if (!d.ok) { el.classList.toggle('liked', was); toast(d.message || S.error, 'error'); return; }
      el.classList.toggle('liked', d.liked); el.setAttribute('aria-pressed', d.liked);
      if (cnt) cnt.textContent = O.lang === 'bn' ? String(d.count).replace(/\d/g, (x) => '০১২৩৪৫৬৭৮৯'[x]) : d.count;
    },
    install() { doInstall(); },
    'chat-open'() { toggleDrawer(false); Chat.open(); },
    'chat-toggle'() { Chat.toggle(); },
    'chat-close'() { Chat.close(); },
    'chat-min'() { Chat.minimize(); },
    'chat-clear'() { Chat.clear(); },
    'chat-quick'(el) { Chat.send(el.textContent.trim()); },
    'greet-close'() { $('[data-chat-greet]').hidden = true; },
    'tab'(el) {
      const group = el.closest('[data-tabs]');
      $$('[data-action="tab"]', group).forEach((t) => { t.classList.toggle('active', t === el); t.setAttribute('aria-selected', t === el); });
      $$('[data-tab-panel]', group.parentElement).forEach((p) => { p.hidden = p.dataset.tabPanel !== el.dataset.tabTarget; });
    },
  };

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) {
      e.preventDefault();
      if (el.dataset.confirm && !(await confirmDialog(el.dataset.confirm))) return;
      actions[el.dataset.action](el, e);
      return;
    }
    const link = e.target.closest('a[data-confirm]');
    if (link) {
      e.preventDefault();
      if (await confirmDialog(link.dataset.confirm)) spaEligible(link) ? navigate(link.href) : (location.href = link.href);
    }
    const np = $('#notif-panel');
    if (np && !np.hidden && !e.target.closest('#notif-panel, [data-action="notifications"]')) np.hidden = true;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeOverlays(); Chat.isOpen() && Chat.close(); }
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { e.preventDefault(); openSearch(); }
  });

  function syncFs() {
    const cur = document.documentElement.getAttribute('data-fs') || '';
    $$('[data-action="fs"]').forEach((b) => { b.classList.toggle('on', b.dataset.fs === cur); b.setAttribute('aria-pressed', b.dataset.fs === cur); });
  }

  function toggleDrawer(force) {
    const sb = $('#sidebar'); const bd = $('.drawer-backdrop'); const btn = $('[data-action="drawer"]');
    if (!sb) return;
    const open = force ?? !sb.classList.contains('open');
    sb.classList.toggle('open', open);
    if (bd) bd.hidden = !open;
    btn?.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open && innerWidth < 992 ? 'hidden' : '';
  }
  function closeOverlays() {
    toggleDrawer(false); closeSearch();
    const np = $('#notif-panel'); if (np) np.hidden = true;
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    toast(S.copied, 'success', 1800);
  }

  /* ---------------- Share ---------------- */
  function openShare(url, title) {
    const u = encodeURIComponent(url); const t = encodeURIComponent(title);
    const opts = [
      ['Facebook', 'fa-brands fa-facebook-f', 'facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`],
      ['WhatsApp', 'fa-brands fa-whatsapp', 'whatsapp', `https://wa.me/?text=${t}%20${u}`],
      ['Messenger', 'fa-brands fa-facebook-messenger', 'messenger', `fb-messenger://share/?link=${u}`],
      ['Telegram', 'fa-brands fa-telegram', 'telegram', `https://t.me/share/url?url=${u}&text=${t}`],
      ['X', 'fa-brands fa-x-twitter', 'x', `https://twitter.com/intent/tweet?url=${u}&text=${t}`],
      ['LinkedIn', 'fa-brands fa-linkedin-in', 'linkedin', `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
      ['Instagram', 'fa-brands fa-instagram', 'instagram', 'instagram'],
      ['Email', 'fa-solid fa-envelope', 'email', `mailto:?subject=${t}&body=${u}`],
    ];
    const html = `<div class="share-grid">${opts.map(([n, ic, k, href]) => href === 'instagram'
      ? `<button type="button" class="share-opt" data-share-ig><span class="soc-dot soc soc-${k}"><i class="${ic}"></i></span>${n}</button>`
      : `<a class="share-opt" href="${href}" target="_blank" rel="noopener"><span class="soc-dot soc soc-${k}"><i class="${ic}"></i></span>${n}</a>`).join('')}
      </div><div class="copy-box mt-2"><span>${esc(url)}</span><button class="btn btn-xs btn-primary" type="button" data-share-copy><i class="fa-regular fa-copy"></i> ${esc(S.share_copy || 'Copy')}</button></div>
      ${navigator.share ? `<button class="btn btn-sm btn-outline btn-block mt-1" type="button" data-share-native><i class="fa-solid fa-share-nodes"></i> More…</button>` : ''}`;
    const m = modal(html, { title: 'Share' });
    m.el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-share-copy]')) copyText(url);
      if (e.target.closest('[data-share-native]')) navigator.share({ title, url }).catch(() => {});
      if (e.target.closest('[data-share-ig]')) {
        // Instagram has no web share URL: use the native sheet, else copy and open Instagram.
        if (navigator.share) navigator.share({ title, url }).catch(() => {});
        else { await copyText(url); window.open('https://www.instagram.com/', '_blank', 'noopener'); }
      }
    });
  }

  /* ---------------- Search ---------------- */
  let searchTimer = 0; let searchCtl = null;
  function openSearch() {
    const o = $('#search-overlay'); if (!o) return;
    toggleDrawer(false);
    o.hidden = false;
    const i = $('#global-search'); i.focus(); i.select();
  }
  function closeSearch() { const o = $('#search-overlay'); if (o) o.hidden = true; }
  // Live BDT equivalent for USD amount inputs (wallet deposit)
  document.addEventListener('input', (e) => {
    const rate = +e.target.dataset?.bdtRate;
    if (!rate) return;
    const out = e.target.closest('.field')?.querySelector('[data-bdt-out]');
    const v = +e.target.value;
    if (out) out.textContent = v > 0 ? (S.bdt_equiv || '≈ {n}').replace('{n}', '৳' + Math.ceil(v * rate).toLocaleString()) : '';
  });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'global-search') return;
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    const out = $('#search-results');
    if (q.length < 2) { out.innerHTML = ''; return; }
    out.innerHTML = `<div class="empty-sm">${esc(S.searching)}</div>`;
    searchTimer = setTimeout(async () => {
      searchCtl?.abort(); searchCtl = new AbortController();
      try {
        const r = await fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}`, { signal: searchCtl.signal, headers: { Accept: 'application/json' } });
        const d = await r.json();
        const groups = d.groups || [];
        out.innerHTML = groups.length ? groups.map((g) => `<div class="search-group">${esc(g.label)}</div>` + g.items.map((it) =>
          `<a class="search-item" href="${esc(it.url)}"><span class="ic-box ic-box-sm"><i class="${esc(it.icon)}"></i></span><span class="grow truncate">${esc(it.title)}${it.sub ? `<br><small class="muted">${esc(it.sub)}</small>` : ''}</span></a>`).join('')).join('')
          + `<a class="search-item" href="${BASE}/search?q=${encodeURIComponent(q)}"><span class="ic-box ic-box-sm"><i class="fa-solid fa-arrow-right"></i></span>${esc(S.view_all)}</a>`
          : `<div class="empty-sm"><i class="fa-solid fa-magnifying-glass"></i>${esc(S.no_results)}</div>`;
      } catch { /* aborted */ }
    }, 200);
  });
  document.addEventListener('click', (e) => {
    const o = $('#search-overlay');
    if (o && !o.hidden && e.target === o) closeSearch();
    if (e.target.closest('.search-item')) closeSearch();
  });
  document.addEventListener('keydown', (e) => {
    const o = $('#search-overlay'); if (!o || o.hidden || !['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
    const items = $$('.search-item', o); if (!items.length) return;
    let i = items.findIndex((x) => x.classList.contains('focus'));
    if (e.key === 'Enter') { if (i >= 0) { e.preventDefault(); items[i].click(); } return; }
    e.preventDefault();
    items[i]?.classList.remove('focus');
    i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[i].classList.add('focus'); items[i].scrollIntoView({ block: 'nearest' });
  });

  /* ---------------- Sound ---------------- */
  let audioCtx = null;
  // Browsers only allow sound after the first tap/key press, so unlock audio on any interaction.
  function unlockAudio() {
    try {
      if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx?.state === 'suspended') audioCtx.resume();
    } catch { /* noop */ }
  }
  ['pointerdown', 'touchstart', 'keydown', 'click'].forEach((ev) => document.addEventListener(ev, unlockAudio, { passive: true }));
  function chime(kind = 'notify') {
    unlockAudio();
    if (!audioCtx || audioCtx.state === 'closed') return;
    if (kind === 'notify' && navigator.vibrate) try { navigator.vibrate([90, 50, 90]); } catch { /* noop */ }
    try {
      const now = audioCtx.currentTime;
      const notes = kind === 'chat' ? [880, 1175] : kind === 'send' ? [1320] : [784, 1047, 1319];
      notes.forEach((f, i) => {
        const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, now + i * 0.12);
        g.gain.exponentialRampToValueAtTime(kind === 'send' ? 0.04 : kind === 'chat' ? 0.08 : 0.14, now + i * 0.12 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.35);
        o.connect(g).connect(audioCtx.destination); o.start(now + i * 0.12); o.stop(now + i * 0.12 + 0.3);
      });
    } catch { /* noop */ }
  }

  /* ---------------- Notifications ---------------- */
  function setBadge(n) {
    $$('[data-notif-count]').forEach((b) => { b.hidden = !n; b.textContent = n > 99 ? '99+' : n; });
  }
  async function pollNotifications(first = false, live = false) {
    if (!O.user || (document.hidden && !live)) return;
    try {
      const d = await api('/api/notifications?summary=1');
      if (!d.ok) return;
      setBadge(d.count);
      const last = +(store.get('ozx-notif-last') || 0);
      if (d.latest && d.latest.id > last) {
        store.set('ozx-notif-last', d.latest.id);
        if (!first && !d.latest.is_read) {
          if (O.sound && d.latest.sound) chime();
          const b = $('.notif-btn'); b?.classList.remove('ring'); void b?.offsetWidth; b?.classList.add('ring');
          toast(d.latest.title, 'info', 4500, d.latest.link ? { label: S.view_all || 'View', fn: () => navigate(d.latest.link) } : null);
        }
      }
    } catch { /* offline */ }
  }
  async function toggleNotif() {
    const p = $('#notif-panel'); if (!p) return;
    p.hidden = !p.hidden;
    if (p.hidden || !O.user) return;
    const list = $('[data-notif-list]', p);
    list.innerHTML = '<div class="empty-sm"><div class="skeleton"></div></div>';
    const d = await api('/api/notifications');
    const items = d.items || [];
    list.innerHTML = items.length ? items.map((n) => `<a class="notif-item ${n.is_read ? '' : 'unread'}" href="${esc(n.url)}">
      <span class="ic-box ic-box-sm"><i class="${esc(n.icon)}"></i></span><span class="grow"><span class="t">${esc(n.title)}</span><br><span class="m">${esc(n.message)}</span></span><span class="time">${esc(n.time)}</span></a>`).join('')
      : `<div class="empty-sm"><i class="fa-regular fa-bell"></i>${esc(S.no_notifications)}</div>`;
  }

  /* ---------------- Web Push ---------------- */
  const b64ToU8 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...b].map((c) => c.charCodeAt(0))); };
  async function enablePush(interactive) {
    if (!O.push || !('serviceWorker' in navigator) || !('PushManager' in window)) { if (interactive) toast(S.notif_denied, 'error'); return; }
    try {
      const perm = interactive ? await Notification.requestPermission() : Notification.permission;
      if (perm !== 'granted') { if (interactive) toast(S.notif_denied, 'error'); return; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(O.push) });
      const j = sub.toJSON();
      await api('/api/push/subscribe', { method: 'POST', json: { endpoint: j.endpoint, keys: j.keys } });
      if (interactive) toast(S.notif_enabled, 'success');
      $$('[data-push-state]').forEach((el) => { el.textContent = S.notif_enabled; });
    } catch (err) { if (interactive) toast(S.notif_denied, 'error'); }
  }

  /* ---------------- PWA install + push permission (persistent "engage" sheet) ---------------- */
  let deferredInstall = null;
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const pushSupported = () => !!(O.push && 'serviceWorker' in navigator && 'PushManager' in window && window.Notification);
  const SNOOZE_MS = 15 * 60 * 1000; // "Later" only postpones; the sheet comes back on the next visit after 15 minutes.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredInstall = e;
    $$('[data-install-btn]').forEach((b) => { b.hidden = false; });
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null; store.set('ozx-installed', '1');
    $$('[data-install-btn]').forEach((b) => { b.hidden = true; });
    closeEngage(); setTimeout(() => engage(true), 1200); // straight to notification permission
  });
  async function doInstall() {
    if (isIOS && !isStandalone()) { showEngage('ios'); return; }
    if (!deferredInstall) { toast(S.install_text, 'info', 5000); return; }
    deferredInstall.prompt();
    const choice = await deferredInstall.userChoice.catch(() => null);
    deferredInstall = null;
    if (choice?.outcome === 'accepted') { closeEngage(); store.set('ozx-installed', '1'); }
  }

  let engageEl = null;
  function closeEngage() { engageEl?.remove(); engageEl = null; document.body.classList.remove('engage-open'); }
  function showEngage(mode) {
    closeEngage();
    const feats = mode === 'push' || mode === 'denied'
      ? [['fa-bolt', S.eg_pf1], ['fa-wallet', S.eg_pf2], ['fa-gift', S.eg_pf3]]
      : [['fa-gauge-high', S.eg_if1], ['fa-wifi', S.eg_if2], ['fa-bell', S.eg_if3]];
    const icon = mode === 'push' ? 'fa-bell' : mode === 'denied' ? 'fa-bell-slash' : 'fa-mobile-screen-button';
    const title = { install: S.eg_install_title, ios: S.eg_install_title, push: S.eg_push_title, denied: S.eg_denied_title }[mode];
    const text = { install: S.eg_install_text, ios: S.eg_ios_text, push: S.eg_push_text, denied: S.eg_denied_text }[mode];
    const btn = { install: `<i class="fa-solid fa-download"></i> ${esc(S.eg_install_btn)}`, ios: `<i class="fa-solid fa-check"></i> ${esc(S.eg_ok)}`,
      push: `<i class="fa-solid fa-bell"></i> ${esc(S.eg_allow)}`, denied: `<i class="fa-solid fa-rotate"></i> ${esc(S.eg_recheck)}` }[mode];
    engageEl = document.createElement('div');
    engageEl.className = 'engage-backdrop';
    engageEl.innerHTML = `<div class="engage-sheet" role="dialog" aria-modal="true" aria-labelledby="eg-t">
      <div class="engage-hero mode-${mode}"><span class="engage-ring"></span><span class="engage-icon"><i class="fa-solid ${icon}"></i></span></div>
      <h3 id="eg-t">${esc(title)}</h3><p>${esc(text)}</p>
      ${mode === 'ios' ? `<ol class="engage-steps"><li><i class="fa-solid fa-arrow-up-from-bracket"></i> ${esc(S.eg_ios1)}</li><li><i class="fa-regular fa-square-plus"></i> ${esc(S.eg_ios2)}</li></ol>` : ''}
      ${mode === 'denied' ? `<ol class="engage-steps"><li><i class="fa-solid fa-lock"></i> ${esc(S.eg_den1)}</li><li><i class="fa-solid fa-toggle-on"></i> ${esc(S.eg_den2)}</li></ol>` : ''}
      ${mode === 'denied' || mode === 'ios' ? '' : `<ul class="engage-feats">${feats.map(([i, t]) => `<li><i class="fa-solid ${i}"></i>${esc(t)}</li>`).join('')}</ul>`}
      <button class="btn btn-primary btn-block engage-go" type="button">${btn}</button>
      <button class="btn btn-ghost btn-sm btn-block engage-later" type="button">${esc(S.eg_later)}</button>
    </div>`;
    document.body.appendChild(engageEl); document.body.classList.add('engage-open');
    setTimeout(() => engageEl?.querySelector('.engage-go')?.focus(), 50);
    engageEl.querySelector('.engage-later').onclick = () => { store.set('ozx-engage-snooze', Date.now() + SNOOZE_MS); closeEngage(); };
    engageEl.querySelector('.engage-go').onclick = async (ev) => {
      if (mode === 'install') return doInstall();
      if (mode === 'ios') { store.set('ozx-engage-snooze', Date.now() + SNOOZE_MS); return closeEngage(); }
      if (mode === 'denied') { if (Notification.permission === 'granted') { closeEngage(); enablePush(true); } else toast(S.eg_still_blocked, 'error', 4000); return; }
      ev.currentTarget.classList.add('is-loading');
      unlockAudio();
      await enablePush(true);
      closeEngage();
      if (Notification.permission === 'denied') showEngage('denied');
      else if (Notification.permission === 'granted') chime();
    };
  }
  // Decides what to ask for: install the app first, then notifications. Nothing once both are done.
  function engage(force = false) {
    if (!force && +(store.get('ozx-engage-snooze') || 0) > Date.now()) return;
    if (document.body.classList.contains('engage-open')) return;
    const installed = isStandalone() || store.get('ozx-installed') === '1';
    if (!installed && O.pwa?.prompt) {
      if (deferredInstall) return showEngage('install');
      if (isIOS) return showEngage('ios');
    }
    if (!pushSupported()) return;
    if (Notification.permission === 'default') return showEngage('push');
    if (Notification.permission === 'denied' && +(store.get('ozx-denied-shown') || 0) < Date.now() - 864e5) {
      store.set('ozx-denied-shown', Date.now()); return showEngage('denied');
    }
    if (Notification.permission === 'granted') enablePush(false); // keep the subscription fresh
  }

  function registerSW() {
    if (!O.pwa?.enabled || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(BASE + '/sw.js', { scope: BASE + '/' }).then((reg) => {
      const onWaiting = (w) => toast(S.update_ready, 'info', 12000, { label: S.reload, fn: () => w.postMessage('SKIP_WAITING') });
      if (reg.waiting && navigator.serviceWorker.controller) onWaiting(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) onWaiting(w); });
      });
    }).catch(() => {});
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
    // Live push while the site is open: play the sound and refresh the badge immediately.
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type !== 'push') return;
      if (O.user) pollNotifications(false, true);
      else { if (O.sound) chime(); toast(e.data.title || '', 'info', 5000); }
    });
  }

  /* ---------------- AI Chat ---------------- */
  const Chat = (() => {
    const panel = () => $('#chat-panel');
    let loaded = false; let busy = false;
    const linkify = (t) => esc(t).replace(/(https?:\/\/[^\s<]+|\/(?:services|news|team|contact|payment|faq)[^\s<]*)/g, (u) => `<a href="${u.startsWith('/') && !u.startsWith(BASE + '/') ? BASE + u : u}">${u}</a>`)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const HUMAN_RE = /human|agent|real person|support team|মানুষ|এজেন্ট|লাইভ সাপোর্ট|হিউম্যান|কথা বল/i;
    function add(role, text, human = false) {
      const body = $('[data-chat-body]');
      const d = document.createElement('div');
      d.className = 'msg ' + (role === 'user' ? 'msg-user' : 'msg-bot');
      const wa = human && O.wa ? `<br><a class="wa-chip" href="https://wa.me/${esc(O.wa)}" target="_blank" rel="noopener" data-no-spa><i class="fa-brands fa-whatsapp"></i> ${esc(S.wa_chat || 'WhatsApp')}</a>` : '';
      d.innerHTML = `<div class="bubble">${role === 'user' ? esc(text) : linkify(text)}${wa}</div>`;
      body.appendChild(d); body.scrollTop = body.scrollHeight;
      return d;
    }
    async function loadHistory() {
      if (loaded) return; loaded = true;
      const d = await api('/api/ai/history').catch(() => null);
      (d?.messages || []).forEach((m) => add(m.role, m.content, m.role === 'assistant' && HUMAN_RE.test(m.content) && /WhatsApp/i.test(m.content)));
    }
    return {
      isOpen: () => panel() && !panel().hidden,
      open() {
        const p = panel(); if (!p) return;
        p.hidden = false; p.classList.remove('minimized');
        $('[data-chat-greet]') && ($('[data-chat-greet]').hidden = true);
        $('.fab-chat')?.setAttribute('aria-expanded', 'true');
        loadHistory(); setTimeout(() => $('#chat-input')?.focus(), 50);
      },
      close() { const p = panel(); if (p) p.hidden = true; $('.fab-chat')?.setAttribute('aria-expanded', 'false'); },
      toggle() { this.isOpen() ? this.close() : this.open(); },
      minimize() { panel()?.classList.toggle('minimized'); },
      async clear() { await api('/api/ai/clear', { method: 'POST' }); $('[data-chat-body]').innerHTML = ''; add('assistant', S.ai_cleared || '👋'); chime('send'); },
      async send(text) {
        text = (text || '').trim(); if (!text || busy) return;
        this.open(); busy = true;
        add('user', text); chime('send');
        const typing = add('assistant', '');
        typing.querySelector('.bubble').innerHTML = `<span class="typing" aria-label="${esc(S.typing)}"><i></i><i></i><i></i></span>`;
        const d = await api('/api/ai/chat', { method: 'POST', json: { message: text } }).catch(() => ({ ok: false }));
        typing.remove(); busy = false;
        add('assistant', d.ok ? d.reply : (d.message || S.ai_error), !!d.human || HUMAN_RE.test(text));
        if (O.ai?.sound) chime('chat');
      },
    };
  })();
  document.addEventListener('submit', (e) => {
    if (!e.target.matches('[data-chat-form]')) return;
    e.preventDefault();
    const i = $('#chat-input'); Chat.send(i.value); i.value = '';
  });
  function chatGreeting() {
    const g = $('[data-chat-greet]');
    if (!g || !O.ai?.greet) return;
    try { if (sessionStorage.getItem('ozx-greeted')) return; sessionStorage.setItem('ozx-greeted', '1'); } catch { return; }
    setTimeout(() => { if (!Chat.isOpen()) { g.hidden = false; setTimeout(() => { g.hidden = true; }, 12000); } }, 5000);
  }

  /* ---------------- Scroll to top ---------------- */
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => { const b = $('.fab-top'); if (b) b.hidden = scrollY < 500; ticking = false; });
  }, { passive: true });

  /* ---------------- Components (re-initialised after each navigation) ---------------- */
  Object.assign(components, {
    recaptcha(el) {
      const render = () => { try { el.dataset.wid = grecaptcha.render(el, { sitekey: el.dataset.sitekey, theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light' }); } catch { /* already */ } };
      if (window.grecaptcha?.render) return render();
      window.__ozxCaptcha = window.__ozxCaptcha || [];
      window.__ozxCaptcha.push(render);
      if (!$('script[data-recaptcha]')) {
        window.ozxCaptchaReady = () => window.__ozxCaptcha.splice(0).forEach((f) => f());
        const s = document.createElement('script'); s.src = 'https://www.google.com/recaptcha/api.js?onload=ozxCaptchaReady&render=explicit&hl=' + (O.lang || 'en'); s.async = true; s.dataset.recaptcha = '1';
        document.head.appendChild(s);
      }
    },
    slider(el) {
      const track = $('.slider-track', el); const dots = $$('.slider-dot', el);
      if (!track) return;
      const slides = $$('.slide', track);
      const go = (i) => track.scrollTo({ left: slides[(i + slides.length) % slides.length].offsetLeft - track.offsetLeft, behavior: reduceMotion ? 'auto' : 'smooth' });
      const cur = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      track.addEventListener('scroll', () => { const i = cur(); dots.forEach((d, j) => d.classList.toggle('active', i === j)); }, { passive: true });
      dots.forEach((d, i) => d.addEventListener('click', () => go(i)));
      $('[data-slide="prev"]', el)?.addEventListener('click', () => go(cur() - 1));
      $('[data-slide="next"]', el)?.addEventListener('click', () => go(cur() + 1));
      if (reduceMotion || slides.length < 2) return;
      let paused = false;
      ['pointerenter', 'touchstart', 'focusin'].forEach((ev) => el.addEventListener(ev, () => { paused = true; }, { passive: true }));
      el.addEventListener('pointerleave', () => { paused = false; });
      const t = setInterval(() => { if (!document.body.contains(el)) return clearInterval(t); if (!paused && !document.hidden) go(cur() + 1); }, 6500);
    },
    filter(el) {
      // Client-side filtering of cards by category chips and a search box.
      const items = $$('[data-filter-item]', el);
      const chips = $$('[data-filter-cat]', el);
      const input = $('[data-filter-q]', el);
      const empty = $('[data-filter-empty]', el);
      let cat = chips.find((c) => c.classList.contains('active'))?.dataset.filterCat || '';
      const apply = () => {
        const q = (input?.value || '').trim().toLowerCase(); let shown = 0;
        items.forEach((it) => {
          const ok = (!cat || it.dataset.cat === cat) && (!q || it.dataset.text.includes(q));
          it.hidden = !ok; if (ok) shown++;
        });
        if (empty) empty.hidden = shown > 0;
      };
      chips.forEach((c) => c.addEventListener('click', () => {
        cat = c.dataset.filterCat; chips.forEach((x) => { x.classList.toggle('active', x === c); x.setAttribute('aria-pressed', x === c); });
        apply();
        const u = new URL(location.href); cat ? u.searchParams.set('cat', cat) : u.searchParams.delete('cat'); history.replaceState(history.state, '', u);
      }));
      input?.addEventListener('input', apply);
      apply();
    },
    countdown(el) {
      const end = Date.parse(el.dataset.until);
      const parts = { d: $('[data-d]', el), h: $('[data-h]', el), m: $('[data-m]', el), s: $('[data-s]', el) };
      const tick = () => {
        let s = Math.max(0, Math.floor((end - Date.now()) / 1000));
        const v = { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
        Object.entries(parts).forEach(([k, n]) => { if (n) n.textContent = String(v[k]).padStart(2, '0'); });
        if (s <= 0) { clearInterval(t); setTimeout(() => location.reload(), 4000); }
      };
      const t = setInterval(tick, 1000); tick();
    },
    'pay-methods'(el) {
      const radios = $$('input[name="method"]', el);
      const form = el.closest('form') || document;
      const sync = () => {
        radios.forEach((r) => {
          const panel = $(`[data-method-panel="${r.value}"]`, form);
          if (panel) panel.hidden = !r.checked;
          r.closest('.pay-option')?.classList.toggle('selected', r.checked);
        });
        const proof = $('[data-proof]', form);
        if (proof) proof.hidden = radios.some((r) => r.checked && r.value === 'balance');
      };
      radios.forEach((r) => r.addEventListener('change', sync)); sync();
    },
    'file-preview'(el) {
      const input = $('input[type="file"]', el); const img = $('img', el); const info = $('[data-file-info]', el);
      input?.addEventListener('change', () => {
        const f = input.files[0]; if (!f) return;
        if (info) info.textContent = `${f.name} · ${(f.size / 1024).toFixed(0)} KB`;
        if (img && f.type.startsWith('image/')) { img.src = URL.createObjectURL(f); img.hidden = false; }
      });
    },
    'char-count'(el) {
      const i = $('input,textarea', el); const out = $('[data-count]', el); const max = +i.maxLength;
      const up = () => { out.textContent = `${i.value.length}/${max}`; }; i.addEventListener('input', up); up();
    },
    'auto-submit'(el) { el.addEventListener('change', () => el.closest('form')?.requestSubmit()); },
    'push-status'(el) {
      if (!('Notification' in window)) { el.textContent = '—'; return; }
      el.textContent = Notification.permission === 'granted' ? S.notif_enabled : (Notification.permission === 'denied' ? S.notif_denied : '');
    },
    'local-time'(el) { const d = new Date(el.dateTime); if (!isNaN(d)) el.title = d.toLocaleString(); },
  });

  function initComponents(root = document) {
    $$('[data-component]', root).forEach((el) => {
      if (el.__ozx) return;
      el.__ozx = true;
      el.dataset.component.split(/\s+/).forEach((name) => {
        try { components[name]?.(el, { api, toast, navigate, modal, confirmDialog }); } catch (err) { console.error(name, err); }
      });
    });
  }

  // Public API for page modules (editor, admin, passkeys)
  window.OZXApp = { api, toast, navigate, modal, confirmDialog, initComponents, copyText, csrf, base: BASE, strings: S };

  document.addEventListener('DOMContentLoaded', () => {
    setActiveNav(O.nav);
    syncFs();
    initComponents(document);
    registerSW();
    if (O.user) { pollNotifications(true); setInterval(pollNotifications, 15000); document.addEventListener('visibilitychange', () => !document.hidden && pollNotifications()); }
    setTimeout(() => engage(), 3500);
    chatGreeting();
    idlePrefetch();
    history.replaceState({ spa: 1, y: 0 }, '');
  });
  window.addEventListener('online', () => toast('✓ Online', 'success', 1500));
  window.addEventListener('offline', () => toast(S.offline, 'error'));
})();
