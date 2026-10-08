/* pages/checkout.js — COD checkout: live pricing, delivery zone, privacy-safe autofill,
   client validation (server re-validates everything), duplicate-submit protection. */
(function (App) {
  'use strict';
  var COUPON_KEY = 'ns-coupon';
  var IDEM_KEY = 'ns-checkout-idem';
  var ctrl = null;
  var submitting = false;
  var initiated = false;

  function el(root, sel) { return App.$(sel, root); }
  function val(root, name) { var f = el(root, '[name="' + name + '"]'); return f ? f.value.trim() : ''; }

  function normalizePhone(v) {
    var d = App.en(v).replace(/\D+/g, '');
    if (d.indexOf('880') === 0) d = d.slice(2); else if (d.indexOf('88') === 0 && d.length === 13) d = d.slice(2);
    return /^01[3-9]\d{8}$/.test(d) ? d : null;
  }

  function showError(root, field, msg) {
    var input = el(root, '[name="' + field + '"]');
    var err = el(root, '[data-error-for="' + field + '"]');
    if (input) { input.classList.toggle('is-invalid', !!msg); input.setAttribute('aria-invalid', msg ? 'true' : 'false'); }
    if (err) { err.textContent = msg || ''; err.hidden = !msg; }
  }

  function validate(root) {
    var errors = {};
    var name = val(root, 'name'), phone = val(root, 'phone'), district = val(root, 'district'), address = val(root, 'address');
    if (name.length < 2) errors.name = 'পূর্ণ নাম লিখুন।';
    if (!normalizePhone(phone)) errors.phone = 'সঠিক মোবাইল নাম্বার দিন (যেমন 01XXXXXXXXX)।';
    if (!district) errors.district = 'জেলা নির্বাচন করুন।';
    if (address.length < 8) errors.address = 'পূর্ণ ঠিকানা লিখুন (বাসা/রোড, এলাকা, থানা)।';
    ['name', 'phone', 'district', 'address'].forEach(function (f) { showError(root, f, errors[f]); });
    return errors;
  }

  function renderItems(root, cart) {
    var box = el(root, '[data-co-items]');
    box.innerHTML = cart.lines.filter(function (l) { return l.name; }).map(function (l) {
      var meta = [l.size ? 'সাইজ: ' + l.size : '', l.color ? 'রং: ' + l.color : '', '× ' + App.bn(l.qty)].filter(Boolean).join(' • ');
      return '<div class="co-item' + (l.available ? '' : ' is-error') + '">' +
        '<img src="' + App.escape(l.image) + '" alt="" width="52" height="52" loading="lazy">' +
        '<div><div class="co-item-name">' + App.escape(l.name) + '</div><div class="co-item-meta">' + App.escape(l.available ? meta : (l.message || '')) + '</div></div>' +
        '<div class="co-item-price">' + (l.available ? App.escape(l.line_total_text) : '') + '</div></div>';
    }).join('');
  }

  function price(root) {
    var items = App.cart.payload();
    if (!items.length) {
      el(root, '[data-checkout-form]').hidden = true;
      el(root, '[data-cart-empty]').hidden = false;
      return;
    }
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    var body = { items: items, coupon: App.session.get(COUPON_KEY, ''), district: val(root, 'district'), phone: val(root, 'phone') };
    var wrap = el(root, '[data-checkout]');
    if (!initiated && wrap) body.initiate_checkout = wrap.getAttribute('data-event-id');
    App.post(App.url('/api/cart/price'), body, { signal: ctrl.signal }).then(function (res) {
      var cart = res.data.cart;
      if (res.data.track) { initiated = true; App.tracker && App.tracker.fire(res.data.track); }
      renderItems(root, cart);
      var set = function (k, v) { var x = el(root, '[data-t="' + k + '"]'); if (x) x.textContent = v; };
      set('subtotal', cart.subtotal_text);
      set('delivery', cart.delivery_text);
      set('discount', '− ' + cart.discount_text);
      set('total', cart.total_text);
      var dr = el(root, '[data-discount-row]'); if (dr) dr.hidden = !(cart.discount > 0);
      App.$$('[data-zone]', root).forEach(function (z) { z.classList.toggle('is-active', z.getAttribute('data-zone') === cart.delivery_zone); });
      var msg = el(root, '[data-coupon-msg]');
      if (msg) {
        if (cart.coupon) { msg.hidden = false; msg.className = 'coupon-msg small is-ok'; msg.textContent = 'কুপন প্রয়োগ হয়েছে: ' + cart.coupon.code + ' (' + cart.coupon.label + ')'; }
        else if (cart.coupon_error && body.coupon) { msg.hidden = false; msg.className = 'coupon-msg small'; msg.textContent = cart.coupon_error; }
        else msg.hidden = true;
      }
      var alert = el(root, '[data-form-alert]');
      if (cart.errors && cart.errors.length) { alert.hidden = false; alert.textContent = cart.errors.join(' '); }
      else if (!submitting) alert.hidden = true;
    }, function (err) {
      if (err && err.name === 'AbortError') return;
      App.toast(err.message, 'error');
    });
  }

  var reprice = App.debounce(function () { var r = App.$('[data-checkout]'); if (r) price(r); }, 250);

  // Autofill: the server only answers for customers already linked to this browser.
  var lookup = App.debounce(function (root, by) {
    var phone = normalizePhone(val(root, 'phone'));
    var name = val(root, 'name');
    if (by === 'phone' && !phone) return;
    if (by === 'name' && name.length < 3) return;
    App.post(App.url('/api/checkout/lookup'), by === 'phone' ? { phone: phone } : { name: name }).then(function (res) {
      var d = res.data;
      if (!d.found) return;
      var filled = false;
      [['name', d.name], ['phone', d.phone], ['district', d.district], ['address', d.address]].forEach(function (pair) {
        var f = el(root, '[name="' + pair[0] + '"]');
        if (f && pair[1] && !f.value.trim()) { f.value = pair[1]; filled = true; showError(root, pair[0], null); }
      });
      if (filled) { App.toast('আগের অর্ডারের তথ্য পূরণ করা হয়েছে', 'info'); reprice(); }
    }, function () { /* silent */ });
  }, 400);

  App.delegate('input', '[data-checkout-form] [data-lookup]', function (input) {
    var root = input.closest('[data-checkout]');
    showError(root, input.name, null);
    lookup(root, input.getAttribute('data-lookup'));
  });
  App.delegate('change', '[data-checkout-form] [data-district]', function (s) { showError(s.closest('[data-checkout]'), 'district', null); reprice(); });
  App.delegate('input', '[data-checkout-form] textarea[name="address"]', function (t) { showError(t.closest('[data-checkout]'), 'address', null); });
  App.delegate('focusout', '[data-checkout-form] [name="phone"]', function (input) {
    var p = normalizePhone(input.value);
    if (p) input.value = p;
    else if (input.value.trim()) showError(input.closest('[data-checkout]'), 'phone', 'সঠিক মোবাইল নাম্বার দিন (যেমন 01XXXXXXXXX)।');
  });

  App.action('apply-coupon', function (btn) {
    var root = btn.closest('[data-checkout]');
    App.session.set(COUPON_KEY, (val(root, 'coupon') || '').toUpperCase());
    price(root);
  });

  App.delegate('submit', '[data-checkout-form]', function (form, e) {
    e.preventDefault();
    if (submitting) return;
    var root = form.closest('[data-checkout]');
    var errors = validate(root);
    var alert = el(root, '[data-form-alert]');
    if (Object.keys(errors).length) {
      var first = el(root, '.is-invalid');
      if (first) { first.focus(); first.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return;
    }
    var btn = el(root, '[data-submit]');
    submitting = true;
    alert.hidden = true;
    App.loading(btn, true, 'অর্ডার প্রসেস হচ্ছে...');
    var idem = App.session.get(IDEM_KEY, '');
    if (!idem) { idem = App.uid(); App.session.set(IDEM_KEY, idem); }

    App.post(App.url('/api/checkout/place'), {
      name: val(root, 'name'), phone: normalizePhone(val(root, 'phone')), district: val(root, 'district'),
      address: val(root, 'address'), note: val(root, 'note'),
      coupon: App.session.get(COUPON_KEY, ''), items: App.cart.payload(), idempotency_key: idem
    }).then(function (res) {
      var d = res.data;
      if (d.track && App.tracker) App.tracker.fire(d.track);
      App.cart.clear();
      App.session.remove(COUPON_KEY);
      App.session.remove(IDEM_KEY);
      if (App.router) App.router.navigate(d.redirect, { replace: true }); else location.href = d.redirect;
    }, function (err) {
      submitting = false;
      App.loading(btn, false);
      if (err.data && err.data.errors) Object.keys(err.data.errors).forEach(function (f) { showError(root, f, err.data.errors[f]); });
      alert.hidden = false;
      alert.textContent = err.message;
      alert.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // A rejected order may be retried with corrected data under a new key.
      if (err.status === 422 || err.status === 429) App.session.remove(IDEM_KEY);
    });
  });

  App.page('checkout', {
    mount: function (root) {
      submitting = false;
      initiated = false;
      var coupon = el(root, '[data-coupon-input]');
      if (coupon) coupon.value = App.session.get(COUPON_KEY, '');
      price(root);
      return function () { if (ctrl) ctrl.abort(); };
    }
  });
})(window.App);
