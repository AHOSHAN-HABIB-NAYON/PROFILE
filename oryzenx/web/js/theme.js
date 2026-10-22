// Apply the saved theme before first paint to avoid a flash. Light is the default (as in the design).
try {
  var t = localStorage.getItem('ox-theme') || 'light';
  document.documentElement.dataset.theme = t;
} catch (e) { document.documentElement.dataset.theme = 'light'; }
