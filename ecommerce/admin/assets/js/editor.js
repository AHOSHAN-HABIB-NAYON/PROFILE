/*!
 * editor.js — product editor (pricing ↔ discount, variant matrix, instant image
 * upload with progress & reordering, related-product picker) and the
 * lightweight rich-text editor used for descriptions and policy pages.
 */
(function (App) {
  'use strict';

  // ================================================================ Rich text editor
  function rteSync(rte) {
    var area = App.$('[data-rte-area]', rte), input = App.$('[data-rte-input]', rte);
    if (!area || !input) return;
    if (rte.classList.contains('is-source')) area.innerHTML = input.value; else input.value = area.innerHTML;
  }
  App.on('form:beforesubmit', function (form) { App.$$('[data-rte]', form).forEach(rteSync); });
  App.delegate('input', '[data-rte-area]', function (area) { rteSync(area.closest('[data-rte]')); });
  App.delegate('paste', '[data-rte-area]', function (area, e) {
    // Paste as plain text to avoid foreign styles; server sanitizes anyway.
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });

  App.delegate('click', '[data-rte-cmd]', function (btn, e) {
    e.preventDefault();
    var rte = btn.closest('[data-rte]');
    var area = App.$('[data-rte-area]', rte);
    var cmd = btn.getAttribute('data-rte-cmd');
    if (cmd === 'source') {
      var input = App.$('[data-rte-input]', rte);
      var toSource = !rte.classList.contains('is-source');
      if (toSource) input.value = area.innerHTML; else area.innerHTML = input.value;
      rte.classList.toggle('is-source', toSource);
      input.hidden = !toSource; area.hidden = toSource;
      return;
    }
    area.focus();
    if (cmd === 'h2' || cmd === 'h3' || cmd === 'p') document.execCommand('formatBlock', false, cmd);
    else if (cmd === 'link') {
      var url = window.prompt('Link URL (https://… or /page)');
      if (url && /^(https?:\/\/|\/)/i.test(url)) document.execCommand('createLink', false, url);
    } else if (cmd === 'image') {
      App.$('[data-rte-file]', rte).click();
      return;
    } else if (cmd === 'table') {
      document.execCommand('insertHTML', false, '<table><thead><tr><th>Header</th><th>Header</th></tr></thead><tbody><tr><td>Cell</td><td>Cell</td></tr><tr><td>Cell</td><td>Cell</td></tr></tbody></table><p></p>');
    } else document.execCommand(cmd, false, null);
    rteSync(rte);
  });

  App.delegate('change', '[data-rte-file]', function (input) {
    var rte = input.closest('[data-rte]');
    var file = input.files && input.files[0];
    if (!file) return;
    var fd = new FormData();
    fd.append('image', file);
    App.toast('Uploading image…', 'info');
    App.post(rte.getAttribute('data-upload'), fd).then(function (res) {
      var area = App.$('[data-rte-area]', rte);
      area.focus();
      document.execCommand('insertHTML', false, '<img src="' + App.escape(res.data.url) + '" alt="">');
      rteSync(rte);
    }, function (err) { App.toast(err.message, 'error'); });
    input.value = '';
  });

  // ================================================================ Pricing
  App.delegate('input', '[data-pricing] [data-discount]', function (d) {
    var box = d.closest('[data-pricing]');
    var price = parseFloat(App.$('[data-price]', box).value);
    var pct = parseFloat(d.value);
    var old = App.$('[data-old-price]', box);
    if (price > 0 && pct > 0 && pct < 95) old.value = Math.round(price / (1 - pct / 100));
    else if (!d.value) old.value = '';
  });
  App.delegate('input', '[data-pricing] [data-price], [data-pricing] [data-old-price]', function (el) {
    var box = el.closest('[data-pricing]');
    var price = parseFloat(App.$('[data-price]', box).value), old = parseFloat(App.$('[data-old-price]', box).value);
    App.$('[data-discount]', box).value = old > price && price > 0 ? Math.round((old - price) / old * 100) : '';
  });

  // ================================================================ Variants
  function variantRows(form) { return App.$$('[data-variants] tbody tr', form); }
  function syncStockField(form) {
    var stocks = App.$$('[data-variant-stock]', form);
    var stockInput = App.$('[data-stock-input]', form);
    if (!stockInput) return;
    var has = stocks.length > 0;
    stockInput.readOnly = has;
    App.$('[data-stock-hint]', form).hidden = !has;
    App.$('[data-variants-empty]', form).hidden = has;
    if (has) stockInput.value = stocks.reduce(function (n, s) { return n + (parseInt(s.value, 10) || 0); }, 0);
  }
  App.delegate('input', '[data-variant-stock]', function (el) { syncStockField(el.closest('form')); });

  App.action('variants-generate', function (btn) {
    var form = btn.closest('form');
    var sizes = (App.$('[data-sizes]', form).value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var colors = App.$$('[data-color-name]', form).map(function (i) { return i.value.trim(); }).filter(Boolean);
    if (!sizes.length && !colors.length) { App.toast('Add sizes or colors first.', 'error'); return; }
    var existing = {};
    variantRows(form).forEach(function (tr) {
      var get = function (k) { var el = tr.querySelector('[name$="[' + k + ']"]'); return el ? el.value : ''; };
      existing[get('size') + '|' + get('color')] = { sku: get('sku'), price: get('price'), stock: get('stock') };
    });
    var combos = [];
    (sizes.length ? sizes : ['']).forEach(function (s) { (colors.length ? colors : ['']).forEach(function (c) { combos.push([s, c]); }); });
    var tbody = App.$('[data-variants] tbody', form);
    tbody.innerHTML = combos.map(function (combo, i) {
      var prev = existing[combo[0] + '|' + combo[1]] || { sku: '', price: '', stock: '0' };
      var n = 'variants[' + i + ']';
      return '<tr><td>' + App.escape(combo[0] || '—') + '<input type="hidden" name="' + n + '[size]" value="' + App.escape(combo[0]) + '"></td>' +
        '<td>' + App.escape(combo[1] || '—') + '<input type="hidden" name="' + n + '[color]" value="' + App.escape(combo[1]) + '"></td>' +
        '<td><input class="input input-sm" name="' + n + '[sku]" value="' + App.escape(prev.sku) + '" aria-label="Variant SKU"></td>' +
        '<td><input class="input input-sm" type="number" step="0.01" min="0" name="' + n + '[price]" value="' + App.escape(prev.price) + '" placeholder="default" aria-label="Variant price"></td>' +
        '<td><input class="input input-sm" type="number" min="0" name="' + n + '[stock]" value="' + App.escape(prev.stock) + '" aria-label="Variant stock" data-variant-stock></td></tr>';
    }).join('');
    syncStockField(form);
    form.setAttribute('data-dirty', '1');
    App.toast(combos.length + ' variant(s) ready — set stock and save.', 'success');
  });

  // ================================================================ Images (instant upload, progress, reorder)
  function uploadFiles(zone, files) {
    if (!files || !files.length) return;
    var fd = new FormData();
    Array.prototype.slice.call(files, 0, 12).forEach(function (f) { fd.append('images[]', f); });
    var bar = App.$('[data-upload-progress]', zone);
    bar.hidden = false;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', zone.getAttribute('data-url'));
    xhr.setRequestHeader('X-CSRF-Token', App.csrfToken());
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = function (e) { if (e.lengthComputable) bar.firstElementChild.style.transform = 'scaleX(' + (e.loaded / e.total) + ')'; };
    xhr.onload = function () {
      bar.hidden = true; bar.firstElementChild.style.transform = 'scaleX(0)';
      var res = {};
      try { res = JSON.parse(xhr.responseText); } catch (e) { res = {}; }
      if (xhr.status >= 200 && xhr.status < 300 && res.success) {
        App.toast(res.message, 'success');
        App.router.refresh();
      } else App.toast(res.message || 'Upload failed.', 'error', { duration: 5000 });
    };
    xhr.onerror = function () { bar.hidden = true; App.toast('Network error during upload.', 'error'); };
    xhr.send(fd);
  }
  App.delegate('change', '[data-upload-input]', function (input) { uploadFiles(input.closest('[data-uploader]'), input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach(function (t) {
    document.addEventListener(t, function (e) {
      var z = e.target.closest && e.target.closest('.dropzone');
      if (z && e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1) { e.preventDefault(); z.classList.add('is-over'); }
    });
  });
  document.addEventListener('dragleave', function (e) { var z = e.target.closest && e.target.closest('.dropzone'); if (z) z.classList.remove('is-over'); });
  document.addEventListener('drop', function (e) {
    var z = e.target.closest && e.target.closest('.dropzone');
    if (!z || !e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    z.classList.remove('is-over');
    if (z.hasAttribute('data-uploader')) uploadFiles(z, e.dataTransfer.files);
    else {
      var input = z.querySelector('input[type="file"]');
      if (input) { input.files = e.dataTransfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  });

  function saveImageOrder(list) {
    var zone = App.$('[data-uploader]');
    if (!zone || !list) return;
    var order = App.$$('[data-image-id]', list).map(function (f) { return Number(f.getAttribute('data-image-id')); });
    App.post(zone.getAttribute('data-reorder'), { order: order }).then(function () { App.toast('Image order saved', 'success'); }, function (err) { App.toast(err.message, 'error'); });
  }
  App.on('list:sorted', function (list) { if (list.hasAttribute('data-image-list')) saveImageOrder(list); });
  App.action('image-move', function (btn) {
    var item = btn.closest('.image-item'), list = item.parentNode;
    if (btn.getAttribute('data-dir') === '-1' && item.previousElementSibling) list.insertBefore(item, item.previousElementSibling);
    else if (btn.getAttribute('data-dir') === '1' && item.nextElementSibling) list.insertBefore(item.nextElementSibling, item);
    else return;
    saveImageOrder(list);
  });

  // ================================================================ Related products picker
  var pickerCtrl = null;
  App.delegate('input', '[data-picker-input]', App.debounce(function (input) {
    var picker = input.closest('[data-picker]');
    var box = App.$('[data-picker-results]', picker);
    var q = input.value.trim();
    if (q.length < 2) { box.hidden = true; return; }
    if (pickerCtrl) pickerCtrl.abort();
    pickerCtrl = new AbortController();
    App.get(picker.getAttribute('data-search') + '?q=' + encodeURIComponent(q), { signal: pickerCtrl.signal }).then(function (res) {
      var selfId = (App.$('input[name="id"]', picker.closest('form')) || {}).value;
      var taken = App.$$('input[name="related[]"]', picker).map(function (i) { return i.value; });
      var items = res.data.items.filter(function (p) { return String(p.id) !== String(selfId) && taken.indexOf(String(p.id)) === -1; });
      box.innerHTML = items.length ? items.map(function (p) {
        return '<button type="button" class="picker-item" data-pick="' + p.id + '" data-name="' + App.escape(p.name) + '">' + App.escape(p.name) + (p.sku ? ' <span class="muted small">' + App.escape(p.sku) + '</span>' : '') + '</button>';
      }).join('') : '<p class="muted small picker-empty">No matching products</p>';
      box.hidden = false;
    }, function () {});
  }, 250));
  App.delegate('click', '[data-pick]', function (btn) {
    var picker = btn.closest('[data-picker]');
    var chip = document.createElement('span');
    chip.className = 'chip-item';
    chip.innerHTML = App.escape(btn.getAttribute('data-name')) + '<input type="hidden" name="related[]" value="' + Number(btn.getAttribute('data-pick')) + '"><button type="button" data-action="chip-remove" aria-label="Remove"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>';
    App.$('[data-picker-chips]', picker).appendChild(chip);
    App.$('[data-picker-results]', picker).hidden = true;
    App.$('[data-picker-input]', picker).value = '';
    picker.closest('form').setAttribute('data-dirty', '1');
  });
  App.action('chip-remove', function (btn) { var f = btn.closest('form'); btn.closest('.chip-item').remove(); if (f) f.setAttribute('data-dirty', '1'); });

  App.page('product-form', {
    mount: function (root) {
      var form = App.$('form[data-product-editor]', root);
      if (form) syncStockField(form);
      return null;
    }
  });
})(window.App);
