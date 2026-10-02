/* install.js — step navigation for the installation wizard. */
(function () {
  'use strict';
  const form = document.getElementById('install-form');
  if (!form) return;
  const steps = [...form.querySelectorAll('.step')];
  const marks = [...document.querySelectorAll('[data-steps] li')];
  let cur = 0;
  const show = (i) => {
    cur = i;
    steps.forEach((s, n) => (s.hidden = n !== i));
    marks.forEach((m, n) => { m.classList.toggle('active', n === i); m.classList.toggle('done', n < i); });
  };
  const valid = (i) => [...steps[i].querySelectorAll('input[required]')].every((inp) => {
    const ok = inp.checkValidity() && inp.value.trim() !== '';
    inp.closest('.field').classList.toggle('invalid', !ok);
    return ok;
  });
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-next]') && valid(cur)) show(cur + 1);
    if (e.target.closest('[data-prev]')) show(cur - 1);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!valid(cur)) return;
    const btn = form.querySelector('[type=submit]');
    const err = form.querySelector('[data-install-error]');
    btn.classList.add('loading');
    err.hidden = true;
    try {
      const res = await fetch('/install', { method: 'POST', body: new FormData(form), headers: { 'X-Requested-With': 'fetch', Accept: 'application/json' } });
      const d = await res.json();
      if (d.success) { btn.innerHTML = '<i class="fa fa-check"></i> সফল!'; setTimeout(() => (location.href = d.redirect), 800); return; }
      err.textContent = d.message; err.hidden = false;
      const k = Object.keys(d.errors || {})[0];
      if (k) { const inp = form.elements[k]; const step = inp && inp.closest('.step'); if (step) show(steps.indexOf(step)); }
    } catch (x) {
      err.textContent = 'দুঃখিত, ইনস্টলেশন সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।'; err.hidden = false;
    }
    btn.classList.remove('loading');
  });
})();
