/* lazyload.js — fades in native lazy images; IntersectionObserver for data-src images. */
(function () {
  'use strict';
  const App = window.App;
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const img = en.target;
      if (img.dataset.src) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
      io.unobserve(img);
    });
  }, { rootMargin: '200px 0px' }) : null;

  function mark(img) {
    if (img.complete && img.naturalWidth) { img.classList.add('loaded'); return; }
    img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
    img.addEventListener('error', () => {
      img.classList.add('loaded');
      if (!img.dataset.fallback) { img.dataset.fallback = '1'; img.src = '/assets/images/placeholder.svg'; }
    }, { once: true });
  }

  App.lazy = {
    observe(root) {
      (root || document).querySelectorAll('img[loading="lazy"]').forEach(mark);
      (root || document).querySelectorAll('img[data-src]').forEach((img) => (io ? io.observe(img) : (img.src = img.dataset.src)));
    },
  };
})();
