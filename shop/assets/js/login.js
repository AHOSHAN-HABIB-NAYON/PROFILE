/* login.js — admin login over Fetch (CSRF + rate limited on the server). */
(function () {
  'use strict';
  const f = document.getElementById('login-form');
  if (!f) return;
  const err = f.querySelector('[data-login-error]');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.classList.add('loading');
    err.hidden = true;
    try {
      const fd = new FormData(f);
      const r = await fetch('/admin/login', { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch', Accept: 'application/json', 'X-CSRF-Token': fd.get('_csrf') } });
      const d = await r.json();
      if (d.success) { location.href = d.redirect || '/admin'; return; }
      if (d.csrf) f.querySelector('[name=_csrf]').value = d.csrf;
      err.textContent = d.message; err.hidden = false;
    } catch (x) {
      err.textContent = 'দুঃখিত, এই মুহূর্তে লগইন করা যাচ্ছে না।'; err.hidden = false;
    }
    btn.classList.remove('loading');
  });
})();
