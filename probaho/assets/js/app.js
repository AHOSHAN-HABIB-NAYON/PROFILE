/* =====================================================================
   Probaho — client runtime (vanilla JS, no framework)
   SPA navigation · forms · theme · passkeys · push · PWA · AI chat
   ===================================================================== */
(() => {
  'use strict';

  const CFG = JSON.parse(document.getElementById('app-config')?.textContent || '{}');
  const BASE = CFG.base || '';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const u = (p) => BASE + (p.startsWith('/') ? p : '/' + p);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  const FRIENDLY = 'দুঃখিত, এই মুহূর্তে অনুরোধটি সম্পন্ন করা যাচ্ছে না। আবার চেষ্টা করুন।';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;

  /* ------------------------------------------------------------ toast */
  function toast(message, type = 'ok', ms = 3200) {
    if (!message) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = icon(type === 'ok' ? 'check-circle' : type === 'err' ? 'alert' : 'info') + `<div>${esc(message)}</div>`;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, ms);
  }

  /* ------------------------------------------------------------ modal */
  function modal(html, { onOpen, onClose } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      onClose && onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    $('#modal-root').appendChild(wrap);
    onOpen && onOpen(wrap.firstElementChild, close);
    return close;
  }
  function confirmBox(message, { ok = 'নিশ্চিত করুন', danger = false } = {}) {
    return new Promise((resolve) => {
      let answer = false;
      modal(`<h3>নিশ্চিত করুন</h3><p class="muted">${esc(message)}</p>
        <div class="modal-actions"><button class="btn btn-ghost" data-close>বাতিল</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(ok)}</button></div>`, {
        onOpen(m, close) { m.querySelector('[data-ok]').addEventListener('click', () => { answer = true; close(); }); },
        onClose() { resolve(answer); },
      });
    });
  }
  function promptBox(title, { value = '', placeholder = '', ok = 'সংরক্ষণ' } = {}) {
    return new Promise((resolve) => {
      let answer = null;
      modal(`<h3>${esc(title)}</h3><input class="input" maxlength="100" value="${esc(value)}" placeholder="${esc(placeholder)}">
        <div class="modal-actions"><button class="btn btn-ghost" data-close>বাতিল</button><button class="btn btn-primary" data-ok>${esc(ok)}</button></div>`, {
        onOpen(m, close) {
          const inp = m.querySelector('input'); inp.focus(); inp.select();
          const go = () => { answer = inp.value.trim(); close(); };
          m.querySelector('[data-ok]').addEventListener('click', go);
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        },
        onClose() { resolve(answer); },
      });
    });
  }

  /* ------------------------------------------------------------ API */
  async function api(url, data = {}, { method = 'POST' } = {}) {
    const opts = { method, credentials: 'same-origin', headers: { 'X-CSRF-Token': CFG.csrf, Accept: 'application/json' } };
    if (method !== 'GET') {
      if (data instanceof FormData) opts.body = data;
      else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(data); }
    }
    let res;
    try {
      res = await fetch(url.startsWith('http') ? url : u(url), opts);
    } catch (e) {
      return { ok: false, message: navigator.onLine ? FRIENDLY : 'ইন্টারনেট সংযোগ নেই। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।' };
    }
    let json;
    try { json = await res.json(); } catch (e) { json = { ok: false, message: FRIENDLY }; }
    if (method !== 'GET' && json.ok) Router.clearCache();
    return json;
  }

  /* ------------------------------------------------------------ theme */
  const Theme = {
    pref() { return store.get('pb-theme') || CFG.theme?.user || document.documentElement.dataset.themePref || CFG.theme?.default || 'light'; },
    resolve(p) { return p === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : p; },
    apply(p, save = true) {
      document.documentElement.setAttribute('data-theme', this.resolve(p) === 'dark' ? 'dark' : 'light');
      document.documentElement.dataset.themePref = p;
      if (save) {
        store.set('pb-theme', p);
        if (CFG.auth && CFG.shell !== 'admin') api('/api/profile/theme', { theme: p });
      }
      $$('[data-theme-set]').forEach((b) => b.classList.toggle('active', b.dataset.themeSet === p));
    },
    cycle() {
      const allowed = CFG.theme?.allowed?.length ? CFG.theme.allowed : ['light', 'dark'];
      const order = ['light', 'dark', 'system'].filter((t) => allowed.includes(t));
      const next = order[(order.indexOf(this.pref()) + 1) % order.length] || 'light';
      this.apply(next);
      toast({ light: 'লাইট মোড চালু', dark: 'ডার্ক মোড চালু', system: 'সিস্টেম থিম অনুসরণ করছে' }[next], 'info', 1600);
    },
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (Theme.pref() === 'system') Theme.apply('system', false); });

  /* ------------------------------------------------------------ progress */
  const Progress = {
    t: null,
    start() {
      const bar = $('#progress');
      clearTimeout(this.t);
      bar.style.width = '0'; bar.classList.add('active');
      requestAnimationFrame(() => { bar.style.width = '65%'; });
    },
    done() {
      const bar = $('#progress');
      bar.style.width = '100%';
      this.t = setTimeout(() => { bar.classList.remove('active'); bar.style.width = '0'; }, 220);
    },
  };

  /* ------------------------------------------------------------ SPA router */
  const Router = {
    cache: new Map(),
    inflight: new Map(),
    TTL: 45000,
    scrolls: {},
    clearCache() { this.cache.clear(); },
    key(url) { const x = new URL(url, location.href); return x.pathname + x.search; },
    internal(a) {
      if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download') || a.dataset.external !== undefined) return false;
      const x = new URL(a.href, location.href);
      if (x.origin !== location.origin) return false;
      if (BASE && !x.pathname.startsWith(BASE + '/') && x.pathname !== BASE) return false;
      const p = x.pathname.slice(BASE.length) || '/';
      if (/^\/(api|auth|assets|uploads)\//.test(p) || /\.(json|xml|txt|js|css|png|jpe?g|webp|svg|pdf)$/.test(p)) return false;
      const toAdmin = p.startsWith('/v2admin');
      if (toAdmin !== (CFG.shell === 'admin')) return false;
      return true;
    },
    async fetchPage(url, { force = false } = {}) {
      const k = this.key(url);
      const hit = this.cache.get(k);
      if (!force && hit && Date.now() - hit.t < this.TTL) return hit.data;
      if (this.inflight.has(k)) return this.inflight.get(k);
      const p = fetch(url, { credentials: 'same-origin', headers: { 'X-SPA': '1', 'X-Shell': CFG.shell, Accept: 'application/json' } })
        .then(async (r) => {
          const ct = r.headers.get('content-type') || '';
          if (!ct.includes('json')) throw new Error('not-json');
          const data = await r.json();
          if (data.ok && !data.redirect && r.status === 200) this.cache.set(k, { t: Date.now(), data });
          return data;
        })
        .finally(() => this.inflight.delete(k));
      this.inflight.set(k, p);
      return p;
    },
    prefetch(url) {
      if (!CFG.auth && /\/(dashboard|wallet|profile|settings|qr)/.test(url)) return;
      if (navigator.connection?.saveData) return;
      const k = this.key(url);
      const hit = this.cache.get(k);
      if (hit && Date.now() - hit.t < this.TTL) return;
      this.fetchPage(url).catch(() => {});
    },
    async go(url, { push = true, replace = false, force = false, scroll = 0 } = {}) {
      const target = new URL(url, location.href);
      if (push && !replace && target.pathname === location.pathname && target.search === location.search && target.hash) {
        $(target.hash)?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      this.scrolls[this.key(location.href)] = scrollY;
      const content = $('#app-content');
      content?.classList.add('leaving');
      Progress.start();
      let data;
      try {
        data = await this.fetchPage(target.href, { force });
      } catch (e) {
        Progress.done();
        content?.classList.remove('leaving');
        if (!navigator.onLine) { toast('ইন্টারনেট সংযোগ নেই।', 'err'); return; }
        location.href = target.href;
        return;
      }
      Progress.done();
      if (data.redirect) {
        const r = new URL(data.redirect, location.href);
        const isAdmin = r.pathname.slice(BASE.length).startsWith('/v2admin');
        if (isAdmin !== (CFG.shell === 'admin')) { location.href = r.href; return; }
        return this.go(r.href, { push: true, replace: true, force: true });
      }
      if (!data.html && data.html !== '') { content?.classList.remove('leaving'); toast(data.message || FRIENDLY, 'err'); return; }
      if (push) history[replace ? 'replaceState' : 'pushState']({ spa: 1 }, '', target.href);
      this.render(data);
      if (target.hash) setTimeout(() => $(target.hash)?.scrollIntoView(), 50);
      else window.scrollTo(0, scroll);
    },
    render(data) {
      if (typeof data.auth === 'boolean') CFG.auth = data.auth;
      if (data.shellHtml && data.shell !== CFG.shell) {
        if (data.shell === 'admin' || CFG.shell === 'admin') { location.reload(); return; }
        $('#shell').innerHTML = data.shellHtml;
        document.body.className = 'shell-' + data.shell;
        document.documentElement.dataset.shell = data.shell;
        CFG.shell = data.shell;
      }
      const content = $('#app-content');
      content.innerHTML = data.html;
      content.dataset.page = data.page;
      content.classList.remove('leaving');
      content.style.animation = 'none'; void content.offsetWidth; content.style.animation = '';
      document.title = data.title;
      $$('[data-heading]').forEach((h) => { h.textContent = data.heading || ''; });
      const back = $('.topbar-back'); const brand = $('.topbar-brand');
      if (back) back.hidden = !data.back;
      if (brand) brand.hidden = !!data.back;
      $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === data.active || (data.page === 'home' && a.dataset.nav === 'home')));
      if (typeof data.unread === 'number') setUnread(data.unread);
      $('#mobile-menu')?.setAttribute('hidden', '');
      $('#admin-sidebar')?.classList.remove('open');
      Theme.apply(Theme.pref(), false);
      initPage(content);
    },
  };

  function setUnread(n) {
    $$('[data-unread]').forEach((b) => { b.hidden = !n; b.textContent = n > 99 ? '99+' : n; });
  }

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a');
    if (!a || !Router.internal(a)) return;
    e.preventDefault();
    Router.go(a.href);
  });
  let hoverTimer;
  const onIntent = (e) => {
    const a = e.target.closest?.('a');
    if (!a || !Router.internal(a)) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => Router.prefetch(a.href), e.type === 'touchstart' ? 0 : 70);
  };
  document.addEventListener('mouseover', onIntent, { passive: true });
  document.addEventListener('touchstart', onIntent, { passive: true });
  window.addEventListener('popstate', () => {
    Router.go(location.href, { push: false, scroll: Router.scrolls[Router.key(location.href)] || 0 });
  });
  function prefetchNav() {
    const run = () => $$('.bottom-nav a, .side-nav a, .header-nav a').slice(0, 8).forEach((a) => Router.internal(a) && Router.prefetch(a.href));
    ('requestIdleCallback' in window) ? requestIdleCallback(run, { timeout: 3000 }) : setTimeout(run, 1500);
  }

  /* ------------------------------------------------------------ forms */
  async function submitForm(form) {
    if (form.dataset.busy) return;
    if (form.dataset.confirm && !(await confirmBox(form.dataset.confirm, { danger: form.dataset.danger !== undefined }))) return;
    const btn = form.querySelector('[type=submit]');
    const errBox = form.querySelector('.form-error');
    if (errBox) errBox.hidden = true;
    form.dataset.busy = '1';
    const label = btn?.innerHTML;
    if (btn) { btn.classList.add('is-loading'); btn.innerHTML = '<span class="spinner"></span>' + (btn.dataset.loading || 'অপেক্ষা করুন...'); }
    const fd = new FormData(form);
    if (form._files) { fd.delete(form._files.name); form._files.list.forEach((f) => fd.append(form._files.name, f)); }
    const res = await api(form.getAttribute('action'), fd);
    delete form.dataset.busy;
    if (btn) { btn.classList.remove('is-loading'); btn.innerHTML = label; }
    if (!res.ok) {
      if (errBox) { errBox.textContent = res.message || FRIENDLY; errBox.hidden = false; }
      toast(res.message || FRIENDLY, 'err');
      if (res.captcha) window.turnstile?.reset?.();
      if (res.reload_captcha) Router.go(location.href, { push: false, force: true, scroll: scrollY });
      return;
    }
    const handler = form.dataset.onSuccess && Handlers[form.dataset.onSuccess];
    if (handler) return handler(res, form);
    if (res.message) toast(res.message, 'ok');
    if (form.dataset.reset !== undefined) { form.reset(); form._files && (form._files.list = []); $$('.upload-previews', form).forEach((p) => { p.innerHTML = ''; }); }
    if (res.redirect) {
      const r = new URL(res.redirect, location.href);
      const isAdmin = r.pathname.slice(BASE.length).startsWith('/v2admin');
      if (isAdmin !== (CFG.shell === 'admin') || res.hard) location.href = r.href;
      else Router.go(r.href, { force: true });
    } else if (res.reload) {
      Router.go(location.href, { push: false, force: true, scroll: scrollY });
    }
  }
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-ajax]');
    if (!form) return;
    e.preventDefault();
    submitForm(form);
  });

  // Generic POST buttons: <button data-post="/api/x/y" data-id="1" data-confirm="..." data-then="reload|remove">
  async function postButton(btn) {
    if (btn.dataset.confirm && !(await confirmBox(btn.dataset.confirm, { danger: btn.dataset.danger !== undefined }))) return;
    const payload = {};
    Object.keys(btn.dataset).forEach((k) => { if (!['post', 'confirm', 'then', 'danger'].includes(k)) payload[k] = btn.dataset[k]; });
    btn.disabled = true;
    const res = await api(btn.dataset.post, payload);
    btn.disabled = false;
    if (!res.ok) return toast(res.message || FRIENDLY, 'err');
    if (res.message) toast(res.message, 'ok');
    if (typeof res.unread === 'number') setUnread(res.unread);
    const then = btn.dataset.then || 'reload';
    if (res.redirect) Router.go(res.redirect, { force: true });
    else if (then === 'remove') btn.closest('[data-item]')?.remove();
    else if (then === 'reload') Router.go(location.href, { push: false, force: true, scroll: scrollY });
  }

  /* ------------------------------------------------------------ actions */
  const Actions = {
    'theme-cycle': () => Theme.cycle(),
    'theme-set': (el) => Theme.apply(el.dataset.themeSet),
    menu: () => { const m = $('#mobile-menu'); m.hidden = !m.hidden; },
    back: () => { if (history.length > 1) history.back(); else Router.go(u('/dashboard')); },
    logout: async () => {
      const res = await api('/api/auth/logout', {});
      store.set('pb-chat', '');
      if (res.ok) { Router.clearCache(); Router.go(u('/'), { replace: true, force: true }); toast('সফলভাবে লগআউট হয়েছে', 'info'); }
    },
    copy: (el) => {
      navigator.clipboard?.writeText(el.dataset.copyText || '').then(() => toast('কপি করা হয়েছে', 'ok', 1500));
    },
    'toggle-pass': (el) => {
      const inp = el.closest('.input-group').querySelector('input');
      inp.type = inp.type === 'password' ? 'text' : 'password';
      el.innerHTML = icon(inp.type === 'password' ? 'eye' : 'eye-off');
    },
    'toggle-balance': (el) => {
      const card = el.closest('.balance-card');
      card.classList.toggle('is-hidden');
      store.set('pb-hide-balance', card.classList.contains('is-hidden') ? '1' : '0');
    },
    'passkey-login': () => Passkey.login(),
    'passkey-add': () => Passkey.register(),
    'passkey-rename': async (el) => {
      const name = await promptBox('Passkey-এর নাম পরিবর্তন', { value: el.dataset.name });
      if (!name) return;
      const res = await api('/api/passkey/rename', { id: el.dataset.id, name });
      res.ok ? (toast(res.message), Router.go(location.href, { push: false, force: true, scroll: scrollY })) : toast(res.message, 'err');
    },
    'push-toggle': (el) => Push.toggle(el),
    'install-app': () => PWA.open(true),
    'install-now': () => PWA.install(),
    'install-later': () => PWA.later(),
    'chat-open': (el) => Chat.open(el.dataset.tab || 'ai'),
    'chat-close': () => Chat.close(),
    'admin-menu': () => $('#admin-sidebar')?.classList.toggle('open'),
    'admin-logout': async () => { await api('/v2admin/api/auth/logout', {}); location.href = u('/v2admin/login'); },
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el && Actions[el.dataset.action]) { e.preventDefault(); Actions[el.dataset.action](el, e); return; }
    const post = e.target.closest('[data-post]');
    if (post && post.tagName !== 'FORM') { e.preventDefault(); postButton(post); return; }
    const cp = e.target.closest('[data-copy-text]');
    if (cp) { e.preventDefault(); Actions.copy(cp); }
    const seg = e.target.closest('[data-theme-set]');
    if (seg) { e.preventDefault(); Theme.apply(seg.dataset.themeSet); }
    if ($('#mobile-menu') && !$('#mobile-menu').hidden && e.target.id === 'mobile-menu') $('#mobile-menu').hidden = true;
  });

  /* ------------------------------------------------------------ helpers: base64url */
  const b64 = {
    toBuf(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a.buffer; },
    fromBuf(buf) { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  };

  /* ------------------------------------------------------------ passkeys */
  const Passkey = {
    supported() { return !!(window.PublicKeyCredential && navigator.credentials); },
    async login() {
      if (!this.supported()) return toast('এই ব্রাউজারে Passkey সাপোর্ট নেই।', 'err');
      const opts = await api('/api/passkey/login-options', {});
      if (!opts.ok) return toast(opts.message, 'err');
      const o = opts.options;
      let cred;
      try {
        cred = await navigator.credentials.get({ publicKey: { ...o, challenge: b64.toBuf(o.challenge), allowCredentials: [] }, mediation: 'optional' });
      } catch (e) {
        return toast(e.name === 'NotAllowedError' ? 'Passkey যাচাই বাতিল করা হয়েছে।' : 'Passkey দিয়ে লগইন করা যায়নি।', 'err');
      }
      const r = cred.response;
      const res = await api('/api/passkey/login', {
        remember: $('[name=remember]')?.checked ? 1 : 0,
        next: new URLSearchParams(location.search).get('next') || '',
        credential: {
          id: cred.id, rawId: b64.fromBuf(cred.rawId), type: cred.type,
          response: {
            clientDataJSON: b64.fromBuf(r.clientDataJSON), authenticatorData: b64.fromBuf(r.authenticatorData),
            signature: b64.fromBuf(r.signature), userHandle: r.userHandle ? b64.fromBuf(r.userHandle) : '',
          },
        },
      });
      if (!res.ok) return toast(res.message, 'err');
      toast(res.message, 'ok');
      Router.clearCache();
      Router.go(res.redirect, { force: true, replace: true });
    },
    async register() {
      if (!this.supported()) return toast('এই ব্রাউজারে Passkey সাপোর্ট নেই।', 'err');
      const name = await promptBox('Passkey-এর একটি নাম দিন', { placeholder: 'যেমন: আমার Android ফোন', ok: 'চালিয়ে যান' });
      if (name === null) return;
      const opts = await api('/api/passkey/register-options', {});
      if (!opts.ok) return toast(opts.message, 'err');
      const o = opts.options;
      let cred;
      try {
        cred = await navigator.credentials.create({
          publicKey: {
            ...o,
            challenge: b64.toBuf(o.challenge),
            user: { ...o.user, id: b64.toBuf(o.user.id) },
            excludeCredentials: (o.excludeCredentials || []).map((c) => ({ ...c, id: b64.toBuf(c.id) })),
          },
        });
      } catch (e) {
        return toast(e.name === 'InvalidStateError' ? 'এই ডিভাইসে আগেই Passkey যোগ করা আছে।' : e.name === 'NotAllowedError' ? 'Passkey তৈরি বাতিল করা হয়েছে।' : 'Passkey তৈরি করা যায়নি।', 'err');
      }
      const r = cred.response;
      const res = await api('/api/passkey/register', {
        name,
        credential: {
          id: cred.id, rawId: b64.fromBuf(cred.rawId), type: cred.type,
          response: { clientDataJSON: b64.fromBuf(r.clientDataJSON), attestationObject: b64.fromBuf(r.attestationObject), transports: r.getTransports ? r.getTransports() : [] },
        },
      });
      if (!res.ok) return toast(res.message, 'err');
      toast(res.message, 'ok');
      Router.go(location.href, { push: false, force: true, scroll: scrollY });
    },
  };

  /* ------------------------------------------------------------ service worker + push */
  let swReg = null;
  if ('serviceWorker' in navigator && CFG.pwa?.enabled !== false) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(u('/sw.js'), { scope: u('/') }).then((r) => { swReg = r; Push.refresh(); }).catch(() => {});
    });
    navigator.serviceWorker.addEventListener?.('message', (e) => {
      if (e.data?.type === 'navigate' && e.data.url) Router.go(e.data.url, { force: true });
      if (e.data?.type === 'push') { const b = $('[data-unread]'); const n = (parseInt(b?.textContent, 10) || 0) + 1; setUnread(n); Router.clearCache(); }
    });
  }
  const Push = {
    supported() { return 'PushManager' in window && 'Notification' in window && 'serviceWorker' in navigator; },
    key() { const raw = atob(CFG.push.key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - CFG.push.key.length % 4) % 4)); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); },
    async current() { const reg = swReg || await navigator.serviceWorker.ready; return reg.pushManager.getSubscription(); },
    async refresh() {
      const el = $('[data-action=push-toggle]');
      if (!el) return;
      const status = $('[data-push-status]');
      if (!CFG.push?.enabled || !this.supported()) { el.disabled = true; if (status) status.textContent = 'এই ব্রাউজারে পুশ নোটিফিকেশন সাপোর্ট নেই।'; return; }
      const sub = await this.current().catch(() => null);
      const input = el.querySelector('input') || el;
      if ('checked' in input) input.checked = !!sub && Notification.permission === 'granted';
      if (status) status.textContent = Notification.permission === 'denied' ? 'ব্রাউজার সেটিংসে নোটিফিকেশন ব্লক করা আছে।' : sub ? 'এই ডিভাইসে চালু আছে' : 'এই ডিভাইসে বন্ধ আছে';
    },
    async toggle(el) {
      if (!CFG.push?.enabled || !this.supported()) return toast('পুশ নোটিফিকেশন সাপোর্টেড নয়।', 'err');
      const sub = await this.current().catch(() => null);
      if (sub) {
        await api('/api/push/unsubscribe', { endpoint: sub.endpoint });
        await sub.unsubscribe();
        toast('এই ডিভাইসে পুশ নোটিফিকেশন বন্ধ হয়েছে', 'info');
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { toast('নোটিফিকেশনের অনুমতি দেওয়া হয়নি।', 'err'); return this.refresh(); }
        try {
          const reg = swReg || await navigator.serviceWorker.ready;
          const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: this.key() });
          const res = await api('/api/push/subscribe', s.toJSON());
          toast(res.message || 'পুশ নোটিফিকেশন চালু হয়েছে', res.ok ? 'ok' : 'err');
        } catch (e) { toast('পুশ নোটিফিকেশন চালু করা যায়নি।', 'err'); }
      }
      this.refresh();
    },
  };

  /* ------------------------------------------------------------ PWA install */
  const PWA = {
    deferred: null,
    standalone() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; },
    ios() { return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream; },
    steps() {
      const ua = navigator.userAgent;
      if (this.ios()) return 'Safari-তে নিচের Share বাটন (□↑) → "Add to Home Screen" → Add';
      if (/SamsungBrowser/i.test(ua)) return 'মেনু (☰) → "Add page to" → "Home screen"';
      if (/Firefox/i.test(ua)) return 'মেনু (⋮) → "Install" অথবা "Add to Home screen"';
      if (/Edg\//i.test(ua)) return 'মেনু (…) → Apps → "Install this site as an app"';
      if (/Android/i.test(ua)) return 'Browser Menu (⋮) → "Add to Home Screen" / "Install app"';
      return 'অ্যাড্রেস বারের ইনস্টল আইকনে (⊕) ক্লিক করুন অথবা Browser Menu → "Install app"';
    },
    open(manual = false) {
      const sheet = $('#install-sheet');
      if (!sheet) return;
      if (this.standalone()) return toast('অ্যাপটি ইতিমধ্যে ইনস্টল করা আছে ✓', 'ok');
      $('.install-done', sheet).hidden = true;
      const man = $('.install-manual', sheet);
      man.hidden = !!this.deferred;
      $('[data-install-steps]', sheet).textContent = this.steps();
      $('[data-action=install-now]', sheet).hidden = !this.deferred;
      sheet.hidden = false;
      void manual;
    },
    close() { const s = $('#install-sheet'); if (s) s.hidden = true; },
    async install() {
      if (!this.deferred) return this.open(true);
      this.deferred.prompt();
      const choice = await this.deferred.userChoice.catch(() => ({}));
      this.deferred = null;
      if (choice.outcome !== 'accepted') this.later();
    },
    later() { store.set('pb-install-later', String(Date.now())); this.close(); },
    installed() {
      store.set('pb-installed', '1');
      const sheet = $('#install-sheet');
      if (sheet) {
        sheet.hidden = false;
        $('.install-done', sheet).hidden = false;
        $('.install-manual', sheet).hidden = true;
        $('[data-action=install-now]', sheet).hidden = true;
        setTimeout(() => this.close(), 2600);
      }
      toast('অ্যাপ সফলভাবে ইনস্টল হয়েছে ✓', 'ok');
    },
    maybeAuto() {
      if (!CFG.pwa?.enabled || !CFG.pwa.auto || this.standalone() || store.get('pb-installed')) return;
      const later = parseInt(store.get('pb-install-later') || '0', 10);
      if (later && Date.now() - later < 3 * 86400000) return;              // snoozed for 3 days
      const visits = parseInt(store.get('pb-visits') || '0', 10) + 1;
      store.set('pb-visits', String(visits));
      const delay = (CFG.pwa.delay || 25) * 1000;
      setTimeout(() => {
        if (document.hidden || $('#chat-panel:not([hidden])') || $('.modal-backdrop')) return;
        if (this.deferred) this.open();
        else if (this.ios() && visits >= 2) this.open(true);             // iOS: manual steps, not on first visit
      }, delay);
    },
  };
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    PWA.deferred = e;
    $$('[data-action=install-app]').forEach((b) => b.classList.add('can-install'));
  });
  window.addEventListener('appinstalled', () => PWA.installed());
  $('#install-sheet')?.addEventListener('click', (e) => { if (e.target.id === 'install-sheet') PWA.later(); });

  /* ------------------------------------------------------------ AI chat */
  const Chat = {
    history: [],
    loaded: false,
    load() {
      if (this.loaded) return;
      this.loaded = true;
      try { this.history = JSON.parse(sessionStorage.getItem('pb-chat') || '[]'); } catch (e) { this.history = []; }
      const log = $('#chat-log');
      if (!log) return;
      this.add('bot', CFG.ai?.welcome || 'আসসালামু আলাইকুম!', false);
      this.history.forEach((m) => this.add(m.role === 'user' ? 'me' : 'bot', m.content, false));
      const quick = $('#chat-quick');
      if (quick) quick.innerHTML = (CFG.ai?.quick || []).map((q) => `<button type="button">${esc(q)}</button>`).join('');
    },
    linkify(text) {
      return esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    },
    add(who, text, save = true) {
      const log = $('#chat-log');
      const b = document.createElement('div');
      b.className = 'bubble ' + who;
      b.innerHTML = this.linkify(text);
      log.appendChild(b);
      log.scrollTop = log.scrollHeight;
      if (save) {
        this.history.push({ role: who === 'me' ? 'user' : 'assistant', content: text });
        this.history = this.history.slice(-20);
        try { sessionStorage.setItem('pb-chat', JSON.stringify(this.history)); } catch (e) { /* ignore */ }
      }
    },
    open(tab = 'ai') {
      const p = $('#chat-panel');
      if (!p) return;
      this.load();
      p.hidden = false;
      $('#assist').classList.add('open');
      this.tab($('[data-chat-pane=ai]') ? tab : 'human');
      if (tab === 'ai' && matchMedia('(min-width: 640px)').matches) setTimeout(() => $('#chat-form input')?.focus(), 120);
    },
    close() { $('#chat-panel').hidden = true; $('#assist').classList.remove('open'); },
    tab(name) {
      $$('[data-chat-tab]').forEach((b) => b.classList.toggle('active', b.dataset.chatTab === name));
      $$('[data-chat-pane]').forEach((p) => { p.hidden = p.dataset.chatPane !== name; });
    },
    async send(text) {
      text = text.trim();
      if (!text) return;
      this.add('me', text);
      const log = $('#chat-log');
      const typing = document.createElement('div');
      typing.className = 'bubble bot typing';
      typing.innerHTML = '<i></i><i></i><i></i>';
      log.appendChild(typing);
      log.scrollTop = log.scrollHeight;
      const res = await api('/api/chat/send', { message: text, history: this.history.slice(-9, -1) });
      typing.remove();
      this.add('bot', res.ok ? res.answer : (res.message || FRIENDLY));
    },
  };
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'chat-form') return;
    e.preventDefault();
    const inp = e.target.querySelector('input');
    const v = inp.value; inp.value = '';
    Chat.send(v);
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-chat-tab]');
    if (t) return Chat.tab(t.dataset.chatTab);
    const q = e.target.closest('#chat-quick button');
    if (q) Chat.send(q.textContent);
    const ask = e.target.closest('[data-ask]');
    if (ask) { Chat.open('ai'); Chat.send(ask.dataset.ask); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#chat-panel')?.hidden) Chat.close(); });

  /* ------------------------------------------------------------ lazy scripts */
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    return loaded[src];
  }
  function initCaptcha(root) {
    const el = $('[data-captcha]', root);
    if (!el) return;
    if (el.dataset.captcha === 'turnstile') {
      loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit').then(() => {
        const t = setInterval(() => { if (window.turnstile) { clearInterval(t); el.innerHTML = ''; window.turnstile.render(el, { sitekey: el.dataset.sitekey, theme: document.documentElement.dataset.theme }); } }, 50);
      });
    } else {
      window.pbRecaptcha = () => window.grecaptcha.render(el, { sitekey: el.dataset.sitekey });
      loadScript('https://www.google.com/recaptcha/api.js?onload=pbRecaptcha&render=explicit');
    }
  }
  function qrSvg(text, size = 6) {
    return loadScript(u('/assets/js/vendor/qrcode.js')).then(() => {
      const qr = window.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({ cellSize: size, margin: 2, scalable: true });
    });
  }

  /* ------------------------------------------------------------ page initialisers */
  const Pages = {
    login(root) {
      if (!Passkey.supported()) $$('[data-action=passkey-login]', root).forEach((b) => { b.disabled = true; b.title = 'এই ব্রাউজারে Passkey সাপোর্ট নেই'; });
    },
    register(root) {
      const pw = $('[name=password]', root); const bar = $('.pw-meter i', root);
      pw?.addEventListener('input', () => {
        const v = pw.value; let s = 0;
        if (v.length >= 8) s++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++; if (/\d/.test(v)) s++; if (/[^A-Za-z0-9]/.test(v)) s++; if (v.length >= 12) s++;
        bar.style.width = (s / 5 * 100) + '%';
        bar.style.background = s <= 2 ? 'var(--err)' : s <= 3 ? 'var(--warn)' : 'var(--ok)';
      });
    },
    dashboard(root) {
      if (store.get('pb-hide-balance') === '1') $('.balance-card', root)?.classList.add('is-hidden');
    },
    wallet(root) { Pages.dashboard(root); },
    home(root) {
      $$('[data-action=install-app]', root).forEach((b) => { if (PWA.standalone()) { b.innerHTML = icon('check') + ' অ্যাপ ইনস্টল করা আছে'; b.disabled = true; } });
    },
    settings(root) {
      Push.refresh();
      Theme.apply(Theme.pref(), false);
      if (!Passkey.supported()) { const b = $('[data-action=passkey-add]', root); if (b) { b.disabled = true; b.insertAdjacentHTML('afterend', '<p class="hint muted small">এই ব্রাউজারে Passkey সাপোর্ট নেই।</p>'); } }
      const qr = $('[data-totp-uri]', root);
      if (qr) qrSvg(qr.dataset.totpUri, 4).then((svg) => { qr.innerHTML = svg; });
    },
    deposit(root) { Amount.bind(root); },
    withdraw(root) { Amount.bind(root); },
    transfer(root) {
      Amount.bind(root);
      const inp = $('[name=recipient]', root); const out = $('[data-recipient]', root);
      let t;
      inp?.addEventListener('input', () => {
        clearTimeout(t);
        out.innerHTML = '';
        if (inp.value.trim().length < 4) return;
        t = setTimeout(async () => {
          const res = await api('/api/wallet/lookup', { q: inp.value.trim() });
          out.innerHTML = res.ok
            ? `<div class="alert alert-ok">${icon('check-circle')}<div><b>${esc(res.name)}</b><br><small>ID: ${esc(res.uid)}</small></div></div>`
            : `<div class="alert alert-warn">${icon('alert')}<div>${esc(res.message)}</div></div>`;
        }, 450);
      });
      if (inp?.value) inp.dispatchEvent(new Event('input'));
    },
    binance_pay(root) { Amount.bind(root); },
    binance_order(root) {
      const box = $('[data-order]', root);
      if (!box) return;
      const qr = $('[data-qr-content]', root);
      if (qr && !qr.querySelector('img')) qrSvg(qr.dataset.qrContent, 5).then((svg) => { qr.innerHTML = svg; });
      const timer = $('[data-expire]', root);
      if (timer) {
        const end = parseInt(timer.dataset.expire, 10) * 1000;
        const tick = () => {
          if (!timer.isConnected) return;
          const s = Math.max(0, Math.floor((end - Date.now()) / 1000));
          timer.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
          if (s > 0) setTimeout(tick, 1000);
        };
        tick();
      }
      if (box.dataset.status !== 'pending' || box.dataset.mode !== 'api') return;
      const poll = async () => {
        if (!box.isConnected) return;
        const res = await api('/api/binance/status', { trade: box.dataset.order });
        if (res.ok && res.status !== 'pending') { Router.clearCache(); Router.go(location.href, { push: false, force: true }); return; }
        setTimeout(poll, 5000);
      };
      setTimeout(poll, 5000);
    },
    report(root) { Uploads.bind(root); },
    qr(root) { QR.init(root); },
    transactions(root) {
      const more = $('[data-load-more]', root);
      more?.addEventListener('click', async () => {
        more.disabled = true;
        const url = new URL(location.href); url.searchParams.set('page', more.dataset.next);
        const res = await Router.fetchPage(url.href, { force: true }).catch(() => null);
        more.disabled = false;
        if (!res?.html) return;
        const tmp = document.createElement('div'); tmp.innerHTML = res.html;
        $('[data-tx-list]', root).insertAdjacentHTML('beforeend', $('[data-tx-list]', tmp)?.innerHTML || '');
        const next = $('[data-load-more]', tmp);
        if (next) more.dataset.next = next.dataset.next; else more.remove();
      });
    },
  };

  const Amount = {
    bind(root) {
      const amt = $('[name=amount]', root);
      if (!amt) return;
      const fee = $('[data-fee-out]', root); const total = $('[data-total-out]', root);
      const calc = () => {
        const v = parseFloat(String(amt.value).replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d))) || 0;
        const sel = $('[name=method]:checked', root);
        const pct = parseFloat(sel?.dataset.feePercent ?? amt.dataset.feePercent ?? 0) || 0;
        const fix = parseFloat(sel?.dataset.feeFixed ?? amt.dataset.feeFixed ?? 0) || 0;
        const f = v > 0 ? Math.round((v * pct / 100 + fix) * 100) / 100 : 0;
        if (fee) fee.textContent = f.toFixed(2);
        if (total) total.textContent = (v + f).toFixed(2);
        const label = $('label[data-account-label]', root);
        if (label && sel?.dataset.accountLabel) label.textContent = sel.dataset.accountLabel;
        const ins = $('div[data-instructions]', root);
        if (ins && sel) ins.textContent = sel.dataset.instructions || '';
        if (ins) ins.closest('.alert').hidden = !ins.textContent;
      };
      amt.addEventListener('input', calc);
      root.addEventListener('change', (e) => { if (e.target.name === 'method') calc(); });
      $$('[data-amount]', root).forEach((c) => c.addEventListener('click', () => { amt.value = c.dataset.amount; calc(); amt.focus(); }));
      calc();
    },
  };

  const Uploads = {
    bind(root) {
      $$('input[type=file][data-preview]', root).forEach((input) => {
        const form = input.closest('form');
        const box = $(input.dataset.preview, root);
        const max = parseInt(input.dataset.max || '3', 10);
        form._files = { name: input.name, list: [] };
        const render = () => {
          box.innerHTML = '';
          form._files.list.forEach((f, i) => {
            const fig = document.createElement('figure');
            const img = document.createElement('img');
            img.src = URL.createObjectURL(f); img.alt = '';
            img.onload = () => URL.revokeObjectURL(img.src);
            const rm = document.createElement('button');
            rm.type = 'button'; rm.innerHTML = icon('x'); rm.setAttribute('aria-label', 'মুছুন');
            rm.onclick = () => { form._files.list.splice(i, 1); render(); };
            fig.append(img, rm); box.appendChild(fig);
          });
        };
        input.addEventListener('change', () => {
          for (const f of input.files) {
            if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { toast('শুধু JPG, PNG বা WEBP ছবি দিন।', 'err'); continue; }
            if (f.size > 5 * 1048576) { toast('প্রতিটি ছবি সর্বোচ্চ ৫ MB হতে পারে।', 'err'); continue; }
            if (form._files.list.length >= max) { toast(`সর্বোচ্চ ${max}টি ছবি দেওয়া যাবে।`, 'err'); break; }
            form._files.list.push(f);
          }
          input.value = '';
          render();
        });
      });
    },
  };

  const QR = {
    stream: null,
    stop() { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; },
    init(root) {
      const mine = $('[data-my-qr]', root);
      if (mine) qrSvg(mine.dataset.myQr, 6).then((svg) => { mine.innerHTML = svg; });
      $$('[data-qr-tab]', root).forEach((b) => b.addEventListener('click', () => {
        $$('[data-qr-tab]', root).forEach((x) => x.classList.toggle('active', x === b));
        $$('[data-qr-pane]', root).forEach((p) => { p.hidden = p.dataset.qrPane !== b.dataset.qrTab; });
        if (b.dataset.qrTab === 'scan') this.start(root); else this.stop();
      }));
      $('[data-scan-start]', root)?.addEventListener('click', () => this.start(root));
      $('[data-scan-file]', root)?.addEventListener('change', (e) => this.fromFile(e.target.files[0], root));
    },
    handle(text) {
      this.stop();
      let uid = null;
      const m = String(text).match(/(?:\/qr\/pay\/|pay:)([A-Za-z0-9]{6,12})/) || String(text).match(/[?&]to=([A-Za-z0-9]{6,12})/);
      if (m) uid = m[1];
      if (uid) { toast('QR শনাক্ত হয়েছে', 'ok', 1400); Router.go(u('/wallet/transfer?to=' + encodeURIComponent(uid))); }
      else if (/^https?:\/\//.test(text)) { modal(`<h3>QR লিংক</h3><p class="muted" style="word-break:break-all">${esc(text)}</p><div class="modal-actions"><button class="btn btn-ghost" data-close>বন্ধ</button><a class="btn btn-primary" href="${esc(text)}" target="_blank" rel="noopener">খুলুন</a></div>`); }
      else toast('এই QR কোডটি সাপোর্টেড নয়।', 'err');
    },
    async detector() {
      if ('BarcodeDetector' in window) {
        try { const f = await BarcodeDetector.getSupportedFormats(); if (f.includes('qr_code')) { const d = new BarcodeDetector({ formats: ['qr_code'] }); return async (src) => (await d.detect(src))[0]?.rawValue || null; } } catch (e) { /* fall through */ }
      }
      await loadScript(u('/assets/js/vendor/jsQR.js'));
      const c = document.createElement('canvas'); const ctx = c.getContext('2d', { willReadFrequently: true });
      return async (src) => {
        const w = src.videoWidth || src.naturalWidth || src.width; const h = src.videoHeight || src.naturalHeight || src.height;
        if (!w || !h) return null;
        const scale = Math.min(1, 640 / Math.max(w, h));
        c.width = w * scale; c.height = h * scale;
        ctx.drawImage(src, 0, 0, c.width, c.height);
        const img = ctx.getImageData(0, 0, c.width, c.height);
        return window.jsQR(img.data, img.width, img.height)?.data || null;
      };
    },
    async start(root) {
      const video = $('video', root); const msg = $('.scanner-msg', root);
      if (!video || this.stream) return;
      if (!navigator.mediaDevices?.getUserMedia) { msg.textContent = 'এই ব্রাউজারে ক্যামেরা সাপোর্ট নেই। গ্যালারি থেকে QR ছবি দিন।'; return; }
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch (e) { msg.textContent = 'ক্যামেরার অনুমতি পাওয়া যায়নি। গ্যালারি থেকে QR ছবি দিন।'; return; }
      msg.textContent = '';
      video.srcObject = this.stream;
      await video.play().catch(() => {});
      const detect = await this.detector();
      const loop = async () => {
        if (!this.stream || !video.isConnected) return this.stop();
        const v = await detect(video).catch(() => null);
        if (v) return this.handle(v);
        setTimeout(() => requestAnimationFrame(loop), 180);
      };
      loop();
    },
    async fromFile(file, root) {
      if (!file) return;
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await img.decode().catch(() => {});
      const detect = await this.detector();
      const v = await detect(img).catch(() => null);
      URL.revokeObjectURL(img.src);
      v ? this.handle(v) : toast('ছবিতে কোনো QR কোড পাওয়া যায়নি।', 'err');
      void root;
    },
  };

  // Success handlers referenced by forms (data-on-success="name")
  const Handlers = {
    login(res) {
      if (res.two_factor) { Router.go(u('/two-factor'), { force: true }); return; }
      toast(res.message, 'ok');
      Router.clearCache();
      Router.go(res.redirect, { force: true, replace: true });
    },
    chatClear() { sessionStorage.removeItem('pb-chat'); },
  };

  function initPage(root) {
    if (QR.stream && root.dataset.page !== 'qr') QR.stop();
    initCaptcha(root);
    $$('img[data-src]', root).forEach((img) => { img.src = img.dataset.src; });
    const fn = Pages[root.dataset.page];
    if (fn) try { fn(root); } catch (e) { console.error(e); }
    window.PB_ADMIN?.init?.(root);
  }

  /* ------------------------------------------------------------ boot */
  window.PB = { api, toast, modal, confirmBox, promptBox, Router, u, icon, esc, qrSvg, loadScript, Handlers };
  Theme.apply(Theme.pref(), false);
  history.replaceState({ spa: 1 }, '', location.href);
  const first = $('#app-content');
  if (first) {
    if (document.readyState !== 'loading') initPage(first);
    else document.addEventListener('DOMContentLoaded', () => initPage(first));
  }
  PWA.maybeAuto();
  prefetchNav();
  window.addEventListener('online', () => toast('আবার অনলাইনে ফিরে এসেছেন', 'ok', 1800));
  window.addEventListener('offline', () => toast('আপনি অফলাইনে আছেন', 'err', 2500));
})();
