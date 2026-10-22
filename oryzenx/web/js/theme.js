// Apply the saved theme before first paint to avoid a flash.
try {
  var t = localStorage.getItem('ox-theme');
  if (!t) t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
} catch (e) { document.documentElement.dataset.theme = 'dark'; }
