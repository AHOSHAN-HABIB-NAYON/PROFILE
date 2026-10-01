/* /v2admin helpers on top of app.js (SPA, forms, toasts are shared). */
(() => {
  'use strict';
  const { api, toast, Router, qrSvg } = window.PB || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // GET forms (search / filters) navigate through the SPA router.
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-get-form]');
    if (!f) return;
    e.preventDefault();
    const params = new URLSearchParams(new FormData(f));
    [...params.keys()].forEach((k) => { if (!params.get(k)) params.delete(k); });
    Router.go(f.getAttribute('action') + (params.toString() ? '?' + params : ''));
  });

  // Inline toggles in resource tables.
  document.addEventListener('change', async (e) => {
    const t = e.target.closest('[data-toggle-url]');
    if (t) {
      const res = await api(t.dataset.toggleUrl, { resource: t.dataset.resource, id: t.dataset.id, field: t.dataset.field });
      if (!res.ok) { t.checked = !t.checked; toast(res.message, 'err'); } else toast(res.message, 'ok', 1200);
    }
    const color = e.target.closest('input[type=color]');
    if (color && color.nextElementSibling?.tagName === 'CODE') color.nextElementSibling.textContent = color.value;
    const target = e.target.closest('[data-target-select]');
    if (target) $('[data-target-value]').hidden = target.value === 'all';
  });

  // Icon picker.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-icon-pick]');
    if (b) {
      const inp = document.getElementById(b.dataset.target);
      inp.value = b.dataset.iconPick;
      const prev = inp.parentElement.querySelector('.icon-preview');
      if (prev) prev.innerHTML = b.innerHTML;
    }
    const sb = $('#admin-sidebar');
    if (sb?.classList.contains('open') && !e.target.closest('#admin-sidebar') && !e.target.closest('[data-action=admin-menu]')) sb.classList.remove('open');
  });

  window.PB_ADMIN = {
    init(root) {
      $$('[data-totp-uri]', root).forEach((el) => qrSvg(el.dataset.totpUri, 4).then((svg) => { el.innerHTML = svg; }));
    },
  };
  const first = $('#app-content');
  if (first) window.PB_ADMIN.init(first);
})();
