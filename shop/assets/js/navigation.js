/* navigation.js — active nav state, bottom sheet, search (debounced), theme toggle. */
(function () {
  'use strict';
  const App = window.App;

  function setActive(key) {
    document.querySelectorAll('[data-nav]').forEach((el) => {
      const on = el.dataset.nav === key;
      el.classList.toggle('active', on);
      if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
  }

  /* ---- Search: debounce + abort + tiny cache so we never query on every keystroke ---- */
  const results = new Map();
  function bindSearch(input) {
    const form = input.closest('form');
    const box = form.querySelector('[data-search-results]') || document.querySelector('.search-overlay [data-search-results]');
    let t = null;
    let ctrl = null;
    let active = -1;
    const render = (items, q) => {
      if (!box) return;
      if (!q) { box.hidden = true; box.innerHTML = ''; return; }
      box.hidden = false;
      if (!items.length) { box.innerHTML = '<div class="suggest-empty">কোনো পণ্য পাওয়া যায়নি</div>'; return; }
      box.innerHTML = items.map((p) =>
        '<a class="suggest-item" href="' + p.url + '"><img src="' + p.image + '" alt="" width="40" height="40" loading="lazy" class="loaded">' +
        '<div class="grow"><div class="s-name"></div><div class="s-price">' + p.price_text + (p.old_price_text ? ' <del>' + p.old_price_text + '</del>' : '') + '</div></div></a>').join('') +
        '<a class="suggest-item" href="/products?q=' + encodeURIComponent(q) + '"><i class="fa fa-search"></i> <span class="small">"' + '<b></b>" এর সব ফলাফল দেখুন</span></a>';
      box.querySelectorAll('.s-name').forEach((el, i) => (el.textContent = items[i].name));
      box.querySelector('b').textContent = q;
      active = -1;
    };
    input.addEventListener('input', () => {
      clearTimeout(t);
      const q = input.value.trim();
      if (q.length < 2) { render([], ''); return; }
      t = setTimeout(async () => {
        if (results.has(q)) { render(results.get(q), q); return; }
        if (ctrl) ctrl.abort();
        ctrl = new AbortController();
        try {
          const r = await App.ajax.get('/api/search?q=' + encodeURIComponent(q), { signal: ctrl.signal });
          if (r.success) { results.set(q, r.data.items); render(r.data.items, q); }
        } catch (e) { /* aborted */ }
      }, 280);
    });
    input.addEventListener('keydown', (e) => {
      if (!box || box.hidden) return;
      const items = [...box.querySelectorAll('.suggest-item')];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach((el, i) => el.classList.toggle('active', i === active));
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault(); items[active].click();
      } else if (e.key === 'Escape') { render([], ''); }
    });
    if (box && !box.closest('.search-overlay')) {
      document.addEventListener('click', (e) => { if (!form.contains(e.target)) box.hidden = true; });
      box.addEventListener('click', () => { box.hidden = true; input.value = ''; });
    }
  }

  function openSearch() {
    const o = document.querySelector('[data-search-overlay]');
    if (!o) return;
    o.hidden = false;
    setTimeout(() => o.querySelector('input').focus(), 30);
  }
  function closeSearch() {
    const o = document.querySelector('[data-search-overlay]');
    if (o) o.hidden = true;
  }

  function applyThemeLabel() {
    const dark = document.documentElement.dataset.theme === 'dark';
    document.querySelectorAll('[data-theme-toggle] .fa').forEach((i) => (i.className = 'fa fa-' + (dark ? 'sun-o' : 'moon-o')));
    document.querySelectorAll('[data-theme-label]').forEach((l) => (l.textContent = dark ? 'লাইট মোড' : 'ডার্ক মোড'));
  }
  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.cookie = 'theme=' + next + ';path=/;max-age=31536000;samesite=lax';
    applyThemeLabel();
  }

  function init() {
    document.querySelectorAll('[data-search-input]').forEach(bindSearch);
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-open-sheet]')) App.ui.openSheet(t.closest('[data-open-sheet]').dataset.openSheet);
      else if (t.closest('[data-close-sheet]')) App.ui.closeSheet(t.closest('.sheet'));
      else if (t.closest('[data-open-search]')) openSearch();
      else if (t.closest('[data-close-search]')) closeSearch();
      else if (t.closest('[data-theme-toggle]')) toggleTheme();
      else if (t.closest('.search-overlay a')) closeSearch();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { App.ui.closeSheet(); closeSearch(); } });
    document.addEventListener('submit', (e) => { if (e.target.matches('[data-search-form]')) closeSearch(); }, true);
    document.addEventListener('change', (e) => {
      const f = e.target.closest('form[data-auto-submit]');
      if (f && e.target.tagName === 'SELECT') f.requestSubmit ? f.requestSubmit() : f.submit();
    });
    applyThemeLabel();
  }

  App.nav = { init, setActive };
})();
