/* app.js — boot. Loaded once; everything else is driven by the router. */
(function () {
  'use strict';
  const App = window.App;

  document.querySelectorAll('img[loading="lazy"]').forEach((img) => { if (img.complete) img.classList.add('loaded'); });
  document.documentElement.classList.add('js');

  // Global delegated helpers (bound once → no duplicates across navigations).
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) { e.preventDefault(); App.ui.copy(c.dataset.copy); }
  });
  // Material-like ripple feedback on buttons (transform/opacity only).
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.btn');
    if (!b || b.disabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = b.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 1.2;
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.width = span.style.height = size + 'px';
    span.style.left = e.clientX - r.left - size / 2 + 'px';
    span.style.top = e.clientY - r.top - size / 2 + 'px';
    b.appendChild(span);
    span.addEventListener('animationend', () => span.remove(), { once: true });
  }, { passive: true });
  window.addEventListener('online', () => App.ui.toast('ইন্টারনেট সংযোগ ফিরে এসেছে', 'success'));
  window.addEventListener('offline', () => App.ui.toast('ইন্টারনেট সংযোগ নেই', 'error'));

  App.nav && App.nav.init();
  App.router.start();
})();
