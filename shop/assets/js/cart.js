/* cart.js — add to cart (delegated once), badge, cart page interactions. */
(function () {
  'use strict';
  const App = window.App;

  function setCount(n) {
    document.querySelectorAll('[data-cart-count]').forEach((b) => {
      b.textContent = App.bn(n);
      b.hidden = !n;
      b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
    });
  }

  async function add(payload, btn, buyNow) {
    if (btn) btn.classList.add('loading');
    const r = await App.ajax.post('/api/cart/add', payload);
    if (btn) btn.classList.remove('loading');
    if (!r.success) {
      App.ui.toast(r.message, 'error');
      return r;
    }
    setCount(r.data.count);
    if (App.track && r.data.track) App.track.addToCart(r.data.track);
    if (buyNow) {
      App.router.navigate('/checkout');
    } else {
      App.ui.flyToCart(btn);
      App.ui.toast(r.message, 'success', { action: { text: 'কার্ট দেখুন', href: '/cart' } });
    }
    return r;
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add-cart]');
    if (!btn) return;
    e.preventDefault();
    add({ id: Number(btn.dataset.addCart), type: btn.dataset.type || 'product', qty: 1 }, btn, btn.hasAttribute('data-buy-now'));
  });

  /* ---- Cart page ---- */
  App.pages = App.pages || {};
  App.pages.cart = {
    init(root, signal) {
      const box = root.querySelector('[data-cart-root]');
      if (!box) return;
      const apply = (r) => {
        if (r.data && r.data.html !== undefined) { box.innerHTML = r.data.html; App.lazy.observe(box); setCount(r.data.count); }
        if (r.message) App.ui.toast(r.message, r.success ? 'success' : 'error');
      };
      box.addEventListener('click', async (e) => {
        const line = e.target.closest('.cart-line');
        if (e.target.closest('[data-coupon-remove]')) {
          apply(await App.ajax.post('/api/cart/coupon', { remove: 1 }));
          return;
        }
        if (!line) return;
        const key = line.dataset.key;
        const qtyEl = line.querySelector('[data-qty]');
        const current = Number((qtyEl.textContent || '1').replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d)));
        if (e.target.closest('[data-remove]')) {
          line.classList.add('removing');
          const r = await App.ajax.post('/api/cart/remove', { key });
          setTimeout(() => apply(r), 180);
        } else if (e.target.closest('[data-qty-inc]') || e.target.closest('[data-qty-dec]')) {
          const next = current + (e.target.closest('[data-qty-inc]') ? 1 : -1);
          if (next < 1) return;
          line.classList.add('busy');
          const r = await App.ajax.post('/api/cart/update', { key, qty: next });
          apply(r.success ? Object.assign(r, { message: '' }) : r);
        }
      }, { signal });
      box.addEventListener('submit', async (e) => {
        if (!e.target.matches('[data-coupon-form]')) return;
        e.preventDefault();
        const code = e.target.code.value.trim();
        if (!code) { App.ui.toast('কুপন কোড লিখুন।', 'error'); return; }
        const btn = e.target.querySelector('button[type=submit]');
        btn && btn.classList.add('loading');
        const r = await App.ajax.post('/api/cart/coupon', { code });
        btn && btn.classList.remove('loading');
        apply(r);
      }, { signal });
    },
  };

  App.cart = { add, setCount };
})();
