/* চাকরি সার্কুলার — client app (no framework, ~instant navigation) */
(function () {
  'use strict';
  var CC = window.__CC || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var app = $('#app');
  var BN = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  function bn(n) { return String(n).replace(/[0-9]/g, function (d) { return BN[d]; }); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------------- toast ---------------- */
  var toastTimer;
  function toast(msg, err) {
    var t = $('#toast'); if (!t) return;
    t.textContent = msg; t.className = 'toast on' + (err ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = 'toast'; }, 2800);
  }

  /* ---------------- theme ---------------- */
  function setTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) {}
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-theme-toggle]')) setTheme(document.documentElement.getAttribute('data-theme') !== 'dark');
  });

  /* ---------------- drawer / sheets ---------------- */
  var drawer = $('#drawer');
  function openEl(el) { if (!el) return; el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; }
  function closeEl(el) { if (!el) return; el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); if (!$('.drawer.open, .sheet.open, .modal.open, .ssheet.open')) document.body.style.overflow = ''; }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('[data-drawer]')) { e.preventDefault(); openEl(drawer); return; }
    if (t.closest('[data-drawer-close]')) { closeEl(drawer); return; }
    if (t.closest('[data-sheet-close]')) { closeEl(t.closest('.sheet')); return; }
    if (t.closest('[data-search-open]')) { openSearch(); return; }
    if (t.closest('[data-search-close]')) { closeEl($('#searchSheet')); return; }
    if (t.closest('[data-back]')) { if (history.state && history.state.idx > 0) history.back(); else navigate('/'); return; }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') $$('.drawer.open, .sheet.open, .modal.open, .ssheet.open').forEach(closeEl);
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
  });

  /* ---------------- SPA navigation ---------------- */
  var cacheMap = new Map();
  var TTL = 30000;
  var idx = (history.state && history.state.idx) || 0;
  var navToken = 0;
  history.replaceState({ idx: idx, y: window.scrollY }, '');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  function isInternal(a) {
    if (!a || a.target === '_blank' || a.hasAttribute('download') || a.getAttribute('rel') === 'external') return false;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^(mailto|tel|javascript):/.test(href)) return false;
    var u = new URL(a.href, location.href);
    if (u.origin !== location.origin) return false;
    if (/^\/(uploads|api|cron|install|sitemap|robots|manifest|sw\.js|css|js|img|icons)/.test(u.pathname)) return false;
    if (/\.(pdf|xml|txt|png|jpe?g|webp|zip)$/i.test(u.pathname)) return false;
    return true;
  }
  function fetchPage(url) {
    var hit = cacheMap.get(url);
    if (hit && Date.now() - hit.t < TTL) return hit.p;
    var p = fetch(url, { headers: { 'X-Partial': '1' }, credentials: 'same-origin' }).then(function (r) {
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('application/json') === -1) throw new Error('full');
      return r.json();
    });
    cacheMap.set(url, { t: Date.now(), p: p });
    p.catch(function () { cacheMap.delete(url); });
    if (cacheMap.size > 40) cacheMap.delete(cacheMap.keys().next().value);
    return p;
  }
  function prefetch(a) {
    if (!isInternal(a) || navigator.connection && (navigator.connection.saveData || /2g/.test(navigator.connection.effectiveType || ''))) return;
    var url = new URL(a.href, location.href);
    if (url.pathname === location.pathname && url.search === location.search) return;
    fetchPage(url.pathname + url.search);
  }
  var hoverTimer;
  document.addEventListener('mouseover', function (e) {
    var a = e.target.closest && e.target.closest('a');
    if (!a) return; clearTimeout(hoverTimer); hoverTimer = setTimeout(function () { prefetch(a); }, 60);
  });
  document.addEventListener('touchstart', function (e) { var a = e.target.closest && e.target.closest('a'); if (a) prefetch(a); }, { passive: true });

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest('a');
    if (!isInternal(a)) return;
    var u = new URL(a.href, location.href);
    if (u.pathname === location.pathname && u.search === location.search && u.hash) return;
    e.preventDefault();
    $$('.drawer.open, .sheet.open, .ssheet.open').forEach(closeEl);
    navigate(u.pathname + u.search + u.hash);
  });

  var progress = $('#progress'); var progTimer;
  function progressStart() { if (!progress) return; clearTimeout(progTimer); progress.classList.add('on'); progress.style.width = '30%'; progTimer = setTimeout(function () { progress.style.width = '75%'; }, 250); }
  function progressDone() { if (!progress) return; clearTimeout(progTimer); progress.style.width = '100%'; setTimeout(function () { progress.classList.remove('on'); progress.style.width = '0'; }, 250); }

  function navigate(url, opts) {
    opts = opts || {};
    var token = ++navToken;
    var back = !!opts.back;
    if (!opts.pop) { history.replaceState({ idx: idx, y: window.scrollY }, ''); }
    progressStart();
    var path = url.split('#')[0];
    return fetchPage(path).then(function (data) {
      if (token !== navToken) return;
      if (!opts.pop) { idx++; history.pushState({ idx: idx, y: 0 }, '', url); }
      swap(data, back, function () {
        var hash = url.split('#')[1];
        if (opts.pop) window.scrollTo(0, opts.y || 0);
        else if (hash && document.getElementById(hash)) document.getElementById(hash).scrollIntoView();
        else window.scrollTo(0, 0);
      });
      progressDone();
    }).catch(function () {
      if (token !== navToken) return;
      location.href = url; // graceful fallback (offline page / full load)
    });
  }

  function swap(data, back, after) {
    var apply = function () {
      app.innerHTML = data.body;
      document.title = data.title;
      app.setAttribute('data-nav-key', data.nav || '');
      document.body.className = data.bodyClass || '';
      setActive(data.nav || '');
      after && after();
      init(app);
      hit();
    };
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !reduce) {
      document.documentElement.classList.toggle('vt-back', back);
      var vt = document.startViewTransition(apply);
      vt.finished.then(function () { document.documentElement.classList.remove('vt-back'); });
      return;
    }
    if (reduce) { apply(); return; }
    app.classList.remove('pg-in', 'back'); app.classList.add('pg-out'); if (back) app.classList.add('back');
    setTimeout(function () {
      apply();
      app.classList.remove('pg-out'); void app.offsetWidth; app.classList.add('pg-in');
      setTimeout(function () { app.classList.remove('pg-in', 'back'); }, 360);
    }, 130);
  }

  window.addEventListener('popstate', function (e) {
    var st = e.state || { idx: 0, y: 0 };
    var back = st.idx < idx; idx = st.idx;
    navigate(location.pathname + location.search + location.hash, { pop: true, back: back, y: st.y });
  });
  var scrollSave;
  window.addEventListener('scroll', function () {
    clearTimeout(scrollSave);
    scrollSave = setTimeout(function () { try { history.replaceState({ idx: idx, y: window.scrollY }, ''); } catch (e) {} }, 150);
  }, { passive: true });

  function setActive(key) {
    $$('[data-nav]').forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-nav') === key); });
    var p = location.pathname;
    $$('.catbar a, .drawer-nav a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === p); });
  }

  /* hide bottom nav while scrolling down on phones */
  var lastY = window.scrollY;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    if (Math.abs(y - lastY) < 8) return;
    document.body.classList.toggle('hide-bnav', y > lastY && y > 300);
    lastY = y;
  }, { passive: true });

  /* ---------------- analytics beacon ---------------- */
  function device() {
    var d = store('cc_did');
    if (!d) { d = (Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 20); store('cc_did', d); }
    return d;
  }
  function hit() {
    var s = 0;
    try { if (!sessionStorage.getItem('cc_s')) { sessionStorage.setItem('cc_s', '1'); s = 1; } } catch (e) {}
    var post = $('[data-post]', app);
    var body = JSON.stringify({ p: location.pathname, id: post ? post.getAttribute('data-post') : null, d: device(), s: s });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/hit', body);
    else fetch('/api/hit', { method: 'POST', body: body, keepalive: true });
  }

  /* ---------------- bookmarks ---------------- */
  function saved() { return store('cc_saved') || []; }
  function setSaved(list) { store('cc_saved', list); syncPushSaved(); }
  function paintBookmarks(root) {
    var s = saved().map(function (x) { return String(x.id); });
    $$('[data-bm]', root).forEach(function (b) {
      var on = s.indexOf(b.getAttribute('data-bm')) > -1;
      b.classList.toggle('on', on);
      var label = b.querySelector('span'); if (label) label.textContent = on ? 'সেভড' : 'সেভ';
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-bm]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var id = b.getAttribute('data-bm');
    var list = saved(); var i = list.findIndex(function (x) { return String(x.id) === id; });
    if (i > -1) { list.splice(i, 1); toast('সেভ তালিকা থেকে সরানো হয়েছে'); }
    else {
      var card = b.closest('.card, .post');
      var title = card ? (card.getAttribute('data-title') || (card.querySelector('.card-title') || {}).textContent || '') : '';
      list.unshift({ id: Number(id), t: title.trim(), dl: b.getAttribute('data-bm-deadline') || '', at: Date.now() });
      toast('সেভ হয়েছে ✓ ডেডলাইনের আগে মনে করিয়ে দেব');
      if (!store('cc_push_asked') && 'Notification' in window && Notification.permission === 'default') setTimeout(showPushPrompt, 1200);
    }
    setSaved(list.slice(0, 200));
    paintBookmarks(document);
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  });
  function renderSaved(root) {
    var box = $('[data-saved-list]', root); if (!box) return;
    var list = saved();
    if (!list.length) { box.innerHTML = '<div class="empty"><h3>এখনো কিছু সেভ করা হয়নি</h3><p>পছন্দের পোস্টে বুকমার্ক আইকনে চাপ দিয়ে সেভ করুন।</p><a class="btn btn-primary" href="/">পোস্ট দেখুন</a></div>'; renderRemind(root, []); return; }
    fetch('/api/saved?ids=' + list.map(function (x) { return x.id; }).join(',')).then(function (r) { return r.json(); }).then(function (d) {
      box.innerHTML = d.html || '<div class="empty"><h3>সেভ করা পোস্টগুলো আর নেই</h3></div>';
      paintBookmarks(box);
      renderRemind(root, d.items || []);
    }).catch(function () { box.innerHTML = '<div class="empty"><h3>অফলাইন</h3><p>ইন্টারনেট সংযোগ ফিরলে সেভড পোস্ট দেখা যাবে।</p></div>'; });
  }
  function renderRemind(root, items) {
    var ul = $('[data-remind-list]', root); if (!ul) return;
    var now = Date.now();
    var withDl = items.filter(function (x) { return x.deadline && new Date(x.deadline).getTime() > now; }).sort(function (a, b) { return new Date(a.deadline) - new Date(b.deadline); });
    ul.innerHTML = withDl.length ? withDl.map(function (x) {
      var days = Math.ceil((new Date(x.deadline) - now) / 86400000);
      return '<li><a href="' + x.url + '">' + esc(x.title) + '</a><span class="dl ' + (days <= 3 ? 'dl-soon' : 'dl-ok') + '">' + (days <= 1 ? 'আজ/কাল শেষ' : 'আর ' + bn(days) + ' দিন') + '</span></li>';
    }).join('') : '<li>ডেডলাইনসহ কোনো সেভ করা পোস্ট নেই</li>';
  }

  /* ---------------- share ---------------- */
  var shareSheet = $('#shareSheet'); var shareData = {};
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-share-open]'); if (!b) return;
    var post = $('.post', app);
    shareData = { title: post ? post.getAttribute('data-title') : document.title, url: location.href.split('#')[0], img: post ? post.getAttribute('data-img') : '' };
    $('#shareTitle').textContent = shareData.title; $('#shareHost').textContent = location.host;
    var img = $('#shareImg'); if (shareData.img) { img.src = shareData.img; img.hidden = false; } else img.hidden = true;
    var u = encodeURIComponent(shareData.url); var t = encodeURIComponent(shareData.title);
    var links = { facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + u, x: 'https://twitter.com/intent/tweet?url=' + u + '&text=' + t, whatsapp: 'https://api.whatsapp.com/send?text=' + t + '%20' + u, telegram: 'https://t.me/share/url?url=' + u + '&text=' + t };
    $$('[data-share]', shareSheet).forEach(function (a) { if (links[a.getAttribute('data-share')]) a.href = links[a.getAttribute('data-share')]; });
    var native = $('[data-share="native"]', shareSheet); native.style.display = navigator.share ? '' : 'none';
    openEl(shareSheet);
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-share]'); if (!b) return;
    var kind = b.getAttribute('data-share');
    if (kind === 'copy') {
      e.preventDefault();
      (navigator.clipboard ? navigator.clipboard.writeText(shareData.url) : Promise.reject()).then(function () { toast('লিংক কপি হয়েছে ✓'); }).catch(function () {
        var ta = document.createElement('textarea'); ta.value = shareData.url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('লিংক কপি হয়েছে ✓');
      });
      closeEl(shareSheet);
    } else if (kind === 'native') {
      e.preventDefault(); navigator.share({ title: shareData.title, url: shareData.url }).catch(function () {}); closeEl(shareSheet);
    } else setTimeout(function () { closeEl(shareSheet); }, 300);
  });

  /* ---------------- search ---------------- */
  function openSearch() {
    var s = $('#searchSheet'); openEl(s); paintRecent(s);
    setTimeout(function () { var i = $('input', s); i && i.focus(); }, 80);
  }
  function recent() { return store('cc_recent') || []; }
  function addRecent(q) { q = q.trim(); if (!q) return; var r = recent().filter(function (x) { return x !== q; }); r.unshift(q); store('cc_recent', r.slice(0, 8)); }
  function paintRecent(root) {
    $$('[data-recent-wrap]', root).forEach(function (w) {
      var r = recent(); w.hidden = !r.length;
      var box = $('[data-recent]', w);
      if (box) box.innerHTML = r.map(function (q) { return '<a href="/search?q=' + encodeURIComponent(q) + '"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' + esc(q) + '</a>'; }).join('');
    });
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-recent-clear]')) { store('cc_recent', []); paintRecent(document); }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.matches('[data-search-form]')) {
      e.preventDefault();
      var q = (f.querySelector('[name=q]') || {}).value || '';
      addRecent(q);
      var params = new URLSearchParams(new FormData(f));
      Array.from(params.keys()).forEach(function (k) { if (!params.get(k)) params.delete(k); });
      closeEl($('#searchSheet'));
      navigate('/search' + (params.toString() ? '?' + params.toString() : ''));
    }
  });
  var sugTimer;
  document.addEventListener('input', function (e) {
    var inp = e.target;
    if (!inp.matches('[data-suggest], [data-suggest-inline]')) return;
    clearTimeout(sugTimer);
    sugTimer = setTimeout(function () {
      var q = inp.value.trim();
      var list = inp.matches('[data-suggest]') ? $('[data-suggest-list]', $('#searchSheet')) : inlineBox(inp);
      if (q.length < 2) { list.innerHTML = ''; list.hidden = inp.matches('[data-suggest-inline]'); return; }
      fetch('/api/suggest?q=' + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (rows) {
        var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        list.innerHTML = rows.map(function (r) { return '<a href="' + r.u + '"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>' + esc(r.t).replace(re, '<mark>$1</mark>') + '</span></a>'; }).join('');
        list.hidden = !rows.length;
      }).catch(function () {});
    }, 160);
  });
  function inlineBox(inp) {
    var host = inp.closest('.hero-search, .search-box');
    var box = host.querySelector('.inline-suggest');
    if (!box) { box = document.createElement('div'); box.className = 'inline-suggest suggest'; box.hidden = true; host.appendChild(box); }
    return box;
  }
  document.addEventListener('click', function (e) {
    $$('.inline-suggest').forEach(function (b) { if (!b.parentNode.contains(e.target)) b.hidden = true; });
  });
  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-autosubmit]')) { var f = e.target.form; f && f.requestSubmit ? f.requestSubmit() : f.submit(); }
  });

  /* ---------------- forms (report, subscribe) ---------------- */
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.matches('[data-report]')) {
      e.preventDefault();
      var btn = f.querySelector('[type=submit]'); btn.disabled = true;
      fetch(f.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(f))) })
        .then(function (r) { return r.json(); }).then(function (d) {
          if (d.ok) { f.innerHTML = '<div class="form-done"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg><h3>' + esc(d.message) + '</h3><p class="hint" style="justify-content:center">আমরা দ্রুত যাচাই করব।</p></div>'; }
          else { toast(d.error || 'সমস্যা হয়েছে', true); btn.disabled = false; }
        }).catch(function () { toast('ইন্টারনেট সংযোগ পরীক্ষা করুন', true); btn.disabled = false; });
    }
    if (f.matches('[data-subscribe]')) {
      e.preventDefault();
      fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: f.email.value }) })
        .then(function (r) { return r.json(); }).then(function (d) { toast(d.ok ? d.message : d.error, !d.ok); if (d.ok) f.reset(); })
        .catch(function () { toast('ইন্টারনেট সংযোগ পরীক্ষা করুন', true); });
    }
  });

  /* ---------------- load more ---------------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-more]'); if (!b) return;
    b.classList.add('loading'); b.textContent = 'লোড হচ্ছে…';
    fetch(b.getAttribute('data-more')).then(function (r) { return r.json(); }).then(function (d) {
      var feed = $('[data-feed]', app);
      var tmp = document.createElement('div'); tmp.innerHTML = d.html;
      while (tmp.firstChild) feed.appendChild(tmp.firstChild);
      paintBookmarks(feed);
      if (d.next) { b.setAttribute('data-more', d.next); b.classList.remove('loading'); b.innerHTML = 'আরও দেখুন <svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>'; }
      else b.parentNode.innerHTML = '<a class="btn btn-ghost" href="/posts">সব পোস্ট দেখুন</a>';
    }).catch(function () { b.classList.remove('loading'); b.textContent = 'আবার চেষ্টা করুন'; });
  });

  /* ---------------- tabs ---------------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tabs] [data-tab]'); if (!b) return;
    var wrap = b.closest('[data-tabs]'); var name = b.getAttribute('data-tab');
    $$('[data-tab]', wrap).forEach(function (x) { x.classList.toggle('on', x === b); });
    var scope = wrap.parentNode;
    $$('[data-pane]', scope).forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== name; });
  });

  /* ---------------- slider ---------------- */
  function initSlider(root) {
    $$('[data-slider]', root).forEach(function (s) {
      var track = $('.slides', s); var n = track.children.length; if (n < 2) return;
      var dots = $$('.sl-dots button', s); var i = 0; var timer;
      function go(k) { i = (k + n) % n; track.style.transform = 'translateX(' + (-i * 100) + '%)'; dots.forEach(function (d, j) { d.classList.toggle('on', j === i); }); }
      function auto() { clearInterval(timer); timer = setInterval(function () { if (!document.hidden && document.body.contains(s)) go(i + 1); else if (!document.body.contains(s)) clearInterval(timer); }, 4500); }
      $('.sl-prev', s).onclick = function () { go(i - 1); auto(); };
      $('.sl-next', s).onclick = function () { go(i + 1); auto(); };
      dots.forEach(function (d, j) { d.onclick = function () { go(j); auto(); }; });
      var x0 = null; var dx = 0; var w = 1;
      s.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; dx = 0; w = s.offsetWidth; track.style.transition = 'none'; clearInterval(timer); }, { passive: true });
      s.addEventListener('touchmove', function (e) { if (x0 === null) return; dx = e.touches[0].clientX - x0; track.style.transform = 'translateX(calc(' + (-i * 100) + '% + ' + dx + 'px))'; }, { passive: true });
      s.addEventListener('touchend', function () { track.style.transition = ''; if (Math.abs(dx) > w * 0.15) go(dx < 0 ? i + 1 : i - 1); else go(i); x0 = null; auto(); });
      s.addEventListener('mouseenter', function () { clearInterval(timer); });
      s.addEventListener('mouseleave', auto);
      auto();
    });
  }

  /* ---------------- countdown ---------------- */
  var cdTimer;
  function initCountdown(root) {
    clearInterval(cdTimer);
    var el = $('[data-countdown]', root); if (!el || el.classList.contains('is-over')) return;
    var end = new Date(el.getAttribute('data-countdown')).getTime();
    function pad(n) { return bn(String(n).padStart(2, '0')); }
    function tick() {
      var ms = end - Date.now();
      if (ms <= 0) { clearInterval(cdTimer); el.classList.add('is-over'); el.innerHTML = '<span class="cd-label">আবেদনের সময় শেষ</span><div class="cd-val">সময় শেষ</div>'; return; }
      var s = Math.floor(ms / 1000);
      $('[data-d]', el).textContent = bn(Math.floor(s / 86400));
      $('[data-h]', el).textContent = pad(Math.floor(s % 86400 / 3600));
      $('[data-m]', el).textContent = pad(Math.floor(s % 3600 / 60));
      $('[data-s]', el).textContent = pad(s % 60);
    }
    tick(); cdTimer = setInterval(tick, 1000);
  }

  /* ---------------- notices: badge + sound ---------------- */
  function seenNotices() { return store('cc_seen_notices') || null; }
  function updateNoticeBadge(ids) {
    var seen = seenNotices();
    if (seen === null) { store('cc_seen_notices', ids); seen = ids; }
    var fresh = ids.filter(function (id) { return seen.indexOf(id) === -1; });
    [$('#noticeBadge'), $('#noticeBadgeM')].forEach(function (b) { if (!b) return; b.hidden = !fresh.length; b.textContent = fresh.length ? bn(fresh.length) : ''; });
    return fresh;
  }
  function markNoticesSeen() { store('cc_seen_notices', (CC.notices || []).concat(seenNotices() || []).slice(0, 200)); updateNoticeBadge(CC.notices || []); }
  function beep() {
    try {
      var A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      var ctx = new A(); var o = ctx.createOscillator(); var g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(880, ctx.currentTime); o.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.42);
    } catch (e) {}
  }
  var userInteracted = false;
  ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { userInteracted = true; }, { once: true, passive: true }); });
  function pollNotices() {
    if (document.hidden) return;
    fetch('/api/notices/state').then(function (r) { return r.json(); }).then(function (d) {
      var before = CC.notices || [];
      CC.notices = d.ids;
      var brandNew = d.ids.filter(function (id) { return before.indexOf(id) === -1; });
      var fresh = updateNoticeBadge(d.ids);
      if (brandNew.length && fresh.length) { if (userInteracted) beep(); toast('নতুন নোটিশ এসেছে 🔔'); }
    }).catch(function () {});
  }
  setInterval(pollNotices, 120000);

  /* ---------------- push notifications ---------------- */
  function urlB64(base64) {
    var pad = '='.repeat((4 - base64.length % 4) % 4); var raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out;
  }
    function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && CC.vapid && CC.push; }
  function showPushPrompt() {
    if (!pushSupported() || Notification.permission !== 'default') return;
    openEl($('#pushModal'));
  }
  function subscribePush() {
    store('cc_push_asked', Date.now());
    closeEl($('#pushModal'));
    if (!pushSupported()) { toast('এই ব্রাউজারে নোটিফিকেশন সমর্থিত নয়', true); return; }
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') { toast('নোটিফিকেশন অনুমতি দেওয়া হয়নি'); return; }
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) {
          return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(CC.vapid) });
        });
      }).then(function (sub) { return sendSub(sub); }).then(function () { toast('নোটিফিকেশন চালু হয়েছে ✓'); });
    }).catch(function () { toast('নোটিফিকেশন চালু করা যায়নি', true); });
  }
  function sendSub(sub) {
    return fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sub: sub.toJSON ? sub.toJSON() : sub, saved: saved().map(function (x) { return x.id; }) }) });
  }
  function syncPushSaved() {
    if (!pushSupported() || Notification.permission !== 'granted') return;
    navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) { if (sub) sendSub(sub); }).catch(function () {});
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-push-allow]')) subscribePush();
    if (e.target.closest('[data-push-later]')) { store('cc_push_asked', Date.now()); closeEl($('#pushModal')); }
    if (e.target.closest('[data-push-ask]')) {
      if (!pushSupported()) return toast('এই ব্রাউজারে নোটিফিকেশন সমর্থিত নয়', true);
      if (Notification.permission === 'granted') { syncPushSaved(); return toast('নোটিফিকেশন ইতিমধ্যে চালু আছে ✓'); }
      if (Notification.permission === 'denied') return toast('ব্রাউজার সেটিংস থেকে নোটিফিকেশন অনুমতি দিন', true);
      openEl($('#pushModal'));
    }
  });
  function maybeAskPush() {
    var asked = store('cc_push_asked');
    if (asked && Date.now() - asked < 7 * 86400000) return;
    setTimeout(showPushPrompt, (CC.pushDelay || 8) * 1000);
  }

  /* ---------------- PWA install ---------------- */
  var deferredInstall = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; $$('[data-install]').forEach(function (b) { b.hidden = false; }); });
  window.addEventListener('appinstalled', function () { toast('অ্যাপ ইনস্টল হয়েছে ✓'); var c = $('#installCard'); if (c) c.hidden = true; });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('[data-install]')) return;
    if (deferredInstall) { deferredInstall.prompt(); deferredInstall.userChoice.finally(function () { deferredInstall = null; }); }
    else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) toast('Safari তে শেয়ার বাটন → "Add to Home Screen" চাপুন');
    else toast('ব্রাউজারের মেনু থেকে "Install app" / "Add to Home screen" চাপুন');
  });
  if (window.matchMedia('(display-mode: standalone)').matches) { var ic = $('#installCard'); if (ic) ic.hidden = true; }

  /* ---------------- per-page init ---------------- */
  function init(root) {
    paintBookmarks(root);
    initSlider(root);
    initCountdown(root);
    renderSaved(root);
    paintRecent(root);
    var af = $('[data-autofocus]', root); if (af && window.innerWidth > 960) af.focus();
    if (location.pathname === '/notices') markNoticesSeen();
  }

  setActive(app.getAttribute('data-nav-key') || '');
  init(document);
  updateNoticeBadge(CC.notices || []);
  hit();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
    });
  }
  maybeAskPush();
  window.CCApp = { navigate: navigate, toast: toast };
})();
