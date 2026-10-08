/*!
 * store.js — storefront globals that live for the whole session:
 * cart store, add-to-cart, drawer, instant search, bottom-nav indicator,
 * Meta Pixel / GTM / Google Ads bridge, WhatsApp greeting, PWA install.
 */
(function (App) {
  'use strict';
  if (!App) return;
  var config = App.config;

  // =============================================================== Cart store
  var KEY = 'ns-cart';
  var Cart = App.cart = {
    items: function () {
      var list = App.store.get(KEY, []);
      return Array.isArray(list) ? list.filter(function (i) { return i && i.product_id > 0; }) : [];
    },
    save: function (items) {
      App.store.set(KEY, items.slice(0, 30));
      Cart.render();
      App.emit('cart:change', Cart.items());
    },
    keyOf: function (i) { return i.product_id + '|' + (i.size || '') + '|' + (i.color || ''); },
    add: function (item) {
      var items = Cart.items(), k = Cart.keyOf(item), found = false;
      items.forEach(function (i) {
        if (Cart.keyOf(i) === k) { i.qty = Math.min(item.max_qty || 20, (i.qty || 1) + (item.qty || 1)); found = true; }
      });
      if (!found) items.push({ product_id: item.product_id, size: item.size || '', color: item.color || '', qty: item.qty || 1, name: item.name || '' });
      Cart.save(items);
      Cart.bump();
    },
    setQty: function (key, qty) {
      var items = Cart.items().map(function (i) { if (Cart.keyOf(i) === key) i.qty = Math.max(1, Math.min(20, qty)); return i; });
      Cart.save(items);
    },
    remove: function (key) { Cart.save(Cart.items().filter(function (i) { return Cart.keyOf(i) !== key; })); },
    clear: function () { Cart.save([]); },
    count: function () { return Cart.items().reduce(function (n, i) { return n + (i.qty || 1); }, 0); },
    payload: function () { return Cart.items().map(function (i) { return { product_id: i.product_id, size: i.size, color: i.color, qty: i.qty }; }); },
    render: function () {
      var n = Cart.count();
      App.$$('[data-cart-count]').forEach(function (b) { b.textContent = App.bn(n > 99 ? '99+' : n); b.hidden = n === 0; });
    },
    bump: function () {
      App.$$('[data-cart-count]').forEach(function (b) {
        b.classList.remove('is-bump'); void b.offsetWidth; b.classList.add('is-bump');
      });
    }
  };
  Cart.render();
  window.addEventListener('storage', function (e) { if (e.key === KEY) { Cart.render(); App.emit('cart:change', Cart.items()); } });

  /** Validate on the server, then add. Resolves true on success. */
  App.addToCart = function (item, sourceEl) {
    return App.post(App.url('/api/cart/add'), item).then(function (res) {
      var d = res.data;
      Cart.add(d.item);
      flyToCart(sourceEl);
      if (d.track) Tracker.fire(d.track);
      return true;
    });
  };

  function flyToCart(el) {
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var target = App.$$('[data-cart-icon], .bn-item[data-nav="cart"]').filter(function (t) { return t.offsetParent !== null; })[0];
    if (!target) return;
    var a = el.getBoundingClientRect(), b = target.getBoundingClientRect();
    var dot = document.createElement('span');
    dot.className = 'fly-dot';
    dot.style.left = (a.left + a.width / 2 - 7) + 'px';
    dot.style.top = (a.top + a.height / 2 - 7) + 'px';
    document.body.appendChild(dot);
    var dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    var anim = dot.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: 'translate(' + dx * 0.5 + 'px,' + (dy * 0.5 - 60) + 'px) scale(1.2)', opacity: 1, offset: 0.5 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.4)', opacity: .3 }
    ], { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)' });
    anim.onfinish = function () { dot.remove(); };
  }

  App.action('add-to-cart', function (btn) {
    App.loading(btn, true);
    App.addToCart({ product_id: Number(btn.getAttribute('data-id')), qty: 1 }, btn).then(function () {
      App.loading(btn, false);
      App.toast('কার্টে যোগ হয়েছে', 'success', { actionText: 'কার্ট দেখুন', href: App.url('/cart'), onAction: function () { App.router && App.router.navigate(App.url('/cart')); } });
    }, function (err) {
      App.loading(btn, false);
      App.toast(err.message, 'error');
    });
  });

  // =============================================================== Drawer
  var sidebar = App.$('#sidebar'), backdrop = App.$('.drawer-backdrop'), menuBtn = App.$('[data-action="drawer-open"]');
  function openDrawer() {
    if (!sidebar) return;
    backdrop.hidden = false;
    requestAnimationFrame(function () { backdrop.classList.add('is-visible'); sidebar.classList.add('is-open'); });
    document.body.classList.add('drawer-open');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
    setTimeout(function () { var f = sidebar.querySelector('a, button'); if (f) f.focus(); }, 280);
  }
  function closeDrawer() {
    if (!sidebar || !sidebar.classList.contains('is-open')) return;
    sidebar.classList.remove('is-open');
    backdrop.classList.remove('is-visible');
    document.body.classList.remove('drawer-open');
    if (menuBtn) { menuBtn.setAttribute('aria-expanded', 'false'); }
    setTimeout(function () { backdrop.hidden = true; }, 260);
  }
  App.action('drawer-open', openDrawer);
  App.action('drawer-close', closeDrawer);
  App.on('drawer:close', closeDrawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
  // Swipe left to close the drawer
  (function () {
    if (!sidebar) return;
    var x0 = null;
    sidebar.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    sidebar.addEventListener('touchend', function (e) { if (x0 !== null && x0 - e.changedTouches[0].clientX > 60) closeDrawer(); x0 = null; }, { passive: true });
  })();

  // =============================================================== Bottom-nav indicator
  function moveIndicator() {
    var items = App.$$('.bottom-nav .bn-item');
    var idx = items.findIndex(function (i) { return i.classList.contains('is-active'); });
    var inner = App.$('.bottom-nav-inner');
    if (inner && idx >= 0) inner.style.setProperty('--bn-index', idx);
  }
  moveIndicator();
  App.on('nav', moveIndicator);

  // =============================================================== Instant search
  var header = App.$('#header');
  var form = App.$('[data-search]');
  if (form) {
    var input = form.querySelector('input[name="q"]');
    var box = form.querySelector('#search-results');
    var ctrl = null, activeIdx = -1, cache = new Map();

    var renderResults = function (q, data) {
      if (!data.items.length && !data.categories.length) {
        box.innerHTML = '<div class="sr-empty">“' + App.escape(q) + '” এর জন্য কিছু পাওয়া যায়নি</div>';
      } else {
        var html = '';
        if (data.categories.length) {
          html += '<div>' + data.categories.map(function (c) {
            return '<a class="sr-cat" href="' + App.escape(c.url) + '"><i class="fa-solid fa-table-cells-large" aria-hidden="true"></i>' + App.escape(c.name) + '</a>';
          }).join('') + '</div>';
        }
        html += data.items.map(function (p) {
          return '<a class="sr-item" role="option" href="' + App.escape(p.url) + '"><img src="' + App.escape(p.image) + '" alt="" width="46" height="46" loading="lazy">' +
            '<span><span class="sr-name">' + App.escape(p.name) + '</span><span class="sr-price">' + App.escape(p.price) + (p.old ? '<del>' + App.escape(p.old) + '</del>' : '') + '</span></span></a>';
        }).join('');
        html += '<a class="sr-all" href="' + App.escape(data.all) + '">সব ফলাফল দেখুন <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>';
        box.innerHTML = html;
      }
      box.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      activeIdx = -1;
    };
    var hide = function () { box.hidden = true; input.setAttribute('aria-expanded', 'false'); };
    var search = App.debounce(function () {
      var q = input.value.trim();
      if (q.length < 2) { hide(); return; }
      if (cache.has(q)) { renderResults(q, cache.get(q)); return; }
      if (ctrl) ctrl.abort();
      ctrl = new AbortController();
      App.get(App.url('/api/search?q=' + encodeURIComponent(q)), { signal: ctrl.signal }).then(function (res) {
        cache.set(q, res.data);
        if (input.value.trim() === q) renderResults(q, res.data);
      }, function () { /* aborted or failed — keep typing */ });
    }, 250);

    input.addEventListener('input', search);
    input.addEventListener('focus', function () { if (input.value.trim().length >= 2 && box.innerHTML) box.hidden = false; });
    input.addEventListener('keydown', function (e) {
      var links = App.$$('a', box);
      if (box.hidden || !links.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = (activeIdx + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links.forEach(function (l, i) { l.classList.toggle('is-active', i === activeIdx); });
        links[activeIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault(); links[activeIdx].click();
      } else if (e.key === 'Escape') hide();
    });
    document.addEventListener('click', function (e) { if (!form.contains(e.target)) hide(); });
    box.addEventListener('click', function (e) { if (e.target.closest('a')) { hide(); closeSearch(); } });
    App.on('route:start', hide);

    var closeSearch = function () { header.classList.remove('is-searching'); };
    App.action('search-open', function () { header.classList.add('is-searching'); setTimeout(function () { input.focus(); }, 30); });
    App.action('search-close', function () { closeSearch(); hide(); });
    form.addEventListener('submit', function () { hide(); closeSearch(); });
  }

  // =============================================================== Tracking bridge
  var T = config.tracking || {};
  var Tracker = App.tracker = {
    pixelLoaded: false,
    initPixel: function () {
      if (!T.pixel || this.pixelLoaded) return;
      this.pixelLoaded = true;
      /* Official Meta Pixel bootstrap, loaded after first paint */
      var f = window, n;
      if (f.fbq) return;
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
      var s = document.createElement('script');
      s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js';
      var nonceEl = document.querySelector('script[nonce]');
      if (nonceEl) s.setAttribute('nonce', nonceEl.nonce || nonceEl.getAttribute('nonce'));
      document.head.appendChild(s);
      window.fbq('init', T.pixel);
    },
    gaMap: { PageView: 'page_view', ViewContent: 'view_item', AddToCart: 'add_to_cart', InitiateCheckout: 'begin_checkout', Purchase: 'purchase' },
    fire: function (evt, opts) {
      if (!evt || !evt.name) return;
      opts = opts || {};
      if (evt.once) {
        if (App.session.get('tr:' + evt.once)) return;
        App.session.set('tr:' + evt.once, 1);
      }
      // Re-rendering a cached page must not reuse the server event_id (that event was already counted).
      var eventId = opts.fromCache ? evt.name.toLowerCase() + '_' + App.uid().replace(/-/g, '').slice(0, 16) : evt.event_id;
      var data = evt.data || {};
      if (T.pixel && (T.meta || {})[evt.name] !== false) {
        Tracker.initPixel();
        if (evt.name === 'PageView') window.fbq('track', 'PageView', {}, { eventID: eventId });
        else window.fbq('track', evt.name, data, { eventID: eventId });
      }
      if (T.gtm) {
        window.dataLayer = window.dataLayer || [];
        var ga = Tracker.gaMap[evt.name];
        if (evt.name === 'PageView') {
          window.dataLayer.push({ event: 'page_view', page_location: location.href, page_title: document.title });
        } else if (ga) {
          window.dataLayer.push({ ecommerce: null });
          window.dataLayer.push({
            event: ga, event_id: eventId,
            ecommerce: {
              currency: data.currency || T.currency, value: data.value,
              transaction_id: data.order_id,
              items: (data.contents || (data.content_ids || []).map(function (id) { return { id: id, quantity: 1 }; })).map(function (c) {
                return { item_id: c.id, quantity: c.quantity || 1, price: c.item_price };
              })
            }
          });
        }
      }
      if (T.ads_id && evt.name === 'Purchase') Tracker.adsConversion(data);
    },
    adsConversion: function (data) {
      var send = function () {
        window.gtag('event', 'conversion', {
          send_to: T.ads_id + (T.ads_label ? '/' + T.ads_label : ''),
          value: data.value, currency: data.currency || T.currency, transaction_id: data.order_id
        });
      };
      if (window.gtag) return send();
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', T.ads_id);
      App.loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(T.ads_id)).then(send, function () {});
    },
    fireAll: function (list, opts) { (list || []).forEach(function (e) { Tracker.fire(e, opts); }); }
  };

  // Initial page events, after load so tracking never competes with LCP.
  window.addEventListener('load', function () {
    var pd = App.$('#page-data');
    var data = {};
    try { data = pd ? JSON.parse(pd.textContent) : {}; } catch (e) { data = {}; }
    setTimeout(function () { Tracker.fireAll(data.track); }, 0);
  });
  App.on('route:change', function (d) { Tracker.fireAll(d.data.track, { fromCache: d.fromCache }); });

  // =============================================================== WhatsApp
  var greet = App.$('[data-wa-greeting]');
  if (greet && !App.session.get('wa-greeted')) {
    setTimeout(function () {
      greet.hidden = false;
      App.session.set('wa-greeted', 1);
      setTimeout(function () { greet.hidden = true; }, 6000);
    }, 7000);
  }
  App.action('wa-click', function () {
    App.post(App.url('/api/analytics/event'), { name: 'whatsapp_click' }, { keepalive: true }).catch(function () {});
  });

  // =============================================================== PWA
  var deferredPrompt = null;
  var banner = App.$('#install-banner');
  if (config.pwa && 'serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(config.sw, { scope: (config.base || '') + '/' }).catch(function () {});
    });
  } else if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (regs) { regs.forEach(function (r) { r.unregister(); }); }).catch(function () {});
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    App.$$('[data-install-item]').forEach(function (b) { b.hidden = false; });
    var dismissed = App.store.get('pwa-dismissed', 0);
    if (banner && Date.now() - dismissed > 7 * 86400000) setTimeout(function () { banner.hidden = false; }, 15000);
  });
  App.action('pwa-install', function () {
    if (!deferredPrompt) { App.toast('ব্রাউজার মেনু থেকে "Add to Home screen" নির্বাচন করুন', 'info'); return; }
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (c) {
      if (c.outcome === 'accepted') App.post(App.url('/api/analytics/event'), { name: 'pwa_install' }).catch(function () {});
      deferredPrompt = null;
      if (banner) banner.hidden = true;
    });
  });
  App.action('pwa-dismiss', function () { App.store.set('pwa-dismissed', Date.now()); if (banner) banner.hidden = true; });
  App.on('route:change', function () { App.$$('[data-install-item]').forEach(function (b) { b.hidden = !deferredPrompt; }); });

  // Online/offline feedback
  window.addEventListener('offline', function () { App.toast('ইন্টারনেট সংযোগ নেই', 'error', { duration: 4000 }); });
  window.addEventListener('online', function () { App.toast('আবার অনলাইনে আছেন', 'success'); });
})(window.App);
