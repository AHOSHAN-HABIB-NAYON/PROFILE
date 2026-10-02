/* prefetch.js — warm the page cache on hover/touch intent and for primary nav links when idle. */
(function () {
  'use strict';
  const App = window.App;
  let timer = null;
  function intent(e) {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.hasAttribute('data-no-spa') || a.target === '_blank') return;
    clearTimeout(timer);
    timer = setTimeout(() => App.router.prefetch(a.href), e.type === 'touchstart' ? 0 : 70);
  }
  document.addEventListener('mouseover', intent, { passive: true });
  document.addEventListener('touchstart', intent, { passive: true });
  document.addEventListener('mouseout', () => clearTimeout(timer), { passive: true });

  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
  window.addEventListener('load', () => idle(() => {
    document.querySelectorAll('.bottom-nav a[href], .desk-nav a[href]').forEach((a, i) => setTimeout(() => App.router.prefetch(a.href), i * 300));
  }));
})();
