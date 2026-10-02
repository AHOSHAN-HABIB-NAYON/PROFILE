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

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    buttons().forEach((b) => (b.hidden = false));
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    buttons().forEach((b) => (b.hidden = true));
    App.ui.toast('অ্যাপ ইনস্টল হয়েছে!', 'success');
  });
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-install]') || !deferred) return;
    App.ui.closeSheet();
    deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    buttons().forEach((b) => (b.hidden = true));
  });
})();
