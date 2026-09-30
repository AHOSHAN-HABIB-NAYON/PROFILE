/* এডমিন প্যানেল — ছোট ইন্টারঅ্যাকশন (লাইব্রেরি ছাড়া) */
(function () {
  'use strict';
  var d = document, $ = function (s, r) { return (r || d).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || d).querySelectorAll(s)); };
  function toast(msg, type) { var h = $('#toastHost'); if (!h) return; var t = d.createElement('div'); t.className = 'toast ' + (type || ''); t.textContent = msg; h.appendChild(t); setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 320); }, 2600); }
  window.admToast = toast;
  /* থিম */
  function setTheme(t) { if (t === 'dark') d.documentElement.setAttribute('data-theme', 'dark'); else d.documentElement.removeAttribute('data-theme'); try { localStorage.setItem('cc_theme', t); } catch (e) { /* */ } }
  d.addEventListener('click', function (e) {
    var b;
    if (e.target.closest('#admTheme')) { setTheme(d.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); return; }
    if (e.target.closest('#admBurger, [data-open-menu]')) { $('#aSide').classList.add('open'); $('#aMask').classList.add('open'); return; }
    if (e.target.closest('#aMask, [data-close-menu]')) { $('#aSide').classList.remove('open'); $('#aMask').classList.remove('open'); return; }
    if ((b = e.target.closest('[data-confirm]')) && !confirm(b.getAttribute('data-confirm'))) { e.preventDefault(); return; }
    if ((b = e.target.closest('[data-all]'))) { var on = b.checked; $$(b.getAttribute('data-all')).forEach(function (c) { c.checked = on; }); return; }
    if ((b = e.target.closest('[data-toggle]'))) { var el = $(b.getAttribute('data-toggle')); if (el) el.classList.toggle('on'); return; }
    if ((b = e.target.closest('[data-copy]'))) { navigator.clipboard && navigator.clipboard.writeText(b.getAttribute('data-copy')); toast('কপি হয়েছে ✓', 'ok'); }
  });
  /* ফর্ম সাবমিটে বাটন ডিসেবল (ডাবল ক্লিক ঠেকাতে) */
  d.addEventListener('submit', function (e) { var f = e.target; if (f.hasAttribute('data-nolock')) return; setTimeout(function () { $$('button[type=submit]', f).forEach(function (b) { b.disabled = true; b.style.opacity = '.65'; }); }, 10); });
  /* পোস্ট এডিটর */
  var ta = $('#content');
  if (ta) {
    function wrap(open, close, ph) { var s = ta.selectionStart, e2 = ta.selectionEnd, v = ta.value, sel = v.slice(s, e2) || ph || ''; ta.value = v.slice(0, s) + open + sel + close + v.slice(e2); ta.focus(); ta.selectionStart = s + open.length; ta.selectionEnd = s + open.length + sel.length; }
    $$('.ed-tools [data-tag]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = b.getAttribute('data-tag');
        if (t === 'b') wrap('<b>', '</b>', 'মোটা লেখা'); else if (t === 'i') wrap('<i>', '</i>', 'বাঁকা লেখা');
        else if (t === 'h2') wrap('<h2>', '</h2>', 'শিরোনাম'); else if (t === 'h3') wrap('<h3>', '</h3>', 'উপ-শিরোনাম');
        else if (t === 'ul') wrap('<ul>\n  <li>', '</li>\n  <li>আরেকটি</li>\n</ul>', 'আইটেম');
        else if (t === 'ol') wrap('<ol>\n  <li>', '</li>\n  <li>আরেকটি</li>\n</ol>', 'ধাপ');
        else if (t === 'a') { var u = prompt('লিংকের ঠিকানা (https://…)'); if (u) wrap('<a href="' + u + '" target="_blank">', '</a>', 'লিংকের লেখা'); }
        else if (t === 'p') wrap('<p>', '</p>', 'অনুচ্ছেদ'); else if (t === 'hr') wrap('<hr>', '', '');
        else if (t === 'table') wrap('<table>\n  <tr><th>বিবরণ</th><th>তথ্য</th></tr>\n  <tr><td>', '</td><td></td></tr>\n</table>', 'ঘর');
      });
    });
    var pv = $('#edPrev');
    $('#edPreviewBtn') && $('#edPreviewBtn').addEventListener('click', function () {
      if (pv.classList.contains('on')) { pv.classList.remove('on'); ta.style.display = ''; this.textContent = 'প্রিভিউ'; return; }
      var btn = this, f = new URLSearchParams(); f.set('content', ta.value); f.set('_t', $('input[name=_t]').value);
      fetch(location.pathname.replace(/\/post.*$/, '/preview'), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: f.toString() }).then(function (r) { return r.text(); }).then(function (h) { pv.innerHTML = '<div class="pd-body" style="margin:0;padding:0;border:0">' + h + '</div>'; pv.classList.add('on'); ta.style.display = 'none'; btn.textContent = 'সম্পাদনা'; });
    });
    /* ফায়ারওয়াল-নিরাপদ: লেখা base64-এ পাঠাই */
    var form = ta.closest('form');
    form.addEventListener('submit', function () { try { var bytes = new TextEncoder().encode(ta.value); var bin = ''; bytes.forEach(function (b) { bin += String.fromCharCode(b); }); $('#contentB64').value = btoa(bin); ta.disabled = true; } catch (e) { /* */ } });
  }
  /* লিংক সারি যোগ/মোছা */
  var lb = $('#linkBox');
  if (lb) {
    var tpl = $('#linkTpl');
    $('#addLink').addEventListener('click', function () { var n = tpl.content.cloneNode(true); lb.appendChild(n); });
    lb.addEventListener('click', function (e) { var r = e.target.closest('[data-rm]'); if (r) r.closest('.lnk-row').remove(); });
  }
  /* স্লাগ অটো-পূরণ: শিরোনাম + ক্যাটাগরি */
  /* টানা-সাজানো তালিকা (টিম) */
  var sortable = $('[data-sortable]');
  if (sortable) {
    var dragEl;
    sortable.addEventListener('dragstart', function (e) { dragEl = e.target.closest('[draggable]'); if (dragEl) { dragEl.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; } });
    sortable.addEventListener('dragend', function () { if (dragEl) dragEl.classList.remove('dragging'); saveOrder(); });
    sortable.addEventListener('dragover', function (e) { e.preventDefault(); var over = e.target.closest('[draggable]'); if (!over || over === dragEl) return; var r = over.getBoundingClientRect(); var after = (e.clientY - r.top) > r.height / 2; sortable.insertBefore(dragEl, after ? over.nextSibling : over); });
    function saveOrder() { var ids = $$('[draggable]', sortable).map(function (x) { return x.getAttribute('data-id'); }); var f = new URLSearchParams(); f.set('do', 'order'); f.set('ids', ids.join(',')); f.set('_t', $('input[name=_t]').value); fetch(location.pathname, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: f.toString() }).then(function () { toast('ক্রম সংরক্ষিত ✓', 'ok'); }); }
  }
  /* অটোমেশন: রান + লাইভ লগ */
  var runBtn = $('#autoRun');
  if (runBtn) {
    var box = $('#runBox'), logEl = $('#autoLog'), csrf = $('input[name=_t]').value, base = location.pathname;
    function poll() {
      fetch(base + '?json=status', { headers: { 'Accept': 'application/json' } }).then(function (r) { return r.json(); }).then(function (j) {
        if (logEl) logEl.innerHTML = j.rows.map(function (l) { return '<div class="al ' + l.level + '"><span class="t">' + l.t + '</span><span>' + l.msg.replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }) + '</span></div>'; }).join('');
        var running = j.job && j.job.state === 'running';
        box.hidden = !running; runBtn.disabled = running; runBtn.style.opacity = running ? '.6' : '';
        var st = $('#runStatus'); if (st && j.job) st.textContent = j.stage || '';
        if (running) setTimeout(poll, 2000);
        else if (j.job && j.job.state === 'done' && window.__autoStarted) { window.__autoStarted = false; toast(j.job.sum && j.job.sum.msg ? j.job.sum.msg : 'রান শেষ', 'ok'); }
      }).catch(function () { setTimeout(poll, 4000); });
    }
    runBtn.addEventListener('click', function () {
      var f = new URLSearchParams(); f.set('do', 'run'); f.set('_t', csrf); window.__autoStarted = true;
      fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, body: f.toString() }).then(function (r) { return r.json(); }).then(function (j) { toast(j.busy ? 'আগের রান চলছে…' : 'রান শুরু হয়েছে', 'ok'); box.hidden = false; poll(); });
    });
    poll(); setInterval(function () { if (!d.hidden && box.hidden) poll(); }, 15000);
  }
})();
