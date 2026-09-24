/* Runs before first paint: apply stored theme to avoid a flash (no inline scripts under CSP). */
(function () {
  try {
    var t = localStorage.getItem('aura.theme');
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage unavailable */ }
}());
