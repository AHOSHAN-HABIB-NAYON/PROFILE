/* pages/cart.js — renders the browser cart using server pricing (/api/cart/price) */
(function (App) {
  'use strict';
  var COUPON_KEY = 'ns-coupon';
  var ctrl = null;

  function lineHtml(l) {
    var key = App.escape(l.key);
    if (!l.available && !l.name) return '';
    var meta = [l.size ? 'সাইজ: ' + l.size : '', l.color ? 'রং: ' + l.color : ''].filter(Boolean).join(' • ');
    return '<div class="cart-line" data-line="' + key + '">' +
      '<a href="' + App.escape(l.url) + '"><img class="cart-line-img" src="' + App.escape(l.image) + '" alt="" width="76" height="76" loading="lazy"></a>' +
      '<div class="cart-line-body">' +
        '<a class="cart-line-name" href="' + App.escape(l.url) + '">' + App.escape(l.name) + '</a>' +
        (meta ? '<span class="cart-line-meta">' + App.escape(meta) + '</span>' : '') +
        (l.available ? '<span class="price">' + App.escape(l.unit_price_text) + (l.old_price_text ? ' <del class="old-price">' + App.escape(l.old_price_text) + '</del>' : '') + '</span>' : '') +
        (l.message ? '<span class="cart-line-msg' + (l.available ? '' : ' is-error') + '">' + App.escape(l.message) + '</span>' : '') +
        '<div class="cart-line-foot">' +
          (l.available ? '<div class="qty" role="group" aria-label="পরিমাণ">' +
            '<button type="button" class="qty-btn" data-action="cart-dec" data-key="' + key + '" aria-label="কমান"><i class="fa-solid fa-minus" aria-hidden="true"></i></button>' +
            '<input class="qty-input" type="number" inputmode="numeric" min="1" max="' + (l.max_qty || 20) + '" value="' + l.qty + '" data-cart-qty="' + key + '" aria-label="পরিমাণ">' +
            '<button type="button" class="qty-btn" data-action="cart-inc" data-key="' + key + '" aria-label="বাড়ান"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>' +
          '</div><span class="cart-line-total">' + App.escape(l.line_total_text) + '</span>' : '') +
          '<button type="button" class="icon-btn cart-remove" data-action="cart-remove" data-key="' + key + '" aria-label="মুছে ফেলুন"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>' +
        '</div>' +
      '</div></div>';
  }

  function setTotals(root, cart) {
    var set = function (k, v) { var el = App.$('[data-t="' + k + '"]', root); if (el) el.textContent = v; };
    set('subtotal', cart.subtotal_text);
    set('total', cart.total_text);
    set('discount', '− ' + cart.discount_text);
    if (cart.delivery_zone || cart.delivery_free) set('delivery', cart.delivery_text);
    var dr = App.$('[data-discount-row]', root); if (dr) dr.hidden = !(cart.discount > 0);
    var msg = App.$('[data-coupon-msg]', root);
    if (msg) {
      if (cart.coupon) { msg.hidden = false; msg.className = 'coupon-msg small is-ok'; msg.textContent = 'কুপন প্রয়োগ হয়েছে: ' + cart.coupon.code + ' (' + cart.coupon.label + ')'; }
      else if (cart.coupon_error && App.session.get(COUPON_KEY, '')) { msg.hidden = false; msg.className = 'coupon-msg small'; msg.textContent = cart.coupon_error; }
      else msg.hidden = true;
    }
  }

  function load(root) {
    var items = App.cart.payload();
    var filled = App.$('[data-cart-filled]', root), empty = App.$('[data-cart-empty]', root);
    if (!items.length) { filled.hidden = true; empty.hidden = false; return; }
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    App.post(App.url('/api/cart/price'), { items: items, coupon: App.session.get(COUPON_KEY, '') }, { signal: ctrl.signal }).then(function (res) {
      var cart = res.data.cart;
      // Drop lines the server no longer recognises (deleted products).
      var known = cart.lines.filter(function (l) { return l.name; }).map(function (l) { return l.key; });
      var stale = App.cart.items().filter(function (i) { return known.indexOf(App.cart.keyOf(i)) === -1; });
      if (stale.length) App.cart.save(App.cart.items().filter(function (i) { return known.indexOf(App.cart.keyOf(i)) !== -1; }));
      // Server may clamp quantities to stock.
      cart.lines.forEach(function (l) {
        var it = App.cart.items().filter(function (i) { return App.cart.keyOf(i) === l.key; })[0];
        if (it && l.available && it.qty !== l.qty) App.cart.setQty(l.key, l.qty);
      });
      if (!cart.lines.some(function (l) { return l.name; })) { filled.hidden = true; empty.hidden = false; return; }
      filled.hidden = false; empty.hidden = true;
      App.$('[data-cart-lines]', root).innerHTML = cart.lines.map(lineHtml).join('');
      setTotals(root, cart);
      var btn = App.$('[data-checkout-btn]', root);
      if (btn) btn.classList.toggle('is-disabled', cart.item_count === 0);
    }, function (err) {
      if (err && err.name === 'AbortError') return;
      App.toast(err.message, 'error');
    });
  }

  var reprice = App.debounce(function () { var root = App.$('[data-cart-page]'); if (root) load(root); }, 300);

  function qtyOf(key) {
    var it = App.cart.items().filter(function (i) { return App.cart.keyOf(i) === key; })[0];
    return it ? it.qty : 1;
  }
  App.action('cart-inc', function (b) { var k = b.getAttribute('data-key'); var input = App.$('[data-cart-qty="' + k + '"]'); var max = input ? Number(input.max) : 20; App.cart.setQty(k, Math.min(max, qtyOf(k) + 1)); if (input) input.value = Math.min(max, qtyOf(k)); reprice(); });
  App.action('cart-dec', function (b) { var k = b.getAttribute('data-key'); App.cart.setQty(k, Math.max(1, qtyOf(k) - 1)); var input = App.$('[data-cart-qty="' + k + '"]'); if (input) input.value = qtyOf(k); reprice(); });
  App.action('cart-remove', function (b) {
    var k = b.getAttribute('data-key');
    var removed = App.cart.items().filter(function (i) { return App.cart.keyOf(i) === k; })[0];
    var row = b.closest('.cart-line');
    if (row) row.classList.add('is-removing');
    setTimeout(function () {
      App.cart.remove(k);
      reprice();
      App.toast('পণ্যটি সরানো হয়েছে', 'info', { actionText: 'ফিরিয়ে আনুন', onAction: function () { if (removed) { App.cart.add(removed); reprice(); } } });
    }, 200);
  });
  App.delegate('change', '[data-cart-qty]', function (input) {
    var v = parseInt(App.en(input.value), 10) || 1;
    App.cart.setQty(input.getAttribute('data-cart-qty'), Math.max(1, Math.min(Number(input.max) || 20, v)));
    reprice();
  });
  App.delegate('submit', '[data-coupon-form]', function (form, e) {
    e.preventDefault();
    var code = (App.$('[data-coupon-input]', form).value || '').trim().toUpperCase();
    App.session.set(COUPON_KEY, code);
    reprice();
  });

  App.page('cart', {
    mount: function (root) {
      var input = App.$('[data-coupon-input]', root);
      if (input) input.value = App.session.get(COUPON_KEY, '');
      load(root);
      return function () { if (ctrl) ctrl.abort(); };
    }
  });
})(window.App);
