/* =========================================================
   CakriCircular SPA Engine
   - পুরো পেজ কখনো রিলোড হয় না, শুধু #app বদলায়
   - Header / Navbar / Sidebar / Footer একবারই লোড হয়
   - History API, Back/Forward, Cache, Prefetch, Transition
   - এডমিনে কিছু বদলালে ক্যাশ নিজে থেকেই ভেঙে যায় (লাইভ আপডেট)
   ========================================================= */
(function () {
  'use strict';

  var APP = document.getElementById('app');
  var BAR = document.getElementById('spa-progress');
  var BARF = BAR ? BAR.firstElementChild : null;
  var cache = new Map();
  var inflight = new Map();
  var TTL = 90 * 1000;            // ৯০ সেকেন্ড (টাটকা কনটেন্টের জন্য ছোট)
  var MAX_CACHE = 40;
  var scrollMap = new Map();
  var cleanups = [];
  var navToken = 0;
  var pendingAnchor = null;      /* যে পোস্টে ক্লিক করা হলো */
  var currentKey = keyOf(location.href);   /* এখন আসলে কোন পেজে আছি */
  var barTimer = null;
  var VER = (window.CC && window.CC.ver) || '1';
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  function bnNum(n) { return String(n).replace(/[0-9]/g, function (d) { return '০১২৩৪৫৬৭৮৯'[d]; }); }
  function sameOrigin(href) { try { return new URL(href, location.href).origin === location.origin; } catch (e) { return false; } }
  function keyOf(u) { var a = new URL(u, location.href); return a.pathname + a.search; }
  function absolute(u) { return new URL(u, location.href).href; }

  function barStart() {
    if (!BAR) return;
    clearInterval(barTimer);
    BAR.classList.add('on'); BARF.style.width = '12%';
    var w = 12;
    barTimer = setInterval(function () { w += (90 - w) * 0.12; BARF.style.width = w + '%'; }, 140);
  }
  function barDone() {
    if (!BAR) return;
    clearInterval(barTimer);
    BARF.style.width = '100%';
    setTimeout(function () { BAR.classList.remove('on'); setTimeout(function () { BARF.style.width = '0'; }, 250); }, 180);
  }
  function trimCache() {
    if (cache.size <= MAX_CACHE) return;
    var oldest = null, ot = Infinity;
    cache.forEach(function (v, k) { if (v.t < ot) { ot = v.t; oldest = k; } });
    if (oldest) cache.delete(oldest);
  }

  /* ---------------- ডেটা লোড ---------------- */
  function load(url, opts) {
    opts = opts || {};
    var k = keyOf(url);
    if (!opts.fresh) {
      var hit = cache.get(k);
      if (hit && (Date.now() - hit.t) < TTL) return Promise.resolve(hit.data);
    }
    if (inflight.has(k)) return inflight.get(k);

    var hdrs = { 'X-SPA': '1', 'X-Requested-With': 'fetch' };
    if (opts.prefetch) hdrs['X-Prefetch'] = '1';
    var p = fetch(url, {
      headers: hdrs,
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function (r) {
      /* সার্ভারে কিছু বদলালে ভার্সন বদলায় → পুরনো সব ক্যাশ ফেলে দিই */
      var sv = r.headers.get('X-CC-Ver');
      if (sv && sv !== VER) { VER = sv; cache.clear(); prefetched.clear(); }
      if (!r.ok && r.status !== 404) throw new Error('HTTP ' + r.status);
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('application/json') === -1) throw new Error('not-spa');
      return r.json();
    }).then(function (d) {
      cache.set(k, { t: Date.now(), data: d }); trimCache(); inflight.delete(k);
      return d;
    }).catch(function (err) { inflight.delete(k); throw err; });

    inflight.set(k, p);
    return p;
  }

  /* ---------------- হেড আপডেট ---------------- */
  function setMeta(sel, attr, val) {
    var el = document.head.querySelector(sel);
    if (!el) return;
    el.setAttribute(attr, val || '');
  }
  function applyHead(d, url) {
    document.title = d.title || document.title;
    setMeta('meta[name="description"]', 'content', d.meta && d.meta.desc);
    setMeta('meta[property="og:title"]', 'content', d.title);
    setMeta('meta[property="og:description"]', 'content', d.meta && d.meta.desc);
    setMeta('meta[property="og:url"]', 'content', (d.meta && d.meta.canonical) || url);
    setMeta('meta[property="og:image"]', 'content', d.meta && d.meta.og);
    setMeta('meta[name="twitter:title"]', 'content', d.title);
    setMeta('meta[name="twitter:description"]', 'content', d.meta && d.meta.desc);
    setMeta('meta[name="twitter:image"]', 'content', d.meta && d.meta.og);
    var can = document.head.querySelector('link[rel="canonical"]');
    if (can) can.setAttribute('href', (d.meta && d.meta.canonical) || url);

    var old = document.getElementById('page-schema');
    if (old) old.remove();
    if (d.schema && d.schema.length) {
      var s = document.createElement('script');
      s.type = 'application/ld+json'; s.id = 'page-schema';
      s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': d.schema });
      document.head.appendChild(s);
    }
  }

  function injectAssets(d) {
    if (d.css) Object.keys(d.css).forEach(function (k) {
      if (document.head.querySelector('style[data-k="' + CSS.escape(k) + '"]')) return;
      var st = document.createElement('style'); st.setAttribute('data-k', k);
      st.textContent = d.css[k]; document.head.appendChild(st);
    });
    if (d.js) Object.keys(d.js).forEach(function (k) {
      if (document.querySelector('script[data-k="' + CSS.escape(k) + '"]')) return;
      var sc = document.createElement('script'); sc.setAttribute('data-k', k);
      sc.textContent = d.js[k]; document.body.appendChild(sc);
    });
  }

  /* ---------------- নেভিগেশন ---------------- */
  function navigate(url, opts) {
    opts = opts || {};
    var full = absolute(url);
    if (keyOf(full) === keyOf(location.href) && !opts.force) { closeAll(); return; }

    var token = ++navToken;
    /* এখনকার পেজের অবস্থান নিজের কী-তে রাখি (popstate-এ URL আগেই বদলে যায়) */
    scrollMap.set(currentKey, { y: window.scrollY, a: pendingAnchor });
    pendingAnchor = null;
    barStart();
    APP.classList.add('is-leaving');
    closeAll();

    var minDelay = new Promise(function (r) { setTimeout(r, 110); });

    Promise.all([load(full, opts), minDelay]).then(function (res) {
      if (token !== navToken) return;
      var d = res[0];
      if (d && d.redirect) {                      /* পুরনো লিংক → নতুন লিংক */
        cache.delete(keyOf(full));
        navigate(d.redirect, { replace: true, force: true });
        return;
      }
      injectAssets(d);
      APP.innerHTML = d.html;
      applyHead(d, full);

      if (opts.replace) history.replaceState({ spa: 1 }, '', full);
      else if (!opts.pop) history.pushState({ spa: 1 }, '', full);

      APP.classList.remove('is-leaving');
      APP.style.animation = 'none'; void APP.offsetWidth; APP.style.animation = '';

      var saved = scrollMap.get(keyOf(full));
      currentKey = keyOf(full);
      restoreScroll(opts.pop ? saved : null);

      afterRender(d);
      barDone();
    }).catch(function () {
      if (token !== navToken) return;
      barDone(); APP.classList.remove('is-leaving');
      location.href = full;
    });
  }

  function stickyH() {                    /* হেডার + ক্যাটাগরি বারের উচ্চতা */
    var h = document.querySelector('.hd'), c = document.querySelector('.catbar');
    return (h ? h.offsetHeight : 0) + (c ? c.offsetHeight : 0);
  }

  /* ফেরার সময়: আগে যে পোস্টে ক্লিক করেছিলাম ঠিক সেটিই চোখের সামনে আনি।
     ছবি লোড হতে হতে পেজের উচ্চতা বদলায়, তাই কয়েকবার চেষ্টা করে মিলিয়ে নিই */
  function restoreScroll(st) {
    if (!st) { window.scrollTo(0, 0); return; }
    var tries = 0;

    function targetY() {
      if (st.a) {
        var el = APP.querySelector('[data-href="' + (window.CSS && CSS.escape ? CSS.escape(st.a) : st.a) + '"]');
        if (el) return Math.max(0, el.getBoundingClientRect().top + window.scrollY - stickyH() - 12);
      }
      return st.y || 0;
    }

    (function put() {
      var y = targetY();
      window.scrollTo(0, y);
      tries++;
      if (Math.abs(window.scrollY - y) > 2 && tries < 16) {
        (tries < 4 ? requestAnimationFrame : function (f) { setTimeout(f, 70); })(put);
      }
    })();
  }

  function afterRender(d) {
    cleanups.forEach(function (fn) { try { fn(); } catch (e) {} });
    cleanups = [];
    document.body.setAttribute('data-nav', (d && d.nav) || '');
    markActive();
    initBanners();
    initCounters();
    ping(location.pathname + location.search);
    document.dispatchEvent(new CustomEvent('spa:ready'));
  }

  function markActive() {
    var path = location.pathname;
    document.querySelectorAll('.catbar a').forEach(function (a) {
      a.classList.toggle('active', new URL(a.href).pathname === path);
    });
    var key = document.body.getAttribute('data-nav') || '';
    document.querySelectorAll('.bn a, .hd-nav a, .sb a.sb-i').forEach(function (a) {
      var k = a.getAttribute('data-key');
      if (!k) return;
      a.classList.toggle('active', k === key || (k === 'home' && path === new URL(window.CC.base).pathname));
    });
    var act = document.querySelector('.catbar a.active');
    if (act && act.scrollIntoView) act.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  /* ---------------- প্রিফেচ ---------------- */
  var prefetched = new Set();
  function prefetch(url) {
    var k = keyOf(url);
    if (prefetched.has(k) || cache.has(k)) return;
    prefetched.add(k);
    load(url, { prefetch: true }).catch(function () { prefetched.delete(k); });
  }
  function spaLink(el) {
    var a = el.closest ? el.closest('a') : null;
    if (!a || !a.href) return null;
    if (a.hasAttribute('data-no-spa') || a.target === '_blank' || a.hasAttribute('download')) return null;
    if (!sameOrigin(a.href)) return null;
    if (a.getAttribute('href').charAt(0) === '#') return null;
    var p = new URL(a.href).pathname;
    if (/\.(xml|txt|pdf|jpg|png|zip|webmanifest)$/i.test(p)) return null;
    return a;
  }
  function hoverTarget(t) {
    var a = spaLink(t);
    if (a) return a.href;
    var c = t.closest ? t.closest('[data-href]') : null;
    return c ? c.getAttribute('data-href') : null;
  }
  document.addEventListener('mouseover', function (e) { var u = hoverTarget(e.target); if (u) prefetch(u); }, { passive: true });
  document.addEventListener('touchstart', function (e) { var u = hoverTarget(e.target); if (u) prefetch(u); }, { passive: true });

  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (ents) {
    ents.forEach(function (en) {
      if (en.isIntersecting) { var a = spaLink(en.target); if (a) prefetch(a.href); io.unobserve(en.target); }
    });
  }, { rootMargin: '200px' }) : null;
  function observeLinks() {
    if (!io) return;
    APP.querySelectorAll('.pitem a[href]').forEach(function (a) { io.observe(a); });
  }
  document.addEventListener('spa:ready', observeLinks);

  /* ---------------- ক্লিক ---------------- */
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    var a = spaLink(e.target);
    if (a) {
      var holder = a.closest('[data-href]');
      pendingAnchor = holder ? holder.getAttribute('data-href') : null;
      if (pendingAnchor) scrollMap.set(currentKey, { y: window.scrollY, a: pendingAnchor });
      e.preventDefault(); navigate(a.href); return;
    }

    /* কার্ডের যেখানেই চাপুন — শেয়ার বাটন আর অন্য লিংক ছাড়া — বিস্তারিত খুলবে */
    if (e.target.closest('.share-btn') || e.target.closest('a') || e.target.closest('button')) return;
    if (window.getSelection && String(window.getSelection()).length > 2) return;   /* লেখা সিলেক্ট করলে নয় */
    var card = e.target.closest('[data-href]');
    if (card) {
      pendingAnchor = card.getAttribute('data-href');
      scrollMap.set(currentKey, { y: window.scrollY, a: pendingAnchor });
      e.preventDefault(); navigate(card.getAttribute('data-href'));
    }
  });
  window.addEventListener('popstate', function () { navigate(location.href, { pop: true, force: true }); });

  /* স্ক্রল করলেই বর্তমান অবস্থান মনে রাখি */
  var scTick = null;
  window.addEventListener('scroll', function () {
    if (scTick) return;
    scTick = setTimeout(function () {
      scTick = null;
      var old = scrollMap.get(currentKey) || {};
      scrollMap.set(currentKey, { y: window.scrollY, a: old.a || null });
    }, 150);
  }, { passive: true });

  /* পেজ ফিরে দেখলে টাটকা করি (এডমিন আপডেট সাথে সাথে দেখাবে) */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') cache.delete(keyOf(location.href));
  });

  /* ---------------- SPA ফর্ম (GET সার্চ) ---------------- */
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f.hasAttribute('data-spa-form')) return;
    e.preventDefault();
    var fd = new FormData(f), clean = new URLSearchParams();
    fd.forEach(function (v, k) { if (String(v).trim() !== '') clean.append(k, v); });
    var term = (fd.get('q') || '').toString().trim();
    if (term) saveRecent(term);
    var qs = clean.toString();
    navigate(f.getAttribute('action') + (qs ? '?' + qs : ''));
    closeSearch();
  });

  /* ---------------- সাইডবার ও সার্চ শিট ---------------- */
  var sb = document.getElementById('sb'), mask = document.getElementById('sbMask');
  function openSb() { if (!sb) return; sb.classList.add('open'); mask.classList.add('open'); sb.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; }
  function closeSb() { if (!sb) return; sb.classList.remove('open'); mask.classList.remove('open'); sb.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }
  function openSearch() {
    var s = document.getElementById('hdSearch'); if (!s) return;
    renderRecent();
    s.classList.add('open'); s.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    var i = document.getElementById('hsInput');
    if (i) setTimeout(function () { i.focus(); }, 80);
  }
  function closeSearch() {
    var s = document.getElementById('hdSearch'); if (!s) return;
    s.classList.remove('open'); s.setAttribute('aria-hidden', 'true');
    if (!sb || !sb.classList.contains('open')) document.body.style.overflow = '';
  }
  function closeAll() { closeSb(); closeSearch(); closeSharePop(); }

  document.addEventListener('click', function (e) {
    if (e.target.closest('#sideBtn') || e.target.closest('[data-open-sb]')) { sb && sb.classList.contains('open') ? closeSb() : openSb(); }
    else if (e.target.closest('#sbClose') || e.target.closest('#sbMask')) closeSb();
    else if (e.target.closest('#hdSearchBtn')) {
      var s = document.getElementById('hdSearch');
      if (s && s.classList.contains('open')) closeSearch(); else openSearch();
    }
    else if (e.target.closest('[data-hs-close]')) closeSearch();
    else if (e.target.closest('#hsClear')) {
      var inp = document.getElementById('hsInput');
      if (inp && inp.value) { inp.value = ''; inp.focus(); }
      else closeSearch();
    }
    else if (e.target.closest('.hs-chip')) { setTimeout(closeSearch, 30); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });

  /* সাম্প্রতিক অনুসন্ধান (ডিভাইসে সেভ) */
  function getRecent() {
    try { return JSON.parse(localStorage.getItem('cc_recent') || '[]'); } catch (e) { return []; }
  }
  function saveRecent(term) {
    try {
      var list = getRecent().filter(function (t) { return t !== term; });
      list.unshift(term);
      localStorage.setItem('cc_recent', JSON.stringify(list.slice(0, 8)));
    } catch (e) {}
  }
  function renderRecent() {
    var box = document.getElementById('hsRecentBox'), wrap = document.getElementById('hsRecent');
    if (!box || !wrap) return;
    var list = getRecent().slice(0, 4);
    if (!list.length) { box.hidden = true; return; }
    box.hidden = false;
    wrap.innerHTML = list.map(function (t) {
      return '<a class="hs-chip" href="' + window.CC.base + 'search?q=' + encodeURIComponent(t) + '">' +
             '<i class="fa fa-clock-rotate-left"></i>' + esc(t) + '</a>';
    }).join('') + '<button type="button" class="hs-chip" id="hsWipe"><i class="fa fa-trash"></i>মুছুন</button>';
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('#hsWipe')) {
      try { localStorage.removeItem('cc_recent'); } catch (er) {}
      renderRecent(); toast('সাম্প্রতিক অনুসন্ধান মুছে ফেলা হয়েছে');
    }
  });
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  /* ---------------- শেয়ার (নিচ থেকে ওঠা বটম শিট) ---------------- */
  var pop = null;
  function closeSharePop() {
    if (!pop) return;
    var p = pop; pop = null;
    p.classList.add('closing');
    setTimeout(function () { p.remove(); }, 220);
    document.body.style.overflow = '';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.share-btn');
    if (b) {
      e.preventDefault(); e.stopPropagation();
      openShare(b.getAttribute('data-share-title'), b.getAttribute('data-share-url'), b.getAttribute('data-share-cat'));
      return;
    }
    if (pop && (e.target.closest('.sh-mask') || e.target.closest('.sh-x'))) closeSharePop();
  });

  function openShare(title, url, cat) {
    closeSharePop();
    var u = encodeURIComponent(url), t = encodeURIComponent(title);
    pop = document.createElement('div');
    pop.className = 'sh-wrap';
    pop.innerHTML =
      '<div class="sh-mask"></div>' +
      '<div class="sh-sheet" role="dialog" aria-label="শেয়ার করুন">' +
        '<div class="sh-grip"></div>' +
        '<div class="sh-head">' +
          '<div><b>শেয়ার করুন</b>' + (cat ? '<span class="sh-cat">' + esc(cat) + '</span>' : '') + '</div>' +
          '<button class="sh-x" aria-label="বন্ধ"><i class="fa fa-xmark"></i></button>' +
        '</div>' +
        '<p class="sh-title">' + esc(title) + '</p>' +
        '<div class="sh-ic">' +
          '<a target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=' + u + '" class="fb"><span class="sh-cir"><i class="fa-brands fa-facebook-f"></i></span>Facebook</a>' +
          '<a target="_blank" rel="noopener" href="https://api.whatsapp.com/send?text=' + t + '%20' + u + '" class="wa"><span class="sh-cir"><i class="fa-brands fa-whatsapp"></i></span>WhatsApp</a>' +
          '<a target="_blank" rel="noopener" href="https://t.me/share/url?url=' + u + '&text=' + t + '" class="tg"><span class="sh-cir"><i class="fa-brands fa-telegram"></i></span>Telegram</a>' +
          '<a target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=' + t + '&url=' + u + '" class="tw"><span class="sh-cir"><i class="fa-brands fa-x-twitter"></i></span>X</a>' +
          (navigator.share ? '<button class="mo" type="button"><span class="sh-cir"><i class="fa fa-ellipsis"></i></span>আরও</button>' : '') +
        '</div>' +
        '<div class="sh-copy"><i class="fa fa-link"></i><input readonly value="' + esc(url) + '"><button class="sh-cp"><i class="fa fa-copy"></i> কপি</button></div>' +
      '</div>';
    document.body.appendChild(pop);
    document.body.style.overflow = 'hidden';

    pop.querySelector('.sh-cp').addEventListener('click', function () {
      var inp = pop.querySelector('input');
      inp.select();
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
        .catch(function () { try { document.execCommand('copy'); } catch (e) {} })
        .finally(function () { toast('লিংক কপি হয়েছে', 'ok'); });
    });
    var mo = pop.querySelector('.mo');
    if (mo) mo.addEventListener('click', function () {
      navigator.share({ title: title, url: url }).catch(function () {});
    });
  }

  /* ---------------- প্রিমিয়াম টোস্ট ও ডায়ালগ ---------------- */
  function toast(msg, type) {
    var t = document.createElement('div');
    t.className = 'cc-toast' + (type ? ' ' + type : '');
    t.innerHTML = '<span class="ct-ic"><i class="fa ' + (type === 'err' ? 'fa-circle-exclamation' : 'fa-circle-check') + '"></i></span>' + esc(msg);
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 320); }, 2200);
  }
  function ccDialog(opt) {
    opt = opt || {};
    var d = document.createElement('div');
    d.className = 'cc-dlg';
    d.innerHTML =
      '<div class="cd-mask"></div>' +
      '<div class="cd-box" role="dialog">' +
        '<div class="cd-ic ' + (opt.type || 'ok') + '"><i class="fa ' + (opt.icon || 'fa-check') + '"></i>' +
          '<span class="cd-r1"></span><span class="cd-r2"></span></div>' +
        '<h3>' + esc(opt.title || 'সম্পন্ন হয়েছে') + '</h3>' +
        '<p>' + esc(opt.text || '') + '</p>' +
        '<button class="cd-btn">' + esc(opt.btn || 'ঠিক আছে') + '</button>' +
      '</div>';
    document.body.appendChild(d);
    document.body.style.overflow = 'hidden';
    function kill() { d.classList.add('closing'); document.body.style.overflow = ''; setTimeout(function () { d.remove(); }, 220); }
    d.querySelector('.cd-btn').addEventListener('click', kill);
    d.querySelector('.cd-mask').addEventListener('click', kill);
    return kill;
  }
  window.ccToast = toast;
  window.ccDialog = ccDialog;

  /* ---------------- ব্যানার স্লাইডার ---------------- */
  function initBanners() {
    document.querySelectorAll('.bnr').forEach(function (el) { if (el.dataset.init !== '1') setupBanner(el); });
  }
  function setupBanner(el) {
    el.dataset.init = '1';
    var track = el.querySelector('.bnr-track');
    if (!track) return;
    var slides = track.children;
    if (slides.length === 0) return;
    var i = 0, timer = null, dots = el.querySelectorAll('.bnr-dot');

    function go(n, smooth) {
      i = (n + slides.length) % slides.length;
      track.style.transition = smooth === false ? 'none' : 'transform .5s cubic-bezier(.22,.8,.28,1)';
      track.style.transform = 'translateX(' + (-i * 100) + '%)';   /* ← ঠিক দিক */
      dots.forEach(function (d, x) { d.classList.toggle('on', x === i); });
    }
    function play() { stop(); if (slides.length > 1) timer = setInterval(function () { go(i + 1); }, 4500); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    dots.forEach(function (d, x) { d.onclick = function () { go(x); play(); }; });

    /* ম্যানুয়াল: আঙুলে সোয়াইপ (মোবাইল) ও মাউসে টেনে (পিসি) */
    var win = el.querySelector('.bnr-win') || track;
    var x0 = null, dx = 0, dragging = false;

    function begin(x) { x0 = x; dx = 0; dragging = true; stop(); track.style.transition = 'none'; }
    function move(x) {
      if (!dragging) return;
      dx = x - x0;
      if (Math.abs(dx) > 6) win.classList.add('drag');
      track.style.transform = 'translateX(' + (-i * 100 + (dx / win.offsetWidth) * 100) + '%)';
    }
    function end() {
      if (!dragging) return;
      dragging = false;
      var moved = Math.abs(dx) > Math.max(40, win.offsetWidth * 0.12);
      go(moved ? i + (dx < 0 ? 1 : -1) : i);
      setTimeout(function () { win.classList.remove('drag'); }, 30);
      x0 = null; dx = 0; play();
    }

    track.addEventListener('touchstart', function (ev) { begin(ev.touches[0].clientX); }, { passive: true });
    track.addEventListener('touchmove',  function (ev) { move(ev.touches[0].clientX); }, { passive: true });
    track.addEventListener('touchend', end);
    track.addEventListener('touchcancel', end);

    win.addEventListener('mousedown', function (ev) { ev.preventDefault(); begin(ev.clientX); });
    window.addEventListener('mousemove', function (ev) { if (dragging) move(ev.clientX); });
    window.addEventListener('mouseup', end);
    el.addEventListener('mouseenter', stop);
    el.addEventListener('mouseleave', play);
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : play(); });

    go(0, false); play();
    cleanups.push(stop);
  }

  /* ---------------- "আরও দেখুন" (সব পোস্ট একই পেজে) ---------------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-more]');
    if (!b) return;
    e.preventDefault();
    var wrap = b.closest('.more-wrap');
    var spin = wrap ? wrap.querySelector('.more-spin') : null;
    var url = b.getAttribute('data-more');
    b.style.display = 'none'; if (spin) spin.hidden = false;

    load(url).then(function (d) {
      var tmp = document.createElement('div');
      tmp.innerHTML = d.html;
      var list = document.querySelector('#postList') || document.querySelector('.plist');
      var got = tmp.querySelector('#postList') || tmp.querySelector('.plist');
      if (list && got) {
        Array.prototype.slice.call(got.children).forEach(function (n) { list.appendChild(n); });
      }
      var nextBtn = tmp.querySelector('[data-more]');
      if (wrap) {
        if (nextBtn) {
          b.setAttribute('data-more', nextBtn.getAttribute('data-more'));
          b.innerHTML = nextBtn.innerHTML;
          b.style.display = '';
        } else {
          wrap.innerHTML = '<div class="more-spin">সবগুলো পোস্ট দেখানো হয়েছে</div>';
        }
      }
      if (spin) spin.hidden = true;
      observeLinks();
      initCounters();
    }).catch(function () {
      if (spin) spin.hidden = true;
      b.style.display = ''; toast('লোড করা যায়নি, আবার চেষ্টা করুন', 'err');
    });
  });

  /* ---------------- ডেডলাইন লাইভ কাউন্টার ---------------- */
  function initCounters() {
    var els = APP.querySelectorAll('[data-deadline]');
    if (!els.length) return;
    function tick() {
      els.forEach(function (el) {
        var end = new Date(el.getAttribute('data-deadline') + 'T23:59:59+06:00').getTime();
        var diff = end - Date.now();
        if (diff <= 0) { el.textContent = 'আবেদনের সময় শেষ'; el.className = 'pchip over'; return; }
        var d = Math.floor(diff / 86400000), h = Math.floor(diff % 86400000 / 3600000), m = Math.floor(diff % 3600000 / 60000);
        el.textContent = 'বাকি ' + bnNum(d) + ' দিন ' + bnNum(h) + ' ঘন্টা ' + bnNum(m) + ' মিনিট';
        el.className = 'pchip ' + (d <= 3 ? 'urgent' : 'open');
      });
    }
    tick();
    var t = setInterval(tick, 30000);
    cleanups.push(function () { clearInterval(t); });
  }

  /* ---------------- ছবির লাইটবক্স ---------------- */
  document.addEventListener('click', function (e) {
    var im = e.target.closest('[data-zoom]');
    if (!im) return;
    var lb = document.createElement('div');
    lb.className = 'lb';
    lb.innerHTML = '<button class="lb-x" aria-label="বন্ধ"><i class="fa fa-xmark"></i></button><img src="' + im.getAttribute('data-zoom') + '" alt="">';
    document.body.appendChild(lb);
    document.body.style.overflow = 'hidden';
    function kill() { lb.remove(); document.body.style.overflow = ''; }
    lb.addEventListener('click', function (ev) { if (ev.target === lb || ev.target.closest('.lb-x')) kill(); });
    document.addEventListener('keydown', function esc2(ev) { if (ev.key === 'Escape') { kill(); document.removeEventListener('keydown', esc2); } });
  });

  /* ---------------- অ্যানালিটিকস ---------------- */
  function ping(path) {
    try {
      var body = new Blob([JSON.stringify({ path: path })], { type: 'application/json' });
      if (navigator.sendBeacon) navigator.sendBeacon(window.CC.base + 'api/track', body);
      else fetch(window.CC.base + 'api/track', { method: 'POST', body: body, keepalive: true });
    } catch (e) {}
  }

  /* ---------------- নোটিশ ব্যাজ ---------------- */
  function setBadges(n) {
    document.querySelectorAll('[data-nbadge]').forEach(function (b) {
      if (n > 0) { b.textContent = bnNum(n > 99 ? '99+' : n); b.classList.add('on'); }
      else b.classList.remove('on');
    });
    document.querySelectorAll('.ico-btn.bell').forEach(function (b) { b.classList.toggle('on', n > 0); });
  }
  function noticeBadge() {
    if (!document.querySelector('[data-nbadge]')) return;
    fetch(window.CC.base + 'api/notices?since=' + encodeURIComponent(localStorage.getItem('cc_notice_seen') || '0'))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        setBadges(d.unread || 0);
        if (d.unread > 0) {
          if (d.latest && sessionStorage.getItem('cc_ding') !== String(d.latest)) {
            sessionStorage.setItem('cc_ding', String(d.latest));
            ding();
          }
        }
      }).catch(function () {});
  }
  function ding() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
      var c = new Ctx(), o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = 'sine'; o.frequency.setValueAtTime(880, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(1320, c.currentTime + .12);
      g.gain.setValueAtTime(.001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(.15, c.currentTime + .03);
      g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + .35);
      o.start(); o.stop(c.currentTime + .36);
    } catch (e) {}
  }
  window.ccMarkNoticesSeen = function (ts) {
    localStorage.setItem('cc_notice_seen', String(ts || Math.floor(Date.now() / 1000)));
    setBadges(0);
  };

  /* ---------------- অ্যাপ ইনস্টল (PWA) ----------------
     নিয়ম: ইনস্টল করা না থাকলে ফুটারের কার্ড সবসময় দেখাবে।
           ইনস্টল থাকলে দেখাবে না। আনইনস্টল করলে আবার দেখাবে। */
  var deferredPrompt = window.__ccBIP || null;   /* <head>-এ আগেই ধরা পড়লে */

  function inApp() {   /* এখনই অ্যাপের ভেতরে চলছে কিনা */
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           window.navigator.standalone === true ||
           location.search.indexOf('src=app') > -1;
  }
  function showAppCard() {
    var c = document.getElementById('appCard');
    if (!c) return;
    c.hidden = false; c.classList.add('show');
  }
  function hideAppCard() {
    var c = document.getElementById('appCard');
    if (c) { c.classList.remove('show'); c.hidden = true; }
  }

  /* প্রতিবার যাচাই করি — আনইনস্টল করলে কার্ড আবার ফিরে আসবে */
  function refreshInstallState() {
    if (!document.getElementById('appCard')) return;
    if (inApp()) { hideAppCard(); return; }

    if (navigator.getInstalledRelatedApps) {
      navigator.getInstalledRelatedApps().then(function (apps) {
        if (apps && apps.length) { hideAppCard(); }
        else { try { localStorage.removeItem('cc_installed'); } catch (e) {} showAppCard(); }
      }).catch(function () {
        (localStorage.getItem('cc_installed') === '1') ? hideAppCard() : showAppCard();
      });
      return;
    }
    /* যে ব্রাউজারে জানার উপায় নেই (আইফোন/ফায়ারফক্স) — শেষ অবস্থা মনে রাখি */
    (localStorage.getItem('cc_installed') === '1') ? hideAppCard() : showAppCard();
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    /* এই ইভেন্ট আসা মানেই অ্যাপটি এখন ইনস্টল করা নেই */
    e.preventDefault(); deferredPrompt = e; window.__ccBIP = e;
    try { localStorage.removeItem('cc_installed'); } catch (x) {}
    showAppCard();
  });
  window.addEventListener('appinstalled', function () {
    try { localStorage.setItem('cc_installed', '1'); } catch (e) {}
    deferredPrompt = null; window.__ccBIP = null; hideAppCard();
    toast('অ্যাপ ইনস্টল হয়েছে', 'ok');
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('#appInstallBtn')) return;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (c) {
        if (c.outcome === 'accepted') { try { localStorage.setItem('cc_installed', '1'); } catch (er) {} hideAppCard(); }
        deferredPrompt = null;
      });
    } else {
      ccDialog({
        type: 'ok', icon: 'fa-mobile-screen-button',
        title: 'অ্যাপ হিসেবে যোগ করুন',
        text: 'ক্রোমে ⋮ মেনু খুলে "অ্যাপ ইনস্টল করুন" / "Install app" অথবা "Add to Home screen" চাপুন। আইফোনে Safari-র শেয়ার বাটন থেকে "Add to Home Screen" বেছে নিন।',
        btn: 'বুঝেছি'
      });
    }
  });

  refreshInstallState();
  document.addEventListener('spa:ready', refreshInstallState);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') refreshInstallState();
  });

  /* সার্ভিস ওয়ার্কার */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(window.CC.base + 'sw.js', { scope: window.CC.base })
        .catch(function () {});
    });
  }

  /* ---------------- ডার্ক মোড ---------------- */
  function applyTheme(t) {
    var root = document.documentElement;
    if (t === 'dark') root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'dark' ? '#03221f' : '#0b544e');
  }
  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('cc_theme', next); } catch (e) {}
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-theme-toggle]')) { e.preventDefault(); toggleTheme(); }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-theme-toggle]')) { e.preventDefault(); toggleTheme(); }
  });

  /* ---------------- সেভড জব (ডিভাইসে সংরক্ষিত) ---------------- */
  function getSaved() {
    try { var l = JSON.parse(localStorage.getItem('cc_saved') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; }
  }
  function putSaved(list) { try { localStorage.setItem('cc_saved', JSON.stringify(list.slice(0, 200))); } catch (e) {} }
  function isSaved(u) { return getSaved().some(function (x) { return x.u === u; }); }
  function syncSaved() {
    var list = getSaved();
    document.querySelectorAll('[data-save]').forEach(function (b) {
      var on = list.some(function (x) { return x.u === b.getAttribute('data-save'); });
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      var lb = b.querySelector('.lbl'); if (lb) lb.textContent = on ? 'সেভ করা' : 'সেভ';
    });
    document.querySelectorAll('[data-saved-count]').forEach(function (c) { c.textContent = list.length ? bnNum(list.length) : ''; });
    renderSaved();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-save]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var u = b.getAttribute('data-save'), list = getSaved();
    if (isSaved(u)) {
      putSaved(list.filter(function (x) { return x.u !== u; }));
      toast('সেভ তালিকা থেকে সরানো হয়েছে');
    } else {
      list.unshift({ u: u, t: b.getAttribute('data-title') || '', i: b.getAttribute('data-img') || '',
        c: b.getAttribute('data-cat') || '', d: b.getAttribute('data-dl') || '', o: b.getAttribute('data-org') || '', at: Date.now() });
      putSaved(list);
      toast('সেভ করা হয়েছে', 'ok');
    }
    syncSaved();
  });
  document.addEventListener('click', function (e) {
    var x = e.target.closest('[data-unsave]');
    if (!x) return;
    e.preventDefault(); e.stopPropagation();
    var u = x.getAttribute('data-unsave');
    putSaved(getSaved().filter(function (s) { return s.u !== u; }));
    syncSaved();
    toast('সরানো হয়েছে');
  });
  function daysLeft(d) {
    if (!d) return null;
    var end = new Date(d + 'T23:59:59+06:00').getTime();
    return Math.floor((end - Date.now()) / 86400000);
  }
  function renderSaved() {
    var box = document.getElementById('savedList');
    if (!box) return;
    var list = getSaved(), empty = document.getElementById('savedEmpty'), cnt = document.getElementById('savedCnt');
    if (cnt) cnt.textContent = bnNum(list.length);
    if (empty) empty.hidden = list.length > 0;
    box.innerHTML = list.map(function (x) {
      var dl = daysLeft(x.d), chip = '';
      if (dl !== null) {
        if (dl < 0) chip = '<span class="pdead over"><span class="dic"><i class="fa fa-xmark"></i></span>সময় শেষ</span>';
        else if (dl <= 3) chip = '<span class="pdead urgent"><span class="dic"><i class="fa fa-hourglass-half"></i></span>' + (dl === 0 ? 'আজই শেষ দিন' : 'আর ' + bnNum(dl) + ' দিন বাকি') + '</span>';
        else chip = '<span class="pdead open"><span class="dic"><i class="fa fa-calendar-check"></i></span>আর ' + bnNum(dl) + ' দিন বাকি</span>';
      }
      return '<article class="pitem" data-href="' + esc(x.u) + '">' +
        '<span class="pthumb"><a class="pitem-thumb" href="' + esc(x.u) + '" tabindex="-1" aria-hidden="true">' +
          (x.i ? '<img src="' + esc(x.i) + '" alt="" loading="lazy">' : '') + '</a></span>' +
        '<div class="pitem-body">' + chip +
          '<a href="' + esc(x.u) + '"><h3 class="pitem-title">' + esc(x.t) + '</h3></a>' +
          '<div class="pmeta"><span class="tm"><i class="fa fa-bookmark"></i>সেভ করা হয়েছে</span></div>' +
          '<div class="prow"><div class="ptags">' + (x.c ? '<span class="ptag">' + esc(x.c) + '</span>' : '') +
            (x.o ? '<span class="ptag soft"><i class="fa fa-building"></i>' + esc(x.o) + '</span>' : '') + '</div>' +
          '<button type="button" class="unsave-btn" data-unsave="' + esc(x.u) + '" aria-label="সরান"><i class="fa fa-trash-can"></i></button></div>' +
        '</div></article>';
    }).join('');
  }
  document.addEventListener('spa:ready', syncSaved);

  /* ---------------- ইনজেক্টেড স্টাইল ---------------- */
  var css = document.createElement('style');
  css.textContent = [
    '@keyframes fadeIn{from{opacity:0}to{opacity:1}}',
    '@keyframes popUp{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}',
    '@keyframes sheetUp{from{transform:translateY(102%)}to{transform:none}}',

    /* শেয়ার বটম শিট */
    '.sh-wrap{position:fixed;inset:0;z-index:165}',
    '.sh-mask{position:absolute;inset:0;background:rgba(9,25,22,.5);animation:fadeIn .2s ease both}',
    '.sh-sheet{position:absolute;left:0;right:0;bottom:0;background:var(--card);color:var(--ink);border-radius:26px 26px 0 0;',
    '  padding:10px 18px calc(24px + env(safe-area-inset-bottom));box-shadow:0 -14px 50px rgba(0,0,0,.25);',
    '  animation:sheetUp .3s cubic-bezier(.2,.9,.3,1.05) both;max-width:520px;margin:0 auto}',
    '.sh-wrap.closing .sh-sheet{animation:sheetUp .22s ease reverse both}',
    '.sh-wrap.closing .sh-mask{opacity:0;transition:opacity .2s}',
    '.sh-grip{width:42px;height:4px;border-radius:99px;background:var(--line);margin:0 auto 12px}',
    '.sh-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}',
    '.sh-head b{font-size:1.04rem;display:block}',
    '.sh-cat{display:inline-block;margin-top:3px;background:var(--brand-l);color:var(--brand);font-size:.72rem;font-weight:700;padding:3px 11px;border-radius:999px}',
    '.sh-x{border:0;background:var(--chip);width:34px;height:34px;border-radius:50%;color:var(--muted);flex:none}',
    '.sh-title{font-size:.9rem;color:var(--muted);margin:10px 0 16px;line-height:1.6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '.sh-ic{display:flex;gap:6px;justify-content:space-between;margin-bottom:16px}',
    '.sh-ic a,.sh-ic button{flex:1;border:0;background:none;padding:0;display:flex;flex-direction:column;align-items:center;gap:7px;',
    '  font-size:.74rem;font-weight:600;color:var(--ink-2);transition:.16s}',
    '.sh-cir{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font-size:1.22rem;color:#fff;transition:transform .18s}',
    '.sh-ic a:active .sh-cir,.sh-ic button:active .sh-cir{transform:scale(.9)}',
    '.sh-ic a:hover .sh-cir{transform:translateY(-3px)}',
    '.sh-ic .fb .sh-cir{background:#1877f2}.sh-ic .wa .sh-cir{background:#25d366}',
    '.sh-ic .tg .sh-cir{background:#29a9eb}.sh-ic .tw .sh-cir{background:#111}',
    '.sh-ic .mo .sh-cir{background:#64757a}',
    '.sh-copy{display:flex;align-items:center;gap:8px;background:var(--soft);border:1px solid var(--line);border-radius:14px;padding:6px 6px 6px 12px}',
    '.sh-copy>i{color:var(--muted);font-size:.85rem}',
    '.sh-copy input{flex:1;min-width:0;border:0;background:none;font:inherit;font-size:.8rem;color:var(--muted);outline:none}',
    '.sh-cp{border:0;background:var(--brand);color:#fff;border-radius:10px;padding:0 14px;height:38px;font-weight:600;font-size:.83rem;white-space:nowrap}',
    '.sh-cp:active{transform:scale(.96)}',

    /* টোস্ট */
    '.cc-toast{position:fixed;left:50%;bottom:92px;transform:translateX(-50%);background:rgba(12,30,21,.96);color:#fff;',
    '  padding:12px 20px 12px 14px;border-radius:999px;font-size:.88rem;z-index:200;display:flex;align-items:center;gap:10px;',
    '  box-shadow:0 14px 38px rgba(0,0,0,.3);animation:popUp .26s cubic-bezier(.2,.9,.3,1.2) both;max-width:88vw;backdrop-filter:blur(8px)}',
    '.cc-toast .ct-ic{width:24px;height:24px;border-radius:50%;background:#16a34a;display:grid;place-items:center;font-size:.74rem;flex:none}',
    '.cc-toast.err .ct-ic{background:#dc3c2c}',
    '.cc-toast.out{opacity:0;transform:translateX(-50%) translateY(8px);transition:opacity .3s,transform .3s}',

    /* প্রিমিয়াম ডায়ালগ */
    '.cc-dlg{position:fixed;inset:0;z-index:190;display:grid;place-items:center;padding:22px}',
    '.cd-mask{position:absolute;inset:0;background:rgba(9,25,22,.55);animation:fadeIn .2s ease both}',
    '.cd-box{position:relative;background:var(--card);color:var(--ink);border-radius:24px;padding:30px 24px 22px;max-width:360px;width:100%;',
    '  text-align:center;box-shadow:0 26px 70px rgba(0,0,0,.3);animation:popUp .3s cubic-bezier(.2,.9,.3,1.2) both}',
    '.cc-dlg.closing .cd-box{opacity:0;transform:translateY(10px) scale(.97);transition:.2s}',
    '.cc-dlg.closing .cd-mask{opacity:0;transition:.2s}',
    '.cd-ic{position:relative;width:76px;height:76px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;',
    '  font-size:1.9rem;color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-2))}',
    '.cd-ic.err{background:linear-gradient(135deg,#c0392b,#e05a48)}',
    '.cd-ic i{animation:popUp .4s .1s cubic-bezier(.2,.9,.3,1.6) both}',
    '.cd-r1,.cd-r2{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(15,118,110,.35);animation:rip 1.8s ease-out infinite}',
    '.cd-r2{animation-delay:.6s}',
    '@keyframes rip{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.55);opacity:0}}',
    '.cd-box h3{margin:0 0 8px;font-size:1.16rem;font-weight:700}',
    '.cd-box p{margin:0 0 20px;color:var(--muted);font-size:.92rem;line-height:1.7}',
    '.cd-btn{width:100%;border:0;background:linear-gradient(135deg,var(--brand),var(--brand-2));color:#fff;padding:13px;border-radius:14px;font:inherit;font-weight:600;font-size:.95rem}',
    '.cd-btn:active{transform:scale(.98)}',

    /* লাইটবক্স */
    '.lb{position:fixed;inset:0;background:rgba(8,20,18,.93);z-index:170;display:grid;place-items:center;padding:20px;animation:fadeIn .16s ease both}',
    '.lb img{max-width:100%;max-height:88vh;border-radius:12px;animation:popUp .26s ease both}',
    '.lb-x{position:absolute;top:16px;right:16px;width:42px;height:42px;border-radius:50%;border:0;background:rgba(255,255,255,.16);color:#fff;font-size:1.1rem}'
  ].join('');
  document.head.appendChild(css);

  /* ---------------- বুট ---------------- */
  history.replaceState({ spa: 1 }, '', location.href);
  markActive();
  initBanners();
  initCounters();
  observeLinks();
  noticeBadge();
  syncSaved();
  setInterval(noticeBadge, 120000);
  ping(location.pathname + location.search);

  window.SPA = {
    navigate: navigate, prefetch: prefetch, toast: toast, dialog: ccDialog,
    clearCache: function () { cache.clear(); prefetched.clear(); }
  };
})();
