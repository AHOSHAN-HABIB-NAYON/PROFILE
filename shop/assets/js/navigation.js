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

  /* ---- Search: debounce + abort + tiny cache (no query per keystroke) + recent searches ---- */
  const RECENT_KEY = 'recent_searches';
  const results = new Map();
  const recent = {
    get() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; } },
    add(q) {
      q = String(q || '').trim();
      if (q.length < 2) return;
      try { localStorage.setItem(RECENT_KEY, JSON.stringify([q].concat(recent.get().filter((x) => x !== q)).slice(0, 8))); } catch (e) { /* ignore */ }
    },
    clear() { try { localStorage.removeItem(RECENT_KEY); } catch (e) { /* ignore */ } },
  };
  function renderRecent() {
    const wrap = document.querySelector('[data-recent-wrap]');
    const box = document.querySelector('[data-recent]');
    if (!wrap || !box) return;
    const list = recent.get();
    wrap.hidden = !list.length;
    box.innerHTML = '';
    list.forEach((q) => {
      const a = document.createElement('a');
      a.className = 'chip'; a.href = '/products?q=' + encodeURIComponent(q);
      a.innerHTML = '<i class="fa fa-history"></i> ';
      a.appendChild(document.createTextNode(q));
      box.appendChild(a);
    });
  }
  const esc = (t) => { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; };
  function bindSearch(input) {
    const form = input.closest('form');
    const overlay = input.closest('[data-search-overlay]');
    const box = overlay ? overlay.querySelector('[data-search-results]') : form.querySelector('[data-search-results]');
    const idle = overlay ? overlay.querySelector('[data-search-idle]') : null;
    let t = null;
    let ctrl = null;
    let active = -1;
    const show = (html) => { if (!box) return; box.innerHTML = html; box.hidden = false; if (idle) idle.hidden = true; active = -1; };
    const reset = () => { if (box) { box.hidden = true; box.innerHTML = ''; } if (idle) { idle.hidden = false; renderRecent(); } };
    const render = (items, q) => {
      if (!items.length) {
        show('<div class="search-empty"><span class="empty-art"><i class="fa fa-search"></i></span><b>"' + esc(q) + '" এর জন্য কিছু পাওয়া যায়নি</b><span>অন্য শব্দ দিয়ে চেষ্টা করুন</span></div>');
        return;
      }
      show(items.map((p) =>
        '<a class="suggest-item" href="' + p.url + '" data-recent-q="' + esc(q) + '"><img src="' + p.image + '" alt="" width="48" height="48" class="loaded">' +
        '<div class="grow"><div class="s-name">' + esc(p.name) + '</div>' + (p.category ? '<div class="s-cat">' + esc(p.category) + '</div>' : '') +
        '<div class="s-price">' + p.price_text + (p.old_price_text ? ' <del>' + p.old_price_text + '</del>' : '') + '</div></div><i class="fa fa-angle-right"></i></a>').join('') +
        '<a class="suggest-all" href="/products?q=' + encodeURIComponent(q) + '" data-recent-q="' + esc(q) + '">"' + esc(q) + '" এর সব ফলাফল দেখুন <i class="fa fa-arrow-right"></i></a>');
    };
    input.addEventListener('input', () => {
      clearTimeout(t);
      const q = input.value.trim();
      if (q.length < 2) { reset(); return; }
      if (results.has(q)) { render(results.get(q), q); return; }
      if (overlay) show('<div class="search-loading">' + '<div class="sk-row"><span class="sk"></span><span class="sk"></span></div>'.repeat(3) + '</div>');
      t = setTimeout(async () => {
        if (ctrl) ctrl.abort();
        ctrl = new AbortController();
        try {
          const r = await App.ajax.get('/api/search?q=' + encodeURIComponent(q), { signal: ctrl.signal });
          if (r.success && input.value.trim() === q) { results.set(q, r.data.items); render(r.data.items, q); }
        } catch (e) { /* aborted */ }
      }, 280);
    });
    input.addEventListener('keydown', (e) => {
      if (!box || box.hidden) return;
      const items = [...box.querySelectorAll('.suggest-item, .suggest-all')];
      if (!items.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach((el, i) => el.classList.toggle('active', i === active));
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault(); items[active].click();
      } else if (e.key === 'Escape') { reset(); }
    });
    form.addEventListener('submit', () => recent.add(input.value), true);
    if (box) box.addEventListener('click', (e) => { const a = e.target.closest('[data-recent-q]'); if (a) recent.add(a.dataset.recentQ); });
    if (box && !overlay) {
      document.addEventListener('click', (e) => { if (!form.contains(e.target)) box.hidden = true; });
      box.addEventListener('click', () => { box.hidden = true; input.value = ''; });
    }
  }

  function openSearch() {
    const o = document.querySelector('[data-search-overlay]');
    if (!o) return;
    renderRecent();
    o.hidden = false;
    o.classList.remove('closing');
    document.body.classList.add('no-scroll');
    setTimeout(() => o.querySelector('input').focus(), 60);
  }
  function closeSearch() {
    const o = document.querySelector('[data-search-overlay]');
    if (!o || o.hidden) return;
    o.classList.add('closing');
    document.body.classList.remove('no-scroll');
    setTimeout(() => { o.hidden = true; o.classList.remove('closing'); }, 180);
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
    // Subtle header shadow once the page scrolls.
    const header = document.querySelector('.app-header');
    if (header) {
      let ticking = false;
      window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => { header.classList.toggle('scrolled', window.scrollY > 4); ticking = false; });
      }, { passive: true });
    }
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
      else if (t.closest('[data-recent-clear]')) { recent.clear(); renderRecent(); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { App.ui.closeSheet(); closeSearch(); } });
    document.addEventListener('submit', (e) => { if (e.target.matches('[data-search-form]')) closeSearch(); }, true);
    document.addEventListener('change', (e) => {
      const f = e.target.closest('form[data-auto-submit]');
      if (f && e.target.tagName === 'SELECT') f.requestSubmit ? f.requestSubmit() : f.submit();
    });
    applyThemeLabel();
    // Subtle header shadow once the page scrolls.
    const header = document.querySelector('.app-header');
    if (header) {
      let ticking = false;
      window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => { header.classList.toggle('scrolled', window.scrollY > 4); ticking = false; });
      }, { passive: true });
    }
  }

  App.nav = { init, setActive };
})();
