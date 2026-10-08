/*!
 * admin.js — admin shell behaviour, bound once via event delegation:
 * AJAX forms, confirm + POST actions, drawer, theme, notification polling,
 * slug generation, icon picker, repeaters, sortable lists, previews, Google Sign-In.
 */
(function (App) {
  'use strict';
  if (!App) return;
  var isAuth = App.config.scope === 'auth';

  function go(url) {
    if (!url) return;
    if (App.router && !isAuth) App.router.navigate(url); else window.location.href = url;
  }
  function refresh() {
    if (App.router && !isAuth) App.router.refresh(); else window.location.reload();
  }

  /** Handle the standard {success, message, data:{redirect|reload}} response. */
  function handleSuccess(res, opts) {
    opts = opts || {};
    var d = res.data || {};
    if (res.message && !opts.silent) App.toast(res.message, 'success');
    if (d.redirect) go(d.redirect);
    else if (d.reload) refresh();
    return d;
  }

  function showFieldErrors(form, errors) {
    App.$$('.is-invalid', form).forEach(function (el) { el.classList.remove('is-invalid'); });
    App.$$('.field-error[data-generated]', form).forEach(function (el) { el.remove(); });
    Object.keys(errors || {}).forEach(function (name) {
      var input = form.querySelector('[name="' + name + '"]');
      if (!input) return;
      input.classList.add('is-invalid');
      var p = document.createElement('p');
      p.className = 'field-error'; p.setAttribute('data-generated', '');
      p.textContent = errors[name];
      input.insertAdjacentElement('afterend', p);
    });
  }

  // ------------------------------------------------------------ AJAX forms
  App.delegate('submit', 'form[data-ajax]', function (form, e) {
    e.preventDefault();
    if (form.dataset.busy) return;
    var proceed = form.hasAttribute('data-confirm-submit')
      ? App.confirm({ text: form.getAttribute('data-confirm-submit'), confirmText: 'Continue', cancelText: 'Cancel' })
      : Promise.resolve(true);
    proceed.then(function (ok) {
      if (!ok) return;
      App.emit('form:beforesubmit', form);
      var btn = e.submitter || form.querySelector('[type="submit"]');
      form.dataset.busy = '1';
      App.loading(btn, true);
      var data = new FormData(form);
      App.post(form.getAttribute('action'), data).then(function (res) {
        showFieldErrors(form, {});
        App.emit('form:success', { form: form, res: res });
        if (form.hasAttribute('data-reset-on-success')) form.reset();
        if (!form.hasAttribute('data-compressor')) handleSuccess(res);
        else App.toast(res.message, 'success');
        form.removeAttribute('data-dirty');
      }, function (err) {
        showFieldErrors(form, err.data && err.data.errors);
        App.toast(err.message, 'error', { duration: 5000 });
        if (err.status === 401) setTimeout(function () { window.location.href = App.url('/admin/login'); }, 1200);
      }).then(function () {
        delete form.dataset.busy;
        App.loading(btn, false);
      });
    });
  });

  // ------------------------------------------------------------ POST actions (with optional confirm)
  App.action('post', function (btn) {
    var msg = btn.getAttribute('data-confirm');
    var ask = msg ? App.confirm({ text: msg, danger: btn.hasAttribute('data-danger') || btn.classList.contains('danger'), confirmText: 'Yes, continue', cancelText: 'Cancel' }) : Promise.resolve(true);
    ask.then(function (ok) {
      if (!ok) return;
      App.loading(btn, true);
      App.post(btn.getAttribute('data-url'), {}).then(function (res) {
        var removeSel = btn.getAttribute('data-remove-closest');
        if (removeSel) {
          var el = btn.closest(removeSel);
          if (el) el.remove();
          App.toast(res.message, 'success');
          App.emit('list:changed', btn);
        } else handleSuccess(res);
      }, function (err) { App.toast(err.message, 'error', { duration: 5000 }); }).then(function () { App.loading(btn, false); });
    });
  });

  // ------------------------------------------------------------ Auto-submit (filters, toggles)
  App.delegate('change', '[data-autosubmit]', function (el) {
    var form = el.form || el.closest('form');
    if (!form) return;
    if (form.requestSubmit) form.requestSubmit(); else form.submit();
  });

  // ------------------------------------------------------------ Drawer & user menu
  var sidebar = App.$('#sidebar'), backdrop = App.$('.drawer-backdrop');
  App.action('drawer-open', function () {
    if (!sidebar) return;
    backdrop.hidden = false;
    requestAnimationFrame(function () { backdrop.classList.add('is-visible'); sidebar.classList.add('is-open'); });
    document.body.classList.add('drawer-open');
  });
  function closeDrawer() {
    if (!sidebar || !sidebar.classList.contains('is-open')) return;
    sidebar.classList.remove('is-open'); backdrop.classList.remove('is-visible');
    document.body.classList.remove('drawer-open');
    setTimeout(function () { backdrop.hidden = true; }, 260);
  }
  App.action('drawer-close', closeDrawer);
  App.on('drawer:close', closeDrawer);
  App.on('route:start', closeDrawer);

  App.action('user-menu', function (btn) {
    var menu = btn.nextElementSibling;
    var open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('click', function (e) {
    var menu = App.$('.a-user-menu');
    if (menu && !menu.hidden && !e.target.closest('.a-user')) { menu.hidden = true; }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

  // Bottom-nav indicator
  function moveIndicator() {
    var items = App.$$('.bottom-nav .bn-item');
    var idx = items.findIndex(function (i) { return i.classList.contains('is-active'); });
    var inner = App.$('.bottom-nav-inner');
    if (inner) { inner.style.setProperty('--bn-index', Math.max(0, idx)); inner.classList.toggle('no-active', idx < 0); }
  }
  moveIndicator();
  App.on('nav', moveIndicator);

  // ------------------------------------------------------------ Theme
  App.action('admin-theme', function () {
    var t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    App.store.set('ns-admin-theme', t);
  });

  // ------------------------------------------------------------ Notifications polling
  if (App.config.scope === 'admin') {
    var lastId = 0;
    var poll = function () {
      if (document.hidden) return;
      App.get(App.url('/admin/poll?after=' + lastId)).then(function (res) {
        var d = res.data;
        App.$$('[data-notif-count]').forEach(function (b) { b.textContent = d.unread > 99 ? '99+' : d.unread; b.hidden = d.unread === 0; });
        if (lastId > 0) (d.new || []).slice(0, 3).forEach(function (n) {
          App.toast(n.title, n.type === 'security' || n.type === 'courier_error' ? 'error' : 'info', n.link ? { actionText: 'Open', onAction: function () { go(n.link); }, duration: 6000 } : {});
        });
        lastId = d.latest;
      }, function () { /* offline or logged out */ });
    };
    poll();
    setInterval(poll, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
  }

  // ------------------------------------------------------------ Slug generation
  var slugify = App.debounce(function (source) {
    var target = App.$(source.getAttribute('data-slug-source'));
    if (!target || target.hasAttribute('data-slug-locked') || !source.value.trim()) return;
    App.get(App.url('/admin/slug?text=' + encodeURIComponent(source.value))).then(function (res) { target.value = res.data.slug; });
  }, 350);
  App.delegate('input', '[data-slug-source]', slugify);
  App.delegate('input', '[data-slug-target]', function (el) { el.setAttribute('data-slug-locked', ''); });

  // ------------------------------------------------------------ Password visibility
  App.action('toggle-password', function (btn) {
    var input = App.$(btn.getAttribute('data-target'));
    if (!input) return;
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.querySelector('i').className = 'fa-solid ' + (show ? 'fa-eye-slash' : 'fa-eye');
  });

  // ------------------------------------------------------------ Icon picker
  App.action('icon-picker', function (btn) {
    var lib = App.$('[data-icon-library]');
    var icons = [];
    try { icons = JSON.parse(lib.textContent); } catch (e) { icons = []; }
    var form = btn.closest('form');
    var html = '<input type="search" class="input" placeholder="Search icons (shirt, phone, food…)" data-icon-search autofocus>' +
      '<div class="icon-grid" data-icon-grid>' + icons.map(function (i) {
        return '<button type="button" class="icon-cell" data-icon="' + App.escape(i.icon_class) + '" data-terms="' + App.escape((i.label + ' ' + i.group_name + ' ' + (i.keywords || '')).toLowerCase()) + '" title="' + App.escape(i.label) + '">' +
          '<i class="' + App.escape(i.icon_class) + '" aria-hidden="true"></i><span>' + App.escape(i.label) + '</span></button>';
      }).join('') + '</div>';
    var m = App.modal({ title: 'Choose an icon', icon: 'fa-solid fa-icons', html: html, size: 'lg' });
    m.body.addEventListener('input', function (e) {
      if (!e.target.matches('[data-icon-search]')) return;
      var q = e.target.value.trim().toLowerCase();
      App.$$('.icon-cell', m.body).forEach(function (c) { c.hidden = q && c.getAttribute('data-terms').indexOf(q) === -1; });
    });
    m.body.addEventListener('click', function (e) {
      var cell = e.target.closest('[data-icon]');
      if (!cell) return;
      var cls = cell.getAttribute('data-icon');
      form.querySelector('[data-icon-input]').value = cls;
      form.querySelector('[data-icon-preview]').innerHTML = '<i class="' + App.escape(cls) + '" aria-hidden="true"></i>';
      var fa = form.querySelector('input[name="icon_type"][value="fa"]');
      if (fa) fa.checked = true;
      m.close(true);
    });
  });

  // ------------------------------------------------------------ File previews
  App.delegate('change', 'input[type="file"][data-preview-target]', function (input) {
    var box = App.$(input.getAttribute('data-preview-target'));
    if (!box) return;
    box.innerHTML = '';
    Array.prototype.slice.call(input.files || [], 0, 12).forEach(function (f) {
      if (!/^image\//.test(f.type)) return;
      var fig = document.createElement('figure');
      fig.className = 'image-item';
      var img = document.createElement('img');
      img.src = URL.createObjectURL(f); img.alt = ''; img.width = 120; img.height = 120;
      img.onload = function () { URL.revokeObjectURL(img.src); };
      var cap = document.createElement('figcaption');
      cap.textContent = (f.size / 1048576).toFixed(2) + ' MB → optimized on upload';
      fig.appendChild(img); fig.appendChild(cap);
      box.appendChild(fig);
    });
  });

  // ------------------------------------------------------------ Repeaters
  App.action('repeater-add', function (btn) {
    var name = btn.getAttribute('data-target');
    var scope = btn.closest('.field') || document;
    var tpl = App.$('template[data-template="' + name + '"]', scope);
    var list = App.$('[data-repeater="' + name + '"]', scope);
    if (!tpl || !list) return;
    var row = tpl.content.firstElementChild.cloneNode(true);
    list.appendChild(row);
    var first = row.querySelector('input');
    if (first) first.focus();
  });
  App.action('repeater-remove', function (btn) { var row = btn.closest('.repeater-row'); if (row) row.remove(); App.emit('repeater:change'); });

  // ------------------------------------------------------------ Sortable lists (drag + buttons)
  App.action('list-move', function (btn) {
    var item = btn.closest('li');
    if (!item) return;
    if (btn.getAttribute('data-dir') === '-1' && item.previousElementSibling) item.parentNode.insertBefore(item, item.previousElementSibling);
    if (btn.getAttribute('data-dir') === '1' && item.nextElementSibling) item.parentNode.insertBefore(item.nextElementSibling, item);
    btn.focus();
  });
  var dragging = null;
  document.addEventListener('dragstart', function (e) {
    var item = e.target.closest && e.target.closest('[data-sortable-list] > li, [data-image-list] > .image-item');
    if (!item) return;
    dragging = item;
    item.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', ''); } catch (err) { /* ignore */ }
  });
  document.addEventListener('dragover', function (e) {
    if (!dragging) return;
    var over = e.target.closest && e.target.closest('[data-sortable-list] > li, [data-image-list] > .image-item');
    if (!over || over === dragging || over.parentNode !== dragging.parentNode) return;
    e.preventDefault();
    var rect = over.getBoundingClientRect();
    var after = dragging.parentNode.hasAttribute('data-image-list') ? (e.clientX > rect.left + rect.width / 2) : (e.clientY > rect.top + rect.height / 2);
    over.parentNode.insertBefore(dragging, after ? over.nextSibling : over);
  });
  document.addEventListener('dragend', function () {
    if (!dragging) return;
    dragging.classList.remove('is-dragging');
    App.emit('list:sorted', dragging.parentNode);
    dragging = null;
  });

  // ------------------------------------------------------------ Bulk select
  App.delegate('change', '[data-check-all]', function (all) {
    var form = all.closest('form');
    App.$$('[data-check-item]', form).forEach(function (c) { c.checked = all.checked; });
    updateBulk(form);
  });
  App.delegate('change', '[data-check-item]', function (c) { updateBulk(c.closest('form')); });
  function updateBulk(form) {
    var n = App.$$('[data-check-item]:checked', form).length;
    var bar = App.$('[data-bulk-bar]', form);
    if (bar) { bar.hidden = n === 0; App.$('[data-bulk-count]', bar).textContent = n + ' selected'; }
  }

  // ------------------------------------------------------------ Misc
  App.delegate('input', '[data-color-live]', function (input) {
    var v = input.getAttribute('data-color-live');
    if (v) document.documentElement.style.setProperty(v, input.value);
    var code = input.parentNode.querySelector('code');
    if (code) code.textContent = input.value;
  });
  App.delegate('input', '[data-counter]', function (el) {
    var c = el.parentNode.querySelector('.char-count');
    if (!c) { c = document.createElement('span'); c.className = 'char-count small muted'; el.insertAdjacentElement('afterend', c); }
    c.textContent = el.value.length + (el.maxLength > 0 ? ' / ' + el.maxLength : '');
  });
  App.delegate('change', '[data-parent-select]', function (sel) { filterChildren(sel); });
  function filterChildren(sel) {
    var child = App.$(sel.getAttribute('data-parent-select'));
    if (!child) return;
    App.$$('option[data-parent]', child).forEach(function (o) {
      o.hidden = sel.value !== '' && o.getAttribute('data-parent') !== sel.value;
      if (o.hidden && o.selected) child.value = '';
    });
  }
  App.on('route:change', function () { App.$$('[data-parent-select]').forEach(filterChildren); });
  App.on('ready', function () { App.$$('[data-parent-select]').forEach(filterChildren); });

  App.action('courier-balance', function (btn) {
    App.loading(btn, true);
    App.post(btn.getAttribute('data-url'), {}).then(function (res) { App.toast(res.message, 'success'); }, function (err) { App.toast(err.message, 'error'); })
      .then(function () { App.loading(btn, false); });
  });

  // Compressor result
  App.on('form:success', function (d) {
    if (!d.form.hasAttribute('data-compressor')) return;
    var r = d.res.data, box = App.$('[data-compress-result]', d.form);
    box.hidden = false;
    box.innerHTML = '<div class="stat-row"><div><strong>' + r.original_kb + ' KB</strong><span>Original</span></div><div><strong class="text-success">' + r.kb + ' KB</strong><span>Compressed</span></div>' +
      '<div><strong>' + r.saved + '%</strong><span>Saved</span></div><div><strong>' + r.width + '×' + r.height + '</strong><span>Size (q' + r.quality + ')</span></div></div>' +
      '<a class="btn btn-primary" data-no-spa href="' + App.escape(r.download) + '"><i class="fa-solid fa-download" aria-hidden="true"></i> Download</a>';
  });

  // Unsaved-changes guard for editors
  App.delegate('input', 'form[data-product-editor]', function (form) {
    form.setAttribute('data-dirty', '1');
    var note = App.$('[data-dirty-note]', form); if (note) note.hidden = false;
  });
  window.addEventListener('beforeunload', function (e) {
    if (App.$('form[data-dirty]')) { e.preventDefault(); e.returnValue = ''; }
  });

  // Google Identity Services callback (login page)
  window.nsGoogleLogin = function (response) {
    var next = App.$('input[name="next"]');
    App.post(App.url('/admin/login/google'), { credential: response.credential, next: next ? next.value : '/admin' })
      .then(function (res) { handleSuccess(res); }, function (err) { App.toast(err.message, 'error', { duration: 5000 }); });
  };
})(window.App);
