/*!
 * Admin runtime: rich text editor, media picker & compressor, CRUD helpers,
 * notification composer, user/order dialogs, live support thread.
 * Registers modules on window.App (app.js) — loaded only in the admin shell.
 */
(() => {
  'use strict';
  const App = window.App;
  if (!App) return;
  const { api, toast, modal, esc, actions, inits } = App;
  const BASE = App.CFG.base || '';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const A = (a) => BASE + '/api/admin?action=' + a;

  // ------------------------------------------------------------------
  // GET filter forms → SPA navigation; selects auto-submit
  // ------------------------------------------------------------------
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-get-form]');
    if (!f) return;
    e.preventDefault();
    const u = new URL(f.action, location.href);
    new FormData(f).forEach((v, k) => { if (v !== '') u.searchParams.set(k, v); });
    App.navigate(u.href);
  });
  document.addEventListener('change', (e) => {
    const s = e.target.closest('[data-autosubmit]');
    if (s && s.form) s.form.requestSubmit();
  });

  // ------------------------------------------------------------------
  // Form helpers: slug, icon preview, color sync, media fields, sections
  // ------------------------------------------------------------------
  const slugify = (s, us) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, us ? '_' : '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 120);
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.form) {
      $$('[data-slug-from]', t.form).forEach((slug) => {
        if (slug.dataset.slugFrom && t.name === slug.dataset.slugFrom && (!slug.value || slug.dataset.auto === '1')) {
          slug.value = slugify(t.value, slug.hasAttribute('data-slug-underscore'));
          slug.dataset.auto = '1';
        }
      });
      if (t.matches('[data-slug-from]')) t.dataset.auto = '0';
    }
    if (t.matches('[data-icon-input]')) {
      const prev = t.closest('.row').querySelector('[data-icon-preview] i');
      const cls = t.value.trim().split(/\s+/).filter((c) => /^fa[a-z0-9-]*$/.test(c));
      if (prev) prev.className = (cls.some((c) => /^fa-(solid|regular|brands)$/.test(c)) ? '' : 'fa-solid ') + cls.join(' ');
    }
    if (t.matches('[data-color-sync]')) { const i = document.getElementById(t.dataset.colorSync); if (i) i.value = t.value; }
    if (t.matches('input[pattern="#[0-9a-fA-F]{6}"]')) { const c = t.closest('.row').querySelector('[data-color-sync]'); if (c && /^#[0-9a-f]{6}$/i.test(t.value)) c.value = t.value; }
  });
  document.addEventListener('change', (e) => {
    const f = e.target.closest('[data-mf-file]');
    if (f && f.files[0]) {
      const mf = f.closest('[data-media-field]');
      const prev = $('.mf-preview', mf);
      prev.innerHTML = f.files[0].type.startsWith('image/') ? `<img src="${URL.createObjectURL(f.files[0])}" alt="">` : `<span class="tiny">${esc(f.files[0].name)}</span>`;
      $('[data-action="media-clear"]', mf).hidden = false;
    }
    const sec = e.target.closest('[data-sections] input');
    if (sec) syncSections(sec.closest('[data-sections]'));
  });
  actions['media-clear'] = (el) => {
    const mf = el.closest('[data-media-field]');
    $('[data-media-value]', mf).value = '';
    const file = $('[data-mf-file]', mf);
    file.value = '';
    $('.mf-preview', mf).innerHTML = '<i class="fa-regular fa-image"></i>';
    el.hidden = true;
  };
  function syncSections(list) {
    const vals = $$('[data-section]', list).filter((r) => $('input', r).checked).map((r) => r.dataset.section);
    list.parentElement.querySelector('[data-sections-value]').value = vals.join(',');
  }
  actions['section-up'] = (el) => { const r = el.closest('[data-section]'); r.previousElementSibling && r.parentElement.insertBefore(r, r.previousElementSibling); syncSections(r.parentElement); };
  actions['section-down'] = (el) => { const r = el.closest('[data-section]'); r.nextElementSibling && r.parentElement.insertBefore(r.nextElementSibling, r); syncSections(r.parentElement); };

  actions['crud-toggle'] = async (el) => {
    const res = await api(A('crud_toggle'), { method: 'POST', data: { res: el.dataset.res, id: el.dataset.id, field: el.dataset.field, value: el.checked ? 1 : 0 } });
    if (!res.ok) { el.checked = !el.checked; toast(res.message, 'error'); } else { App.clearCache(); toast(res.message, 'success'); }
  };

  // ------------------------------------------------------------------
  // Media picker (library modal) — used by image fields and the editor
  // ------------------------------------------------------------------
  function pickMedia() {
    return new Promise((resolve) => {
      let chosen = null;
      modal({
        title: 'Media library', wide: true,
        html: `<div class="row mb-1"><input class="input" placeholder="Search…" data-mq><label class="btn btn-soft"><i class="fa-solid fa-upload"></i>Upload<input type="file" accept="image/jpeg,image/png,image/webp" hidden data-mup></label></div>
          <div class="upload-progress"><i></i></div><div class="media-grid" data-mgrid style="max-height:55vh;overflow:auto"><div class="skeleton" style="height:120px"></div></div>`,
        onOpen: (m, close) => {
          const grid = $('[data-mgrid]', m);
          const load = async (q = '') => {
            const r = await api(A('media_list') + '&q=' + encodeURIComponent(q));
            grid.innerHTML = (r.items || []).map((it) => `<button type="button" class="media-item" data-pick='${esc(JSON.stringify(it))}'><div class="ph"><img src="${esc(it.thumb)}" alt="" loading="lazy"></div><div class="mi-meta truncate">${esc(it.name || '')}</div></button>`).join('') || '<p class="muted small">No images yet — upload one.</p>';
          };
          load();
          let t;
          $('[data-mq]', m).addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => load(e.target.value), 250); });
          grid.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) { chosen = JSON.parse(b.dataset.pick); close(); } });
          $('[data-mup]', m).addEventListener('change', async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            const fd = new FormData();
            fd.append('file', f);
            const pb = $('.upload-progress', m);
            pb.style.display = 'block';
            const r = await App.xhrPost(BASE + '/api/upload', fd, (p) => (pb.firstElementChild.style.width = Math.round(p * 100) + '%'));
            pb.style.display = 'none';
            if (!r.ok) return toast(r.message, 'error');
            toast(r.message + (r.media.saved > 0 ? ` (−${r.media.saved}%)` : ''), 'success');
            chosen = { path: r.media.path, url: r.media.url, thumb: r.media.thumb || r.media.url };
            close();
          });
        },
      }).then(() => resolve(chosen));
    });
  }
  actions['media-pick'] = async (el) => {
    const it = await pickMedia();
    if (!it) return;
    const mf = el.closest('[data-media-field]');
    $('[data-media-value]', mf).value = it.path;
    $('[data-mf-file]', mf).value = '';
    $('.mf-preview', mf).innerHTML = `<img src="${esc(it.url)}" alt="">`;
    $('[data-action="media-clear"]', mf).hidden = false;
  };

  actions['media-detail'] = (el) => {
    const m = JSON.parse(el.dataset.media);
    const sets = [['logo', 'Logo'], ['favicon', 'Favicon'], ['app_icon', 'App icon'], ['og_image', 'OG / share image'], ['banner', 'Banner'], ['email_logo', 'Email logo'], ['home.about_image', 'Home about image']];
    modal({
      title: m.name || 'Media', wide: true,
      html: `${m.img ? `<img src="${esc(m.url)}" alt="" style="max-height:300px;margin:0 auto 12px;border-radius:12px">` : `<p><a href="${esc(m.url)}" target="_blank" rel="noopener">Open file</a></p>`}
        <dl class="kv mb-2"><dt>Size</dt><dd>${esc(m.size)}${m.original ? ` <span class="muted">(original ${esc(m.original)}, −${m.saved}%)</span>` : ''}</dd>${m.dim ? `<dt>Dimensions</dt><dd>${esc(m.dim)}</dd>` : ''}<dt>Usage</dt><dd>${esc(m.tag || '—')}</dd></dl>
        <div class="copy-row" style="display:flex;gap:8px;align-items:center;background:var(--soft);border-radius:12px;padding:6px 6px 6px 12px"><code class="grow small" style="word-break:break-all">${esc(m.abs)}</code><button class="btn btn-sm btn-soft" data-copy-url><i class="fa-regular fa-copy"></i>Copy URL</button></div>
        ${m.img ? `<div class="row wrap mt-2"><select class="select" data-set style="flex:1;min-width:160px"><option value="">Set as…</option>${sets.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><button class="btn btn-soft" data-do-set>Apply</button></div>
        <div class="row wrap mt-1"><label class="small grow">Re-compress to <b data-tl>10</b>% <input type="range" min="1" max="100" value="10" data-target style="width:100%"></label><button class="btn btn-ghost" data-do-compress><i class="fa-solid fa-compress"></i>Compress</button></div>` : ''}`,
      actions: [{ label: 'Delete', class: 'btn-danger', onClick: () => { del(); return false; } }, { label: 'Close', class: 'btn-ghost', value: true }],
      onOpen: (box, close) => {
        box.addEventListener('click', async (e) => {
          if (e.target.closest('[data-copy-url]')) { await App.copyText(m.abs); toast('Copied', 'success'); }
          if (e.target.closest('[data-do-set]')) {
            const key = $('[data-set]', box).value;
            if (!key) return;
            const r = await api(A('media_set'), { method: 'POST', data: { id: m.id, key } });
            toast(r.message, r.ok ? 'success' : 'error');
          }
          if (e.target.closest('[data-do-compress]')) {
            const b = e.target.closest('[data-do-compress]');
            b.classList.add('loading');
            const r = await api(A('media_recompress'), { method: 'POST', data: { id: m.id, target: $('[data-target]', box).value } });
            b.classList.remove('loading');
            close();
            App.handleResult(r, null);
          }
        });
        const rng = $('[data-target]', box);
        rng && rng.addEventListener('input', () => ($('[data-tl]', box).textContent = rng.value));
      },
    });
    async function del() {
      if (!(await App.confirm('Delete this file permanently? Pages using it will show a broken image.', { danger: true }))) return;
      const r = await api(A('media_delete'), { method: 'POST', data: { id: m.id } });
      document.querySelectorAll('.modal-backdrop').forEach((x) => x.remove());
      App.handleResult(r, null);
    }
  };

  inits['media-library'] = (root) => {
    const inp = $('[data-media-upload]', root);
    if (!inp) return;
    const drop = $('[data-media-drop]', root);
    const pb = $('.upload-progress', drop);
    const upload = async (files) => {
      let done = 0;
      pb.style.display = 'block';
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('kind', f.type === 'application/pdf' ? 'document' : 'image');
        const r = await App.xhrPost(BASE + '/api/upload', fd, (p) => (pb.firstElementChild.style.width = Math.round(((done + p) / files.length) * 100) + '%'));
        done++;
        toast(r.ok ? `${f.name}: ${r.message}${r.media.saved > 0 ? ' (−' + r.media.saved + '%)' : ''}` : `${f.name}: ${r.message}`, r.ok ? 'success' : 'error');
      }
      pb.style.display = 'none';
      App.navigate(location.href, { replace: true, force: true });
    };
    inp.addEventListener('change', () => inp.files.length && upload(Array.from(inp.files)));
    ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.style.borderColor = 'var(--primary)'; }));
    drop.addEventListener('dragleave', () => (drop.style.borderColor = ''));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.style.borderColor = ''; upload(Array.from(e.dataTransfer.files)); });
  };

  // ------------------------------------------------------------------
  // Client-side image compressor (canvas): target % of original size
  // ------------------------------------------------------------------
  inits.compressor = (root) => {
    const fileIn = $('[data-cmp-file]', root);
    const target = $('[data-cmp-target]', root);
    const fmt = $('[data-cmp-format]', root);
    const maxIn = $('[data-cmp-max]', root);
    const minQ = $('[data-cmp-minq]', root);
    let src = null;
    let result = null;
    const hb = (b) => (b > 1048576 ? (b / 1048576).toFixed(2) + ' MB' : (b / 1024).toFixed(1) + ' KB');
    const toBlob = (canvas, type, q) => new Promise((r) => canvas.toBlob(r, type, q));

    async function run() {
      if (!src) return;
      $('[data-cmp-target-label]', root).textContent = target.value + '%';
      const img = await createImageBitmap(src);
      const goal = src.size * (+target.value / 100);
      let type = fmt.value === 'keep' ? src.type : fmt.value;
      if (type === 'image/png' && +target.value < 100) type = 'image/webp'; // PNG has no quality knob
      let scale = Math.min(1, +maxIn.value / Math.max(img.width, img.height));
      let blob = null;
      let w = 0;
      let h = 0;
      const floor = Math.max(0.1, +minQ.value / 100);
      for (let pass = 0; pass < 14; pass++) {
        w = Math.max(1, Math.round(img.width * scale));
        h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(img, 0, 0, w, h);
        // binary search on quality
        let lo = floor, hi = 0.92, best = null;
        for (let i = 0; i < 7; i++) {
          const q = (lo + hi) / 2;
          const b = await toBlob(c, type, q);
          if (b.size <= goal) { best = b; lo = q; } else hi = q;
        }
        blob = best || (await toBlob(c, type, floor));
        if (blob.size <= goal || w < 320) break;
        scale *= 0.85; // quality floor reached → shrink dimensions
      }
      result = { blob, type, w, h };
      const ext = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }[type] || 'img';
      $('[data-cmp-orig]', root).src = URL.createObjectURL(src);
      $('[data-cmp-orig-size]', root).textContent = hb(src.size);
      $('[data-cmp-orig-dim]', root).textContent = img.width + '×' + img.height;
      $('[data-cmp-new]', root).src = URL.createObjectURL(blob);
      $('[data-cmp-new-size]', root).textContent = hb(blob.size);
      $('[data-cmp-new-dim]', root).textContent = w + '×' + h;
      $('[data-cmp-saved]', root).textContent = '−' + Math.max(0, Math.round(100 - (blob.size / src.size) * 100)) + '%';
      const dl = $('[data-cmp-download]', root);
      dl.href = URL.createObjectURL(blob);
      dl.download = src.name.replace(/\.[^.]+$/, '') + '-compressed.' + ext;
      $('[data-cmp-result]', root).hidden = false;
      $('[data-cmp-actions]', root).hidden = false;
    }
    let t;
    const rerun = () => { clearTimeout(t); t = setTimeout(run, 200); };
    fileIn.addEventListener('change', () => { src = fileIn.files[0] || null; $('[data-file-label]', root).textContent = src ? src.name : ''; run(); });
    [target, fmt, maxIn, minQ].forEach((x) => x.addEventListener('input', rerun));
    const send = async (action, extra = {}) => {
      if (!result) return;
      const fd = new FormData();
      const ext = result.type.split('/')[1].replace('jpeg', 'jpg');
      fd.append('file', new File([result.blob], src.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: result.type }));
      fd.append('compress', '0');
      fd.append('keep_format', '1');
      Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
      return App.xhrPost(action, fd);
    };
    $('[data-cmp-save]', root).addEventListener('click', async (e) => {
      e.target.classList.add('loading');
      const r = await send(BASE + '/api/upload', { tag: 'compressor' });
      e.target.classList.remove('loading');
      toast(r.message, r.ok ? 'success' : 'error');
    });
    $('[data-cmp-replace]', root).addEventListener('click', async () => {
      const it = await pickMedia();
      if (!it || !it.id) return;
      if (!(await App.confirm('Replace this image everywhere it is used on the site?'))) return;
      const r = await send(A('media_replace'), { id: it.id, compress: '0' });
      toast(r.message, r.ok ? 'success' : 'error');
    });
  };

  // ------------------------------------------------------------------
  // Rich text editor (contenteditable + server-side sanitising)
  // ------------------------------------------------------------------
  const EMOJI = ['🔥', '🚀', '📈', '📉', '⚠️', '💰', '👑', '❌', '✅', '⭐', '🎉', '💡', '📢', '🛡️', '💎', '⚡', '🎯', '📌', '🆕', '💬', '❤️', '👍', '🙏', '😊', '🤖', '🌍', '🇧🇩', '₿', '💵', '🪙'];
  const ICONS = ['fa-solid fa-fire', 'fa-solid fa-rocket', 'fa-solid fa-chart-line', 'fa-solid fa-arrow-trend-up', 'fa-solid fa-arrow-trend-down', 'fa-solid fa-triangle-exclamation', 'fa-solid fa-coins', 'fa-solid fa-crown',
    'fa-solid fa-circle-check', 'fa-solid fa-circle-xmark', 'fa-solid fa-star', 'fa-solid fa-bolt', 'fa-solid fa-gift', 'fa-solid fa-bell', 'fa-solid fa-shield-halved', 'fa-solid fa-lock', 'fa-brands fa-bitcoin', 'fa-brands fa-ethereum',
    'fa-solid fa-sack-dollar', 'fa-solid fa-wallet', 'fa-solid fa-gem', 'fa-solid fa-thumbs-up', 'fa-solid fa-heart', 'fa-solid fa-code', 'fa-brands fa-node-js', 'fa-brands fa-php', 'fa-brands fa-react', 'fa-solid fa-robot'];
  const BN = document.documentElement.lang === 'bn';
  // one-tap coloured icons for market / news posts (sanitizer keeps fa-* and rt-* classes)
  const QUICK = [['fa-solid fa-arrow-trend-up rt-up', 'Up'], ['fa-solid fa-circle-check rt-green', 'Check'], ['fa-solid fa-certificate rt-blue', 'Badge'], ['fa-solid fa-fire rt-orange', 'Hot'],
    ['fa-solid fa-rocket rt-blue', 'Rocket'], ['fa-solid fa-arrow-trend-down rt-down', 'Down'], ['fa-solid fa-triangle-exclamation rt-gold', 'Warning'], ['fa-solid fa-sack-dollar rt-green', 'Money'],
    ['fa-solid fa-bullseye rt-red', 'Target'], ['fa-solid fa-bolt rt-gold', 'Bolt'], ['fa-solid fa-crown rt-gold', 'Crown'], ['fa-solid fa-circle-xmark rt-down', 'No']];
  inits.rte = (wrap) => {
    if (wrap.dataset.ready) return;
    wrap.dataset.ready = '1';
    const ta = $('textarea', wrap);
    const bar = document.createElement('div');
    bar.className = 'rte-bar';
    const B = (cmd, icon, title) => `<button type="button" data-cmd="${cmd}" title="${title}" aria-label="${title}"><i class="fa-solid ${icon}"></i></button>`;
    bar.innerHTML = `<select data-block aria-label="Block"><option value="p">Paragraph</option><option value="h2">Heading</option><option value="h3">Sub-heading</option><option value="blockquote">Quote</option></select>
      ${B('bold', 'fa-bold', 'Bold')}${B('italic', 'fa-italic', 'Italic')}${B('underline', 'fa-underline', 'Underline')}${B('strikeThrough', 'fa-strikethrough', 'Strike')}<span class="sep"></span>
      ${B('insertUnorderedList', 'fa-list-ul', 'Bullet list')}${B('insertOrderedList', 'fa-list-ol', 'Numbered list')}${B('link', 'fa-link', 'Link')}${B('unlink', 'fa-link-slash', 'Remove link')}<span class="sep"></span>
      ${B('image', 'fa-image', 'Image')}${B('button', 'fa-square-plus', 'Button')}${B('badge', 'fa-certificate', 'Badge')}${B('alert', 'fa-circle-exclamation', 'Alert box')}${B('highlight', 'fa-highlighter', 'Highlight')}
      ${B('icon', 'fa-icons', 'Icon')}${B('emoji', 'fa-face-smile', 'Emoji')}${B('color', 'fa-palette', 'Text color')}${B('video', 'fa-brands fa-youtube', 'YouTube')}<span class="sep"></span>
      <button type="button" data-cmd="coin" title="Coin price ($BTC)" aria-label="Coin"><i class="fa-brands fa-bitcoin"></i> ${BN ? 'কয়েন' : 'Coin'}</button><span class="sep"></span>${B('removeFormat', 'fa-eraser', 'Clear formatting')}${B('source', 'fa-code', 'HTML source')}
      <div class="rte-quick" role="group" aria-label="Quick icons">${QUICK.map(([ic, t]) => `<button type="button" data-quick="${ic}" title="${t}" aria-label="${t}"><i class="${ic}"></i></button>`).join('')}</div>`;
    const area = document.createElement('div');
    area.className = 'rte-area rt';
    area.contentEditable = 'true';
    area.dataset.placeholder = 'Write here…';
    area.innerHTML = ta.value;
    const src = document.createElement('textarea');
    src.className = 'rte-src';
    src.hidden = true;
    wrap.append(bar, area, src);
    let saved = null;
    const keep = () => { const s = getSelection(); if (s.rangeCount && area.contains(s.anchorNode)) saved = s.getRangeAt(0).cloneRange(); };
    const restore = () => { area.focus(); if (saved) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved); } };
    area.addEventListener('keyup', keep);
    area.addEventListener('mouseup', keep);
    area.addEventListener('input', () => (ta.value = area.innerHTML));
    area.addEventListener('paste', (e) => {
      // paste as clean text (keeps line breaks) — avoids junk styles from Word/web
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertHTML', false, esc(text).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>'));
    });
    const insert = (html) => { restore(); document.execCommand('insertHTML', false, html); ta.value = area.innerHTML; };
    const wrapSel = (open, close, fallback) => { restore(); const t = getSelection().toString() || fallback; insert(open + esc(t) + close); };
    const choose = (title, html, onPick) => modal({ title, html, onOpen: (m, close) => m.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { onPick(b.dataset.v); close(); } }) });

    bar.addEventListener('change', (e) => { if (e.target.matches('[data-block]')) { restore(); document.execCommand('formatBlock', false, e.target.value); ta.value = area.innerHTML; } });
    bar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    bar.addEventListener('click', async (e) => {
      const q = e.target.closest('[data-quick]');
      if (q) { keep(); insert(`<i class="${q.dataset.quick}"></i>&nbsp;`); return; }
      const b = e.target.closest('[data-cmd]');
      if (!b) return;
      const cmd = b.dataset.cmd;
      if (['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList', 'unlink', 'removeFormat'].includes(cmd)) {
        restore(); document.execCommand(cmd); ta.value = area.innerHTML; return;
      }
      if (cmd === 'source') {
        const on = src.hidden;
        if (on) { src.value = area.innerHTML; } else { area.innerHTML = src.value; ta.value = src.value; }
        src.hidden = !on; area.hidden = on;
        return;
      }
      keep();
      if (cmd === 'link') {
        const r = await linkDialog('Insert link', false);
        if (r) { restore(); const t = getSelection().toString() || r.text || r.url; insert(`<a href="${esc(r.url)}"${r.blank ? ' target="_blank"' : ''}>${esc(t)}</a>`); }
      } else if (cmd === 'button') {
        const r = await linkDialog('Insert button', true);
        if (r) insert(`<a class="rt-btn${r.outline ? ' rt-btn-outline' : ''}" href="${esc(r.url)}"${r.blank ? ' target="_blank"' : ''}>${esc(r.text || 'Learn more')}</a>&nbsp;`);
      } else if (cmd === 'image') {
        const it = await pickMedia();
        if (it) insert(`<img src="${esc(it.url)}" alt="">`);
      } else if (cmd === 'badge') {
        choose('Badge color', `<div class="row wrap">${['', 'green', 'red', 'orange', 'purple', 'gold', 'dark'].map((c) => `<button type="button" class="btn btn-ghost" data-v="${c}"><span class="rt-badge${c ? ' rt-badge-' + c : ''}">${c || 'blue'}</span></button>`).join('')}</div>`,
          (c) => wrapSel(`<span class="rt-badge${c ? ' rt-badge-' + c : ''}">`, '</span>&nbsp;', 'NEW'));
      } else if (cmd === 'alert') {
        choose('Alert box', `<div class="stack">${[['', 'Info'], ['success', 'Success'], ['warning', 'Warning'], ['danger', 'Danger']].map(([c, l]) => `<button type="button" class="btn btn-ghost btn-block" data-v="${c}">${l}</button>`).join('')}</div>`,
          (c) => wrapSel(`<div class="rt-alert${c ? ' rt-alert-' + c : ''}">`, '</div><p><br></p>', 'Important message'));
      } else if (cmd === 'coin') {
        let sym = '';
        const ok = await modal({ title: BN ? 'কয়েন প্রাইস চিপ' : 'Coin price chip',
          html: `<p class="small muted">${BN ? 'সিম্বল লিখুন (যেমন BTC, ETH, SOL)। পোস্টে লাইভ দাম ও ২৪ ঘণ্টার পরিবর্তন দেখাবে।' : 'Enter a symbol (e.g. BTC, ETH, SOL). The post shows its live price and 24h change.'}</p>
            <input class="input" data-sym maxlength="10" placeholder="BTC" autocapitalize="characters">
            <div class="row wrap mt-1">${['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'TON', 'DOGE', 'TRX'].map((x) => `<button type="button" class="chip" data-pick="${x}">${x}</button>`).join('')}</div>`,
          onOpen: (m) => m.addEventListener('click', (ev) => { const p = ev.target.closest('[data-pick]'); if (p) $('[data-sym]', m).value = p.dataset.pick; }),
          actions: [{ label: BN ? 'যোগ করুন' : 'Insert', onClick: (m) => { sym = $('[data-sym]', m).value.trim().toUpperCase(); } }] });
        if (ok && /^[A-Z][A-Z0-9]{1,9}$/.test(sym)) insert(`$${sym}&nbsp;`);
        else if (sym) toast(BN ? 'সঠিক সিম্বল দিন (২–১০ অক্ষর)' : 'Enter a valid symbol (2–10 letters)', 'error');
      } else if (cmd === 'color') {
        choose(BN ? 'টেক্সট কালার' : 'Text color', `<div class="row wrap">${[['green', '#16a34a'], ['red', '#dc2626'], ['orange', '#f97316'], ['blue', '#2b44d8'], ['gold', '#f59e0b']].map(([c, h]) => `<button type="button" class="btn btn-ghost" data-v="${c}"><b style="color:${h}">${c}</b></button>`).join('')}</div>`,
          (c) => wrapSel(`<span class="rt-${c}">`, '</span>', 'text'));
      } else if (cmd === 'highlight') {
        wrapSel('<mark>', '</mark>', 'highlight');
      } else if (cmd === 'emoji') {
        choose('Emoji', `<div class="pick-grid">${EMOJI.map((x) => `<button type="button" data-v="${x}">${x}</button>`).join('')}</div>`, (x) => insert(x));
      } else if (cmd === 'icon') {
        modal({
          title: 'Icon', html: `<label class="label">Animation</label><select class="select mb-2" data-anim><option value="">None</option><option value="rt-anim-bounce">Bounce</option><option value="rt-anim-pulse">Pulse</option><option value="rt-anim-spin">Spin</option><option value="rt-anim-shake">Shake</option><option value="rt-anim-glow">Glow</option></select>
            <label class="label">Color</label><select class="select mb-2" data-col><option value="">Default</option><option value="rt-up">Green (up)</option><option value="rt-down">Red (down)</option></select>
            <div class="pick-grid">${ICONS.map((i) => `<button type="button" data-v="${i}"><i class="${i}"></i></button>`).join('')}</div>`,
          onOpen: (m, close) => m.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-v]');
            if (!btn) return;
            const cls = [btn.dataset.v, $('[data-anim]', m).value, $('[data-col]', m).value].filter(Boolean).join(' ');
            insert(`<i class="${cls}"></i>&nbsp;`);
            close();
          }),
        });
      } else if (cmd === 'video') {
        const r = await modal({ title: 'YouTube video', html: '<input class="input" data-yt placeholder="https://www.youtube.com/watch?v=…">', actions: [{ label: 'Insert', onClick: (m) => { b._yt = $('[data-yt]', m).value; } }] });
        const id = r && (b._yt || '').match(/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/);
        if (id) insert(`<iframe src="https://www.youtube-nocookie.com/embed/${id[1]}" title="YouTube video" allowfullscreen></iframe><p><br></p>`);
      }
    });
    function linkDialog(title, isButton) {
      let out = null;
      return modal({
        title,
        html: `<div class="form-group"><label class="label">URL</label><input class="input" data-url placeholder="https://… or /services"></div>
          <div class="form-group"><label class="label">Text</label><input class="input" data-text placeholder="${isButton ? 'Button label' : 'Optional'}"></div>
          <label class="check"><input type="checkbox" data-blank> Open in new tab</label>${isButton ? '<label class="check mt-1"><input type="checkbox" data-outline> Outline style</label>' : ''}`,
        actions: [{ label: 'Cancel', class: 'btn-ghost', value: false }, { label: 'Insert', onClick: (m) => {
          const url = $('[data-url]', m).value.trim();
          if (!/^(https?:\/\/|\/|mailto:|tel:)/i.test(url)) { toast('Enter a valid URL', 'error'); return false; }
          out = { url, text: $('[data-text]', m).value.trim(), blank: $('[data-blank]', m).checked, outline: isButton && $('[data-outline]', m).checked };
        } }],
      }).then(() => out);
    }
    // keep textarea in sync before submit
    ta.form && ta.form.addEventListener('submit', () => { ta.value = src.hidden ? area.innerHTML : src.value; }, true);
  };

  // ------------------------------------------------------------------
  // Notification composer: target → user picker
  // ------------------------------------------------------------------
  inits['notify-composer'] = (root) => {
    const sel = $('[data-target-select]', root);
    const picker = $('[data-user-picker]', root);
    const search = $('[data-user-search]', root);
    const results = $('[data-user-results]', root);
    const picked = $('[data-picked]', root);
    sel.addEventListener('change', () => (picker.hidden = sel.value !== 'users'));
    let t;
    search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const q = search.value.trim();
        if (q.length < 2) { results.hidden = true; return; }
        const r = await api(A('user_search') + '&q=' + encodeURIComponent(q));
        results.innerHTML = (r.users || []).map((u) => `<button type="button" class="list-row" style="border:0;background:none;width:100%;text-align:left;cursor:pointer" data-uid="${u.id}" data-name="${esc(u.name)}"><span class="avatar sm">${esc(u.name[0] || '?')}</span><span class="grow">${esc(u.name)}<br><span class="tiny muted">${esc(u.email)}</span></span></button>`).join('') || '<div class="list-row muted small">No users</div>';
        results.hidden = false;
      }, 250);
    });
    results.addEventListener('click', (e) => {
      const b = e.target.closest('[data-uid]');
      if (!b || picked.querySelector(`input[value="${b.dataset.uid}"]`)) return;
      const chip = document.createElement('span');
      chip.className = 'chip active';
      chip.innerHTML = `<input type="hidden" name="users[]" value="${b.dataset.uid}">${esc(b.dataset.name)} <button type="button" class="icon-btn" style="width:22px;height:22px;color:#fff" data-remove-pick aria-label="Remove">×</button>`;
      picked.appendChild(chip);
      search.value = '';
      results.hidden = true;
    });
    picked.addEventListener('click', (e) => { const x = e.target.closest('[data-remove-pick]'); if (x) x.closest('.chip').remove(); });
  };

  // ------------------------------------------------------------------
  // Users / orders dialogs
  // ------------------------------------------------------------------
  const postAndHandle = async (action, data) => App.handleResult(await api(A(action), { method: 'POST', data }), null);
  actions['user-suspend'] = (el) => {
    let data = null;
    modal({
      title: 'Suspend user',
      html: `<div class="form-group"><label class="label">Duration</label><select class="select" data-days><option value="1">1 day</option><option value="3">3 days</option><option value="7" selected>7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="0">Lifetime</option></select></div>
        <div class="form-group"><label class="label">Reason</label><textarea class="textarea" data-reason rows="2" maxlength="255"></textarea></div>`,
      actions: [{ label: 'Cancel', class: 'btn-ghost', value: false }, { label: 'Suspend', class: 'btn-danger', onClick: (m) => { data = { id: el.dataset.id, status: 'suspended', days: $('[data-days]', m).value, reason: $('[data-reason]', m).value }; } }],
    }).then(() => data && postAndHandle('user_status', data));
  };
  actions['user-balance'] = (el) => {
    let data = null;
    modal({
      title: 'Adjust balance',
      html: `<div class="tabs" style="margin-bottom:12px"><button type="button" class="tab active" data-bt="credit">Add</button><button type="button" class="tab" data-bt="debit">Subtract</button></div>
        <div class="form-group"><label class="label">Amount (USD)</label><input class="input" type="number" min="0.01" step="0.01" data-amount></div>
        <div class="form-group"><label class="label">Reason (shown to the user, kept in the audit trail)</label><input class="input" data-reason maxlength="255"></div>`,
      actions: [{ label: 'Cancel', class: 'btn-ghost', value: false }, { label: 'Apply', onClick: (m) => { data = { id: el.dataset.id, type: $('[data-bt].active', m).dataset.bt, amount: $('[data-amount]', m).value, reason: $('[data-reason]', m).value }; } }],
      onOpen: (m) => m.addEventListener('click', (e) => { const b = e.target.closest('[data-bt]'); if (b) $$('[data-bt]', m).forEach((x) => x.classList.toggle('active', x === b)); }),
    }).then(() => data && postAndHandle('user_balance', data));
  };
  actions['user-message'] = (el) => {
    let data = null;
    const email = el.dataset.kind === 'email';
    modal({
      title: email ? 'Send email' : 'Send notification',
      html: `<div class="form-group"><label class="label">${email ? 'Subject' : 'Title'}</label><input class="input" data-title maxlength="190"></div>
        <div class="form-group"><label class="label">Message</label><textarea class="textarea" data-body rows="4" maxlength="2000"></textarea></div>`,
      actions: [{ label: 'Cancel', class: 'btn-ghost', value: false }, { label: 'Send', onClick: (m) => { data = { id: el.dataset.id, kind: el.dataset.kind, title: $('[data-title]', m).value, body: $('[data-body]', m).value }; } }],
    }).then(() => data && postAndHandle('user_message', data));
  };
  actions['order-status'] = (el) => {
    let data = null;
    const st = ['pending_payment', 'payment_submitted', 'under_review', 'approved', 'rejected', 'completed', 'cancelled'];
    modal({
      title: 'Order #' + el.dataset.code,
      html: `<div class="form-group"><label class="label">Status</label><select class="select" data-st>${st.map((s) => `<option value="${s}"${s === el.dataset.status ? ' selected' : ''}>${s.replace(/_/g, ' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label class="label">Note for the customer</label><textarea class="textarea" data-note rows="3" maxlength="1000">${esc(el.dataset.note || '')}</textarea></div>`,
      actions: [{ label: 'Cancel', class: 'btn-ghost', value: false }, { label: 'Update', onClick: (m) => { data = { code: el.dataset.code, status: $('[data-st]', m).value, note: $('[data-note]', m).value }; } }],
    }).then(() => data && postAndHandle('order_status', data));
  };

  actions['smtp-test'] = async (el) => {
    el.classList.add('loading');
    const r = await api(A('smtp_test'), { method: 'POST' });
    el.classList.remove('loading');
    toast(r.message, r.ok ? 'success' : 'error', { duration: r.ok ? 3500 : 9000 });
  };

  inits['ai-test'] = (form) => {
    form.addEventListener('ajax:done', (e) => {
      const r = e.detail;
      const out = $('[data-ai-result]', form);
      out.hidden = false;
      out.innerHTML = `<div class="msg me">${esc(form.message.value)}</div><div class="msg bot">${esc(r.ok ? r.reply : r.message)}</div>`;
    });
  };

  // ------------------------------------------------------------------
  // Live support thread (admin side) – polls while visible
  // ------------------------------------------------------------------
  inits['support-thread'] = (root) => {
    const th = $('[data-thread]', root);
    if (!th) return;
    th.scrollTop = th.scrollHeight;
    let timer;
    const add = (m) => {
      const d = document.createElement('div');
      d.className = 'msg ' + (m.mine ? 'me' : 'bot');
      d.innerHTML = esc(m.message) + `<span class="meta">${esc(m.meta)}</span>`;
      th.appendChild(d);
      th.scrollTop = th.scrollHeight;
    };
    const poll = async () => {
      clearTimeout(timer);
      if (!document.body.contains(th)) return;
      if (!document.hidden) {
        const r = await api(A('support_poll') + '&c=' + th.dataset.cid + '&after=' + th.dataset.last).catch(() => null);
        if (r && r.ok) r.messages.forEach((m) => { add(m); th.dataset.last = m.id; });
      }
      timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 5000);
    App.onCleanup(() => clearTimeout(timer));
    const f = $('[data-support-reply]', root);
    f.addEventListener('ajax:done', (e) => { if (e.detail.ok) poll(); });
    f.message.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) f.requestSubmit(); });
  };
})();
