/* ═══════════════════════════════════════════════════════════
   চাকরি সার্কুলার — অ্যাপ ইঞ্জিন
   পেজ বদল (স্লাইডিং ট্রানজিশন) · থিম · বুকমার্ক · শেয়ার · ইনস্টল · নোটিফিকেশন
   কোনো লাইব্রেরি নেই — খাঁটি JavaScript
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var d = document, w = window, root = d.documentElement;
  var $ = function (s, r) { return (r || d).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var CC = w.CC || {};
  var reduced = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LS = {
    get: function (k, def) { try { var v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* প্রাইভেট মোড */ } },
    json: function (k, def) { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; } }
  };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var I = function (n, c) { return '<svg class="i ' + (c || '') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; };
  var bnNum = function (n) { return String(n).replace(/\d/g, function (x) { return '০১২৩৪৫৬৭৮৯'[x]; }); };
  var app = function () { return $('#app'); };

  /* ───────── থিম ───────── */
  function setTheme(t) {
    if (t === 'dark') root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
    LS.set('cc_theme', t);
    var m = $('meta[name=theme-color]'); if (m) m.setAttribute('content', t === 'dark' ? '#0b1211' : '#0f766e');
  }
  function toggleTheme() {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    if (d.startViewTransition && !reduced) {
      root.dataset.dir = 'tab'; // ক্রসফেড
      d.startViewTransition(function () { setTheme(next); }).finished.finally(function () { delete root.dataset.dir; });
    } else setTheme(next);
  }

  /* ───────── টোস্ট ও ডায়ালগ ───────── */
  w.ccToast = function (msg, type) {
    var host = $('#toastHost'); if (!host) return;
    var t = d.createElement('div'); t.className = 'toast ' + (type || '');
    t.innerHTML = (type === 'ok' ? I('check-circle') : type === 'err' ? I('alert') : '') + '<span>' + esc(msg) + '</span>';
    host.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 320); }, 2600);
  };
  w.ccDialog = function (o) {
    var el = d.createElement('div'); el.className = 'dlg';
    el.innerHTML = '<div class="sheet-mask"></div><div class="dlg-card"><div class="dlg-ic ' + (o.type === 'err' ? 'err' : '') + '">' + I(o.icon || 'check-circle') + '</div><h3>' + esc(o.title) + '</h3><p>' + esc(o.text || '') + '</p><button class="btn block" type="button">' + esc(o.btn || 'ঠিক আছে') + '</button></div>';
    d.body.appendChild(el);
    var close = function () { el.remove(); }; $('button', el).onclick = close; $('.sheet-mask', el).onclick = close;
  };

  /* ───────── বটম শিট ───────── */
  function sheet(html, opts) {
    opts = opts || {};
    var wrap = d.createElement('div'); wrap.className = 'sheet-wrap';
    wrap.innerHTML = '<div class="sheet-mask"></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grab"></div>' + html + '</div>';
    d.body.appendChild(wrap); d.body.style.overflow = 'hidden';
    var closed = false;
    function close() {
      if (closed) return; closed = true; wrap.classList.add('closing'); d.body.style.overflow = '';
      setTimeout(function () { wrap.remove(); if (opts.onClose) opts.onClose(); }, 280);
    }
    $('.sheet-mask', wrap).onclick = close;
    $$('[data-close]', wrap).forEach(function (b) { b.addEventListener('click', close); });
    d.addEventListener('keydown', function esc_(e) { if (e.key === 'Escape') { close(); d.removeEventListener('keydown', esc_); } });
    return { el: wrap, close: close, $: function (s) { return $(s, wrap); }, $$: function (s) { return $$(s, wrap); } };
  }
  w.ccSheet = sheet;

  /* ───────── সাইডবার ও খুঁজুন শিট ───────── */
  function sideToggle(open) {
    var sb = $('#sb'), mk = $('#sbMask'); if (!sb) return;
    sb.classList.toggle('open', open); mk.classList.toggle('open', open); sb.setAttribute('aria-hidden', open ? 'false' : 'true');
    d.body.style.overflow = open ? 'hidden' : '';
  }
  function searchToggle(open) {
    var hs = $('#hdSearch'); if (!hs) return;
    hs.classList.toggle('open', open); hs.setAttribute('aria-hidden', open ? 'false' : 'true');
    $('#hdSearchBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
    d.body.style.overflow = open ? 'hidden' : '';
    if (open) { renderRecent(); setTimeout(function () { var i = $('#hsInput'); if (i) i.focus(); }, 280); }
  }
  function recent() { return LS.json('cc_recent', []); }
  function addRecent(q) { q = (q || '').trim(); if (!q) return; var r = recent().filter(function (x) { return x !== q; }); r.unshift(q); LS.set('cc_recent', JSON.stringify(r.slice(0, 4))); }
  function renderRecent() {
    var r = recent(), box = $('#hsRecentBox'), list = $('#hsRecent'); if (!box) return;
    box.hidden = !r.length;
    list.innerHTML = r.map(function (q) { return '<a class="hs-chip" href="/search?q=' + encodeURIComponent(q) + '">' + I('search') + esc(q) + '</a>'; }).join('');
  }

  /* ═══════════ SPA নেভিগেশন ═══════════ */
  var cache = {}, inflight = {}, navIdx = 0, navBusy = false;
  var histIdx = (history.state && history.state.idx) || 0; navIdx = histIdx;
  try { history.scrollRestoration = 'manual'; } catch (e) { /* পুরোনো ব্রাউজার */ }
  history.replaceState({ idx: navIdx, y: 0 }, '');

  function progress(on, pct) {
    var p = $('#spa-progress'); if (!p) return; var s = $('span', p);
    if (on) { p.classList.add('on'); s.style.width = (pct || 30) + '%'; } else { s.style.width = '100%'; setTimeout(function () { p.classList.remove('on'); s.style.width = '0'; }, 280); }
  }
  function fetchPage(url, prefetch) {
    var c = cache[url]; if (c && Date.now() - c.t < 60000) return Promise.resolve(c.d);
    if (inflight[url]) return inflight[url];
    var h = { 'X-SPA': '1', 'Accept': 'application/json' }; if (prefetch) h['X-Prefetch'] = '1';
    inflight[url] = fetch(url, { headers: h, credentials: 'same-origin' }).then(function (r) {
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('json') < 0) throw new Error('non-json');
      return r.json().then(function (j) { j.status = r.status; return j; });
    }).then(function (j) { cache[url] = { d: j, t: Date.now() }; return j; })
      .finally(function () { delete inflight[url]; });
    return inflight[url];
  }
  function sameOrigin(a) { return a.origin === location.origin; }
  function isSpaLink(a, e) {
    if (!a || !a.href || a.hasAttribute('data-no-spa') || a.target === '_blank' || a.hasAttribute('download')) return false;
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0)) return false;
    var u = new URL(a.href, location.href);
    if (!sameOrigin(u) || /^\/(uploads|api|icons|fonts|css|js|img|screenshots)\//.test(u.pathname) || /\.(xml|txt|pdf|webmanifest|json)$/.test(u.pathname)) return false;
    if (CC.adminSlug && u.pathname.indexOf('/' + CC.adminSlug) === 0) return false;
    if (u.pathname.indexOf('/notify/') === 0) return false;
    return true;
  }

  function setMeta(sel, attr, val) { var el = $(sel); if (el) el.setAttribute(attr, val); }
  function applyHead(p) {
    d.title = p.title || d.title;
    setMeta('meta[name=description]', 'content', p.desc || '');
    var can = p.canonical ? (p.canonical.indexOf('http') === 0 ? p.canonical : location.origin + p.canonical) : location.href;
    setMeta('link[rel=canonical]', 'href', can);
    setMeta('meta[name=robots]', 'content', (p.robots || 'index, follow') + ', max-image-preview:large');
    setMeta('meta[property="og:title"]', 'content', p.title); setMeta('meta[property="og:description"]', 'content', p.desc || '');
    setMeta('meta[property="og:url"]', 'content', can);
    if (p.og) { setMeta('meta[property="og:image"]', 'content', p.og); setMeta('meta[name="twitter:image"]', 'content', p.og); }
    var ld = $('script[type="application/ld+json"]');
    if (ld) { try { var j = JSON.parse(ld.textContent); j['@graph'] = j['@graph'].slice(0, 2).concat(p.schema || []); ld.textContent = JSON.stringify(j); } catch (e) { /* ঠিক আছে */ } }
    d.body.setAttribute('data-nav', p.nav || '');
    $$('[data-nav-key]').forEach(function (a) {
      var k = a.getAttribute('data-nav-key'); var on;
      if (k.indexOf('cat:') === 0) on = p.nav === 'category' && k.slice(4) === p.catSlug; else on = p.nav === k;
      if (a.closest('.catbar')) a.classList.toggle('active', on); else a.classList.toggle('on', on);
    });
    var act = $('.catbar a.active'); if (act && act.scrollIntoView) { try { act.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) { /* */ } }
    if (p.fa && !$('link[data-fa]')) { var l = d.createElement('link'); l.rel = 'stylesheet'; l.setAttribute('data-fa', '1'); l.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css'; d.head.appendChild(l); }
  }

  function render(p, dir, scrollY) {
    var a = app(); a.innerHTML = p.body; a.setAttribute('data-page', p.page || ''); a.setAttribute('data-cat', p.catSlug || '');
    var wrap = $('#pageWrap'); if (wrap) wrap.classList.toggle('solo', p.page === 'offline');
    applyHead(p);
    w.scrollTo(0, scrollY || 0);
    afterSwap();
  }
  function swap(p, dir, scrollY) {
    if (d.startViewTransition && !reduced) {
      root.dataset.dir = dir;
      var vt = d.startViewTransition(function () { render(p, dir, scrollY); });
      vt.finished.finally(function () { delete root.dataset.dir; });
    } else {
      render(p, dir, scrollY);
      var a = app(); a.classList.remove('enter-fwd', 'enter-back', 'enter-tab'); void a.offsetWidth; a.classList.add('enter-' + (dir === 'back' ? 'back' : dir === 'tab' ? 'tab' : 'fwd'));
    }
  }
  function skeleton() {
    var a = app(); if (!a) return;
    if (!a.querySelector('.sk-card')) a.style.opacity = '.55';
  }

  function go(url, opts) {
    opts = opts || {};
    var u = new URL(url, location.href);
    var dir = opts.dir || 'fwd';
    if (navBusy && !opts.pop) { return; }
    navBusy = true; progress(true, 25);
    var slow = setTimeout(skeleton, 220);
    history.replaceState({ idx: navIdx, y: w.scrollY }, '');
    fetchPage(u.pathname + u.search).then(function (p) {
      clearTimeout(slow); progress(true, 80);
      if (p.redirect) { return go(p.redirect, opts); }
      if (!opts.pop) { navIdx += 1; history.pushState({ idx: navIdx, y: 0 }, '', u.pathname + u.search); }
      swap(p, dir, opts.pop ? opts.y : 0);
      app().style.opacity = '';
      track(u.pathname + u.search); bumpViews();
    }).catch(function () {
      clearTimeout(slow); app().style.opacity = '';
      if (navigator.onLine === false) { w.ccToast('ইন্টারনেট নেই', 'err'); } else { location.href = u.href; }
    }).finally(function () { navBusy = false; progress(false); });
  }
  w.ccGo = function (u) { go(u, { dir: 'fwd' }); };

  w.addEventListener('popstate', function (e) {
    var st = e.state || {}; var idx = typeof st.idx === 'number' ? st.idx : 0;
    var dir = idx < navIdx ? 'back' : 'fwd'; navIdx = idx;
    navBusy = false;
    go(location.pathname + location.search, { dir: dir, pop: true, y: st.y || 0 });
  });

  /* ক্লিক ইন্টারসেপ্ট */
  d.addEventListener('click', function (e) {
    var t = e.target;
    /* কার্ডের যেকোনো জায়গায় চাপলে */
    var card = t.closest && t.closest('.pitem');
    if (card && !t.closest('a,button') && card.dataset.href) { go(card.dataset.href, { dir: 'fwd' }); return; }
    var a = t.closest && t.closest('a');
    if (a && isSpaLink(a, e)) {
      e.preventDefault();
      var u = new URL(a.href);
      if (u.pathname + u.search === location.pathname + location.search) { w.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      var tab = a.closest('.bn, .hd-nav, .catbar, .brand');
      if (a.closest('#sb')) sideToggle(false);
      if (a.closest('#hdSearch')) searchToggle(false);
      go(u.pathname + u.search, { dir: tab ? 'tab' : 'fwd' });
    }
  });
  /* প্রিফেচ: হোভার/টাচ */
  var pfT;
  function prefetchFrom(e) {
    var a = e.target.closest && e.target.closest('a'); if (!a || !isSpaLink(a)) return;
    var u = new URL(a.href); clearTimeout(pfT);
    pfT = setTimeout(function () { fetchPage(u.pathname + u.search, true).catch(function () { /* */ }); }, e.type === 'touchstart' ? 0 : 90);
  }
  d.addEventListener('mouseover', prefetchFrom, { passive: true });
  d.addEventListener('touchstart', prefetchFrom, { passive: true });

  function track(path) { try { fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path }), keepalive: true, credentials: 'same-origin' }); } catch (e) { /* */ } }

  /* ═══════════ পেজ-ভিত্তিক সক্রিয়করণ ═══════════ */
  function afterSwap() {
    initBanner(); initGallery(); initLoadMore(); syncBookmarks(); initSaved(); initReport(); initSearchPage(); stagger(); noticePage();
    w.dispatchEvent(new Event('spa:ready'));
  }
  function stagger() { $$('.pitem').forEach(function (c, i) { c.style.setProperty('--i', Math.min(i, 12)); }); }

  /* ───── ব্যানার স্লাইডার ───── */
  var bnrTimer;
  function initBanner() {
    clearInterval(bnrTimer);
    var box = $('.bnr'); if (!box) return;
    var track_ = $('.bnr-track', box), slides = track_.children, dots = $$('.bnr-dot', box), win = $('.bnr-win', box);
    if (slides.length < 2) return;
    var i = 0, x0 = 0, dx = 0, drag = false, wpx = 0;
    function go_(n, smooth) { i = (n + slides.length) % slides.length; track_.style.transition = smooth === false ? 'none' : ''; track_.style.transform = 'translateX(' + (-100 * i) + '%)'; dots.forEach(function (dt, k) { dt.classList.toggle('on', k === i); }); }
    function play() { stop(); bnrTimer = setInterval(function () { if (!d.hidden) go_(i + 1); }, 4500); }
    function stop() { clearInterval(bnrTimer); }
    dots.forEach(function (dt, k) { dt.onclick = function () { go_(k); play(); }; });
    var pv = $('.bnr-arr.prev', box), nx = $('.bnr-arr.next', box);
    if (pv) pv.onclick = function () { go_(i - 1); play(); }; if (nx) nx.onclick = function () { go_(i + 1); play(); };
    function begin(x) { drag = true; x0 = x; dx = 0; wpx = win.offsetWidth; stop(); track_.style.transition = 'none'; }
    function move(x) { if (!drag) return; dx = x - x0; track_.style.transform = 'translateX(calc(' + (-100 * i) + '% + ' + dx + 'px))'; }
    function end() { if (!drag) return; drag = false; if (Math.abs(dx) > wpx * 0.18) go_(i + (dx < 0 ? 1 : -1)); else go_(i); play(); }
    win.addEventListener('touchstart', function (e) { begin(e.touches[0].clientX); }, { passive: true });
    win.addEventListener('touchmove', function (e) { move(e.touches[0].clientX); }, { passive: true });
    win.addEventListener('touchend', end); win.addEventListener('touchcancel', end);
    win.addEventListener('mousedown', function (e) { begin(e.clientX); e.preventDefault(); });
    d.addEventListener('mousemove', function (e) { if (drag) move(e.clientX); }); d.addEventListener('mouseup', end);
    win.addEventListener('click', function (e) { if (Math.abs(dx) > 6) e.preventDefault(); }, true);
    win.addEventListener('mouseenter', stop); win.addEventListener('mouseleave', play);
    play();
  }

  /* ───── পোস্টের ছবির গ্যালারি + জুম ───── */
  function initGallery() {
    var g = $('#postGal'); if (!g) return;
    var main = $('#galMain'), img = $('img', main);
    $$('.gal-th', g).forEach(function (b) {
      b.onclick = function () {
        $$('.gal-th', g).forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on');
        img.style.opacity = '.3'; var src = b.dataset.gal; var n = new Image(); n.onload = function () { img.src = src; main.dataset.zoom = src; img.style.opacity = ''; }; n.src = src;
        var idx = $('#galIdx'); if (idx) idx.textContent = b.dataset.i;
      };
    });
    main.onclick = function () {
      var lb = d.createElement('div'); lb.style.cssText = 'position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.92);display:grid;place-items:center;padding:16px;cursor:zoom-out;animation:fade .25s both';
      lb.innerHTML = '<img src="' + esc(main.dataset.zoom) + '" style="max-width:100%;max-height:100%;border-radius:12px;filter:none;animation:popIn .35s both"><button style="position:absolute;top:14px;right:14px;width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.15);color:#fff;display:grid;place-items:center">' + I('x') + '</button>';
      lb.onclick = function () { lb.remove(); }; d.body.appendChild(lb);
    };
  }

  /* ───── "আরও দেখুন" (পেজ নম্বরের বদলে) ───── */
  function initLoadMore() {
    $$('[data-pager]').forEach(function (nav) {
      var next = nav.dataset.next; if (!next || nav.dataset.ready) return; nav.dataset.ready = '1';
      var wrap = d.createElement('div'); wrap.className = 'more-wrap';
      wrap.innerHTML = '<button type="button" class="more-btn">' + I('arrow-d') + '<span>আরও পোস্ট দেখুন</span></button>';
      nav.style.display = 'none'; nav.parentNode.insertBefore(wrap, nav.nextSibling);
      var btn = $('button', wrap);
      btn.onclick = function () {
        if (btn.classList.contains('loading')) return; btn.classList.add('loading'); btn.firstElementChild.outerHTML = I('refresh');
        fetchPage(next, false).then(function (p) {
          var tpl = d.createElement('template'); tpl.innerHTML = p.body;
          var list = $('#postList'), add = $$('.pitem', tpl.content);
          add.forEach(function (c, k) { c.style.setProperty('--i', Math.min(k, 8)); list.appendChild(c); });
          syncBookmarks();
          var np = $('[data-pager]', tpl.content), nn = np && np.dataset.next;
          if (nn) { next = nn; btn.classList.remove('loading'); btn.innerHTML = I('arrow-d') + '<span>আরও পোস্ট দেখুন</span>'; } else wrap.remove();
        }).catch(function () { btn.classList.remove('loading'); btn.innerHTML = I('arrow-d') + '<span>আবার চেষ্টা করুন</span>'; });
      };
    });
  }

  /* ═══════════ বুকমার্ক (সেভ) ═══════════ */
  function saved() { return LS.json('cc_saved', []); }
  function isSaved(id) { return saved().some(function (x) { return x.id === id; }); }
  function setSaved(list) { LS.set('cc_saved', JSON.stringify(list)); syncBookmarks(); $$('#savedCount').forEach(function (e) { e.textContent = bnNum(list.length); }); w.dispatchEvent(new CustomEvent('cc:saved', { detail: list })); }
  function toggleSaved(id, btn) {
    var list = saved(), on = list.some(function (x) { return x.id === id; });
    if (on) { list = list.filter(function (x) { return x.id !== id; }); w.ccToast('সেভ থেকে সরানো হয়েছে'); }
    else {
      list.unshift({ id: id, t: Date.now() }); w.ccToast('সেভ করা হয়েছে ✓', 'ok');
      var card = btn && btn.closest('.pitem, .pd'); var a = card && (card.dataset.href || location.pathname);
      cacheForOffline(a && a.indexOf('/') === 0 ? [a] : [location.pathname]);
      if (btn) { btn.classList.add('pop'); setTimeout(function () { btn.classList.remove('pop'); }, 500); }
      maybeAskNotifyAfterSave();
    }
    setSaved(list); syncRemind();
  }
  function syncBookmarks() {
    var ids = {}; saved().forEach(function (x) { ids[x.id] = 1; });
    $$('[data-bk]').forEach(function (b) {
      var on = !!ids[b.dataset.bk]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      var s = $('span', b); if (s) s.textContent = on ? 'সেভ করা আছে' : 'সেভ করুন';
      b.setAttribute('aria-label', on ? 'সেভ থেকে সরান' : 'সেভ করুন');
    });
  }
  function cacheForOffline(urls) { if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'cache-urls', urls: urls }); }
  function initSaved() {
    var box = $('[data-saved]'); if (!box) return;
    var list = saved();
    if (!list.length) { box.innerHTML = '<div class="card empty">' + I('bookmark') + '<span>এখনো কিছু সেভ করা হয়নি।<br>কার্ডের বুকমার্ক আইকনে চেপে পরে দেখার জন্য জমিয়ে রাখুন।</span><a class="btn" href="/">চাকরি দেখুন</a></div>'; return; }
    fetch('/api/posts?ids=' + list.map(function (x) { return x.id; }).join(','), { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
      var missing = list.filter(function (x) { return j.found.indexOf(x.id) < 0 && j.found.indexOf(Number(x.id)) < 0; });
      box.innerHTML = '<div class="sec-title"><div class="sec-l"><span class="sec-ic gold">' + I('bookmark') + '</span><h2>আপনার সেভ করা<small>মোট ' + bnNum(j.found.length) + 'টি</small></h2></div><button class="btn sm ghost" id="clearSaved">' + I('trash') + 'সব মুছুন</button></div><div class="plist" id="postList">' + j.html + '</div>' + (missing.length ? '<p class="inf-updated" style="margin-top:14px">কিছু পোস্ট আর পাওয়া যায়নি (' + bnNum(missing.length) + 'টি)</p>' : '');
      syncBookmarks(); stagger();
      var c = $('#clearSaved'); if (c) c.onclick = function () { setSaved([]); syncRemind(); initSaved(); };
      cacheForOffline($$('.pitem', box).map(function (e) { return e.dataset.href; }));
    }).catch(function () { box.innerHTML = '<div class="card empty">' + I('wifioff') + '<span>এখন তালিকা আনা যাচ্ছে না। ইন্টারনেট দেখে আবার চেষ্টা করুন।</span></div>'; });
  }

  /* ═══════════ শেয়ার ═══════════ */
  function openShare(title, url) {
    var full = url.indexOf('http') === 0 ? url : location.origin + url;
    var s = sheet('<h3>শেয়ার করুন</h3><p class="sub">' + esc(title) + '</p><div class="sh-grid">'
      + item('#1877f2', 'facebook', 'Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(full))
      + item('#16a34a', 'chat', 'WhatsApp', 'https://wa.me/?text=' + encodeURIComponent(title + ' ' + full))
      + item('#229ed9', 'send', 'Telegram', 'https://t.me/share/url?url=' + encodeURIComponent(full) + '&text=' + encodeURIComponent(title))
      + item('#111827', 'twitter', 'X', 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(full) + '&text=' + encodeURIComponent(title))
      + item('#d97706', 'mail', 'ইমেইল', 'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(full))
      + (navigator.share ? '<button class="sh-it" data-native type="button"><span style="background:#0f766e">' + I('more') + '</span>আরও</button>' : '')
      + '</div><div class="sh-link"><input readonly value="' + esc(full) + '" aria-label="লিংক"><button class="btn sm" data-copy="' + esc(full) + '" type="button">' + I('copy') + 'কপি</button></div>');
    function item(c, ic, label, href) { return '<a class="sh-it" href="' + esc(href) + '" target="_blank" rel="noopener" data-no-spa><span style="background:' + c + '">' + I(ic) + '</span>' + label + '</a>'; }
    var n = s.$('[data-native]'); if (n) n.onclick = function () { navigator.share({ title: title, url: full }).catch(function () { /* */ }); s.close(); };
  }
  function copy(text) {
    var done = function () { w.ccToast('লিংক কপি হয়েছে ✓', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback() { var t = d.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0'; d.body.appendChild(t); t.select(); try { d.execCommand('copy'); done(); } catch (e) { /* */ } t.remove(); }
  }

  /* ═══════════ ফর্ম ও ছোট পেজ লজিক ═══════════ */
  var TXT = {
    report: { lead: 'নিচের ঘরগুলো পূরণ করে পাঠান। প্রয়োজনে আমরা আপনার ইমেইলে যোগাযোগ করব।', tl: 'বিষয় / পোস্টের নাম', tp: 'কোন পোস্টে সমস্যা?', dl: 'বিস্তারিত', dp: 'কী ভুল আছে, বিস্তারিত লিখুন… সম্ভব হলে পোস্টের লিংকটিও দিন।', el: 'আপনার ইমেইল', btn: 'রিপোর্ট পাঠান', ok: 'রিপোর্ট পৌঁছে গেছে', okt: 'ধন্যবাদ! আপনার পাঠানো তথ্য আমরা যাচাই করে দ্রুত ঠিক করে দেব।' },
    promo: { lead: 'আপনার প্রতিষ্ঠানের নিয়োগ বিজ্ঞপ্তি আমাদের ওয়েবসাইটে প্রকাশ করতে চাইলে নিচের ঘরগুলো পূরণ করুন।', tl: 'প্রতিষ্ঠান ও পদের নাম', tp: 'যেমনঃ ABC লিমিটেড — অ্যাকাউন্ট্যান্ট পদে নিয়োগ', dl: 'বিস্তারিত', dp: 'পদ সংখ্যা, যোগ্যতা, আবেদনের শেষ তারিখ এবং আবেদনের লিংক বা বিজ্ঞপ্তির পিডিএফ লিংক উল্লেখ করুন।', el: 'যোগাযোগের ইমেইল / ফোন', btn: 'অনুরোধ পাঠান', ok: 'অনুরোধ পৌঁছে গেছে', okt: 'ধন্যবাদ! আমরা বিজ্ঞপ্তিটি যাচাই করে শীঘ্রই যোগাযোগ করব।' }
  };
  function initReport() {
    var f = $('#reportForm'); if (!f || f.dataset.ready) return; f.dataset.ready = '1';
    function setMode(m) {
      f.dataset.mode = m; var t = TXT[m];
      $('#rpLead').textContent = t.lead; $('#rpTitleLabel').textContent = t.tl; $('#rp-title').placeholder = t.tp; $('#rpDetLabel').textContent = t.dl; $('#rp-det').placeholder = t.dp; $('#rpEmailLabel').textContent = t.el; $('#rpSubBtnTxt').textContent = t.btn;
      $('#rpPromoInfo').classList.toggle('show', m === 'promo');
      $$('.rp-tab', f).forEach(function (b) { b.classList.toggle('active', b.dataset.mode === m); });
    }
    setMode('report');
    $$('.rp-tab', f).forEach(function (b) { b.onclick = function () { setMode(b.dataset.mode); }; });
    f.addEventListener('submit', function (e) {
      e.preventDefault(); var m = f.dataset.mode, t = TXT[m], box = $('#rpMsg'), btn = $('#rpSubmit'), old = btn.innerHTML;
      btn.disabled = true; btn.innerHTML = I('refresh', 'spin') + ' পাঠানো হচ্ছে…'; box.className = 'rp-msg';
      var title = f.title.value, det = f.details.value;
      if (m === 'promo') { title = '[বিজ্ঞপ্তি প্রকাশ] ' + title; det = 'ধরন: প্রতিষ্ঠানের নিয়োগ বিজ্ঞপ্তি প্রকাশের অনুরোধ\n\n' + det; }
      fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ email: f.email.value, title: title, details: det, website: f.website.value }) })
        .then(function (r) { return r.json(); }).then(function (j) {
          if (j.ok) { f.reset(); setMode(m); box.className = 'rp-msg ok'; box.innerHTML = I('check-circle') + t.ok; w.ccDialog({ icon: 'send', title: t.ok, text: t.okt }); }
          else { box.className = 'rp-msg err'; box.innerHTML = I('alert') + esc(j.msg || 'পাঠানো যায়নি।'); }
        }).catch(function () { box.className = 'rp-msg err'; box.innerHTML = I('alert') + 'ইন্টারনেট সংযোগে সমস্যা হচ্ছে। আবার চেষ্টা করুন।'; })
        .finally(function () { btn.disabled = false; btn.innerHTML = old; });
    });
  }
  function initSearchPage() {
    var f = $('#searchForm'); if (!f || f.dataset.ready) return; f.dataset.ready = '1';
    var q = $('#sQ'), cl = $('#sClear'); if (!q) return;
    function sync() { cl.classList.toggle('on', q.value.trim() !== ''); } q.addEventListener('input', sync);
    cl.onclick = function () { q.value = ''; q.focus(); sync(); };
    $$('select', f).forEach(function (s) { s.onchange = function () { f.requestSubmit(); }; });
  }
  d.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.id === 'hsForm' || f.id === 'searchForm') {
      e.preventDefault(); var fd = new FormData(f), p = new URLSearchParams();
      fd.forEach(function (v, k) { if (String(v).trim() !== '') p.set(k, String(v).trim()); });
      var qv = p.get('q'); if (qv) addRecent(qv);
      searchToggle(false); go('/search' + (p.toString() ? '?' + p.toString() : ''), { dir: 'fwd' });
    }
  });

  /* ═══════════ নোটিশ ব্যাজ ═══════════ */
  function noticeBadge() {
    if (d.hidden) return;
    var since = Number(LS.get('cc_notice_seen', '0'));
    fetch('/api/notices?since=' + since, { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
      var b = $('#noticeBadge'); if (!b) return;
      var n = j.unread > 99 ? 99 : j.unread;
      b.textContent = n ? bnNum(n) : ''; b.setAttribute('data-n', n);
      w.__ccNoticeLatest = j.latest;
    }).catch(function () { /* */ });
  }
  function noticePage() {
    var l = $('.nt-list'); if (!l) return;
    var latest = Number(l.dataset.latest || 0);
    if (latest) { LS.set('cc_notice_seen', String(latest)); var b = $('#noticeBadge'); if (b) { b.textContent = ''; b.setAttribute('data-n', 0); } }
  }

  /* ═══════════ অ্যাপ ইনস্টল ═══════════ */
  var isStandalone = function () { return (w.matchMedia && w.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true || LS.get('cc_installed') === '1' && false; };
  var isIOS = function () { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); };
  var SHOTS = ['mobile-home.png', 'mobile-post.png', 'mobile-search.png', 'mobile-dark.png'];
  function showInstall() {
    var ios = isIOS();
    var shots = '<div class="ins-shots">' + SHOTS.map(function (s) { return '<img src="/screenshots/' + s + '?v=' + CC.asset + '" alt="" loading="lazy" onerror="this.remove()">'; }).join('') + '</div>';
    var perks = '<div class="ins-perks"><div class="ins-perk"><span>' + I('zap') + '</span>হোম স্ক্রিন থেকে এক টাচে খোলে, আরও দ্রুত</div><div class="ins-perk"><span>' + I('bell') + '</span>নতুন চাকরির নোটিফিকেশন পান</div><div class="ins-perk"><span>' + I('bookmark') + '</span>সেভ করা পোস্ট ইন্টারনেট ছাড়াও পড়ুন</div></div>';
    var steps = ios ? '<ol class="ios-steps" style="padding:0;margin:0 0 14px"><li>নিচের মেনু বারে <b>শেয়ার</b> (□↑) আইকনে চাপুন</li><li>নিচে স্ক্রল করে <b>“Add to Home Screen”</b> বেছে নিন</li><li>ডানে উপরে <b>Add</b> চাপুন — হয়ে গেল!</li></ol>' : '';
    var s = sheet('<div class="ins-hero"><img src="/icons/icon-192.png" alt=""><div><b>' + esc(CC.appName || 'Cakricircular') + '</b><small>ইনস্টল করে অ্যাপের মতো ব্যবহার করুন</small></div></div>' + shots + perks + steps + (ios ? '<button class="btn block ghost" data-close type="button">বুঝেছি</button>' : '<button class="btn block" id="doInstall" type="button">' + I('download') + 'এখনই ইনস্টল করুন</button><button class="nf-later" data-close type="button">পরে</button>'));
    var b = s.$('#doInstall');
    if (b) b.onclick = function () {
      var e = w.__ccBIP;
      if (e) { e.prompt(); e.userChoice.then(function (c) { if (c.outcome === 'accepted') { LS.set('cc_installed', '1'); w.ccToast('ইনস্টল হচ্ছে…', 'ok'); } w.__ccBIP = null; refreshInstallUI(); }); s.close(); }
      else { s.close(); w.ccDialog({ icon: 'info', title: 'ব্রাউজারের মেনু থেকে ইনস্টল করুন', text: 'ব্রাউজারের ⋮ মেনুতে “Install app” বা “হোম স্ক্রিনে যোগ করুন” বেছে নিন।' }); }
    };
  }
  function refreshInstallUI() {
    var card = $('#appCard'); if (!card) return;
    var can = !isStandalone() && LS.get('cc_installed') !== '1' && (w.__ccBIP || isIOS() || true);
    card.hidden = !can || isStandalone();
  }
  d.addEventListener('click', function (e) { if (e.target.closest('#appInstallBtn, [data-open-install]')) showInstall(); });
  w.addEventListener('beforeinstallprompt', function () { setTimeout(refreshInstallUI, 50); });
  w.addEventListener('appinstalled', function () { LS.set('cc_installed', '1'); refreshInstallUI(); });

  /* ═══════════ নোটিফিকেশন / ইমেইল প্রম্পট ═══════════ */
  function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in w && 'Notification' in w; }
  function urlB64(b) { var p = '='.repeat((4 - b.length % 4) % 4), s = (b + p).replace(/-/g, '+').replace(/_/g, '/'), raw = atob(s), o = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) o[i] = raw.charCodeAt(i); return o; }
  function post(url, body) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) }).then(function (r) { return r.json(); }); }
  function getSub() { return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }); }
  function subscribePush(cats) {
    if (!pushSupported()) return Promise.reject(new Error('unsupported'));
    if (!CC.vapid) return Promise.reject(new Error('novapid'));
    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') throw new Error('denied');
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      return reg.pushManager.getSubscription().then(function (s) { return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(CC.vapid) }); });
    }).then(function (sub) {
      LS.set('cc_push', '1');
      return post('/api/notify/push', { subscription: sub.toJSON(), cats: cats || [], saved: saved().map(function (x) { return x.id; }) });
    });
  }
  function syncRemind() {
    if (LS.get('cc_push') !== '1' || !pushSupported()) return;
    getSub().then(function (sub) { if (sub) post('/api/notify/saved', { endpoint: sub.endpoint, ids: saved().map(function (x) { return x.id; }) }).catch(function () { /* */ }); }).catch(function () { /* */ });
  }
  function catChips() { return (CC.cats || []).map(function (c) { return '<label><input type="checkbox" name="c" value="' + c.id + '"><span>' + esc(c.name) + '</span></label>'; }).join(''); }
  function openNotify(reason) {
    if (w.__ccNotifyOpen) return; w.__ccNotifyOpen = true;
    var can = pushSupported() && CC.vapid; var ios = isIOS() && !isStandalone();
    var head = '<div class="nf-top"><span class="nf-ic">' + I('bell') + '</span><div><b>নতুন চাকরির খবর সবার আগে পান</b><small>' + (reason === 'saved' ? 'সেভ করা চাকরির শেষ তারিখের রিমাইন্ডারও পাবেন' : 'নতুন বিজ্ঞপ্তি এলেই আপনাকে জানিয়ে দেব') + '</small></div></div>';
    var opts = '<div class="nf-opts">'
      + (can ? '<button class="nf-opt" id="nfPush" type="button"><span class="ic">' + I('bell') + '</span><span><b>নোটিফিকেশন চালু করুন</b><small>ব্রাউজার বন্ধ থাকলেও ফোনে/পিসিতে আসবে</small></span></button>' : '')
      + (!can && ios ? '<div class="inf-note warn" style="font-size:.82rem">' + I('info') + '<p>iPhone-এ নোটিফিকেশন পেতে আগে সাইটটি “Add to Home Screen” করে অ্যাপ হিসেবে খুলুন।</p></div>' : '')
      + '<button class="nf-opt" id="nfMailBtn" type="button"><span class="ic">' + I('mail') + '</span><span><b>ইমেইলে পান</b><small>ইমেইল দিলে আমরা জানিয়ে দেব</small></span></button></div>';
    var mail = '<form class="nf-mail" id="nfMail" hidden novalidate><input class="f-in" type="email" name="email" placeholder="আপনার ইমেইল ঠিকানা" autocomplete="email" required><div class="nf-seg"><label><input type="radio" name="mode" value="daily" checked><span>দৈনিক সারসংক্ষেপ</span></label><label><input type="radio" name="mode" value="instant"><span>নতুন এলেই</span></label></div><div class="nf-cats">' + catChips() + '</div><input class="hp" type="text" name="website" tabindex="-1" autocomplete="off"><button class="btn block" type="submit">' + I('send') + 'সাবস্ক্রাইব করুন</button><p class="nf-note">আমরা আগে একটি নিশ্চিতকরণ মেইল পাঠাব। যেকোনো সময় এক ক্লিকে বন্ধ করা যাবে।</p></form>';
    var s = sheet(head + opts + mail + '<button class="nf-later" data-close type="button">এখন না</button>', { onClose: function () { w.__ccNotifyOpen = false; LS.set('cc_nf_snooze', String(Date.now() + 7 * 864e5)); } });
    var pb = s.$('#nfPush');
    if (pb) pb.onclick = function () {
      pb.disabled = true;
      subscribePush([]).then(function () { s.close(); LS.set('cc_nf_done', '1'); w.ccDialog({ icon: 'bell', title: 'নোটিফিকেশন চালু হয়েছে', text: 'নতুন চাকরি এলেই আপনাকে জানানো হবে।' }); })
        .catch(function (e) { pb.disabled = false; w.ccToast(e.message === 'denied' ? 'ব্রাউজারে অনুমতি দেওয়া হয়নি' : 'এই ডিভাইসে নোটিফিকেশন চালু করা যায়নি', 'err'); });
    };
    s.$('#nfMailBtn').onclick = function () { s.$('#nfMail').hidden = false; s.$('#nfMailBtn').style.display = 'none'; var i = s.$('#nfMail input[type=email]'); if (i) i.focus(); };
    s.$('#nfMail').onsubmit = function (e) {
      e.preventDefault(); var f = e.target, btn = $('button[type=submit]', f), old = btn.innerHTML; btn.disabled = true;
      var cats = $$('input[name=c]:checked', f).map(function (x) { return Number(x.value); });
      post('/api/notify/email', { email: f.email.value, mode: f.mode.value, cats: cats, website: f.website.value }).then(function (j) {
        if (j.ok) { s.close(); LS.set('cc_nf_done', '1'); w.ccDialog({ icon: 'mail', title: 'ইমেইল পাঠানো হয়েছে', text: j.msg }); } else { w.ccToast(j.msg || 'সমস্যা হয়েছে', 'err'); }
      }).catch(function () { w.ccToast('সংযোগে সমস্যা', 'err'); }).finally(function () { btn.disabled = false; btn.innerHTML = old; });
    };
  }
  d.addEventListener('click', function (e) { if (e.target.closest('[data-open-notify]')) { sideToggle(false); openNotify(); } });
  /* ইউজার কিছুটা আগ্রহ দেখালে (৩টি পেজ / সেভ) তবেই একবার সুন্দরভাবে জিজ্ঞেস করি */
  function bumpViews() {
    var n = Number(LS.get('cc_views', '0')) + 1; LS.set('cc_views', String(n));
    if (LS.get('cc_nf_done') === '1') return;
    if (Number(LS.get('cc_nf_snooze', '0')) > Date.now()) return;
    if (pushSupported() && Notification.permission === 'denied') return;
    if (n === 3) setTimeout(function () { if (!d.hidden && !$('.sheet-wrap')) openNotify(); }, 2200);
  }
  function maybeAskNotifyAfterSave() { if (LS.get('cc_nf_done') !== '1' && Number(LS.get('cc_nf_snooze', '0')) < Date.now() && LS.get('cc_push') !== '1') setTimeout(function () { if (!$('.sheet-wrap')) openNotify('saved'); }, 1200); }

  /* ═══════════ গ্লোবাল ক্লিক/ইভেন্ট ═══════════ */
  d.addEventListener('click', function (e) {
    var t = e.target, b;
    if ((b = t.closest('#themeBtn, #themeRow'))) { toggleTheme(); return; }
    if (t.closest('#sideBtn')) { sideToggle(true); return; }
    if (t.closest('#sbClose, #sbMask')) { sideToggle(false); return; }
    if (t.closest('#hdSearchBtn')) { searchToggle(true); return; }
    if (t.closest('[data-hs-close]')) { searchToggle(false); return; }
    if (t.closest('#hsClear')) { var inp = $('#hsInput'); if (inp && inp.value) { inp.value = ''; inp.focus(); } else searchToggle(false); return; }
    if ((b = t.closest('[data-back]'))) { e.preventDefault(); if (history.state && history.state.idx > 0) history.back(); else go('/', { dir: 'back' }); return; }
    if ((b = t.closest('.pd-tab'))) {
      var n = b.dataset.tab; $$('.pd-tab').forEach(function (x) { x.classList.toggle('on', x === b); });
      $$('.pd-panel').forEach(function (x) { x.classList.toggle('on', x.dataset.panel === n); }); return;
    }
    if ((b = t.closest('[data-bk]'))) { e.preventDefault(); e.stopPropagation(); toggleSaved(b.dataset.bk, b); return; }
    if ((b = t.closest('[data-share-url]'))) { e.preventDefault(); e.stopPropagation(); var tt = b.dataset.shareTitle || d.title; if (navigator.share && /Mobi|Android/i.test(navigator.userAgent) && false) { navigator.share({ title: tt, url: location.origin + b.dataset.shareUrl }); } else openShare(tt, b.dataset.shareUrl); return; }
    if ((b = t.closest('[data-copy]'))) { e.preventDefault(); copy(b.dataset.copy); return; }
  });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape') { sideToggle(false); searchToggle(false); } });

  /* অফলাইন বার */
  function netState() { var b = $('#offlineBar'); if (b) b.classList.toggle('on', navigator.onLine === false); }
  w.addEventListener('online', function () { netState(); w.ccToast('ইন্টারনেট ফিরেছে', 'ok'); }); w.addEventListener('offline', netState);

  /* ═══════════ সার্ভিস ওয়ার্কার ═══════════ */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing; if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            var t = d.createElement('div'); t.className = 'toast ok'; t.style.pointerEvents = 'auto';
            t.innerHTML = I('refresh') + '<span>নতুন ভার্সন পাওয়া গেছে</span><button class="btn sm" style="margin-left:6px" type="button">আপডেট</button>';
            $('#toastHost').appendChild(t); $('button', t).onclick = function () { nw.postMessage({ type: 'skip-waiting' }); };
          }
        });
      });
    }).catch(function () { /* */ });
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (refreshing) return; refreshing = true; location.reload(); });
    navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.type === 'go' && e.data.url) go(e.data.url, { dir: 'fwd' }); });
  }

  /* ═══════════ শুরু ═══════════ */
  function init() {
    afterSwap(); refreshInstallUI(); netState(); registerSW(); bumpViews();
    setTimeout(noticeBadge, 1200); setInterval(noticeBadge, 90000);
    d.addEventListener('visibilitychange', function () { if (!d.hidden) noticeBadge(); });
    /* ছবি না এলে লুকাই */
    d.addEventListener('error', function (e) { var t = e.target; if (t && t.tagName === 'IMG' && t.closest('.pthumb,.gal-main')) t.style.visibility = 'hidden'; }, true);
    if (saved().length) cacheForOffline(['/saved']);
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
