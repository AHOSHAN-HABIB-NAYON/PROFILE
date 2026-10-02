/* product.js — gallery, size, quantity, buy now, sticky CTA, share; home slider. */
(function () {
  'use strict';
  const App = window.App;
  App.pages = App.pages || {};

  function slider(root, signal) {
    const el = root.querySelector('[data-slider]');
    if (!el) return;
    const track = el.querySelector('.slides');
    const dots = [...el.querySelectorAll('.dots button')];
    if (dots.length < 2) return;
    let idx = 0;
    let paused = false;
    const go = (i) => { idx = (i + dots.length) % dots.length; track.scrollTo({ left: track.clientWidth * idx, behavior: 'smooth' }); };
    dots.forEach((d, i) => d.addEventListener('click', () => go(i), { signal }));
    let raf = 0;
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        idx = Math.round(track.scrollLeft / track.clientWidth);
        dots.forEach((d, i) => d.classList.toggle('active', i === idx));
      });
    }, { passive: true, signal });
    ['pointerdown', 'touchstart', 'mouseenter'].forEach((ev) => el.addEventListener(ev, () => (paused = true), { passive: true, signal }));
    ['mouseleave', 'touchend'].forEach((ev) => el.addEventListener(ev, () => setTimeout(() => (paused = false), 3000), { passive: true, signal }));
    const timer = setInterval(() => { if (!paused && !document.hidden) go(idx + 1); }, 5000);
    signal.addEventListener('abort', () => clearInterval(timer));
  }

  App.pages.home = { init: slider };

  App.pages.product = {
    init(root, signal) {
      const pid = Number(root.dataset.product);
      if (App.track) App.track.viewContent({ event_id: root.dataset.eventId, id: String(pid), value: Number(root.dataset.price), name: root.dataset.name });

      /* Gallery */
      const track = root.querySelector('[data-gallery-track]');
      const thumbs = [...root.querySelectorAll('[data-thumb]')];
      if (track && thumbs.length) {
        thumbs.forEach((t) => t.addEventListener('click', () => track.scrollTo({ left: track.clientWidth * Number(t.dataset.thumb), behavior: 'smooth' }), { signal }));
        let raf = 0;
        track.addEventListener('scroll', () => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            const i = Math.round(track.scrollLeft / track.clientWidth);
            thumbs.forEach((t, n) => t.classList.toggle('active', n === i));
          });
        }, { passive: true, signal });
      }

      /* Quantity */
      const form = root.querySelector('[data-buy-form]');
      if (!form) return;
      const qty = form.querySelector('[data-qty-input]');
      form.addEventListener('click', (e) => {
        if (!qty) return;
        const max = Number(qty.max) || 20;
        if (e.target.closest('[data-qty-inc]')) qty.value = Math.min(max, Number(qty.value || 1) + 1);
        if (e.target.closest('[data-qty-dec]')) qty.value = Math.max(1, Number(qty.value || 1) - 1);
      }, { signal });

      const picker = form.querySelector('.size-picker');
      const sizeErr = form.querySelector('[data-error="size"]');
      form.addEventListener('change', (e) => { if (e.target.name === 'size' && sizeErr) sizeErr.hidden = true; }, { signal });
      const payload = () => {
        const size = form.querySelector('input[name="size"]:checked');
        if (picker && !size) {
          sizeErr.textContent = 'দয়া করে সাইজ নির্বাচন করুন।';
          sizeErr.hidden = false;
          picker.classList.remove('shake'); void picker.offsetWidth; picker.classList.add('shake');
          picker.scrollIntoView({ behavior: 'smooth', block: 'center' });
          App.ui.toast('দয়া করে সাইজ নির্বাচন করুন।', 'error');
          return null;
        }
        return { id: pid, type: 'product', size: size ? size.value : '', qty: Math.max(1, Number(qty ? qty.value : 1)) };
      };
      const addBtn = form.querySelector('[data-pd-add]');
      if (addBtn) addBtn.addEventListener('click', () => { const p = payload(); if (p) App.cart.add(p, addBtn, false); }, { signal });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const p = payload();
        if (p) App.cart.add(p, form.querySelector('[type=submit]'), true);
      }, { signal });

      /* Sticky mobile CTA when the buy box is off-screen */
      const sticky = root.querySelector('.sticky-buy');
      if (sticky && 'IntersectionObserver' in window) {
        const io = new IntersectionObserver(([en]) => {
          const show = !en.isIntersecting && en.boundingClientRect.top < 0;
          sticky.classList.toggle('show', show);
          document.body.classList.toggle('has-sticky', show);
        });
        io.observe(form);
        signal.addEventListener('abort', () => { io.disconnect(); document.body.classList.remove('has-sticky'); });
        sticky.querySelector('[data-sticky-order]').addEventListener('click', () => {
          if (picker && !form.querySelector('input[name="size"]:checked')) { payload(); return; }
          form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
        }, { signal });
      }

      /* Native share where available */
      const share = root.querySelector('[data-share]');
      if (share && navigator.share) {
        share.hidden = false;
        share.addEventListener('click', () => navigator.share({ title: share.dataset.title, text: share.dataset.text, url: share.dataset.url }).catch(() => {}), { signal });
      }
    },
  };
})();
