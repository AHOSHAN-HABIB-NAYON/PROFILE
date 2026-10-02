/* router.js — Fetch + History API navigation. The shell (header/footer/nav) loads once; only #app changes.
   Each page gets an AbortController: every listener registered with its signal is removed on navigation (no leaks/duplicates). */
(function () {
  'use strict';
  const App = window.App;
  const app = document.getElementById('app');
  if (!app) return;
  const scope = app.dataset.scope || '/';
  const pages = (App.pages = App.pages || {});
  const scroll = new Map();
  let controller = null;
  let navId = 0;
  let currentKey = location.pathname + location.search;
  let depth = (history.state && history.state.depth) || 0;

  const keyOf = (url) => url.pathname + url.search;
  const CACHEABLE = scope === '/' ? /^\/($|products|product\/|category\/|categories|contact)/ : null;

  function inScope(url) {
    if (url.origin !== location.origin) return false;
    if (/\.(xml|txt|json|js|css|png|jpe?g|webp|gif|svg|pdf|zip)$/i.test(url.pathname)) return false;
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/api/')) return false;
    if (scope === '/admin') {
      return url.pathname.startsWith('/admin') && !/^\/admin\/(login|logout|export)/.test(url.pathname);
    }
    return !url.pathname.startsWith('/admin') && url.pathname !== '/install';
  }

  function linkFrom(e) {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
    if ((a.target && a.target !== '_self') || a.hasAttribute('download') || a.hasAttribute('data-no-spa')) return null;
    const href = a.getAttribute('href');
    if (!href || href[0] === '#' || /^(mailto|tel|javascript):/i.test(href)) return null;
    const url = new URL(a.href, location.href);
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return null;
    return inScope(url) ? { a, url } : null;
  }

  function fetchPage(key, prefetch) {
    const cached = App.cache.get(key);
    if (cached) return Promise.resolve({ data: cached, fromCache: true });
    return App.cache.once(key, async () => {
      const headers = { 'X-SPA': '1', Accept: 'application/json' };
      if (prefetch) headers['X-Prefetch'] = '1';
      const res = await fetch(key, { headers, credentials: 'same-origin' });
      const type = res.headers.get('content-type') || '';
      if (!type.includes('application/json')) {
        // Not an SPA response (e.g. redirect to HTML) → do a normal navigation.
        return { data: null, fallback: true, status: res.status };
      }
      const data = await res.json();
      data.status = res.status;
      if (data.csrf) App.ajax.setCsrf(data.csrf);
      if (data.cache && res.ok && data.html) App.cache.set(key, data, 180000);
      return { data, fromCache: false };
    });
  }

  function setMeta(sel, attr, value) {
    let el = document.head.querySelector(sel);
    if (!value) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement(sel.startsWith('link') ? 'link' : 'meta');
      const m = sel.match(/\[(\w+(?::\w+)?)="([^"]+)"\]/);
      if (m) el.setAttribute(m[1], m[2]);
      document.head.appendChild(el);
    }
    el.setAttribute(attr, value);
  }

  function updateHead(d) {
    document.title = d.title || document.title;
    const m = d.meta || {};
    if (scope !== '/') return;
    setMeta('meta[name="description"]', 'content', m.description);
    setMeta('meta[name="keywords"]', 'content', m.keywords);
    setMeta('meta[name="robots"]', 'content', m.robots);
    setMeta('link[rel="canonical"]', 'href', m.canonical);
    setMeta('meta[property="og:title"]', 'content', d.title);
    setMeta('meta[property="og:description"]', 'content', m.description);
    setMeta('meta[property="og:url"]', 'content', m.canonical);
    setMeta('meta[property="og:type"]', 'content', m.og_type);
    setMeta('meta[property="og:image"]', 'content', m.og_image);
    document.head.querySelectorAll('script[type="application/ld+json"]').forEach((s) => s.remove());
    [].concat(m.jsonld || []).forEach((ld) => {
      if (!ld) return;
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.textContent = JSON.stringify(ld);
      document.head.appendChild(s);
    });
  }

  function showSkeleton() {
    const cards = '<div class="sk sk-card"></div>'.repeat(4);
    app.innerHTML = '<div class="page container skeleton-page" aria-busy="true"><div class="sk sk-title"></div><div class="sk sk-banner"></div><div class="pgrid">' + cards + '</div></div>';
    app.classList.remove('leaving');
  }

  function initPage(fromCache) {
    if (controller) controller.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const root = app.firstElementChild || app;
    const page = app.dataset.page;
    document.body.dataset.page = page;
    const t = document.querySelector('[data-appbar-title]');
    if (t) t.textContent = (document.title.split(' | ')[0] || '').trim();
    App.lazy && App.lazy.observe(app);
    App.ui.countdowns(app, signal);
    if (App.nav) App.nav.setActive(app.dataset.navKey || '');
    const mod = pages[page];
    if (mod && mod.init) {
      try { mod.init(root, signal, { fromCache }); } catch (e) { console.error(e); }
    }
    document.dispatchEvent(new CustomEvent('app:page', { detail: { page, root, signal, fromCache } }));
  }

  async function navigate(href, opts) {
    opts = opts || {};
    const url = new URL(href, location.href);
    const key = keyOf(url);
    const id = ++navId;
    scroll.set(currentKey, window.scrollY);
    if (!opts.pop) history.replaceState(Object.assign({}, history.state, { key: currentKey, y: window.scrollY }), '');

    App.ui.progress.start();
    App.ui.closeSheet();
    if (opts.navKey && App.nav) App.nav.setActive(opts.navKey);
    app.classList.add('leaving');
    const skel = setTimeout(() => { if (id === navId) showSkeleton(); }, 260);

    let result;
    try {
      result = await fetchPage(key, false);
    } catch (e) {
      result = { data: null, error: true };
    }
    clearTimeout(skel);
    if (id !== navId) return; // a newer navigation took over

    if (result.fallback) { window.location.href = url.href; return; }
    const d = result.data;
    if (!d || (!d.html && !d.redirect)) {
      App.ui.progress.done();
      app.classList.remove('leaving');
      if (result.error && !navigator.onLine) { window.location.href = url.href; return; }
      App.ui.toast((d && d.message) || App.ajax.GENERIC, 'error');
      return;
    }
    if (d.redirect && !d.html) { navigate(d.redirect, { replace: true }); return; }

    app.innerHTML = d.html;
    app.dataset.page = d.page || 'generic';
    app.dataset.navKey = (d.meta && d.meta.nav) || '';
    updateHead(d);
    if (opts.pop) {
      /* history entry already exists */
    } else if (opts.replace) {
      history.replaceState({ key }, '', url.href);
    } else {
      history.pushState({ key, depth: depth + 1 }, '', url.href);
      depth++;
    }
    currentKey = key;

    const y = opts.pop ? (history.state && history.state.y) || scroll.get(key) || 0 : 0;
    if (url.hash) {
      const t = document.getElementById(url.hash.slice(1));
      if (t) t.scrollIntoView(); else window.scrollTo(0, 0);
    } else {
      window.scrollTo({ top: y, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
    }

    app.classList.remove('leaving');
    app.classList.toggle('back', !!opts.pop);
    app.classList.add('entering');
    setTimeout(() => app.classList.remove('entering', 'back'), 280);
    initPage(result.fromCache);
    App.ui.progress.done();
    app.focus({ preventScroll: true });
    if (App.track) App.track.spaPageView(d, result.fromCache);
  }

  function prefetch(href) {
    if (!CACHEABLE) return;
    const url = new URL(href, location.href);
    if (!inScope(url) || !CACHEABLE.test(url.pathname) || url.searchParams.has('q')) return;
    const c = navigator.connection;
    if (c && (c.saveData || /2g/.test(c.effectiveType || ''))) return;
    const key = keyOf(url);
    if (key === currentKey || App.cache.get(key)) return;
    fetchPage(key, true).catch(() => {});
  }

  function start() {
    history.scrollRestoration = 'manual';
    history.replaceState({ key: currentKey, y: window.scrollY, depth }, '');

    document.addEventListener('click', (e) => {
      const l = linkFrom(e);
      if (!l) return;
      e.preventDefault();
      if (l.a.classList.contains('disabled')) return;
      navigate(l.url.href, { navKey: l.a.dataset.nav });
    });

    document.addEventListener('submit', (e) => {
      const f = e.target;
      if (e.defaultPrevented || (f.method || 'get').toLowerCase() !== 'get' || f.hasAttribute('data-no-spa')) return;
      const url = new URL(f.action || location.href, location.href);
      if (!inScope(url)) return;
      e.preventDefault();
      const params = new URLSearchParams();
      new FormData(f).forEach((v, k) => { if (String(v).trim() !== '') params.append(k, v); });
      url.search = params.toString();
      navigate(url.href);
    });

    window.addEventListener('popstate', (e) => { depth = (e.state && e.state.depth) || 0; navigate(location.href, { pop: true }); });
    // App-bar back button: go back inside the app, otherwise to home.
    document.addEventListener('click', (e) => {
      if (!e.target.closest('[data-back]')) return;
      if (depth > 0) history.back(); else navigate(scope === '/admin' ? '/admin' : '/');
    });
    initPage(false);
  }

  App.router = { start, navigate, prefetch, refresh: () => { App.cache.delete(currentKey); navigate(location.href, { replace: true }); } };
})();
