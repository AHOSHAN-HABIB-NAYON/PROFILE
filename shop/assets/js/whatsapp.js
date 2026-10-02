/* whatsapp.js — floating WhatsApp support with automatic order-ID message. */
(function () {
  'use strict';
  const App = window.App;
  const cfg = (App.config && App.config.whatsapp) || {};

  function link(orderId) {
    const msg = orderId ? String(cfg.message || '').replace(/\{order_id\}|XXXXX/g, orderId) : (cfg.general || '');
    return 'https://wa.me/' + cfg.number + (msg ? '?text=' + encodeURIComponent(msg) : '');
  }
  function currentOrder() {
    const el = document.querySelector('#app [data-page="success"][data-order]');
    return el ? el.dataset.order : null;
  }

  document.addEventListener('click', (e) => {
    const fab = e.target.closest('[data-whatsapp]');
    const btn = e.target.closest('[data-whatsapp-order]');
    if (!cfg.enabled || (!fab && !btn)) return;
    (fab || btn).href = link(btn ? btn.dataset.whatsappOrder : currentOrder());
  });

  App.wa = { link };
})();
