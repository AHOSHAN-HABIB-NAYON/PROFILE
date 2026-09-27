/* Landing page: theme toggle + screenshot tabs + reveal-on-scroll (no framework). */
(function () {
  var root = document.documentElement;
  function setIcon() { document.querySelectorAll('[data-theme-toggle] use').forEach(function (u) { u.setAttribute('href', root.dataset.theme === 'dark' ? '#sun' : '#moon'); }); }
  setIcon();
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-theme-toggle]')) {
      var t = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = t; try { localStorage.setItem('lt-theme', t); } catch (x) {}
      setIcon();
    }
    var tab = e.target.closest('[data-shot]');
    if (tab) {
      document.querySelectorAll('[data-shot]').forEach(function (b) { b.classList.toggle('active', b === tab); });
      document.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.dataset.panel !== tab.dataset.shot; });
    }
  });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }); }, { threshold: 0.12 });
    document.querySelectorAll('.lp-card, .lp-head, .lp-mock, .lp-shots img').forEach(function (n) { n.classList.add('reveal'); io.observe(n); });
  }
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
})();
