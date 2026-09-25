/*
 * Same look on every phone. The layout is designed for a 390px-wide screen.
 * A phone with a larger "Display size"/DPI or a bigger system font gives the page
 * fewer CSS pixels, which makes everything look huge. We scale the page back
 * to the 390px design so it looks identical everywhere. Tablets/desktops are untouched.
 */
(function () {
  var BASE = 390;
  var root = document.documentElement;
  function fit() {
    var w = root.clientWidth || window.innerWidth;
    var z = w < 600 ? Math.min(1.12, Math.max(0.72, w / BASE)) : 1;
    z = Math.round(z * 1000) / 1000;
    root.style.zoom = z === 1 ? '' : String(z);
    root.style.setProperty('--z', String(z));
  }
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);
}());
