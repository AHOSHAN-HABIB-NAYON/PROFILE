/* Runs before first paint: Light is the default theme unless the user explicitly chose Night. */
(function () {
  try {
    var t = localStorage.getItem('lt-theme');
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
    var l = localStorage.getItem('lt-lang');
    if (l) document.documentElement.lang = l;
    if (localStorage.getItem('lt-reduce-motion') === '1') document.documentElement.classList.add('reduce-motion');
  } catch (e) { document.documentElement.setAttribute('data-theme', 'light'); }
  // Web font loads in the background — never blocks first paint (system font is used until it arrives)
  try {
    var f = document.createElement('link'); f.rel = 'stylesheet';
    f.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
    f.media = 'print'; f.addEventListener('load', function () { f.media = 'all'; });
    document.head.appendChild(f);
  } catch (e) {}
})();
