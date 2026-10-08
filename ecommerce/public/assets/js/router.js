/*!
 * router.js — app-like navigation without full page reloads.
 *
 *  AppRouter         intercepts same-origin links & GET forms, drives History API
 *  PageCache         in-memory LRU of rendered pages (TTL, version-aware)
 *  RequestManager    fetch with de-duplication + AbortController
 *  TransitionManager fade/slide of #app-main only (header/sidebar/nav stay mounted)
 *  PrefetchManager   hover/touch intent + idle prefetch of visible links (respects Save-Data)
 *
 * The server returns the same template as JSON when it sees `X-SPA: 1`, so every
 * URL also works as a normal server-rendered page (SEO, no-JS, direct visits).
 * Any failure falls back to a normal browser navigation — users are never stuck.
 */
(function (App) {
  'use strict';
  if (!App || !window.fetch || !window.history || !history.pushState) return;

  var config = App.config;
  var base = config.base || '';
  var isAdmin = config.scope === 'admin';
  var scopePrefix = base + (isAdmin ? '/admin' : '');
  var main = document.getElementById('app-main');
  if (!main) return;

  // ------------------------------------------------------------ PageCache
  var PageCache = {
    map: new Map(),
    ttl: isAdmin ? 15000 : 180000,
    max: 40,
    key: function (url) { var u = new URL(url, location.href); return u.pathname + u.search; },
    get: function (url) {
      var k = this.key(url), hit = this.map.get(k);
      if (!hit) return null;
      if (Date.now() - hit.t > this.ttl) { this.map.delete(k); return null; }
      this.map.delete(k); this.map.set(k, hit); // LRU bump
      return hit.data;
    },
    set: function (url, data) {
      if (!data || data.cache === false) return;
      var k = this.key(url);
      this.map.set(k, { data: data, t: Date.now() });
      while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    },
    clear: function () { this.map.clear(); },
    checkVersion: function (v) {
      if (typeof v === 'number' && v !== config.version) { this.clear(); config.version = v; }
    }
  };

  // ------------------------------------------------------------ RequestManager
  var RequestManager = {
    inflight: new Map(),
    controller: null,
    fetchPage: function (url, opts) {
      opts = opts || {};
      var k = PageCache.key(url);
      if (this.inflight.has(k)) return this.inflight.get(k);
      var ctrl = new AbortController();
      if (!opts.prefetch) {
        if (this.controller) this.controller.abort();
        this.controller = ctrl;
      }
      var p = fetch(url, {
        headers: opts.prefetch
          ? { 'X-SPA': '1', 'X-Prefetch': '1', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
          : { 'X-SPA': '1', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin', signal: ctrl.signal, priority: opts.prefetch ? 'low' : 'high'
      }).then(function (res) {
        var finalUrl = res.url || url;
        var type = res.headers.get('Content-Type') || '';
        if (type.indexOf('application/json') === -1) throw new Error('not-json');
        return res.json().then(function (json) {
          if (json && json.redirect) return { redirect: json.redirect };
          if (!json || !json.data || typeof json.data.html !== 'string') throw new Error('bad-payload');
          json.data.url = finalUrl;
          json.data.status = res.status;
          return json.data;
        });
      });
      var self = this;
      var cleanup = function () { self.inflight.delete(k); };
      p.then(cleanup, cleanup);
      this.inflight.set(k, p);
      return p;
    }
  };

  // ------------------------------------------------------------ TransitionManager
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TransitionManager = {
    leave: function () {
      if (reduceMotion) return Promise.resolve();
      main.classList.remove('is-entering');
      main.classList.add('is-leaving');
      return new Promise(function (r) { setTimeout(r, 110); });
    },
    enter: function () {
      main.classList.remove('is-leaving');
      if (reduceMotion) return;
      main.classList.remove('is-entering');
      void main.offsetWidth;
      main.classList.add('is-entering');
      setTimeout(function () { main.classList.remove('is-entering'); }, 320);
    },
    cancel: function () { main.classList.remove('is-leaving', 'is-entering'); }
  };

  // ------------------------------------------------------------ Head (SEO) updates
  function setMeta(selector, attr, value) {
    var el = document.head.querySelector(selector);
    if (el && value != null) el.setAttribute(attr, value);
  }
  function updateHead(d) {
    if (d.title) document.title = d.title;
    var m = d.meta || {};
    setMeta('meta[name="description"]', 'content', m.description);
    setMeta('meta[name="robots"]', 'content', m.robots);
    setMeta('link[rel="canonical"]', 'href', m.canonical);
    setMeta('meta[property="og:title"]', 'content', d.title);
    setMeta('meta[property="og:description"]', 'content', m.description);
    setMeta('meta[property="og:url"]', 'content', m.canonical);
    setMeta('meta[property="og:image"]', 'content', m.image);
    setMeta('meta[property="og:type"]', 'content', m.type);
    setMeta('meta[name="twitter:title"]', 'content', d.title);
    setMeta('meta[name="twitter:description"]', 'content', m.description);
    setMeta('meta[name="twitter:image"]', 'content', m.image);
    var ld = document.getElementById('jsonld');
    if (ld) ld.textContent = JSON.stringify(d.jsonld || []);
  }

  // ------------------------------------------------------------ Active navigation
  function guessNav(path) {
    if (isAdmin) return null;
    var p = path.replace(base, '') || '/';
    if (p === '/') return 'home';
    if (/^\/(categories|category|products|product|search)/.test(p)) return 'categories';
    if (/^\/(cart|checkout)/.test(p)) return 'cart';
    if (/^\/(orders|order)/.test(p)) return 'orders';
    if (/^\/(profile|page)/.test(p)) return 'profile';
    return null;
  }
  App.setActiveNav = function (key) {
    App.$$('[data-nav]').forEach(function (el) {
      var on = key && el.getAttribute('data-nav') === key;
      el.classList.toggle('is-active', !!on);
      if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
    App.emit('nav', key);
  };

  // ------------------------------------------------------------ Router core
  var navId = 0;
  function sameScope(url) {
    if (url.origin !== location.origin) return false;
    var p = url.pathname;
    if (isAdmin) return p === scopePrefix || p.indexOf(scopePrefix + '/') === 0;
    return p.indexOf(base + '/admin') !== 0 && p.indexOf(base + '/api/') !== 0;
  }
  function eligible(a) {
    if (!a || !a.href || a.hasAttribute('download') || a.hasAttribute('data-no-spa')) return false;
    if (a.target && a.target !== '_self') return false;
    if (a.getAttribute('href').charAt(0) === '#') return false;
    var url = new URL(a.href, location.href);
    if (!/^https?:$/.test(url.protocol) || !sameScope(url)) return false;
    if (/\.(xml|txt|json|pdf|zip|gz|png|jpe?g|webp|svg|csv)$/i.test(url.pathname)) return false;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return false;
    return url;
  }

  function saveScroll() {
    var st = history.state || {};
    st.scroll = window.scrollY;
    st.spa = true;
    try { history.replaceState(st, '', location.href); } catch (e) { /* ignore */ }
  }

  function hardNavigate(url) { window.location.assign(url); }

  /**
   * Navigate to `url`. opts: { push (default true), replace, scroll, nav, force }
   */
  function navigate(url, opts) {
    opts = opts || {};
    var target = new URL(url, location.href);
    var href = target.pathname + target.search + target.hash;
    var id = ++navId;
    var push = opts.push !== false;

    if (push) {
      saveScroll();
      var state = { spa: true, scroll: 0 };
      if (opts.replace) history.replaceState(state, '', href); else history.pushState(state, '', href);
    }
    App.setActiveNav(opts.nav || guessNav(target.pathname));
    App.emit('route:start', { url: href });

    var cached = opts.force ? null : PageCache.get(href);
    var slowTimer = setTimeout(App.progress.start, cached ? 9999 : 80);
    var leaving = TransitionManager.leave();
    var dataPromise = cached ? Promise.resolve(cached) : RequestManager.fetchPage(href);

    return Promise.all([dataPromise, leaving]).then(function (results) {
      if (id !== navId) return; // superseded by a newer navigation
      var data = results[0];
      if (data.redirect) {
        clearTimeout(slowTimer);
        TransitionManager.cancel();
        var r = new URL(data.redirect, location.href);
        if (!sameScope(r)) return hardNavigate(data.redirect);
        return navigate(data.redirect, { replace: true });
      }
      PageCache.checkVersion(data.version);
      var styles = (data.styles || []).map(App.loadStyle);
      var styleWait = Promise.race([Promise.all(styles), new Promise(function (r) { setTimeout(r, 1200); })]);
      return styleWait.then(function () {
        if (id !== navId) return;
        render(data, { fromCache: !!cached, scroll: opts.scroll !== undefined ? opts.scroll : (target.hash ? null : 0) });
        if (!cached && data.status < 400) PageCache.set(href, data);
        clearTimeout(slowTimer);
        App.progress.done();
      });
    }).catch(function (err) {
      clearTimeout(slowTimer);
      if (err && err.name === 'AbortError') return;
      if (id !== navId) return;
      // Fallback: real navigation (server renders full page / SW offline page).
      hardNavigate(href);
    });
  }

  function render(data, info) {
    App.unmountPage();
    main.innerHTML = data.html;
    main.setAttribute('data-page', data.page || '');
    updateHead(data);
    if (data.nav !== undefined) App.setActiveNav(data.nav || null);
    TransitionManager.enter();

    if (info.scroll === null) {
      var el = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (el) el.scrollIntoView();
    } else {
      window.scrollTo(0, info.scroll || 0);
    }
    try { main.focus({ preventScroll: true }); } catch (e) { main.focus(); }

    var name = data.page;
    if (name && App.pages[name]) App.mountPage(name);
    (data.scripts || []).forEach(function (src) {
      App.loadScript(src).catch(function () { /* page still works server-side */ });
    });
    App.emit('route:change', { data: data, fromCache: info.fromCache, url: location.href });
    PrefetchManager.observe();
  }

  // ------------------------------------------------------------ PrefetchManager
  var conn = navigator.connection || {};
  var canPrefetch = !conn.saveData && !/(^|-)2g$/.test(conn.effectiveType || '');
  var PrefetchManager = {
    hoverTimer: null,
    observer: null,
    prefetch: function (href) {
      if (!canPrefetch) return;
      var url = new URL(href, location.href);
      var key = url.pathname + url.search;
      if (PageCache.get(key) || RequestManager.inflight.has(key)) return;
      RequestManager.fetchPage(key, { prefetch: true }).then(function (data) {
        if (data && !data.redirect && data.status < 400) PageCache.set(key, data);
      }, function () { /* ignore */ });
    },
    observe: function () {
      if (!canPrefetch || isAdmin || !('IntersectionObserver' in window)) return;
      if (this.observer) this.observer.disconnect();
      var budget = 4, self = this;
      this.observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting || budget <= 0) return;
          self.observer.unobserve(en.target);
          budget--;
          var href = en.target.href;
          (window.requestIdleCallback || setTimeout)(function () { self.prefetch(href); }, { timeout: 2500 });
        });
      }, { rootMargin: '0px' });
      // Only idle-prefetch a few above-the-fold product links, after the page settles.
      setTimeout(function () {
        App.$$('a[data-prefetch]', main).slice(0, 8).forEach(function (a) { if (eligible(a)) self.observer.observe(a); });
      }, 1500);
    }
  };

  // ------------------------------------------------------------ Listeners (bound once)
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a');
    var url = eligible(a);
    if (!url) return;
    e.preventDefault();
    if (document.body.classList.contains('drawer-open')) App.emit('drawer:close');
    var href = url.pathname + url.search + url.hash;
    if (href === location.pathname + location.search && !url.hash) {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      return navigate(href, { replace: true, force: true });
    }
    navigate(href, { nav: a.getAttribute('data-nav') || null });
  });

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (e.defaultPrevented || !form || (form.method || 'get').toLowerCase() !== 'get' || form.hasAttribute('data-no-spa')) return;
    var action = new URL(form.getAttribute('action') || location.href, location.href);
    if (!sameScope(action)) return;
    e.preventDefault();
    var params = new URLSearchParams();
    new FormData(form).forEach(function (v, k) { if (String(v).trim() !== '') params.append(k, v); });
    var qs = params.toString();
    navigate(action.pathname + (qs ? '?' + qs : ''));
    var input = form.querySelector('input[type="search"]');
    if (input) input.blur();
  });

  window.addEventListener('popstate', function (e) {
    var st = e.state || {};
    navigate(location.pathname + location.search + location.hash, { push: false, scroll: st.scroll || 0 });
  });

  function intent(e) {
    var a = e.target.closest && e.target.closest('a');
    if (!eligible(a)) return;
    clearTimeout(PrefetchManager.hoverTimer);
    var delay = e.type === 'touchstart' ? 0 : 65;
    PrefetchManager.hoverTimer = setTimeout(function () { PrefetchManager.prefetch(a.href); }, delay);
  }
  document.addEventListener('mouseover', intent, { passive: true });
  document.addEventListener('touchstart', intent, { passive: true });
  document.addEventListener('focusin', intent);
  document.addEventListener('mouseout', function () { clearTimeout(PrefetchManager.hoverTimer); }, { passive: true });

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  try { history.replaceState(Object.assign({}, history.state, { spa: true, scroll: window.scrollY }), '', location.href); } catch (e) { /* ignore */ }

  // Seed the cache with the initial page so "back" to it is instant.
  App.on('ready', function () {
    var pd = App.$('#page-data');
    if (pd) {
      try {
        var d = JSON.parse(pd.textContent);
        if (d.cache) {
          PageCache.set(location.pathname + location.search, {
            html: main.innerHTML, title: document.title, page: d.page, nav: d.nav, styles: d.styles, scripts: d.scripts,
            meta: {
              description: (App.$('meta[name="description"]') || {}).content, canonical: (App.$('link[rel="canonical"]') || {}).href,
              image: (App.$('meta[property="og:image"]') || {}).content, type: (App.$('meta[property="og:type"]') || {}).content,
              robots: (App.$('meta[name="robots"]') || {}).content
            },
            jsonld: JSON.parse((App.$('#jsonld') || { textContent: '[]' }).textContent || '[]'),
            track: d.track, cache: true, version: config.version, status: 200
          });
        }
      } catch (e) { /* ignore */ }
    }
    PrefetchManager.observe();
  });

  App.router = { navigate: navigate, prefetch: function (u) { PrefetchManager.prefetch(u); }, cache: PageCache, refresh: function () { return navigate(location.pathname + location.search, { replace: true, force: true, scroll: window.scrollY }); } };
})(window.App);
