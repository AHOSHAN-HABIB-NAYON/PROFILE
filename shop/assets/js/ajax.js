/* ajax.js — Fetch wrapper with CSRF, consistent JSON envelope and Bengali fallbacks. */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const cfgEl = document.getElementById('app-config');
  App.config = cfgEl ? JSON.parse(cfgEl.textContent || '{}') : {};
  let csrf = App.config.csrf || '';
  const GENERIC = 'দুঃখিত, এই মুহূর্তে অনুরোধটি সম্পন্ন করা যাচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।';
  const OFFLINE = 'ইন্টারনেট সংযোগ নেই। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।';

  async function refreshCsrf() {
    try {
      const r = await fetch('/api/csrf', { headers: { 'X-Requested-With': 'fetch', Accept: 'application/json' }, credentials: 'same-origin' });
      const d = await r.json();
      if (d.csrf) csrf = d.csrf;
    } catch (e) { /* ignore */ }
  }

  async function request(url, opts) {
    opts = opts || {};
    const method = opts.method || 'GET';
    const headers = Object.assign({ 'X-Requested-With': 'fetch', Accept: 'application/json' }, opts.headers || {});
    let body = opts.body;
    if (method !== 'GET') {
      headers['X-CSRF-Token'] = csrf;
      if (body && !(body instanceof FormData) && typeof body !== 'string') {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(body);
      }
    }
    let res;
    try {
      res = await fetch(url, { method, headers, body, credentials: 'same-origin', signal: opts.signal });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      return { success: false, message: navigator.onLine ? GENERIC : OFFLINE, errors: {}, network: true, status: 0 };
    }
    let data;
    try { data = await res.json(); } catch (e) { data = { success: false, message: GENERIC, errors: {} }; }
    if (data && data.csrf) csrf = data.csrf;
    if (res.status === 419 && !opts._retried) {
      await refreshCsrf();
      return request(url, Object.assign({}, opts, { _retried: true }));
    }
    if (res.status === 401 && data.redirect) { window.location.href = data.redirect; }
    data.status = res.status;
    data.errors = data.errors || {};
    return data;
  }

  App.ajax = {
    get: (u, o) => request(u, Object.assign({}, o, { method: 'GET' })),
    post: (u, b, o) => request(u, Object.assign({}, o, { method: 'POST', body: b })),
    setCsrf: (t) => { if (t) csrf = t; },
    csrf: () => csrf,
    GENERIC,
  };
  /** Bengali digits for UI numbers. */
  App.bn = (n) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
  App.money = (n) => '৳' + App.bn(Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }));
})();
