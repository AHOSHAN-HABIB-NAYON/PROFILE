/* pwa.js — service worker registration and "Install App" prompt. */
(function () {
  'use strict';
  const App = window.App;
  let deferred = null;
  const buttons = () => document.querySelectorAll('[data-install]');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      if (App.config.pwa) {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
      } else {
        navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
      }
    });
  }

  const DISMISS_KEY = 'install_dismissed_at';
  const recentlyDismissed = () => {
    try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < 7 * 86400000; } catch (e) { return true; }
  };
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    buttons().forEach((b) => (b.hidden = false));
    // Friendly install sheet once the visitor has looked around a bit (max once a week).
    if (!recentlyDismissed() && window.matchMedia('(max-width: 899px)').matches) {
      setTimeout(() => { if (deferred && !document.querySelector('.sheet:not([hidden])')) App.ui.openSheet('install'); }, 25000);
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-install-later]')) {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (x) { /* ignore */ }
      App.ui.closeSheet();
    }
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    buttons().forEach((b) => (b.hidden = true));
    App.ui.toast('অ্যাপ ইনস্টল হয়েছে!', 'success');
  });
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-install], [data-install-confirm]') || !deferred) return;
    App.ui.closeSheet();
    deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    buttons().forEach((b) => (b.hidden = true));
  });
})();
