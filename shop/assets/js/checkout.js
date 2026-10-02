/* checkout.js — guest checkout (no login), returning-customer autofill, live delivery quote, courier animation. */
(function () {
  'use strict';
  const App = window.App;
  App.pages = App.pages || {};
  const PROFILE_KEY = 'shop_profiles';
  const MSG = {
    name: 'দয়া করে আপনার নাম লিখুন।',
    phone: 'সঠিক ফোন নম্বর দিন।',
    district: 'দয়া করে আপনার জেলার নাম লিখুন।',
    address: 'দয়া করে পূর্ণ ঠিকানা লিখুন (গ্রাম/রোড, থানা সহ)।',
  };

  const toEn = (s) => String(s || '').replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d));
  function normPhone(v) {
    let p = toEn(v).replace(/[\s\-()]/g, '');
    if (p.startsWith('+880')) p = p.slice(3); else if (p.startsWith('880')) p = p.slice(2);
    return /^01[3-9]\d{8}$/.test(p) ? p : null;
  }
  function profiles() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveProfile(p) {
    try {
      const list = profiles().filter((x) => x.phone !== p.phone);
      list.unshift(p);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(list.slice(0, 3)));
    } catch (e) { /* storage unavailable */ }
  }

  App.pages.checkout = {
    init(root, signal) {
      const form = root.querySelector('[data-checkout-form]');
      if (!form) return;
      if (App.track) App.track.initiateCheckout({ event_id: root.dataset.eventId, value: Number(root.dataset.value), num_items: Number(root.dataset.items) });
      const f = (n) => form.elements[n];
      const summary = root.querySelector('[data-checkout-summary]');
      const hint = root.querySelector('[data-lookup-hint]');
      const setErr = (name, msg) => {
        const el = form.querySelector('[data-error="' + name + '"]');
        const field = f(name) && f(name).closest('.field');
        if (el) { el.textContent = msg || ''; el.hidden = !msg; }
        if (field) field.classList.toggle('invalid', !!msg);
      };
      const fillIfEmpty = (data, force) => {
        ['name', 'district', 'address'].forEach((k) => { if (data[k] && (force || !f(k).value.trim())) f(k).value = data[k]; });
      };

      /* Local (same device) profiles → name suggestions + instant fill */
      const list = profiles();
      const dl = root.querySelector('#co-name-list');
      if (dl) dl.innerHTML = list.map((p) => '<option></option>').join('');
      if (dl) [...dl.options].forEach((o, i) => (o.value = list[i].name));
      if (list.length && !f('phone').value) {
        hint.textContent = 'আগের অর্ডারের তথ্য পাওয়া গেছে — ফোন নম্বর বা নাম লিখলে স্বয়ংক্রিয়ভাবে পূরণ হবে।';
        hint.hidden = false;
      }
      f('name').addEventListener('change', () => {
        const p = list.find((x) => x.name === f('name').value.trim());
        if (p) { f('phone').value = p.phone; fillIfEmpty(p); quote(); }
      }, { signal });

      /* Phone → previous order suggestion (server only returns address to the same device) */
      let lastLookup = '';
      f('phone').addEventListener('input', async () => {
        const phone = normPhone(f('phone').value);
        setErr('phone', '');
        if (!phone || phone === lastLookup) return;
        lastLookup = phone;
        const local = list.find((x) => x.phone === phone);
        if (local) { fillIfEmpty(local); showHint(); quote(); return; }
        const r = await App.ajax.get('/api/customer-lookup?phone=' + phone);
        if (r.success && r.data) { fillIfEmpty(r.data); showHint(); quote(); }
      }, { signal });
      function showHint() {
        hint.textContent = 'আগের অর্ডার থেকে তথ্য পূরণ করা হয়েছে — প্রয়োজনে পরিবর্তন করুন।';
        hint.classList.add('suggest');
        hint.hidden = false;
      }

      /* District → live delivery charge (debounced) */
      let qt = null;
      let qctrl = null;
      async function quote() {
        if (qctrl) qctrl.abort();
        qctrl = new AbortController();
        try {
          const r = await App.ajax.get('/api/checkout/quote?district=' + encodeURIComponent(f('district').value.trim()), { signal: qctrl.signal });
          if (r.success && summary) { summary.innerHTML = r.data.html; App.lazy.observe(summary); }
        } catch (e) { /* aborted */ }
      }
      f('district').addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(quote, 380); setErr('district', ''); }, { signal });
      ['name', 'address', 'note'].forEach((n) => f(n).addEventListener('input', () => setErr(n, ''), { signal }));
      if (f('district').value) quote();

      /* Coupon */
      const cbtn = root.querySelector('[data-apply-coupon]');
      if (cbtn) cbtn.addEventListener('click', async () => {
        const code = root.querySelector('[name="coupon"]').value.trim();
        cbtn.classList.add('loading');
        const r = await App.ajax.post('/api/cart/coupon', code ? { code } : { remove: 1 });
        cbtn.classList.remove('loading');
        App.ui.toast(r.message, r.success ? 'success' : 'error');
        quote();
      }, { signal });

      /* Submit */
      const submit = form.querySelector('[data-submit]');
      let busy = false;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (busy) return; // double-click protection (server also enforces idempotency)
        const errs = {};
        const name = f('name').value.trim();
        const phone = normPhone(f('phone').value);
        if (name.length < 2) errs.name = MSG.name;
        if (!phone) errs.phone = MSG.phone;
        if (f('district').value.trim().length < 2) errs.district = MSG.district;
        if (f('address').value.trim().length < 10) errs.address = MSG.address;
        ['name', 'phone', 'district', 'address'].forEach((k) => setErr(k, errs[k]));
        const first = Object.keys(errs)[0];
        if (first) { f(first).focus(); App.ui.toast(errs[first], 'error'); return; }

        busy = true;
        submit.classList.add('loading');
        const anim = App.ui.courier('আপনার অর্ডার প্রসেস হচ্ছে…');
        const body = {};
        new FormData(form).forEach((v, k) => (body[k] = v));
        body.phone = phone;
        const [r] = await Promise.all([App.ajax.post('/api/checkout', body), anim.done]);
        if (r.success) {
          saveProfile({ name, phone, district: f('district').value.trim(), address: f('address').value.trim() });
          try { sessionStorage.setItem('purchase:' + r.data.order_code, JSON.stringify(r.data.track)); } catch (err) { /* ignore */ }
          App.cart.setCount(0);
          await App.router.navigate(r.redirect, { replace: true });
          anim.remove();
        } else {
          anim.remove();
          busy = false;
          submit.classList.remove('loading');
          Object.keys(r.errors || {}).forEach((k) => setErr(k, r.errors[k]));
          App.ui.toast(r.message, 'error', { duration: 4500 });
          if (r.status === 422 && !Object.keys(r.errors || {}).length) quote();
        }
      }, { signal });
    },
  };

  App.pages.success = {
    init(root) {
      const code = root.dataset.order;
      let track = null;
      try { track = JSON.parse(sessionStorage.getItem('purchase:' + code) || 'null'); } catch (e) { /* ignore */ }
      if (track && App.track) {
        App.track.purchase(track);
        try { sessionStorage.removeItem('purchase:' + code); } catch (e) { /* fire once */ }
      }
    },
  };
})();
