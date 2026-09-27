/* Runs before first paint: Light is the default theme unless the user explicitly chose Night. */
(function () {
  try {
    var t = localStorage.getItem('lt-theme');
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
    var l = localStorage.getItem('lt-lang');
    if (l) document.documentElement.lang = l;
    if (localStorage.getItem('lt-reduce-motion') === '1') document.documentElement.classList.add('reduce-motion');
  } catch (e) { document.documentElement.setAttribute('data-theme', 'light'); }
})();
