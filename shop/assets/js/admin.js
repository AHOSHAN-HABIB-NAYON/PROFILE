/* admin.js — admin panel behaviours. Generic, delegated handlers are bound ONCE; page-specific
   behaviour receives the router's AbortSignal so listeners are removed on navigation. */
(function () {
  'use strict';
  const App = window.App;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  App.pages = App.pages || {};

  /* ---------------- generic actions ---------------- */
  function afterSuccess(r, el) {
    if (r.message) App.ui.toast(r.message, 'success');
    if (el && el.closest('[data-modal]') && (el.hasAttribute('data-close') || el.closest('form[data-close]'))) closeModal();
    if (r.redirect) { App.router.navigate(r.redirect); return; }
    if (el && el.hasAttribute('data-reload')) App.router.refresh();
  }
  function showErrors(form, r) {
    $$('.field.invalid', form).forEach((f) => f.classList.remove('invalid'));
    $$('[data-field-error]', form).forEach((e) => e.remove());
    Object.keys(r.errors || {}).forEach((k) => {
      const inp = form.elements[k] || form.elements[k + '[]'];
      const field = inp && (inp.closest ? inp.closest('.field') : null);
      if (field) {
        field.classList.add('invalid');
        const p = document.createElement('p');
        p.className = 'field-error'; p.dataset.fieldError = ''; p.textContent = r.errors[k];
        field.appendChild(p);
      }
    });
  }
  function formData(form) {
    $$('[data-custom-radio]:checked', form).forEach((r) => { const v = $('[data-custom-value]', form); if (v) r.value = v.value; });
    return new FormData(form);
  }

  document.addEventListener('submit', async (e) => {
    const form = e.target;
    if (!form.matches('form[data-api]') || form.hasAttribute('data-product-form')) return;
    e.preventDefault();
    e.stopPropagation();
    const btn = form.querySelector('button:not([type="button"])');
    if (btn) btn.classList.add('loading');
    const r = await App.ajax.post(form.dataset.api, formData(form));
    if (btn) btn.classList.remove('loading');
    if (!r.success) { showErrors(form, r); App.ui.toast(r.message, 'error'); return; }
    afterSuccess(r, form);
  }, true);

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-post]');
    if (b) {
      e.preventDefault();
      if (b.dataset.confirm && !window.confirm(b.dataset.confirm)) return;
      b.classList.add('loading');
      let body = {};
      try { body = b.dataset.body ? JSON.parse(b.dataset.body) : {}; } catch (x) { body = {}; }
      const r = await App.ajax.post(b.dataset.post, body);
      b.classList.remove('loading');
      if (!r.success) { App.ui.toast(r.message, 'error'); return; }
      afterSuccess(r, b);
      return;
    }
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a,button,input,label')) { App.router.navigate(row.dataset.href); return; }
    const m = e.target.closest('[data-modal]:not(.modal)');
    if (m) { e.preventDefault(); openModal(m.dataset.modal, m.dataset.title, m.dataset.fill); return; }
    if (e.target.closest('[data-close-modal]')) closeModal();
    if (e.target.closest('[data-admin-theme]')) {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      document.cookie = 'admin_theme=' + next + ';path=/admin;max-age=31536000;samesite=lax';
    }
    const n = e.target.closest('[data-notif-id]');
    if (n && n.classList.contains('unread')) App.ajax.post('/admin/api/notifications/read', { id: Number(n.dataset.notifId) }).then((r) => r.success && setNotif(r.data.count));
  });

  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.matches('[data-toggle-url]')) {
      const r = await App.ajax.post(t.dataset.toggleUrl, t.dataset.field ? { field: t.dataset.field } : {});
      if (!r.success) { t.checked = !t.checked; App.ui.toast(r.message, 'error'); } else App.ui.toast(r.message, 'success', { duration: 1200 });
    }
    if (t.name && t.closest('[data-modal]')) syncShowWhen(t.closest('form'));
  });

  /* ---------------- modal ---------------- */
  const modal = $('[data-modal].modal') || $('.modal');
  let modalCtrl = null;
  function openModal(tplId, title, fill) {
    const tpl = document.getElementById(tplId);
    if (!tpl || !modal) return;
    if (modalCtrl) modalCtrl.abort();
    modalCtrl = new AbortController();
    $('[data-modal-title]', modal).textContent = title || '';
    const body = $('[data-modal-body]', modal);
    body.innerHTML = '';
    body.appendChild(tpl.content.cloneNode(true));
    let data = {};
    try { data = fill ? JSON.parse(fill) : {}; } catch (x) { data = {}; }
    const form = $('form', body);
    if (form) {
      Object.keys(data).forEach((k) => {
        const els = form.querySelectorAll('[name="' + k + '"]');
        els.forEach((el) => {
          if (el.type === 'checkbox') el.checked = String(data[k]) === '1';
          else if (el.type === 'radio') el.checked = el.value === String(data[k]);
          else if (el.type !== 'file' && el.type !== 'hidden') el.value = data[k] == null ? '' : data[k];
          else if (el.type === 'hidden' && els.length === 1) el.value = data[k] == null ? '' : data[k];
        });
      });
      $$('[data-preview]', form).forEach((img) => { const v = data[img.dataset.preview]; if (v) { img.src = v; img.hidden = false; } });
      syncShowWhen(form);
      iconPicker(form, modalCtrl.signal);
      comboEditor(form, data.items || [], modalCtrl.signal);
    }
    modal.hidden = false;
    modal.classList.remove('closing');
    const first = $('input:not([type=hidden]),select,textarea', body);
    if (first && window.matchMedia('(min-width: 600px)').matches) first.focus();
    return body;
  }
  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.classList.add('closing');
    setTimeout(() => { modal.hidden = true; modal.classList.remove('closing'); $('[data-modal-body]', modal).innerHTML = ''; if (modalCtrl) modalCtrl.abort(); }, 190);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  function syncShowWhen(form) {
    if (!form) return;
    $$('[data-show-when]', form).forEach((el) => {
      const [name, val] = el.dataset.showWhen.split('=');
      const checked = form.querySelector('[name="' + name + '"]:checked') || form.elements[name];
      el.hidden = !checked || checked.value !== val;
    });
  }

  function iconPicker(form, signal) {
    const grid = $('[data-icon-grid]', form);
    if (!grid) return;
    const input = form.elements.icon;
    const mark = () => $$('button', grid).forEach((b) => b.classList.toggle('on', b.dataset.icon === input.value));
    mark();
    grid.addEventListener('click', (e) => { const b = e.target.closest('[data-icon]'); if (b) { input.value = b.dataset.icon; mark(); } }, { signal });
    const search = $('[data-icon-search]', form);
    search.addEventListener('input', () => { const q = search.value.trim().toLowerCase(); $$('button', grid).forEach((b) => (b.hidden = q && !b.dataset.icon.includes(q))); }, { signal });
  }

  /* ---------------- product search picker (related products / combos) ---------------- */
  function productSearch(input, resultsBox, onPick, signal) {
    let t = null;
    input.addEventListener('input', () => {
      clearTimeout(t);
      const q = input.value.trim();
      if (q.length < 1) { resultsBox.hidden = true; return; }
      t = setTimeout(async () => {
        const r = await App.ajax.get('/admin/api/products/search?q=' + encodeURIComponent(q));
        if (!r.success) return;
        resultsBox.innerHTML = r.data.items.length ? '' : '<p class="small muted" style="padding:8px">পাওয়া যায়নি</p>';
        r.data.items.forEach((p) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.innerHTML = '<span></span><small class="muted">' + App.money(p.price) + ' · স্টক ' + App.bn(p.stock) + '</small>';
          b.firstChild.textContent = p.name;
          b.addEventListener('click', () => { onPick(p); resultsBox.hidden = true; input.value = ''; });
          resultsBox.appendChild(b);
        });
        resultsBox.hidden = false;
      }, 250);
    }, { signal });
    document.addEventListener('click', (e) => { if (!input.parentNode.contains(e.target)) resultsBox.hidden = true; }, { signal });
  }

  function comboEditor(form, items, signal) {
    const rows = $('[data-combo-rows]', form);
    if (!rows) return;
    const add = (p, qty) => {
      if ($('[data-pid="' + p.id + '"]', rows)) return;
      const row = document.createElement('div');
      row.className = 'combo-row'; row.dataset.pid = p.id;
      row.innerHTML = '<input type="hidden" name="product_ids[]"><span class="grow"></span><input type="number" name="quantities[]" min="1" max="99" aria-label="পরিমাণ"><button type="button" class="icon-btn danger" aria-label="সরান"><i class="fa fa-times"></i></button>';
      row.children[0].value = p.id;
      row.children[1].textContent = p.name;
      row.children[2].value = qty || 1;
      row.querySelector('button').addEventListener('click', () => row.remove());
      rows.appendChild(row);
    };
    items.forEach((i) => add({ id: i.id, name: i.name }, i.qty));
    productSearch($('[data-combo-search]', form), $('[data-picker-results]', form), (p) => add(p, 1), signal);
  }

  /* ---------------- sortable lists (pointer events: mouse + touch) ---------------- */
  function sortable(list, signal, onDone, handleSel) {
    let item = null;
    list.addEventListener('pointerdown', (e) => {
      const h = e.target.closest(handleSel || '.drag');
      if (!h || !list.contains(h) || e.target.closest('button:not(.drag),input,a')) return;
      if (handleSel && e.pointerType !== 'mouse') return; // image grid: buttons on touch
      item = h.closest('.sort-item, .img-item');
      if (!item) return;
      e.preventDefault();
      item.classList.add('dragging');
      list.setPointerCapture && list.setPointerCapture(e.pointerId);
    }, { signal });
    list.addEventListener('pointermove', (e) => {
      if (!item) return;
      const over = document.elementFromPoint(e.clientX, e.clientY);
      const target = over && over.closest('.sort-item, .img-item');
      if (!target || target === item || target.parentNode !== list) return;
      const r = target.getBoundingClientRect();
      const after = list.classList.contains('img-grid') || list.classList.contains('card-grid') ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
      list.insertBefore(item, after ? target.nextSibling : target);
    }, { signal });
    const end = () => {
      if (!item) return;
      item.classList.remove('dragging');
      item = null;
      onDone([...list.children].map((c) => c.dataset.id).filter(Boolean));
    };
    list.addEventListener('pointerup', end, { signal });
    list.addEventListener('pointercancel', end, { signal });
  }

  /* ---------------- charts (dependency-free SVG) ---------------- */
  function chart(el) {
    let cfg;
    try { cfg = JSON.parse(el.dataset.chart); } catch (x) { return; }
    const W = 600; const H = 190; const P = { l: 40, r: 8, t: 10, b: 22 };
    const vals = cfg.values.map(Number);
    const vals2 = (cfg.values2 || []).map(Number);
    const max = Math.max(1, ...vals, ...vals2);
    const n = vals.length;
    const iw = W - P.l - P.r; const ih = H - P.t - P.b;
    const x = (i) => P.l + (n === 1 ? iw / 2 : (iw / (cfg.type === 'bar' ? n : n - 1)) * i + (cfg.type === 'bar' ? iw / n / 2 : 0));
    const y = (v) => P.t + ih - (v / max) * ih;
    const fmt = (v) => (cfg.money ? '৳' : '') + App.bn(v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : Math.round(v));
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img">';
    for (let g = 0; g <= 4; g++) { const gy = P.t + (ih / 4) * g; s += '<line class="grid-line" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + gy + '" y2="' + gy + '"/><text class="axis" x="' + (P.l - 6) + '" y="' + (gy + 3) + '" text-anchor="end">' + fmt(max - (max / 4) * g) + '</text>'; }
    const step = Math.ceil(n / 8);
    cfg.labels.forEach((l, i) => { if (i % step === 0) s += '<text class="axis" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + App.bn(l) + '</text>'; });
    if (cfg.type === 'bar') {
      const bw = Math.min(48, Math.max(4, (iw / n) * 0.6));
      vals.forEach((v, i) => { s += '<rect class="bar" data-i="' + i + '" x="' + (x(i) - bw / 2) + '" y="' + y(v) + '" width="' + bw + '" height="' + Math.max(0, P.t + ih - y(v)) + '" rx="3"/>'; });
    } else {
      const pts = vals.map((v, i) => x(i) + ',' + y(v)).join(' ');
      s += '<polygon class="area" points="' + x(0) + ',' + (P.t + ih) + ' ' + pts + ' ' + x(n - 1) + ',' + (P.t + ih) + '"/><polyline class="line" points="' + pts + '"/>';
      if (vals2.length) s += '<polyline class="line2" points="' + vals2.map((v, i) => x(i) + ',' + y(v)).join(' ') + '"/>';
      vals.forEach((v, i) => { s += '<circle class="pt" data-i="' + i + '" cx="' + x(i) + '" cy="' + y(v) + '" r="3.5"/>'; });
    }
    el.innerHTML = s + '</svg>' + (cfg.legend ? '<div class="chart-legend"><span><i style="background:var(--primary)"></i>' + cfg.legend[0] + '</span><span><i style="background:var(--accent)"></i>' + cfg.legend[1] + '</span></div>' : '');
    const tip = document.createElement('div');
    tip.className = 'chart-tip'; tip.hidden = true;
    el.appendChild(tip);
    el.addEventListener('pointerover', (e) => {
      const t = e.target.closest('[data-i]');
      if (!t) { tip.hidden = true; return; }
      const i = Number(t.dataset.i);
      const svg = el.querySelector('svg').getBoundingClientRect();
      const box = el.getBoundingClientRect();
      tip.textContent = App.bn(cfg.labels[i]) + ': ' + (cfg.money ? App.money(vals[i]) : App.bn(vals[i])) + (vals2.length ? ' / ' + App.bn(vals2[i]) : '');
      tip.style.left = (svg.left - box.left + (x(i) / W) * svg.width) + 'px';
      tip.style.top = (svg.top - box.top + (y(vals[i]) / H) * svg.height) + 'px';
      tip.hidden = false;
    });
    el.addEventListener('pointerleave', () => (tip.hidden = true));
  }

  /* ---------------- generic per-page init ---------------- */
  document.addEventListener('app:page', (ev) => {
    const { root, signal } = ev.detail;
    const title = $('[data-admin-title]');
    if (title) title.textContent = document.title.replace(/ · অ্যাডমিন$/, '');
    $$('[data-chart]', root).forEach(chart);
    $$('[data-sortable]', root).forEach((list) => sortable(list, signal, async (order) => {
      const r = await App.ajax.post(list.dataset.sortable, { order });
      App.ui.toast(r.message, r.success ? 'success' : 'error', { duration: 1200 });
    }));
    // Tabs (settings) with deep-link hash
    const tabs = $('[data-tabs]', root);
    if (tabs) {
      const show = (k) => {
        if (!$('[data-pane="' + k + '"]', root)) return;
        $$('[data-tab]', tabs).forEach((t) => t.classList.toggle('active', t.dataset.tab === k));
        $$('[data-pane]', root).forEach((p) => (p.hidden = p.dataset.pane !== k));
      };
      tabs.addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) { show(t.dataset.tab); history.replaceState(history.state, '', '#' + t.dataset.tab); } }, { signal });
      if (location.hash) show(location.hash.slice(1));
    }
    // Client-side list filter
    $$('[data-filter-list]', root).forEach((inp) => inp.addEventListener('input', () => {
      const q = inp.value.trim().toLowerCase();
      $$(inp.dataset.filterList, root).forEach((row) => (row.hidden = q && !(row.dataset.filterText || row.textContent.toLowerCase()).includes(q)));
    }, { signal }));
  });

  /* ---------------- product form ---------------- */
  App.pages['product-form'] = {
    init(root, signal) {
      const form = $('[data-product-form]', root);
      const editor = App.editor.init(root, signal);
      let pid = Number(root.dataset.productId) || 0;

      // Slug preview
      const slugPrev = $('[data-slug-preview]', root);
      const slugify = (s) => s.toLowerCase().trim().replace(/[^ঀ-৿a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      form.elements.name.addEventListener('input', () => { if (!form.elements.slug.value) slugPrev.textContent = slugify(form.elements.name.value); }, { signal });
      form.elements.slug.addEventListener('input', () => (slugPrev.textContent = slugify(form.elements.slug.value)), { signal });

      // Price ↔ discount
      const price = $('[data-price]', root); const old = $('[data-old-price]', root); const disc = $('[data-discount]', root);
      const showDisc = () => { const p = +price.value; const o = +old.value; disc.value = o > p && p > 0 ? Math.round((o - p) / o * 100) : ''; };
      disc.addEventListener('input', () => { const d = +disc.value; const p = +price.value; if (d > 0 && d < 100 && p > 0) old.value = Math.round(p / (1 - d / 100)); }, { signal });
      old.addEventListener('input', showDisc, { signal });
      price.addEventListener('input', showDisc, { signal });
      showDisc();

      // Sizes
      const chips = $('[data-size-chips]', root);
      const sizeInput = $('[data-size-input]', root);
      const addSize = (val) => {
        val = String(val).trim();
        if (!val || $$('input[name="sizes[]"]', chips).some((i) => i.value.toLowerCase() === val.toLowerCase())) return;
        const c = document.createElement('span');
        c.className = 'size-chip';
        c.innerHTML = '<input type="hidden" name="sizes[]"><button type="button" data-size-toggle></button><button type="button" data-size-remove aria-label="মুছুন"><i class="fa fa-times"></i></button>';
        c.firstChild.value = val; c.children[1].textContent = val;
        chips.appendChild(c);
      };
      $('[data-size-add]', root).addEventListener('click', () => { sizeInput.value.split(',').forEach(addSize); sizeInput.value = ''; }, { signal });
      sizeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sizeInput.value.split(',').forEach(addSize); sizeInput.value = ''; } }, { signal });
      root.addEventListener('click', (e) => {
        const q = e.target.closest('[data-size-quick]'); if (q) addSize(q.dataset.sizeQuick);
        const rm = e.target.closest('[data-size-remove]'); if (rm) rm.closest('.size-chip').remove();
        const tg = e.target.closest('[data-size-toggle]');
        if (tg) {
          const chip = tg.closest('.size-chip');
          chip.classList.toggle('off');
          const un = $('input[name="sizes_unavailable[]"]', chip);
          if (chip.classList.contains('off') && !un) { const h = document.createElement('input'); h.type = 'hidden'; h.name = 'sizes_unavailable[]'; h.value = chip.firstChild.value; chip.prepend(h); }
          if (!chip.classList.contains('off') && un) un.remove();
        }
        const up = e.target.closest('[data-unpick]'); if (up) up.closest('.pick-chip').remove();
      }, { signal });

      // Related products picker
      const picked = $('[data-picked]', root);
      productSearch($('[data-picker-input]', root), $('[data-picker-results]', root), (p) => {
        if (p.id === pid || $('input[value="' + p.id + '"]', picked)) return;
        const c = document.createElement('span');
        c.className = 'pick-chip';
        c.innerHTML = '<input type="hidden" name="related[]"><span></span><button type="button" data-unpick aria-label="সরান"><i class="fa fa-times"></i></button>';
        c.firstChild.value = p.id; c.children[1].textContent = p.name;
        picked.appendChild(c);
      }, signal);

      // Images
      const grid = $('[data-img-grid]', root);
      const fileInput = $('[data-img-input]', root);
      const replaceInput = $('[data-img-replace-input]', root);
      const drop = $('[data-dropzone]', root);
      const queue = [];
      const relabel = () => $$('.img-item', grid).forEach((it, i) => {
        let m = $('.img-main', it);
        if (i === 0 && !m) { m = document.createElement('span'); m.className = 'img-main'; m.textContent = 'প্রধান'; it.appendChild(m); }
        if (i !== 0 && m) m.remove();
      });
      const saveOrder = async () => {
        relabel();
        if (!pid) return;
        const order = $$('.img-item', grid).map((i) => i.dataset.id).filter((id) => id && !id.startsWith('q'));
        const r = await App.ajax.post('/admin/api/products/' + pid + '/images/order', { order });
        if (!r.success) App.ui.toast(r.message, 'error');
      };
      const itemHtml = (src) => '<img src="' + src + '" alt="" width="120" height="120"><div class="img-actions"><button type="button" data-img-left aria-label="বামে"><i class="fa fa-angle-left"></i></button><button type="button" data-img-replace aria-label="পরিবর্তন"><i class="fa fa-refresh"></i></button><button type="button" data-img-delete aria-label="মুছুন"><i class="fa fa-trash"></i></button><button type="button" data-img-right aria-label="ডানে"><i class="fa fa-angle-right"></i></button></div>';
      async function uploadFiles(files, productId) {
        for (const f of files) {
          const tmp = document.createElement('div');
          tmp.className = 'img-item pending';
          tmp.innerHTML = itemHtml(URL.createObjectURL(f));
          grid.appendChild(tmp);
          const fd = new FormData();
          fd.append('images[]', f);
          const r = await App.ajax.post('/admin/api/products/' + productId + '/images', fd);
          URL.revokeObjectURL(tmp.querySelector('img').src);
          if (!r.success) { tmp.remove(); App.ui.toast(f.name + ': ' + r.message, 'error'); continue; }
          const img = r.data.images[0];
          tmp.classList.remove('pending');
          tmp.dataset.id = img.id;
          tmp.querySelector('img').src = img.thumb;
          if (img.size) { const s = document.createElement('span'); s.className = 'img-size'; s.textContent = img.size; tmp.appendChild(s); }
        }
        relabel();
      }
      function addFiles(list) {
        const files = [...list].filter((f) => /^image\//.test(f.type));
        if (!files.length) return;
        if (pid) { uploadFiles(files, pid).then(() => App.ui.toast('ছবি আপলোড ও কমপ্রেস সম্পন্ন', 'success')); return; }
        files.forEach((f) => {
          const id = 'q' + queue.length;
          queue.push({ id, file: f });
          const el = document.createElement('div');
          el.className = 'img-item'; el.dataset.id = id;
          el.innerHTML = itemHtml(URL.createObjectURL(f));
          grid.appendChild(el);
        });
        relabel();
      }
      fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; }, { signal });
      ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }, { signal }));
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }, { signal }));
      drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files), { signal });
      sortable(grid, signal, saveOrder, '.img-item');
      let replacing = null;
      grid.addEventListener('click', async (e) => {
        const it = e.target.closest('.img-item');
        if (!it) return;
        if (e.target.closest('[data-img-left]') && it.previousElementSibling) { grid.insertBefore(it, it.previousElementSibling); saveOrder(); }
        if (e.target.closest('[data-img-right]') && it.nextElementSibling) { grid.insertBefore(it.nextElementSibling, it); saveOrder(); }
        if (e.target.closest('[data-img-delete]')) {
          if (!confirm('ছবিটি মুছে ফেলবেন?')) return;
          if (it.dataset.id.startsWith('q')) { const qi = queue.findIndex((q) => q.id === it.dataset.id); if (qi > -1) queue.splice(qi, 1); it.remove(); relabel(); return; }
          const r = await App.ajax.post('/admin/api/product-images/' + it.dataset.id + '/delete', {});
          if (r.success) { it.remove(); relabel(); } App.ui.toast(r.message, r.success ? 'success' : 'error');
        }
        if (e.target.closest('[data-img-replace]')) {
          if (it.dataset.id.startsWith('q')) { App.ui.toast('সংরক্ষণের পরে ছবি পরিবর্তন করা যাবে।', 'info'); return; }
          replacing = it; replaceInput.click();
        }
      }, { signal });
      replaceInput.addEventListener('change', async () => {
        if (!replacing || !replaceInput.files[0]) return;
        const fd = new FormData(); fd.append('image', replaceInput.files[0]);
        replacing.classList.add('pending');
        const r = await App.ajax.post('/admin/api/product-images/' + replacing.dataset.id + '/replace', fd);
        replacing.classList.remove('pending');
        if (r.success) replacing.querySelector('img').src = r.data.thumb;
        App.ui.toast(r.message, r.success ? 'success' : 'error');
        replaceInput.value = ''; replacing = null;
      }, { signal });

      // Submit
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const btn = $('button[type=submit]', form);
        btn.classList.add('loading');
        const fd = new FormData(form);
        fd.set('description', editor ? editor.value() : '');
        const r = await App.ajax.post('/admin/api/products/save', fd);
        if (!r.success) { btn.classList.remove('loading'); showErrors(form, r); App.ui.toast(r.message, 'error'); return; }
        if (!pid && queue.length) {
          const order = $$('.img-item', grid).map((i) => i.dataset.id);
          const files = order.map((id) => (queue.find((q) => q.id === id) || {}).file).filter(Boolean);
          $$('.img-item', grid).forEach((i) => i.remove());
          await uploadFiles(files, r.data.id);
        }
        btn.classList.remove('loading');
        pid = r.data.id;
        App.ui.toast(r.message, 'success');
        if (r.redirect) App.router.navigate(r.redirect, { replace: true });
      }, { signal, capture: true });
    },
  };

  /* ---------------- stock page ---------------- */
  App.pages.stock = {
    init(root, signal) {
      const update = async (row, body) => {
        const r = await App.ajax.post(row.dataset.url, Object.assign({ type: row.dataset.type || 'product' }, body));
        if (!r.success) { App.ui.toast(r.message, 'error'); return; }
        const v = $('[data-stock-val]', row);
        v.textContent = r.data.stock_text;
        v.className = 'pill stock-val pill-' + (r.data.stock <= 0 ? 'red' : 'green');
        App.ui.toast(r.message, 'success', { duration: 1500 });
      };
      root.addEventListener('click', (e) => {
        const row = e.target.closest('[data-stock-row]');
        if (!row) return;
        const add = e.target.closest('[data-stock-add]');
        if (add) update(row, { mode: 'add', value: Number(add.dataset.stockAdd) });
        if (e.target.closest('[data-stock-custom]')) {
          const body = openModal('tpl-stock', 'কাস্টম স্টক আপডেট');
          const f = $('[data-stock-form]', body);
          if (row.dataset.type === 'combo') $('[data-threshold-field]', f).hidden = true;
          f.addEventListener('submit', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const fd = new FormData(f);
            update(row, { mode: fd.get('mode'), value: Number(fd.get('value')), threshold: fd.get('threshold') || '' });
            closeModal();
          }, { capture: true });
        }
      }, { signal });
    },
  };

  /* ---------------- fraud page ---------------- */
  App.pages.fraud = {
    init(root, signal) {
      const f = $('[data-fraud-form]', root);
      const out = $('[data-fraud-result]', root);
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const btn = $('button', f);
        btn.classList.add('loading');
        const r = await App.ajax.post('/admin/api/fraud/check', { phone: f.phone.value, force: f.force.checked ? 1 : 0 });
        btn.classList.remove('loading');
        if (!r.success) { App.ui.toast(r.message, 'error'); return; }
        out.innerHTML = r.data.html;
      }, { signal, capture: true });
    },
  };

  /* ---------------- notifications polling ---------------- */
  let lastCount = null;
  function setNotif(n) {
    $$('[data-notif-count]').forEach((b) => { b.textContent = App.bn(n); b.hidden = !n; });
  }
  async function poll() {
    if (document.hidden) return;
    const r = await App.ajax.get('/admin/api/notifications/count');
    if (!r.success) return;
    const n = r.data.count;
    if (lastCount !== null && n > lastCount && r.data.latest) {
      App.ui.toast(r.data.latest.title, 'info', { duration: 5000, action: r.data.latest.link ? { text: 'দেখুন', href: r.data.latest.link } : null });
    }
    lastCount = n;
    setNotif(n);
  }
  setInterval(poll, 45000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  /* ---------------- boot ---------------- */
  document.addEventListener('click', (e) => { const c = e.target.closest('[data-copy]'); if (c) { e.preventDefault(); App.ui.copy(c.dataset.copy); } });
  App.nav.init();
  App.router.start();
  poll();
})();
