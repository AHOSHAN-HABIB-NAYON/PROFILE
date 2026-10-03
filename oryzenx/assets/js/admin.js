/* Oryzenx — admin components: lightweight SVG charts, rich editor, pickers, tools. */
(() => {
  'use strict';
  const C = (window.OZXComponents = window.OZXComponents || {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const app = () => window.OZXApp;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n));

  /* ---------- Chart: area/line or bars, pure SVG ---------- */
  C.chart = (el) => {
    let cfg; try { cfg = JSON.parse(el.dataset.series); } catch { return; }
    const colors = ['var(--primary)', 'var(--accent)', 'var(--success)'];
    const draw = () => {
      const W = el.clientWidth || 600; const H = el.clientHeight || 200;
      const pad = { l: 30, r: 8, t: 10, b: 20 };
      const n = cfg.labels.length;
      const max = Math.max(1, ...cfg.sets.flatMap((s) => s.data));
      const x = (i) => pad.l + (n <= 1 ? 0 : (i * (W - pad.l - pad.r)) / (n - 1));
      const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
      let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="chart">`;
      for (let g = 0; g <= 3; g++) {
        const v = (max / 3) * g; const yy = y(v);
        svg += `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}"/><text class="axis" x="${pad.l - 5}" y="${yy + 3}" text-anchor="end">${fmt(Math.round(v))}</text>`;
      }
      const step = Math.ceil(n / Math.max(2, Math.floor(W / 60)));
      cfg.labels.forEach((l, i) => { if (i % step === 0) svg += `<text class="axis" x="${el.dataset.type === 'bars' ? x(i) + 0 : x(i)}" y="${H - 4}" text-anchor="middle">${esc(l)}</text>`; });
      if (el.dataset.type === 'bars') {
        const bw = Math.max(3, ((W - pad.l - pad.r) / n) * 0.6);
        cfg.sets[0].data.forEach((v, i) => { svg += `<rect x="${x(i) - bw / 2}" y="${y(v)}" width="${bw}" height="${Math.max(0, H - pad.b - y(v))}" rx="3" fill="${colors[0]}" opacity=".85"/>`; });
      } else {
        cfg.sets.forEach((s, si) => {
          const pts = s.data.map((v, i) => `${x(i)},${y(v)}`);
          const c = colors[si % colors.length];
          if (si === 0) svg += `<path d="M${pts.join(' L')} L${x(n - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z" fill="${c}" opacity=".12"/>`;
          svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        });
      }
      svg += `<line class="hover-line" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" stroke="var(--text-muted)" stroke-dasharray="3 3" opacity="0"/></svg>`;
      el.innerHTML = svg + `<div class="chart-tip" hidden></div>`;
      if (!el.nextElementSibling?.classList.contains('chart-legend') && cfg.sets.length > 1) {
        el.insertAdjacentHTML('afterend', `<div class="chart-legend">${cfg.sets.map((s, i) => `<span style="--c:${colors[i]}">${esc(s.name)}</span>`).join('')}</div>`);
      }
      const tip = $('.chart-tip', el); const line = $('.hover-line', el);
      el.onpointermove = (e) => {
        const r = el.getBoundingClientRect(); const px = e.clientX - r.left;
        const i = Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1))));
        tip.hidden = false; tip.style.left = x(i) + 'px'; tip.style.top = pad.t + 'px';
        tip.innerHTML = `<b>${esc(cfg.labels[i])}</b> · ${cfg.sets.map((s) => `${esc(s.name)}: ${s.data[i]}`).join(' · ')}`;
        line.setAttribute('x1', x(i)); line.setAttribute('x2', x(i)); line.setAttribute('opacity', '1');
      };
      el.onpointerleave = () => { tip.hidden = true; line.setAttribute('opacity', '0'); };
    };
    draw();
    let t; const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(draw, 120); }); ro.observe(el);
  };

  /* ---------- Rich text editor (contenteditable, sanitized server-side) ---------- */
  const EMOJIS = ['🔥', '🚀', '📈', '⚡', '👑', '✅', '❌', '💡', '🎉', '⭐', '💰', '📢', '🛡️', '🤖', '💻', '📱', '🌐', '🔒', '🎯', '📊', '🧠', '⏰', '👉', '❤️'];
  C.editor = (el) => {
    const ta = $('textarea', el);
    el.insertAdjacentHTML('afterbegin', `<div class="ed-toolbar" role="toolbar" aria-label="Editor">
      ${[['bold', 'fa-bold'], ['italic', 'fa-italic'], ['underline', 'fa-underline'], ['strikeThrough', 'fa-strikethrough'], '|',
        ['h2', 'fa-heading', 'H2'], ['h3', 'fa-h', 'H3'], ['p', 'fa-paragraph'], '|',
        ['insertUnorderedList', 'fa-list-ul'], ['insertOrderedList', 'fa-list-ol'], ['blockquote', 'fa-quote-left'], ['code', 'fa-code'], '|',
        ['link', 'fa-link'], ['image', 'fa-image'], ['emoji', 'fa-face-smile'], ['hr', 'fa-minus'], ['removeFormat', 'fa-eraser'], ['source', 'fa-file-code']]
        .map((b) => b === '|' ? '<span class="sep"></span>' : `<button type="button" data-cmd="${b[0]}" title="${b[2] || b[0]}" aria-label="${b[2] || b[0]}"><i class="fa-solid ${b[1]}"></i></button>`).join('')}
      </div><div class="ed-area prose" contenteditable="true" data-placeholder="Write…"></div><input type="file" accept="image/*" hidden>`);
    const area = $('.ed-area', el); const file = $('input[type=file]', el);
    area.innerHTML = ta.value;
    let source = null;
    const sync = () => { ta.value = source ? source.value : area.innerHTML; };
    area.addEventListener('input', sync);
    const exec = (c, v = null) => { area.focus(); document.execCommand(c, false, v); sync(); };
    el.querySelector('.ed-toolbar').addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const cmd = b.dataset.cmd;
      if (cmd === 'source') {
        if (source) { area.innerHTML = source.value; source.remove(); source = null; area.hidden = false; }
        else { source = document.createElement('textarea'); source.className = 'ed-source'; source.value = area.innerHTML; source.addEventListener('input', sync); area.after(source); area.hidden = true; }
        b.classList.toggle('on', !!source); sync(); return;
      }
      if (source) return;
      if (['h2', 'h3', 'p', 'blockquote'].includes(cmd)) return exec('formatBlock', cmd.toUpperCase());
      if (cmd === 'code') { const s = getSelection().toString(); return exec('insertHTML', `<code>${esc(s || 'code')}</code>`); }
      if (cmd === 'hr') return exec('insertHorizontalRule');
      if (cmd === 'link') { const u = prompt('URL (https://…)'); if (u && /^(https?:\/\/|\/|mailto:)/.test(u)) exec('createLink', u); return; }
      if (cmd === 'image') { file.click(); return; }
      if (cmd === 'emoji') {
        const range = getSelection().rangeCount ? getSelection().getRangeAt(0).cloneRange() : null;
        const m = app().modal(`<div class="emoji-pop">${EMOJIS.map((x) => `<button type="button">${x}</button>`).join('')}</div>`, { title: 'Emoji' });
        m.el.addEventListener('click', (ev) => {
          const eb = ev.target.closest('.emoji-pop button'); if (!eb) return;
          m.close(); area.focus();
          if (range) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); }
          exec('insertText', eb.textContent);
        });
        return;
      }
      exec(cmd);
    });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      const fd = new FormData(); fd.append('image', f); fd.append('quality', '78'); fd.append('format', 'webp'); fd.append('max_width', '1400');
      app().toast('Uploading…', 'info', 1500);
      const r = await fetch(app().base + '/admin/compressor', { method: 'POST', body: fd, headers: { 'X-CSRF-Token': app().csrf(), 'X-Requested-With': 'fetch', Accept: 'application/json' } }).then((x) => x.json()).catch(() => ({}));
      file.value = '';
      if (r.ok) exec('insertHTML', `<img src="${esc(r.result.url)}" alt="">`); else app().toast(r.message || 'Upload failed', 'error');
    });
  };

  /* ---------- Small helpers ---------- */
  C['icon-preview'] = (el) => {
    const i = $('input', el); const p = $('[data-icon-preview]', el);
    i.addEventListener('input', () => { p.className = i.value.replace(/[^a-z0-9\- ]/g, '') || 'fa-solid fa-code'; });
  };

  C['user-picker'] = (el) => {
    const input = $('input', el); const box = $('.picker-results', el); const picked = $('.picked', el);
    let t;
    input.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const q = input.value.trim(); if (q.length < 2) { box.hidden = true; return; }
        const d = await app().api('/admin/api/users?q=' + encodeURIComponent(q));
        box.innerHTML = (d.users || []).map((u) => `<button type="button" data-id="${u.id}" data-name="${esc(u.name)}">${esc(u.name)} <small class="muted">${esc(u.email)}</small></button>`).join('') || '<div class="empty-sm">—</div>';
        box.hidden = false;
      }, 220);
    });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]'); if (!b) return;
      if (!picked.querySelector(`input[value="${b.dataset.id}"]`)) {
        picked.insertAdjacentHTML('beforeend', `<span class="badge badge-primary">${esc(b.dataset.name)}<input type="hidden" name="user_ids[]" value="${b.dataset.id}"><button type="button" aria-label="remove">×</button></span>`);
      }
      box.hidden = true; input.value = ''; input.focus();
    });
    picked.addEventListener('click', (e) => { if (e.target.matches('button')) e.target.closest('.badge').remove(); });
  };

  C.audience = (form) => {
    const sync = () => {
      const v = $('input[name="audience"]:checked', form)?.value;
      $$('[data-aud]', form).forEach((f) => { f.hidden = f.dataset.aud !== v; });
    };
    form.addEventListener('change', (e) => { if (e.target.name === 'audience') sync(); });
    form.addEventListener('ozx:success', () => { $('.picked', form).innerHTML = ''; form.reset(); sync(); });
    sync();
  };

  C.compressor = (form) => {
    const q = $('input[name="quality"]', form); const out = $('[data-q-out]', form);
    q.addEventListener('input', () => { out.textContent = q.value; });
    const drop = $('.drop', form); const fileInput = $('input[type=file]', form);
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('dragover'); }));
    drop.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) { fileInput.files = e.dataTransfer.files; fileInput.dispatchEvent(new Event('change')); } });
    form.addEventListener('ozx:success', (e) => {
      const r = e.detail.result; const box = $('.cmp-result', form);
      box.hidden = false;
      $('[data-r="original"]', box).textContent = r.original;
      $('[data-r="compressed"]', box).textContent = r.compressed;
      $('[data-r="saved"]', box).textContent = r.saved + '%';
      $('[data-r="img"]', box).src = r.url;
      $('[data-r="download"]', box).href = r.url;
      $('[data-r="copy"]', box).dataset.copy = new URL(r.url, location.href).href;
    });
  };

  C['ai-test'] = (form) => {
    form.addEventListener('ozx:success', (e) => {
      const o = $('.ai-test-out', form); o.hidden = false;
      o.textContent = `${e.detail.reply}\n\n— ${e.detail.ms} ms`;
    });
  };

  // Clickable table rows
  document.addEventListener('click', (e) => {
    const tr = e.target.closest('tr.row-link');
    if (!tr || e.target.closest('a, button, input, form')) return;
    app().navigate(tr.dataset.href);
  });

  // Slug autofill from the source field until the slug is edited by hand
  document.addEventListener('input', (e) => {
    const src = e.target;
    if (!src.id) return;
    $$(`[data-slug-from="${src.id}"]`).forEach((slug) => {
      if (slug.dataset.touched || (slug.defaultValue && slug.defaultValue !== '')) return;
      slug.value = src.value.toLowerCase().trim().replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 120);
    });
    if (e.target.dataset.slugFrom) e.target.dataset.touched = '1';
  });
})();
