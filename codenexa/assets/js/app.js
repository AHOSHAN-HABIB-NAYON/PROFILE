/*!
 * CodeNexa front-end — zero dependencies.
 * - AJAX (pjax-style) navigation with hover/touch prefetch + in-memory cache
 * - View Transitions API when available, CSS fallback otherwise
 * - Scroll reveal, counters, filters, pricing toggle, contact form
 * - Light (default) / dark theme, accent colours, language switch
 */
(function () {
  'use strict';

  var doc = document, root = doc.documentElement;
  var app = doc.getElementById('app');
  var base = (doc.querySelector('meta[name="base"]') || {}).content || '/';
  var csrf = (doc.querySelector('meta[name="csrf"]') || {}).content || '';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cache = new Map();          // url -> Promise<{title, html, page}>
  var CACHE_MAX = 30;
  var navigating = 0;

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function store(k, v) { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  /* ------------------------------------------------------------ theme */
  function syncThemeUI() {
    var dark = root.getAttribute('data-theme') === 'dark';
    $$('.switch[data-theme-toggle]').forEach(function (s) { s.setAttribute('aria-checked', String(dark)); });
    var meta = $('#themeColor');
    if (meta) meta.content = dark ? '#060a1c' : '#ffffff';
    var accent = root.getAttribute('data-accent') || 'indigo';
    $$('.swatches button').forEach(function (b) { b.classList.toggle('active', b.dataset.accent === accent); });
  }
  function toggleTheme() {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    var apply = function () { root.setAttribute('data-theme', next); syncThemeUI(); };
    if (doc.startViewTransition && !reduceMotion) doc.startViewTransition(apply); else apply();
    store('theme', next);
  }

  /* ---------------------------------------------------------- progress */
  var bar = $('#progress');
  function progressStart() { bar.className = 'progress'; void bar.offsetWidth; bar.className = 'progress run'; }
  function progressDone() { bar.className = 'progress done'; }

  /* ------------------------------------------------------------- toast */
  function toast(msg, ok) {
    var box = $('#toasts'); if (!box) return;
    var el = doc.createElement('div');
    el.className = 'toast ' + (ok ? 'ok' : 'err');
    el.innerHTML = '<i class="fa-solid ' + (ok ? 'fa-circle-check' : 'fa-circle-exclamation') + '"></i><span></span>';
    el.lastChild.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 320); }, 3800);
  }

  /* -------------------------------------------------------- navigation */
  function isLocal(a) {
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return false;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^(mailto|tel|javascript):/i.test(href)) return false;
    var u = new URL(a.href, location.href);
    if (u.origin !== location.origin) return false;
    var path = u.pathname;
    if (path.indexOf(base) !== 0) return false;
    var rest = path.slice(base.length);
    return !/^(admin|install|api|assets|data)(\/|$)/.test(rest) && !/\.[a-z0-9]{2,5}$/i.test(rest);
  }
  function keyOf(url) { var u = new URL(url, location.href); u.hash = ''; return u.href; }

  function fetchPage(url) {
    var key = keyOf(url);
    if (cache.has(key)) return cache.get(key);
    var p = fetch(key, { headers: { 'X-Requested-With': 'fetch', 'Accept': 'application/json' }, credentials: 'same-origin' })
      .then(function (r) {
        var ct = r.headers.get('content-type') || '';
        if (ct.indexOf('application/json') === -1) throw new Error('not-json');
        return r.json();
      });
    p.catch(function () { cache.delete(key); });
    cache.set(key, p);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return p;
  }

  function prefetch(a) {
    if (!isLocal(a)) return;
    var c = navigator.connection;
    if (c && (c.saveData || /2g/.test(c.effectiveType || ''))) return;
    fetchPage(a.href);
  }

  function setActive(page) {
    var key = page === 'service' ? 'services' : page;
    $$('[data-nav]').forEach(function (a) { a.classList.toggle('active', a.dataset.nav === key); });
  }

  function swap(data, url, push, hash) {
    var render = function () {
      app.innerHTML = data.html;
      app.dataset.page = data.page;
      doc.title = data.title;
      setActive(data.page);
      if (push) history.pushState({ pjax: true }, '', url);
      var target = hash && doc.getElementById(hash.slice(1));
      if (target) target.scrollIntoView(); else if (push) window.scrollTo(0, 0);
      initPage(app);
    };
    if (doc.startViewTransition && !reduceMotion) {
      doc.startViewTransition(render);
    } else if (reduceMotion) {
      render();
    } else {
      app.classList.add('leaving');
      setTimeout(function () {
        render();
        app.classList.remove('leaving');
        app.classList.add('entering');
        setTimeout(function () { app.classList.remove('entering'); }, 450);
      }, 140);
    }
  }

  function navigate(url, push) {
    var id = ++navigating;
    var u = new URL(url, location.href);
    var samePage = keyOf(u.href) === keyOf(location.href);
    if (samePage && u.hash && push) {
      var el = doc.getElementById(u.hash.slice(1));
      if (el) { el.scrollIntoView({ behavior: 'smooth' }); history.pushState({ pjax: true }, '', u.href); return; }
    }
    closeDrawer();
    progressStart();
    fetchPage(u.href).then(function (data) {
      if (id !== navigating) return;
      progressDone();
      swap(data, u.href, push, u.hash);
    }).catch(function () {
      if (id !== navigating) return;
      if (!navigator.onLine) { progressDone(); toast(doc.body.dataset.offline || 'You appear to be offline.', false); return; }
      location.href = u.href; // graceful fallback to full load
    });
  }

  doc.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest('a');
    if (!a || !isLocal(a)) return;
    e.preventDefault();
    navigate(a.href, true);
  });

  // Prefetch on intent: hover (desktop) or touchstart (mobile) — makes clicks feel instant.
  var hoverTimer;
  doc.addEventListener('mouseover', function (e) {
    var a = e.target.closest && e.target.closest('a');
    if (!a) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(function () { prefetch(a); }, 65);
  }, { passive: true });
  doc.addEventListener('touchstart', function (e) {
    var a = e.target.closest && e.target.closest('a');
    if (a) prefetch(a);
  }, { passive: true });

  window.addEventListener('popstate', function () { navigate(location.href, false); });
  history.replaceState({ pjax: true }, '', location.href);
  if ('scrollRestoration' in history) history.scrollRestoration = 'auto';

  // Warm the cache for the main nav during idle time.
  (window.requestIdleCallback || function (cb) { setTimeout(cb, 1200); })(function () {
    $$('.bottom-nav a, .main-nav a').forEach(prefetch);
  });

  /* ------------------------------------------------------------ header */
  var header = $('#header'), ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { header.classList.toggle('scrolled', window.scrollY > 8); ticking = false; });
  }, { passive: true });

  /* ------------------------------------------------------------ drawer */
  var drawer = $('#drawer');
  function openDrawer() { drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); }
  function closeDrawer() { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }

  doc.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('[data-drawer-open]')) return openDrawer();
    if (t.closest('[data-drawer-close]') || t === drawer) return closeDrawer();
    if (t.closest('[data-theme-toggle]')) return toggleTheme();

    var acc = t.closest('[data-accent]');
    if (acc && acc.tagName === 'BUTTON') { root.setAttribute('data-accent', acc.dataset.accent); store('accent', acc.dataset.accent); syncThemeUI(); return; }

    var lang = t.closest('[data-lang]');
    if (lang) {
      doc.cookie = 'lang=' + lang.dataset.lang + ';path=/;max-age=31536000;samesite=lax';
      cache.clear();
      location.reload();
      return;
    }

    var tg = t.closest('[data-toggle]');
    var openMenus = $$('.dropdown.open');
    openMenus.forEach(function (m) { if (!tg || m.id !== tg.dataset.toggle) m.classList.remove('open'); });
    if (tg) { var m = doc.getElementById(tg.dataset.toggle); if (m) m.classList.toggle('open'); }

    var v = t.closest('[data-video]');
    if (v) openVideo(v.dataset.video);
    if (t.closest('[data-modal-close]') || t.id === 'videoModal') closeVideo();
  });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDrawer(); closeVideo(); } });

  // Swipe right to close the drawer.
  (function () {
    var x0 = null;
    drawer.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    drawer.addEventListener('touchend', function (e) {
      if (x0 !== null && e.changedTouches[0].clientX - x0 > 60) closeDrawer();
      x0 = null;
    }, { passive: true });
  })();

  /* ------------------------------------------------------------- video */
  function ytId(u) { var m = String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : null; }
  function openVideo(u) {
    var id = ytId(u), box = $('#videoModal .video-frame');
    if (!id) { window.open(u, '_blank', 'noopener'); return; }
    box.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Video"></iframe>';
    $('#videoModal').classList.add('open');
  }
  function closeVideo() {
    var m = $('#videoModal'); if (!m || !m.classList.contains('open')) return;
    m.classList.remove('open');
    setTimeout(function () { $('.video-frame', m).innerHTML = ''; }, 300);
  }

  /* --------------------------------------------------------- page init */
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      io.unobserve(en.target);
      $$('[data-count]', en.target).forEach(countUp);
      if (en.target.hasAttribute('data-count')) countUp(en.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }) : null;

  function countUp(el) {
    if (el._counted) return; el._counted = true;
    var to = parseInt(el.dataset.count, 10) || 0;
    if (reduceMotion || to === 0) { el.textContent = to; return; }
    var t0 = performance.now(), dur = 1400;
    (function step(now) {
      var p = Math.min((now - t0) / dur, 1);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 4)));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  function initPage(ctx) {
    // Reveal on scroll
    var reveals = $$('.reveal', ctx);
    if (io) reveals.forEach(function (el) { io.observe(el); });
    else reveals.forEach(function (el) { el.classList.add('in'); });
    // Counters not inside a .reveal
    $$('[data-count]', ctx).forEach(function (el) {
      if (!el.closest('.reveal')) { if (io) io.observe(el); else countUp(el); }
    });

    // Portfolio filter
    $$('[data-filter]', ctx).forEach(function (bar) {
      var grid = bar.nextElementSibling;
      bar.addEventListener('click', function (e) {
        var b = e.target.closest('.chip'); if (!b) return;
        $$('.chip', bar).forEach(function (c) { c.classList.toggle('active', c === b); });
        var f = b.dataset.f;
        $$('.project-card', grid).forEach(function (card, i) {
          var show = f === 'all' || card.dataset.cat === f;
          card.classList.toggle('hide', !show);
          card.classList.remove('pop');
          if (show) { card.style.animationDelay = (i % 6) * 40 + 'ms'; void card.offsetWidth; card.classList.add('pop'); }
        });
      });
    });

    // Pricing billing toggle
    $$('[data-billing]', ctx).forEach(function (wrap) {
      var pill = $('.billing-pill', wrap);
      var section = wrap.closest('section');
      function movePill(btn) {
        pill.style.width = btn.offsetWidth + 'px';
        pill.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
      }
      movePill($('button.active', wrap));
      wrap.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.classList.contains('active')) return;
        $$('button', wrap).forEach(function (x) { x.classList.toggle('active', x === b); });
        movePill(b);
        var k = b.dataset.b === 'yearly' ? 'y' : 'm';
        $$('.price', section).forEach(function (p) {
          var n = $('span[data-m]', p), per = $('.per', p), s = $('strong', p);
          n.textContent = n.dataset[k];
          per.textContent = per.dataset[k];
          s.classList.remove('flip'); void s.offsetWidth; s.classList.add('flip');
        });
      });
      window.addEventListener('resize', function () { var a = $('button.active', wrap); if (a && wrap.isConnected) movePill(a); }, { passive: true });
    });

    // Service search (client-side, instant)
    $$('[data-search-input]', ctx).forEach(function (input) {
      var list = $('[data-search-list]', ctx), empty = $('.empty', ctx);
      input.addEventListener('input', function () {
        var q = input.value.trim().toLowerCase(), any = false;
        $$('[data-search]', list).forEach(function (c) {
          var hit = !q || c.dataset.search.indexOf(q) !== -1;
          c.style.display = hit ? '' : 'none';
          any = any || hit;
        });
        if (empty) empty.hidden = any;
      });
    });

    // Contact form (AJAX)
    $$('form[data-contact]', ctx).forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var ok = true;
        $$('[required]', form).forEach(function (f) {
          var bad = !f.value.trim() || (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value.trim()));
          f.classList.toggle('invalid', bad);
          if (bad && ok) { f.focus(); ok = false; }
        });
        if (!ok) return;
        var btn = $('button[type="submit"]', form), label = $('span', btn), old = label.textContent;
        btn.disabled = true; label.textContent = btn.dataset.sending;
        var fd = new FormData(form); fd.append('_csrf', csrf);
        fetch(base + 'api/contact.php', { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' } })
          .then(function (r) { return r.json(); })
          .then(function (res) { toast(res.message, res.ok); if (res.ok) form.reset(); })
          .catch(function () { toast('Network error. Please try again.', false); })
          .then(function () { btn.disabled = false; label.textContent = old; });
      });
      $$('input, textarea', form).forEach(function (f) { f.addEventListener('input', function () { f.classList.remove('invalid'); }); });
    });
  }

  syncThemeUI();
  initPage(doc);
})();
