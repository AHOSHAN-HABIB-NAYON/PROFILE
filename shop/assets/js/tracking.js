/* tracking.js — Meta Pixel + Google tag (browser side). Event IDs match server-side CAPI events for deduplication.
   No secrets here: only the public Pixel ID / Tag ID are used in the browser. */
(function () {
  'use strict';
  const App = window.App;
  const cfg = App.config || {};
  const px = cfg.pixel || {};
  const gt = cfg.gtag || {};

  function loadScript(src) {
    const s = document.createElement('script');
    s.async = true; s.src = src;
    document.head.appendChild(s);
  }

  if (px.enabled && px.id) {
    /* Standard fbq stub (from Meta's snippet), loaded from our own file to stay CSP-compliant. */
    const n = (window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); });
    if (!window._fbq) window._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    loadScript('https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', px.id);
    window.fbq('track', 'PageView', {}, cfg.eventId ? { eventID: cfg.eventId } : undefined);
  }
  if (gt.enabled && gt.id) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', gt.id);
    if (gt.ads && gt.ads !== gt.id) window.gtag('config', gt.ads);
    loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gt.id));
  }

  const fb = (ev, data, eid) => { if (window.fbq) window.fbq('track', ev, data || {}, eid ? { eventID: eid } : undefined); };
  const g = (ev, data) => { if (window.gtag) window.gtag('event', ev, data || {}); };
  const beacon = (data) => {
    const body = JSON.stringify(data);
    fetch('/api/track', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': App.ajax.csrf(), 'X-Requested-With': 'fetch' }, body }).catch(() => {});
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-track-click]');
    if (el) beacon({ event: 'product_click', product_id: Number(el.dataset.trackClick), url: location.pathname });
  }, { capture: true });

  App.track = {
    spaPageView(d, fromCache) {
      const eid = d.meta && d.meta.event_id;
      fb('PageView', {}, fromCache ? null : eid);
      if (window.gtag) window.gtag('event', 'page_view', { page_location: location.href, page_title: document.title });
      if (fromCache) {
        beacon({ event: 'page_view', url: location.pathname });
        if (d.page === 'product') {
          const pid = document.querySelector('#app [data-product]');
          if (pid) beacon({ event: 'product_view', product_id: Number(pid.dataset.product), url: location.pathname });
        }
      }
    },
    viewContent(p) {
      fb('ViewContent', { content_ids: [p.id], content_type: 'product', content_name: p.name, value: p.value, currency: 'BDT' }, p.event_id);
      g('view_item', { currency: 'BDT', value: p.value, items: [{ item_id: p.id, item_name: p.name, price: p.value }] });
    },
    addToCart(t) {
      fb('AddToCart', { content_ids: [t.content_id], content_type: 'product', value: t.value, currency: 'BDT' }, t.event_id);
      g('add_to_cart', { currency: 'BDT', value: t.value, items: [{ item_id: t.content_id }] });
    },
    initiateCheckout(t) {
      fb('InitiateCheckout', { value: t.value, currency: 'BDT', num_items: t.num_items }, t.event_id);
      g('begin_checkout', { currency: 'BDT', value: t.value });
    },
    purchase(t) {
      fb('Purchase', { value: t.value, currency: 'BDT', content_ids: t.content_ids, content_type: 'product', num_items: t.num_items }, t.event_id);
      g('purchase', { transaction_id: t.event_id, value: t.value, currency: 'BDT' });
      if (gt.ads && gt.label) g('conversion', { send_to: gt.ads + '/' + gt.label, value: t.value, currency: 'BDT', transaction_id: t.event_id });
    },
  };
})();
