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
  window.addEventListener('online', () => App.ui.toast('ইন্টারনেট সংযোগ ফিরে এসেছে', 'success'));
  window.addEventListener('offline', () => App.ui.toast('ইন্টারনেট সংযোগ নেই', 'error'));

  App.nav && App.nav.init();
  App.router.start();
})();
