import { api, esc, $, $$, appIcon, appInfo, pageHead, relEl, pagination, copyText, playSound, flag, APP_LIST, debounce, num, state } from '../core.js';

/** One OTP: flag · app logo · name / masked number · tap-to-copy code / live "x sec ago". */
function row(ev, isNew = false) {
  const a = appInfo(ev.application);
  const admin = state.user.role === 'admin';
  const number = admin && ev.resource_value ? ev.resource_value : ev.number;
  const title = [ev.country_code, a.n].filter(Boolean).join(' · ');
  const tag = ev.is_demo ? '<span class="chip demo">DEMO</span>' : ev.mine ? '<span class="chip success">Your number</span>' : '';
  return `<div class="act-row otp-item${isNew ? ' new' : ''}" data-key="${esc(ev.key)}">${flag(ev.country_code)}${appIcon(ev.application, 'sm')}
    <div class="act-main"><div class="act-title">${esc(title)} ${tag}</div><div class="act-num mono">${esc(number || '')}</div>
      ${admin && ev.provider ? `<div class="small muted">${esc(ev.provider)}</div>` : ''}</div>
    <div class="act-end"><button class="act-code mono" data-copy="${esc(ev.code)}" title="Tap to copy"><i class="fa-regular fa-copy"></i> ${esc(ev.code)}</button>${relEl(ev.received_at)}</div></div>`;
}

export async function mount(el, { query, live }) {
  let page = 1;
  let app = '';
  let q = query.q || '';
  let pollTimer = null;
  const seen = new Set();
  const queue = [];
  let flushTimer = null;

  el.innerHTML = `${pageHead('fa-solid fa-shield-halved', 'OTP Services', 'Live OTPs · tap a code to copy', '<span class="conn-state" data-conn><span class="live-dot"></span><span>Connecting…</span></span>')}
  <div class="card">
    <div class="tabs" data-tabs><button class="tab active" data-app="">All</button>${APP_LIST.slice(0, 8).map((a) => `<button class="tab" data-app="${a.code}">${a.code}</button>`).join('')}</div>
    <div class="search-box" style="margin:12px 0"><i class="fa-solid fa-magnifying-glass"></i><input class="input" type="search" placeholder="Last 4 digits of number, or OTP code" data-q value="${esc(q)}" maxlength="15" inputmode="search"></div>
    <div class="act-list" data-list></div>
    <div data-pages></div>
    <p class="small muted center" style="margin:14px 0 0" data-foot></p>
  </div>
  <p class="small muted center" style="margin-top:12px" data-scope><i class="fa-solid fa-lock"></i> Numbers are partly hidden for privacy.</p>`;

  const list = $('[data-list]', el);

  async function load(p = page) {
    page = p;
    list.innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton" style="height:58px;border-radius:14px"></div>').join('');
    const r = await api('/events', { query: { page, app, q } });
    seen.clear();
    r.items.forEach((x) => seen.add(x.key));
    list.innerHTML = r.items.length ? r.items.map((x) => row(x)).join('')
      : '<div class="empty"><i class="fa-solid fa-inbox"></i><div><strong>No OTPs yet</strong></div><div class="small">Get a number in Access Services — codes appear here instantly.</div><a class="btn btn-primary btn-sm" href="/access" style="margin-top:12px"><i class="fa-solid fa-plus"></i>Get Number</a></div>';
    $('[data-pages]', el).innerHTML = pagination(r.pagination, load);
    $('[data-scope]', el).innerHTML = r.public_feed
      ? '<i class="fa-solid fa-lock"></i> All OTPs from our APIs · numbers partly hidden · type the last 4 digits of your number to find your code'
      : '<i class="fa-solid fa-lock"></i> Only codes for numbers assigned to you are shown.';
    $('[data-foot]', el).textContent = `${num(r.pagination.total)} active · auto refresh every 5 seconds · expires in ${r.expiration_hours} hours`;
  }

  function matchesFilter(ev) {
    if (app && ev.application !== app) return false;
    if (q && /^\d{3,15}$/.test(q)) return q.length <= 4 && String(ev.number || '').endsWith(q);
    if (q && !String(ev.code).includes(q)) return false;
    return true;
  }

  // Batch live inserts (demo can emit several per second) — one DOM update per frame.
  function enqueue(ev) {
    if (page !== 1 || seen.has(ev.key) || !matchesFilter(ev)) return;
    seen.add(ev.key);
    queue.push(ev);
    if (!flushTimer) flushTimer = setTimeout(flush, 120);
  }
  function flush() {
    flushTimer = null;
    if (!queue.length) return;
    list.querySelector('.empty')?.remove();
    const html = queue.splice(0).reverse().map((ev) => row(ev, true)).join('');
    list.insertAdjacentHTML('afterbegin', html);
    const rows = list.querySelectorAll('.otp-item');
    for (let i = 30; i < rows.length; i += 1) rows[i].remove();
    playSound('event');
  }

  function setConn(on) {
    const c = $('[data-conn]', el);
    if (!c) return;
    c.classList.toggle('off', !on);
    c.lastElementChild.textContent = on ? 'Live' : 'Polling (5s)';
    clearInterval(pollTimer);
    if (!on) {
      // AJAX fallback: poll every 5 seconds without reloading the page.
      pollTimer = setInterval(async () => {
        if (document.hidden || page !== 1) return;
        try {
          const r = await api('/events', { query: { page: 1, app, q } });
          r.items.slice().reverse().forEach(enqueue);
        } catch { /* ignore */ }
      }, 5000);
    }
  }

  el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) return copyText(c.dataset.copy, c);
    const t = e.target.closest('[data-app]');
    if (t) {
      $$('[data-app]', el).forEach((b) => b.classList.toggle('active', b === t));
      app = t.dataset.app;
      load(1);
    }
  });
  $('[data-q]', el).addEventListener('input', debounce((e) => { q = e.target.value.trim().replace(/[^A-Za-z0-9]/g, ''); load(1); }, 350));


  await load(1);
  setConn(live.connected);
  const offs = [
    live.on('event:new', enqueue),
    live.on('event:public', (ev) => { if (state.user.role !== 'admin') enqueue(ev); }),
    live.on('admin:event', (ev) => { if (state.user.role === 'admin') enqueue(ev); }),
    live.on('live:state', setConn),
    live.on('events:expired', debounce(() => { if (page === 1) load(1); }, 2000)),
  ];
  return () => { offs.forEach((f) => f()); clearInterval(pollTimer); clearTimeout(flushTimer); };
}
