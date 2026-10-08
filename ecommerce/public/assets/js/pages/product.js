/* pages/product.js — gallery, variant selection (size/color), quantity, add-to-cart / order-now, related products */
(function (App) {
  'use strict';

  function state(root) {
    var el = App.$('[data-product-json]', root);
    var data = {};
    try { data = el ? JSON.parse(el.textContent) : {}; } catch (e) { data = {}; }
    return data;
  }

  function selected(root, name) {
    var c = App.$('input[name="' + name + '"]:checked', root);
    return c ? c.value : '';
  }

  function findVariant(p, size, color) {
    return (p.variants || []).filter(function (v) { return v.size === size && v.color === color; })[0] || null;
  }

  /** Update price/stock line and disable unavailable combinations. */
  function refresh(root) {
    var p = state(root);
    if (!p.id) return;
    var size = selected(root, 'size'), color = selected(root, 'color');
    var needSize = (p.sizes || []).length > 0, needColor = (p.colors || []).length > 0;
    if ((p.variants || []).length) {
      App.$$('input[name="size"]', root).forEach(function (inp) {
        var ok = (p.variants || []).some(function (v) { return v.size === inp.value && (!needColor || !color || v.color === color) && (!p.track || v.stock > 0); });
        inp.closest('.opt-chip').classList.toggle('is-unavailable', !ok);
      });
      App.$$('input[name="color"]', root).forEach(function (inp) {
        var ok = (p.variants || []).some(function (v) { return v.color === inp.value && (!needSize || !size || v.size === size) && (!p.track || v.stock > 0); });
        inp.closest('.opt-chip').classList.toggle('is-unavailable', !ok);
      });
    }
    var v = (!needSize || size) && (!needColor || color) ? findVariant(p, size, color) : null;
    var priceEl = App.$('[data-price]', root);
    if (priceEl) priceEl.textContent = App.money(v && v.price != null ? v.price : p.price);
    var line = App.$('[data-stock-line]', root);
    if (line && v && p.track) {
      line.innerHTML = v.stock > 0
        ? '<span class="stock ' + (v.stock <= 5 ? 'stock-low' : 'stock-in') + '"><i class="fa-solid ' + (v.stock <= 5 ? 'fa-fire' : 'fa-circle-check') + '" aria-hidden="true"></i> ' + (v.stock <= 5 ? 'মাত্র ' + App.bn(v.stock) + 'টি বাকি' : 'স্টকে আছে') + '</span>'
        : '<span class="stock stock-out"><i class="fa-solid fa-circle-xmark" aria-hidden="true"></i> এই অপশনটি স্টকে নেই</span>';
    }
    var qty = App.$('[data-qty]', root);
    if (qty && v && p.track) qty.max = Math.max(1, Math.min(20, v.stock));
  }

  /** Validate required options; returns the cart item or null (and shows errors). */
  function collect(root) {
    var p = state(root);
    var item = { product_id: p.id, size: selected(root, 'size'), color: selected(root, 'color'), qty: Math.max(1, parseInt(App.en((App.$('[data-qty]', root) || {}).value || '1'), 10) || 1) };
    var ok = true;
    [['size', (p.sizes || []).length], ['color', (p.colors || []).length]].forEach(function (pair) {
      var group = App.$('[data-opt="' + pair[0] + '"]', root);
      var err = App.$('[data-error-for="' + pair[0] + '"]', root);
      var missing = pair[1] > 0 && !item[pair[0]];
      if (group) {
        group.classList.toggle('has-error', missing);
        if (missing) { group.classList.remove('shake'); void group.offsetWidth; group.classList.add('shake'); }
      }
      if (err) err.hidden = !missing;
      if (missing) ok = false;
    });
    if (!ok) {
      var first = App.$('.opt-group.has-error', root);
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      App.toast(!item.size && (p.sizes || []).length ? 'সাইজ নির্বাচন করুন' : 'রং নির্বাচন করুন', 'error');
      return null;
    }
    if (p.track && (p.variants || []).length) {
      var v = findVariant(p, item.size, item.color);
      if (v && v.stock <= 0) { App.toast('এই অপশনটি স্টকে নেই', 'error'); return null; }
    }
    return item;
  }

  App.action('qty-inc', function (btn) {
    var input = btn.parentNode.querySelector('[data-qty]');
    if (!input) return;
    input.value = Math.min(Number(input.max) || 20, (parseInt(input.value, 10) || 1) + 1);
  });
  App.action('qty-dec', function (btn) {
    var input = btn.parentNode.querySelector('[data-qty]');
    if (!input) return;
    input.value = Math.max(1, (parseInt(input.value, 10) || 1) - 1);
  });

  App.action('pd-add', function (btn) {
    var root = btn.closest('[data-product-form]');
    var item = collect(root);
    if (!item) return;
    App.loading(btn, true);
    App.addToCart(item, btn).then(function () {
      App.loading(btn, false);
      App.toast('কার্টে যোগ হয়েছে', 'success', { actionText: 'কার্ট দেখুন', onAction: function () { App.router.navigate(App.url('/cart')); } });
    }, function (err) { App.loading(btn, false); App.toast(err.message, 'error'); });
  });

  App.action('pd-buy', function (btn) {
    var root = btn.closest('[data-product-form]');
    var item = collect(root);
    if (!item) return;
    App.loading(btn, true);
    App.addToCart(item, btn).then(function () {
      App.loading(btn, false);
      App.router ? App.router.navigate(App.url('/checkout')) : (location.href = App.url('/checkout'));
    }, function (err) { App.loading(btn, false); App.toast(err.message, 'error'); });
  });

  App.action('gallery-go', function (btn) {
    var track = App.$('[data-gallery-track]');
    if (!track) return;
    var i = Number(btn.getAttribute('data-index')) || 0;
    track.scrollTo({ left: track.clientWidth * i, behavior: 'smooth' });
  });

  App.action('play-video', function (btn) {
    var id = btn.getAttribute('data-video');
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
    var iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
    iframe.title = 'Product video';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.loading = 'lazy';
    btn.replaceWith(iframe);
  });

  App.delegate('change', '[data-product-form] input[type="radio"]', function (el) {
    var root = el.closest('[data-product-form]');
    var group = el.closest('.opt-group');
    if (group) {
      group.classList.remove('has-error');
      var err = App.$('.field-error', group); if (err) err.hidden = true;
    }
    refresh(root);
  });

  function loadRelated(root) {
    var section = App.$('[data-related]', root);
    if (!section) return null;
    var done = false;
    var load = function () {
      if (done) return; done = true;
      App.get(section.getAttribute('data-src')).then(function (res) {
        var grid = App.$('[data-related-grid]', section);
        if (!res.data.html) { section.remove(); return; }
        grid.innerHTML = res.data.html;
      }, function () { section.remove(); });
    };
    if (!('IntersectionObserver' in window)) { load(); return null; }
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); load(); } }, { rootMargin: '400px' });
    io.observe(section);
    return function () { io.disconnect(); };
  }

  App.page('product', {
    mount: function (root) {
      refresh(root);
      var stopRelated = loadRelated(root);
      var track = App.$('[data-gallery-track]', root);
      var thumbs = App.$$('.thumb', root);
      var onScroll = App.throttle(function () {
        var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        thumbs.forEach(function (t, n) { t.classList.toggle('is-active', n === i); });
      }, 80);
      if (track && thumbs.length) track.addEventListener('scroll', onScroll, { passive: true });
      return function () { if (stopRelated) stopRelated(); };
    }
  });
})(window.App);
