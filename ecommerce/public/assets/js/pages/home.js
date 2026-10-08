/* pages/home.js — banner slider (scroll-snap + autoplay) and flash-sale countdown */
(function (App) {
  'use strict';

  function startCountdowns(root) {
    var els = App.$$('[data-countdown]', root);
    if (!els.length) return null;
    var pad = function (n) { return App.bn(n < 10 ? '0' + n : String(n)); };
    var tick = function () {
      els.forEach(function (el) {
        var diff = Math.max(0, new Date(el.getAttribute('data-countdown')).getTime() - Date.now());
        var s = Math.floor(diff / 1000);
        var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
        el.innerHTML = (d > 0 ? '<span>' + pad(d) + 'দিন</span>' : '') + '<span>' + pad(h) + '</span><span>' + pad(m) + '</span><span>' + pad(sec) + '</span>';
      });
    };
    tick();
    return setInterval(tick, 1000);
  }

  function startSlider(root) {
    var slider = App.$('[data-slider]', root);
    if (!slider) return null;
    var track = App.$('[data-slides]', slider);
    var dots = App.$$('[data-slide-to]', slider);
    var count = track.children.length;
    if (count < 2) return null;
    var index = 0, timer = null, paused = false;

    var go = function (i) {
      index = (i + count) % count;
      track.scrollTo({ left: track.clientWidth * index, behavior: 'smooth' });
    };
    var sync = App.throttle(function () {
      index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      dots.forEach(function (d, i) { d.classList.toggle('is-active', i === index); d.setAttribute('aria-selected', i === index ? 'true' : 'false'); });
    }, 80);
    var play = function () {
      clearInterval(timer);
      timer = setInterval(function () { if (!paused && !document.hidden) go(index + 1); }, 5000);
    };
    var onDot = function (e) { var b = e.target.closest('[data-slide-to]'); if (b) { go(Number(b.getAttribute('data-slide-to'))); play(); } };
    var pause = function () { paused = true; };
    var resume = function () { paused = false; };

    track.addEventListener('scroll', sync, { passive: true });
    slider.addEventListener('click', onDot);
    slider.addEventListener('pointerenter', pause);
    slider.addEventListener('pointerleave', resume);
    slider.addEventListener('touchstart', pause, { passive: true });
    slider.addEventListener('touchend', function () { setTimeout(resume, 3000); }, { passive: true });
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) play();
    return function () { clearInterval(timer); };
  }

  App.page('home', {
    mount: function (root) {
      var cd = startCountdowns(root);
      var stopSlider = startSlider(root);
      return function () { clearInterval(cd); if (stopSlider) stopSlider(); };
    }
  });
})(window.App);
