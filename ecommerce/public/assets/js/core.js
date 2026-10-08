/*!
 * core.js — shared runtime for storefront and admin.
 * Event delegation (one listener per event type, never re-bound on navigation),
 * HTTP client with CSRF, page-module registry, toasts, modal, progress bar, theme.
 */
(function () {
  'use strict';

  var cfgEl = document.getElementById('app-config');
  var config = {};
  try { config = cfgEl ? JSON.parse(cfgEl.textContent) : {}; } catch (e) { config = {}; }

  var App = window.App = {
    config: config,
    actions: Object.create(null),
    pages: Object.create(null),
    currentPage: null,
    currentCleanup: null,
    bus: document.createElement('span')
  };

  // ---------------------------------------------------------------- helpers
  App.$ = function (sel, root) { return (root || document).querySelector(sel); };
  App.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  App.debounce = function (fn, wait) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  };

  App.throttle = function (fn, wait) {
    var last = 0, t;
    return function () {
      var now = Date.now(), args = arguments, ctx = this;
      var remaining = wait - (now - last);
      clearTimeout(t);
      if (remaining <= 0) { last = now; fn.apply(ctx, args); }
      else { t = setTimeout(function () { last = Date.now(); fn.apply(ctx, args); }, remaining); }
    };
  };

  App.escape = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var BN = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  App.bn = function (v) { return config.bnDigits === false ? String(v) : String(v).replace(/[0-9]/g, function (d) { return BN[d]; }); };
  App.en = function (v) { return String(v).replace(/[০-৯]/g, function (d) { return BN.indexOf(d); }); };
  App.money = function (n) {
    var num = Number(n) || 0;
    return (config.currency || '৳') + App.bn(num.toLocaleString('en-US', { maximumFractionDigits: 2 }));
  };

  App.uid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  };

  App.url = function (path) { return (config.base || '') + path; };

  App.cookie = function (name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  };

  // Storage that never throws (private mode / disabled storage).
  function safeStorage(kind) {
    return {
      get: function (k, fallback) {
        try { var v = window[kind].getItem(k); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
      },
      set: function (k, v) { try { window[kind].setItem(k, JSON.stringify(v)); } catch (e) { /* quota/private */ } },
      remove: function (k) { try { window[kind].removeItem(k); } catch (e) { /* ignore */ } }
    };
  }
  App.store = safeStorage('localStorage');
  App.session = safeStorage('sessionStorage');

  // ---------------------------------------------------------------- events
  App.on = function (name, fn) { App.bus.addEventListener(name, function (e) { fn(e.detail); }); };
  App.emit = function (name, detail) { App.bus.dispatchEvent(new CustomEvent(name, { detail: detail })); };

  /** Register a delegated action: <button data-action="name"> */
  App.action = function (name, fn) { App.actions[name] = fn; };

  /** Register a delegated listener for any event type + selector (bound once globally). */
  var delegates = Object.create(null);
  App.delegate = function (type, selector, fn) {
    if (!delegates[type]) {
      delegates[type] = [];
      document.addEventListener(type, function (e) {
        var list = delegates[type];
        for (var i = 0; i < list.length; i++) {
          var el = e.target && e.target.closest ? e.target.closest(list[i].sel) : null;
          if (el) list[i].fn(el, e);
        }
      }, type === 'focus' || type === 'blur' ? true : false);
    }
    delegates[type].push({ sel: selector, fn: fn });
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var fn = App.actions[el.getAttribute('data-action')];
    if (fn) fn(el, e);
  });

  // ---------------------------------------------------------------- http
  function HttpError(message, status, data) {
    this.message = message; this.status = status; this.data = data || {};
  }
  HttpError.prototype = Object.create(Error.prototype);
  App.HttpError = HttpError;

  App.csrfToken = function () {
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) return meta.getAttribute('content');
    return config.csrfCookie ? App.cookie(config.csrfCookie) : '';
  };

  /**
   * JSON request. Resolves with the parsed body ({success, message, data}),
   * rejects with HttpError carrying a user-safe message.
   */
  App.request = function (url, opts) {
    opts = opts || {};
    var headers = { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    var method = (opts.method || 'GET').toUpperCase();
    var body = opts.body;
    if (method !== 'GET') headers['X-CSRF-Token'] = App.csrfToken();
    if (body && !(body instanceof FormData) && typeof body !== 'string') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    Object.keys(opts.headers || {}).forEach(function (k) { headers[k] = opts.headers[k]; });
    return fetch(url, { method: method, headers: headers, body: body, signal: opts.signal, credentials: 'same-origin', keepalive: !!opts.keepalive })
      .then(function (res) {
        return res.text().then(function (text) {
          var json = null;
          try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
          if (!res.ok || !json || json.success === false) {
            var msg = (json && json.message) || (res.status === 0 ? 'ইন্টারনেট সংযোগ পরীক্ষা করুন।' : 'দুঃখিত, অনুরোধটি সম্পন্ন করা যায়নি।');
            throw new HttpError(msg, res.status, json || {});
          }
          return json;
        });
      }, function (err) {
        if (err && err.name === 'AbortError') throw err;
        throw new HttpError(navigator.onLine === false ? 'ইন্টারনেট সংযোগ নেই।' : 'নেটওয়ার্ক সমস্যা। আবার চেষ্টা করুন।', 0, {});
      });
  };
  App.get = function (url, opts) { return App.request(url, Object.assign({}, opts, { method: 'GET' })); };
  App.post = function (url, body, opts) { return App.request(url, Object.assign({}, opts, { method: 'POST', body: body })); };

  // ---------------------------------------------------------------- page modules
  /** App.page('product', { mount(root) { ...; return cleanupFn } }) */
  App.page = function (name, mod) {
    App.pages[name] = mod;
    // Script loaded after the page was rendered (first load / lazy load) → mount now.
    var main = document.getElementById('app-main');
    if (main && main.getAttribute('data-page') === name && App.currentPage !== name && App.ready) App.mountPage(name);
  };

  App.mountPage = function (name) {
    App.unmountPage();
    var mod = App.pages[name];
    var main = document.getElementById('app-main');
    App.currentPage = name;
    if (mod && typeof mod.mount === 'function' && main) {
      try { App.currentCleanup = mod.mount(main) || null; } catch (e) { if (window.console) console.error(e); }
    }
  };

  App.unmountPage = function () {
    if (typeof App.currentCleanup === 'function') {
      try { App.currentCleanup(); } catch (e) { /* ignore */ }
    }
    App.currentCleanup = null;
    App.currentPage = null;
  };

  // ---------------------------------------------------------------- assets (load once)
  var loaded = Object.create(null);
  function nonce() {
    var s = document.querySelector('script[nonce]');
    return s ? (s.nonce || s.getAttribute('nonce')) : '';
  }
  App.loadScript = function (src) {
    var key = src.split('?')[0];
    if (loaded[key]) return loaded[key];
    var existing = App.$$('script[src]').filter(function (s) { return s.getAttribute('src').split('?')[0] === key; })[0];
    if (existing) return (loaded[key] = Promise.resolve());
    loaded[key] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      var n = nonce(); if (n) s.setAttribute('nonce', n);
      s.onload = resolve;
      s.onerror = function () { delete loaded[key]; reject(new Error('script')); };
      document.body.appendChild(s);
    });
    return loaded[key];
  };
  App.loadStyle = function (href) {
    var key = href.split('?')[0];
    if (loaded[key]) return loaded[key];
    var existing = App.$$('link[rel="stylesheet"]').filter(function (l) { return (l.getAttribute('href') || '').split('?')[0] === key; })[0];
    if (existing) return (loaded[key] = Promise.resolve());
    loaded[key] = new Promise(function (resolve) {
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href;
      l.onload = resolve; l.onerror = resolve; // never block navigation on a stylesheet
      document.head.appendChild(l);
    });
    return loaded[key];
  };

  // ---------------------------------------------------------------- progress bar
  var progressEl = document.getElementById('progress');
  var progressTimer;
  App.progress = {
    start: function () {
      if (!progressEl) return;
      clearTimeout(progressTimer);
      progressEl.classList.remove('is-done', 'is-active');
      void progressEl.offsetWidth;
      progressEl.classList.add('is-active');
    },
    done: function () {
      if (!progressEl) return;
      if (!progressEl.classList.contains('is-active')) return;
      progressEl.classList.add('is-done');
      progressTimer = setTimeout(function () { progressEl.classList.remove('is-active', 'is-done'); }, 450);
    }
  };

  // ---------------------------------------------------------------- toasts
  App.toast = function (message, type, opts) {
    var stack = document.getElementById('toasts');
    if (!stack) return;
    opts = opts || {};
    var icons = { success: 'fa-solid fa-circle-check', error: 'fa-solid fa-circle-exclamation', info: 'fa-solid fa-circle-info' };
    var t = document.createElement('div');
    t.className = 'toast toast-' + (type || 'success');
    t.setAttribute('role', type === 'error' ? 'alert' : 'status');
    t.innerHTML = '<i class="' + icons[type || 'success'] + '" aria-hidden="true"></i><span></span>';
    t.querySelector('span').textContent = message;
    if (opts.actionText) {
      var a = document.createElement(opts.href ? 'a' : 'button');
      a.className = 'toast-action';
      a.textContent = opts.actionText;
      if (opts.href) a.href = opts.href;
      a.addEventListener('click', function () { if (opts.onAction) opts.onAction(); remove(); });
      t.appendChild(a);
    }
    stack.appendChild(t);
    while (stack.children.length > 3) stack.removeChild(stack.firstChild);
    var timer = setTimeout(remove, opts.duration || 3200);
    function remove() {
      clearTimeout(timer);
      t.classList.add('is-leaving');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 220);
    }
    return remove;
  };

  // ---------------------------------------------------------------- modal / confirm
  var lastFocus = null;
  App.modal = function (opts) {
    opts = opts || {};
    var root = document.getElementById('modal-root') || document.body;
    var wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML =
      '<div class="modal' + (opts.size === 'lg' ? ' modal-lg' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title-' + (App._m = (App._m || 0) + 1) + '">' +
      '<div class="modal-head">' + (opts.icon ? '<span class="modal-icon' + (opts.danger ? ' is-danger' : '') + '"><i class="' + App.escape(opts.icon) + '" aria-hidden="true"></i></span>' : '') +
      '<h2 class="modal-title" id="modal-title-' + App._m + '"></h2>' +
      '<button type="button" class="icon-btn" data-modal-close aria-label="বন্ধ করুন"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>' +
      '<div class="modal-body"></div>' +
      (opts.confirmText || opts.cancelText ? '<div class="modal-actions">' +
        (opts.cancelText ? '<button type="button" class="btn btn-ghost" data-modal-close>' + App.escape(opts.cancelText) + '</button>' : '') +
        (opts.confirmText ? '<button type="button" class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-modal-confirm>' + App.escape(opts.confirmText) + '</button>' : '') +
        '</div>' : '') +
      '</div>';
    wrap.querySelector('.modal-title').textContent = opts.title || '';
    var body = wrap.querySelector('.modal-body');
    if (opts.html != null) body.innerHTML = opts.html; else body.textContent = opts.text || '';
    root.appendChild(wrap);
    document.body.classList.add('modal-open');
    lastFocus = document.activeElement;
    requestAnimationFrame(function () { wrap.classList.add('is-open'); });
    var dialog = wrap.querySelector('.modal');
    var focusable = function () { return App.$$('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', dialog); };
    setTimeout(function () { var f = dialog.querySelector('[autofocus]') || focusable()[0]; if (f) f.focus(); }, 60);

    var api = {
      el: dialog, body: body,
      close: function (result) {
        document.removeEventListener('keydown', onKey);
        wrap.classList.remove('is-open');
        setTimeout(function () {
          if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
          if (!document.querySelector('.modal-backdrop')) document.body.classList.remove('modal-open');
          if (lastFocus && lastFocus.focus) lastFocus.focus();
        }, 260);
        if (opts.onClose) opts.onClose(result);
      }
    };
    function onKey(e) {
      if (e.key === 'Escape') api.close(false);
      if (e.key === 'Tab') {
        var els = focusable(); if (!els.length) return;
        var first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap || e.target.closest('[data-modal-close]')) api.close(false);
      var confirmBtn = e.target.closest('[data-modal-confirm]');
      if (confirmBtn) {
        if (opts.onConfirm) {
          var r = opts.onConfirm(api, confirmBtn);
          if (r && typeof r.then === 'function') {
            App.loading(confirmBtn, true);
            r.then(function (keepOpen) { App.loading(confirmBtn, false); if (keepOpen !== true) api.close(true); },
              function () { App.loading(confirmBtn, false); });
          } else if (r !== false) api.close(true);
        } else api.close(true);
      }
    });
    return api;
  };

  App.confirm = function (opts) {
    return new Promise(function (resolve) {
      App.modal({
        title: opts.title || 'নিশ্চিত করুন', text: opts.text, html: opts.html, icon: opts.icon || (opts.danger ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-question'),
        danger: opts.danger, confirmText: opts.confirmText || 'হ্যাঁ', cancelText: opts.cancelText || 'বাতিল',
        onClose: function (result) { resolve(result === true); }
      });
    });
  };

  App.loading = function (btn, on, label) {
    if (!btn) return;
    if (on) {
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      if (label) {
        btn.dataset.originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="btn-label-loading"></span>';
        btn.querySelector('.btn-label-loading').appendChild(document.createTextNode(label));
      } else btn.classList.add('is-loading');
    } else {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.classList.remove('is-loading');
      if (btn.dataset.originalHtml) { btn.innerHTML = btn.dataset.originalHtml; delete btn.dataset.originalHtml; }
    }
  };

  // ---------------------------------------------------------------- theme
  App.theme = {
    get: function () { return document.documentElement.getAttribute('data-theme') || 'light'; },
    set: function (t) {
      document.documentElement.setAttribute('data-theme', t);
      App.store.set('ns-theme', t);
      try { localStorage.setItem('ns-theme', t); } catch (e) { /* ignore */ }
      App.emit('theme', t);
    },
    toggle: function () { App.theme.set(App.theme.get() === 'dark' ? 'light' : 'dark'); }
  };
  App.action('theme-toggle', function () { if (config.darkMode !== false) App.theme.toggle(); });

  // Copy-to-clipboard
  App.action('copy', function (el) {
    var text = el.getAttribute('data-copy') || '';
    var done = function () { App.toast('কপি হয়েছে: ' + text.slice(0, 40), 'success'); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { App.toast('কপি করা যায়নি', 'error'); }
      document.body.removeChild(ta);
    }
  });
  App.action('reload', function () { location.reload(); });

  // Activate non-blocking stylesheets (fonts, icons) without inline handlers (CSP-safe).
  App.$$('link[data-async-css]').forEach(function (l) { l.media = 'all'; });

  document.addEventListener('DOMContentLoaded', function () {
    App.ready = true;
    var main = document.getElementById('app-main');
    var name = main ? main.getAttribute('data-page') : '';
    if (name && App.pages[name]) App.mountPage(name);
    App.emit('ready');
  });
})();
