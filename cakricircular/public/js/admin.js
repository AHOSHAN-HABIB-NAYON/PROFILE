/* চাকরি সার্কুলার — admin panel client */
(function () {
  'use strict';
  var ADM = window.__ADM || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var main = $('#adm');
  var BN = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  function bn(n) { return String(n).replace(/[0-9]/g, function (d) { return BN[d]; }); }

  /* toast */
  var tt;
  function toast(msg, err) { var t = $('#toast'); t.textContent = msg; t.className = 'toast on' + (err ? ' err' : ''); clearTimeout(tt); tt = setTimeout(function () { t.className = 'toast'; }, 3200); }

  /* theme + drawer */
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-theme-toggle]')) {
      var dark = document.documentElement.getAttribute('data-theme') !== 'dark';
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (_) {}
    }
    if (e.target.closest('[data-drawer]')) $('#aSide').classList.add('open');
    if (e.target.closest('[data-drawer-close]')) $('#aSide').classList.remove('open');
  });

  /* confirm modal */
  function confirmBox(text) {
    return new Promise(function (resolve) {
      var m = $('#confirmModal'); $('#cfText').textContent = text || 'আপনি কি নিশ্চিত?';
      m.classList.add('open');
      function done(v) { m.classList.remove('open'); m.removeEventListener('click', h); resolve(v); }
      function h(e) { if (e.target.closest('[data-ok]')) done(true); else if (e.target.closest('[data-cancel]')) done(false); }
      m.addEventListener('click', h);
    });
  }

  /* ---------------- partial navigation ---------------- */
  var progress = $('#progress');
  function isAdminLink(a) {
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return false;
    var href = a.getAttribute('href'); if (!href || href.charAt(0) === '#') return false;
    var u = new URL(a.href, location.href);
    return u.origin === location.origin && (u.pathname === ADM.base || u.pathname.indexOf(ADM.base + '/') === 0) && !/\/(logout|login)$/.test(u.pathname);
  }
  function go(url, push) {
    progress.classList.add('on'); progress.style.width = '40%';
    main.classList.add('out');
    return fetch(url, { headers: { 'X-Partial': '1', 'X-Admin': '1' }, credentials: 'same-origin' }).then(function (r) {
      if (r.redirected && /\/login/.test(r.url)) { location.href = r.url; throw new Error('login'); }
      if ((r.headers.get('content-type') || '').indexOf('json') === -1) { location.href = url; throw new Error('full'); }
      return r.json();
    }).then(function (d) {
      if (push !== false) history.pushState({}, '', url);
      main.innerHTML = d.body; main.setAttribute('data-nav', d.nav);
      document.title = d.docTitle || d.title; $('#aTitle').textContent = d.title;
      $$('[data-nav]').forEach(function (el) { if (el !== main) el.classList.toggle('on', el.getAttribute('data-nav') === d.nav); });
      main.classList.remove('out'); main.style.animation = 'none'; void main.offsetWidth; main.style.animation = '';
      $('#aSide').classList.remove('open');
      if (push !== false) window.scrollTo(0, 0);
      init(main);
    }).catch(function (e) { if (e.message !== 'login' && e.message !== 'full') location.href = url; })
      .finally(function () { progress.style.width = '100%'; setTimeout(function () { progress.classList.remove('on'); progress.style.width = '0'; }, 200); main.classList.remove('out'); });
  }
  function reload() { return go(location.pathname + location.search, false); }
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var a = e.target.closest('a'); if (!isAdminLink(a)) return;
    e.preventDefault(); go(a.getAttribute('href'));
  });
  window.addEventListener('popstate', function () { go(location.pathname + location.search, false); });

  /* ---------------- ajax forms ---------------- */
  function post(url, body) {
    return fetch(url, { method: 'POST', body: body, credentials: 'same-origin', headers: { 'X-CSRF-Token': ADM.csrf, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'সার্ভার থেকে সঠিক উত্তর আসেনি (' + r.status + ')' }; }); });
  }
  function impStep(f, n, done) {
    $$('.imp-steps li', f.parentNode).forEach(function (li, i) { li.classList.toggle('on', i < n); li.classList.toggle('done', i < n - 1 || (i === n - 1 && done)); });
  }
  document.addEventListener('click', function (e) {
    var ch = e.target.closest && e.target.closest('[data-fill]'); if (!ch) return;
    var inp = $('[name="' + ch.getAttribute('data-fill') + '"]'); if (inp) { inp.value = ch.getAttribute('data-val'); inp.focus(); }
  });
  function handle(d) {
    if (!d) return;
    if (d.ok) {
      if (d.message) toast(d.message);
      if (d.redirect) go(d.redirect);
      else if (d.reload) reload();
      if (d.poll) startPoll(true);
    } else toast(d.error || 'সমস্যা হয়েছে', true);
    return d;
  }
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.matches('[data-plain]')) {
      if (f.method.toLowerCase() === 'get') { e.preventDefault(); var qs = new URLSearchParams(new FormData(f)).toString(); go(f.getAttribute('action') + '?' + qs); }
      return;
    }
    if (!f.matches('[data-ajax], [data-bulk]')) return;
    e.preventDefault();
    var sub = e.submitter;
    var conf = sub && sub.hasAttribute('data-no-confirm') ? null : ((sub && sub.getAttribute('data-confirm')) || f.getAttribute('data-confirm'));
    var action = sub && sub.hasAttribute('formaction') ? sub.getAttribute('formaction') : f.getAttribute('action');
    (conf ? confirmBox(conf) : Promise.resolve(true)).then(function (yes) {
      if (!yes) return;
      syncEditors(f);
      var fd = new FormData(f);
      if (sub && sub.name) fd.set(sub.name, sub.value);
      var btns = $$('button[type=submit], button:not([type])', f); btns.forEach(function (b) { b.disabled = true; });
      var old = sub ? sub.innerHTML : '';
      if (sub && !sub.classList.contains('icon-btn')) sub.innerHTML = 'অপেক্ষা করুন…';
      var res = $('[data-result]', f);
      if (res && f.hasAttribute('data-imp-form')) { res.innerHTML = '<div class="imp-wait"><span class="spin"></span>' + (/check/.test(action) ? 'পুরোনো ডাটাবেস যাচাই হচ্ছে…' : 'ইমপোর্ট চলছে — পোস্ট, লিংক, ছবি আনা হচ্ছে। পাতাটি বন্ধ করবেন না…') + '</div>'; impStep(f, /check/.test(action) ? 2 : 3, false); }
      post(action, fd).then(function (d) {
        if (d.ok && d.slug) { var s = $('[name=slug]', f); if (s) s.value = d.slug; }
        if (res) { res.innerHTML = d.ok && d.html ? d.html : (d.ok ? '' : '<div class="imp-card err"><div class="imp-card-h"><b>' + (d.error || 'সমস্যা হয়েছে').replace(/</g, '&lt;') + '</b></div></div>'); if (f.hasAttribute('data-imp-form')) impStep(f, /check/.test(action) ? 2 : 3, d.ok); if (d.html) res.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        handle(d);
      }).catch(function () { toast('ইন্টারনেট সংযোগ পরীক্ষা করুন', true); })
        .finally(function () { btns.forEach(function (b) { b.disabled = false; }); if (sub && old) sub.innerHTML = old; });
    });
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.matches('[data-autosubmit]')) {
      var f = el.form || el.closest('form');
      if (f) f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
  });
  // toggles inside <summary> must not open/close the <details>
  document.addEventListener('click', function (e) {
    var inp = e.target.closest && e.target.closest('summary form input');
    if (!inp) { if (e.target.closest && e.target.closest('summary form')) e.preventDefault(); return; }
    e.preventDefault();
    setTimeout(function () { inp.checked = !inp.checked; inp.dispatchEvent(new Event('change', { bubbles: true })); }, 0);
  }, true);

  document.addEventListener('click', function (e) {
    var d = e.target.closest('[data-delete]');
    if (d) {
      e.preventDefault();
      confirmBox(d.getAttribute('data-confirm')).then(function (yes) { if (yes) post(d.getAttribute('data-delete'), new FormData()).then(handle); });
      return;
    }
    var pa = e.target.closest('[data-post-action]');
    if (pa) {
      var act = pa.getAttribute('data-post-action');
      confirmBox(act === 'trash' ? 'পোস্টটি ট্র্যাশে যাবে।' : 'পোস্টটি রিস্টোর হবে।').then(function (yes) { if (yes) post(ADM.base + '/posts/' + pa.getAttribute('data-id') + '/' + act, new FormData()).then(handle); });
      return;
    }
    var te = e.target.closest('[data-toggle-el]');
    if (te) { var el = $(te.getAttribute('data-toggle-el')); if (el) { el.hidden = !el.hidden; if (!el.hidden) { var inp = $('input:not([type=hidden]), textarea', el); inp && inp.focus(); } } return; }
    var cp = e.target.closest('[data-copy]');
    if (cp) { navigator.clipboard && navigator.clipboard.writeText(cp.textContent.trim()).then(function () { toast('কপি হয়েছে ✓'); }); return; }
    var tab = e.target.closest('[data-tabs] [data-tab]');
    if (tab) {
      var wrap = tab.closest('[data-tabs]'); var name = tab.getAttribute('data-tab');
      $$('[data-tab]', wrap).forEach(function (x) { x.classList.toggle('on', x === tab); });
      $$('[data-pane]', wrap.parentNode).forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== name; });
    }
  });

  /* ---------------- bulk select ---------------- */
  function bulkUpdate(root) {
    var f = $('[data-bulk]', root || document); if (!f) return;
    var n = $$('[data-check]:checked', f).length;
    var bar = $('[data-bulkbar]', f); bar.hidden = !n; $('[data-bulk-count]', f).textContent = bn(n);
  }
  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-check-all]')) { var f = e.target.closest('form'); $$('[data-check]', f).forEach(function (c) { c.checked = e.target.checked; }); }
    if (e.target.matches('[data-check], [data-check-all]')) bulkUpdate();
  });

  /* ---------------- file previews ---------------- */
  document.addEventListener('change', function (e) {
    var inp = e.target; if (!inp.matches('[data-file-preview]')) return;
    var file = inp.files && inp.files[0]; if (!file) return;
    var box = $('[data-preview="' + inp.getAttribute('data-file-preview') + '"]', inp.closest('form'));
    var mb = (file.size / 1048576).toFixed(1);
    if (box && file.type.indexOf('image') === 0) { var url = URL.createObjectURL(file); box.innerHTML = '<img src="' + url + '" alt="">'; }
    toast(file.name + ' — ' + bn(mb) + 'MB' + (file.type.indexOf('image') === 0 ? ' (সেভ করলে অটো কম্প্রেস হবে)' : ''));
  });

  /* ---------------- rich editor ---------------- */
  function syncEditors(root) {
    $$('[data-editor]', root).forEach(function (ed) {
      var area = $('[data-ed-area]', ed); var src = $('.ed-src', ed);
      if (!src.hidden) area.innerHTML = src.value; else src.value = area.innerHTML;
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.ed-bar button'); if (!b) return;
    e.preventDefault();
    var ed = b.closest('[data-editor]'); var area = $('[data-ed-area]', ed); var src = $('.ed-src', ed);
    var cmd = b.getAttribute('data-cmd');
    if (cmd === 'html') {
      if (src.hidden) { src.value = area.innerHTML; src.hidden = false; area.hidden = true; } else { area.innerHTML = src.value; src.hidden = true; area.hidden = false; }
      b.classList.toggle('on', !src.hidden); return;
    }
    area.focus();
    if (cmd === 'createLink') { var u = prompt('লিংক (https://...)'); if (u) document.execCommand('createLink', false, u); return; }
    if (cmd === 'table') { document.execCommand('insertHTML', false, '<table><tbody><tr><th>বিষয়</th><td>তথ্য</td></tr><tr><th>বিষয়</th><td>তথ্য</td></tr></tbody></table><p></p>'); return; }
    document.execCommand(cmd, false, b.getAttribute('data-arg') || null);
  });
  document.addEventListener('paste', function (e) {
    var area = e.target.closest && e.target.closest('[data-ed-area]'); if (!area) return;
    var html = e.clipboardData.getData('text/html');
    if (html) {
      e.preventDefault();
      var tmp = document.createElement('div'); tmp.innerHTML = html;
      $$('*', tmp).forEach(function (n) { n.removeAttribute('style'); n.removeAttribute('class'); n.removeAttribute('id'); if (/^(SCRIPT|STYLE|META|LINK|FONT|SPAN)$/.test(n.tagName)) { if (n.tagName === 'SPAN' || n.tagName === 'FONT') n.replaceWith.apply(n, n.childNodes); else n.remove(); } });
      document.execCommand('insertHTML', false, tmp.innerHTML);
    }
  });

  /* ---------------- slug / counters / serp ---------------- */
  function slugify(t) { return String(t).toLowerCase().replace(/[^ঀ-৿a-z0-9\s-]+/g, ' ').trim().replace(/[\s_-]+/g, '-').slice(0, 90).replace(/-+$/, ''); }
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.matches('[data-slug-src]')) {
      var f = el.form; var out = $('[data-slug-out]', f);
      if (out && (!out.value || out.getAttribute('data-auto') === '1') && /\/new$/.test(f.getAttribute('action'))) { out.value = slugify(el.value); out.setAttribute('data-auto', '1'); }
      var st = $('[data-serp-title]', f); if (st && !$('[name=meta_title]', f).value) st.textContent = el.value;
    }
    if (el.matches('[data-slug-out]')) el.removeAttribute('data-auto');
    if (el.matches('[name=meta_title]')) { var s = $('[data-serp-title]', el.form); if (s) s.textContent = el.value || ($('[name=title]', el.form) || {}).value || ''; }
    if (el.matches('[name=meta_desc]')) { var d = $('[data-serp-desc]', el.form); if (d) d.textContent = el.value; }
    if (el.matches('[data-count]')) counter(el);
  });
  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-role-select]')) { var p = $('[data-perms]', e.target.form); if (p) p.hidden = e.target.value !== 'moderator'; }
    if (e.target.matches('[data-ad-type]')) adType(e.target.form);
  });
  function counter(el) {
    var max = +el.getAttribute('data-count'); var c = el.parentNode.querySelector('.count');
    if (!c) { c = document.createElement('small'); c.className = 'count'; el.after(c); }
    var n = [...el.value].length; c.textContent = bn(n) + ' / ' + bn(max); c.classList.toggle('over', n > max);
  }
  function adType(f) {
    if (!f) return; var html = $('[data-ad-type]', f).value === 'html';
    var h = $('[name=html]', f); if (h) h.closest('.field').hidden = !html;
    var img = $('[name=image]', f); if (img) img.closest('.field').hidden = html;
    var link = $('[name=link]', f); if (link) link.closest('.field').hidden = html;
  }

  /* ---------------- automation live log ---------------- */
  var pollTimer = null;
  function startPoll(force) {
    var log = $('[data-log]', main); if (!log) return;
    var steps = $('[data-steps]', main);
    if (!force && steps.getAttribute('data-status') !== 'running') return;
    clearInterval(pollTimer);
    $('[data-live]', main) && ($('[data-live]', main).hidden = false);
    var btn = $('[data-run-now]', main); if (btn) { btn.disabled = true; btn.textContent = 'চলছে…'; }
    var idle = 0;
    pollTimer = setInterval(function () {
      if (!document.body.contains(log)) { clearInterval(pollTimer); return; }
      fetch(ADM.base + '/automation/poll?since=' + log.getAttribute('data-since'), { headers: { 'X-Admin': '1' } }).then(function (r) { return r.json(); }).then(function (d) {
        d.logs.forEach(function (l) { log.insertAdjacentHTML('beforeend', l.html); log.setAttribute('data-since', l.id); });
        if (d.logs.length) log.scrollTop = log.scrollHeight;
        if (d.run) paintSteps(steps, d.run);
        if (!d.locked && d.run && d.run.status !== 'running') { if (++idle > 1) { clearInterval(pollTimer); $('[data-live]', main).hidden = true; setTimeout(reload, 800); } }
      }).catch(function () {});
    }, 1500);
  }
  function paintSteps(steps, run) {
    $$('li', steps).forEach(function (li) {
      var n = +li.getAttribute('data-step'); var cls = '';
      if (run.status === 'running') cls = n < run.step ? 'done' : n === run.step ? 'active' : '';
      else cls = n <= run.step ? (run.status === 'failed' && n === run.step ? 'fail' : 'done') : '';
      li.className = cls;
    });
  }

  /* ---------------- init per page ---------------- */
  function init(root) {
    bulkUpdate(root);
    $$('[data-count]', root).forEach(counter);
    $$('form', root).forEach(function (f) { if ($('[data-ad-type]', f)) adType(f); });
    var log = $('[data-log]', root); if (log) { log.scrollTop = log.scrollHeight; startPoll(false); }
  }
  init(document);
})();

/* ---------------- post editor: links repeater & gallery ---------------- */
(function () {
  var BN = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  function bn(n) { return String(n).replace(/[0-9]/g, function (d) { return BN[d]; }); }
  function reindex(box) {
    var rows = box.querySelectorAll('[data-lk-row]');
    rows.forEach(function (r, i) {
      r.querySelectorAll('[name^="links["]').forEach(function (inp) { inp.name = inp.name.replace(/^links\[[^\]]*\]/, 'links[' + i + ']'); });
    });
    var c = box.querySelector('[data-lk-count]'); if (c) c.textContent = bn(rows.length) + 'টি';
  }
  document.addEventListener('click', function (e) {
    var box = e.target.closest && e.target.closest('[data-links]'); if (!box) return;
    var rowsEl = box.querySelector('[data-lk-rows]');
    if (e.target.closest('[data-lk-add]')) {
      var tpl = box.querySelector('[data-lk-tpl]');
      rowsEl.insertAdjacentHTML('beforeend', tpl.innerHTML);
      var row = rowsEl.lastElementChild; row.classList.add('lk-new');
      reindex(box); var inp = row.querySelector('.lk-label'); if (inp) inp.focus();
      return;
    }
    var del = e.target.closest('[data-lk-del]');
    if (del) { var r = del.closest('[data-lk-row]'); r.classList.add('lk-out'); setTimeout(function () { r.remove(); reindex(box); }, 180); return; }
    var up = e.target.closest('[data-lk-up]');
    if (up) { var ro = up.closest('[data-lk-row]'); if (ro.previousElementSibling) { rowsEl.insertBefore(ro, ro.previousElementSibling); reindex(box); } }
  });
  // paste a URL into the label box → move it to the URL box
  document.addEventListener('paste', function (e) {
    var t = e.target; if (!t.classList || !t.classList.contains('lk-label')) return;
    var text = (e.clipboardData || window.clipboardData).getData('text');
    var url = t.closest('[data-lk-row]').querySelector('.lk-url');
    if (/^https?:\/\//i.test(text.trim()) && url && !url.value) { e.preventDefault(); url.value = text.trim(); }
  });
  // gallery: preview newly picked images
  document.addEventListener('change', function (e) {
    var inp = e.target; if (!inp.matches || !inp.matches('[data-ge-input]')) return;
    var grid = inp.closest('[data-ge-grid]');
    grid.querySelectorAll('.ge-pending').forEach(function (x) { x.remove(); });
    var files = Array.prototype.slice.call(inp.files || []);
    files.forEach(function (f) {
      var fig = document.createElement('div'); fig.className = 'ge-item ge-pending';
      var img = document.createElement('img'); img.src = URL.createObjectURL(f); img.alt = '';
      var b = document.createElement('span'); b.className = 'ge-new'; b.textContent = 'নতুন';
      fig.appendChild(img); fig.appendChild(b); grid.insertBefore(fig, inp.closest('.ge-add'));
    });
    var note = grid.parentNode.querySelector('[data-ge-note]');
    if (note) { note.hidden = !files.length; note.textContent = bn(files.length) + 'টি নতুন ছবি সেভ করলে আপলোড হবে'; }
  });
  document.addEventListener('change', function (e) {
    var c = e.target; if (!c.matches || !c.matches('.ge-del input')) return;
    c.closest('.ge-item').classList.toggle('ge-removing', c.checked);
  });
})();
