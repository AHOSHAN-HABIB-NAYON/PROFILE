import { api, esc, $, $$, toast, toastError, flag, appIcon, pageHead, relEl, pagination, withLoading, sheet, debounce, copyText, chip, playSound } from '../core.js';

const otpPill = (code) => `<button class="otp-pill" data-copy="${esc(code)}" title="Copy OTP"><span class="mono">${esc(code)}</span><i class="fa-regular fa-copy"></i></button>`;

function upgradePrompt(message) {
  const s = sheet({
    title: 'Upgrade to Premium',
    icon: 'fa-solid fa-crown',
    body: `<div class="upgrade-banner"><i class="fa-solid fa-crown crown"></i><div><strong>Need more numbers & OTPs?</strong><div class="small" style="opacity:.85">${esc(message)}</div></div></div>
      <p class="muted" style="margin-top:14px">Premium members get higher limits, faster access and more features.</p>`,
    foot: '<button class="btn btn-ghost" data-close>Later</button><a class="btn btn-primary" href="/premium" data-close><i class="fa-solid fa-crown"></i>Upgrade Now</a>',
  });
  return s;
}

const LAST_KEY = 'aura.lastService';

export async function mount(el, { query, live }) {
  let page = 1;
  let services = [];
  let selected = null;
  try { selected = Number(localStorage.getItem(LAST_KEY)) || null; } catch { /* ignore */ }

  el.innerHTML = `${pageHead('fa-solid fa-sim-card', 'Access Services', 'Live servers & numbers')}
    <div class="stack access-stack">
      <div class="card get-card">
        <div class="card-head"><h2>Get Number</h2><span class="chip live">Live</span></div>
        <div class="range-select" data-range>
          <button type="button" class="range-trigger" data-range-toggle aria-haspopup="listbox" aria-expanded="false">
            <span class="range-current" data-range-current><span class="muted">Select Range</span></span>
            <i class="fa-solid fa-chevron-down range-caret"></i>
          </button>
          <div class="range-panel" data-range-panel role="listbox" hidden>
            <div class="range-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="Search country or app…" data-range-filter aria-label="Filter ranges"></div>
            <div class="range-list" data-services></div>
          </div>
        </div>
        <button class="btn btn-primary btn-block get-btn" data-get-selected disabled><i class="fa-solid fa-plus"></i><span data-get-label>Get Number</span></button>
        <p class="small muted limits-line" data-limits></p>
        <div class="adv-search">
          <div class="adv-head"><i class="fa-solid fa-magnifying-glass-plus"></i><strong>Advanced Search</strong><span class="small muted">Serial 5–8 digits</span></div>
          <form data-search class="adv-form">
            <input class="input" name="serial" inputmode="numeric" pattern="\\d{5,8}" maxlength="8" placeholder="e.g. 123456" value="${esc(query.serial || '')}" aria-label="Serial">
            <button class="btn btn-primary" type="submit"><i class="fa-solid fa-magnifying-glass"></i>Search</button>
          </form>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Number List</h2><div class="actions"><button class="btn btn-ghost btn-xs" data-refresh aria-label="Refresh"><i class="fa-solid fa-rotate"></i></button></div></div>
        <div data-mine></div>
      </div>
    </div>`;

  const renderLimits = (l) => {
    $('[data-limits]', el).textContent = `${l.hour_used}/${l.hourly_limit} this hour · ${l.day_used}/${l.daily_limit} today${l.premium ? ' · ⚡ Premium' : ''}`;
  };
  const usable = (s) => s.status === 'active' && s.available;

  const svcLabel = (x) => `<span class="range-icons">${flag(x.flag_code)}${appIcon(x.app_icon || x.app_code, 'sm')}</span>
    <span class="range-text"><strong>${esc(x.country_code)} ${esc(x.app_code)}</strong><small>${esc(x.country_name)} ${esc(x.app_name)}</small></span>`;

  function renderPicker(filter = '') {
    const active = services.filter(usable);
    if (!active.some((x) => x.id === selected)) selected = null;
    const q = filter.trim().toLowerCase();
    const shown = q ? active.filter((x) => `${x.country_code} ${x.app_code} ${x.country_name} ${x.app_name}`.toLowerCase().includes(q)) : active;
    $('[data-services]', el).innerHTML = shown.length ? shown.map((x) => `
      <button type="button" class="range-item ${x.id === selected ? 'selected' : ''}" data-pick="${x.id}" role="option" aria-selected="${x.id === selected}">
        ${svcLabel(x)}${x.hot ? '<span class="hot-dot" title="Hot">🔥</span>' : ''}${x.id === selected ? '<i class="fa-solid fa-circle-check range-check"></i>' : ''}
      </button>`).join('')
      : `<div class="empty" style="padding:16px"><i class="fa-solid fa-globe"></i><div>${active.length ? 'No match' : 'No active ranges right now'}</div></div>`;
    const cur = active.find((x) => x.id === selected);
    $('[data-range-current]', el).innerHTML = cur ? svcLabel(cur) : '<span class="range-placeholder"><i class="fa-solid fa-earth-asia"></i> Select Range</span>';
    $('[data-get-selected]', el).disabled = !cur;
    $('[data-get-label]', el).textContent = cur ? `Get ${cur.country_code} ${cur.app_code} Number` : 'Get Number';
  }

  function openRange(open) {
    const panel = $('[data-range-panel]', el);
    panel.hidden = !open;
    $('[data-range-toggle]', el).setAttribute('aria-expanded', String(open));
    $('[data-range]', el).classList.toggle('open', open);
    if (open) { const f = $('[data-range-filter]', el); f.value = ''; renderPicker(); if (matchMedia('(pointer: fine)').matches) f.focus({ preventScroll: true }); }
  }

  let returnMinutes = 10;
  async function loadServices() {
    const r = await api('/services');
    returnMinutes = r.return_minutes || 10;
    renderLimits(r.limits);
    services = r.services;
    renderPicker($('[data-range-filter]', el)?.value || '');
  }

  async function loadMine(p = page) {
    page = p;
    const box = $('[data-mine]', el);
    const r = await api('/resources/mine', { query: { page } });
    const statusChip = (x) => (x.status === 'returned' ? '<span class="chip warning">Return</span>' : x.status === 'received' ? '<span class="chip success">Received</span>' : '<span class="chip pending">Pending</span>');
    box.innerHTML = r.items.length ? `<div class="num-list">${r.items.map((a) => `
      <div class="num-row ${a.status === 'returned' ? 'is-returned' : ''}" data-aid="${a.id}">
        ${flag(a.flag_code)}
        <div class="num-main">
          <div class="num-line"><span class="mono num-value">${esc(a.resource_value)}</span>
            ${a.status !== 'returned' ? `<button class="icon-mini" data-copy="${esc(a.resource_value)}" aria-label="Copy number"><i class="fa-regular fa-copy"></i></button>` : ''}</div>
          <div class="num-sub">${a.last_code ? otpPill(a.last_code) : ''}<span>${esc(a.country_code)} ${esc(a.app_code)} · ${relEl(a.assigned_at)}</span></div>
        </div>
        ${statusChip(a)}
        ${a.status === 'pending' ? `<button class="icon-mini danger" data-release="${a.id}" title="Return number" aria-label="Return number"><i class="fa-solid fa-xmark"></i></button>` : ''}
      </div>`).join('')}</div>${pagination(r.pagination, loadMine)}
      <p class="small muted" style="margin:10px 0 0"><i class="fa-regular fa-clock"></i> Numbers without an OTP return automatically after ${returnMinutes} minutes.</p>`
      : '<div class="empty"><i class="fa-solid fa-hashtag"></i><div>No numbers yet</div><div class="small">Choose a country above and tap “Get Number”.</div></div>';
  }

  async function assign(serviceId, btn) {
    await withLoading(btn, async () => {
      try {
        const r = await api('/resource/assign', { method: 'POST', body: { service_id: serviceId } });
        toast(`Number assigned: ${r.assignment.resource_value}`);
        renderLimits(r.limits);
        navigator.vibrate?.(30);
        await Promise.all([loadMine(1), loadServices()]);
        $('[data-mine]', el).querySelector('.num-row')?.classList.add('flash');
      } catch (err) {
        if (err.body?.upgrade) upgradePrompt(err.message); else toastError(err);
      }
    });
  }

  let resultSheet = null;
  async function search(serial) {
    if (!/^\d{5,8}$/.test(serial)) { toast('Enter 5–8 digits', 'warning'); return; }
    try {
      const r = await api('/resource/search', { query: { serial } });
      resultSheet?.close();
      resultSheet = sheet({
        title: r.count ? `Matching resources found (${r.count})` : 'No matching resources',
        icon: r.count ? 'fa-solid fa-circle-check' : 'fa-solid fa-magnifying-glass',
        body: r.items.length ? `<div class="num-list">${r.items.map((x) => `<div class="num-row" data-claim-row="${x.id}">
            ${flag(x.flag_code)}<div class="num-main"><div class="num-line"><span class="mono num-value">${esc(x.resource_value)}</span></div>
            <div class="num-sub"><span>${esc(x.country_code)} ${esc(x.app_code)} · ${x.mine ? 'Already yours' : 'Available'}</span></div></div>
            ${x.mine ? chip('assigned', 'Yours') : `<button class="btn btn-primary btn-sm" data-claim="${x.id}"><i class="fa-solid fa-hand-pointer"></i>Claim</button>`}</div>`).join('')}</div>`
          : `<div class="empty"><i class="fa-solid fa-magnifying-glass"></i><div>No available number contains “${esc(serial)}”.</div></div>`,
      });
      resultSheet.el.addEventListener('click', async (e) => {
        const cl = e.target.closest('[data-claim]');
        if (!cl) return;
        await withLoading(cl, async () => {
          try {
            const res = await api('/resource/claim', { method: 'POST', body: { resource_id: Number(cl.dataset.claim) } });
            toast(`Number assigned: ${res.assignment.resource_value}`);
            cl.outerHTML = chip('assigned', 'Yours');
            navigator.vibrate?.(30);
            await Promise.all([loadMine(1), loadServices()]);
            el.querySelector('.num-row')?.classList.add('flash');
          } catch (err) { if (err.body?.upgrade) { resultSheet.close(); upgradePrompt(err.message); } else toastError(err); }
        });
      });
    } catch (err) { toastError(err); }
  }

  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-range-toggle]')) { openRange($('[data-range-panel]', el).hidden); return; }
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      selected = Number(pick.dataset.pick);
      try { localStorage.setItem(LAST_KEY, String(selected)); } catch { /* ignore */ }
      renderPicker();
      openRange(false);
      return;
    }
    const g = e.target.closest('[data-get-selected]');
    if (g) return selected && assign(selected, g);
    const c = e.target.closest('[data-copy]');
    if (c) return copyText(c.dataset.copy, c);
    const rel = e.target.closest('[data-release]');
    if (rel) {
      try { await api(`/resources/${rel.dataset.release}/release`, { method: 'POST' }); toast('Number returned'); loadMine(); loadServices(); } catch (err) { toastError(err); }
      return;
    }
    if (e.target.closest('[data-refresh]')) loadMine();
  });
  $('[data-search]', el).addEventListener('submit', (e) => { e.preventDefault(); search(e.target.serial.value.trim()); });
  $('[data-range-filter]', el).addEventListener('input', (e) => renderPicker(e.target.value));
  // close the range list when tapping outside it
  const outside = (e) => { if (!e.target.closest('[data-range]')) openRange(false); };
  document.addEventListener('click', outside);

  await Promise.all([loadServices(), loadMine(1)]);
  if (query.serial) search(query.serial);

  // OTP arrived: update that number's row instantly (no reload), flash it and play a sound.
  function onOtp({ assignment_id: id, code }) {
    const row = el.querySelector(`[data-aid="${id}"]`);
    if (!row) { loadMine().catch(() => {}); return; }
    row.querySelector('.otp-pill')?.remove();
    row.querySelector('.num-sub')?.insertAdjacentHTML('afterbegin', otpPill(code));
    row.querySelector('.chip').outerHTML = '<span class="chip success">Received</span>';
    row.querySelector('[data-release]')?.remove();
    row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
    playSound('event');
    navigator.vibrate?.([40, 30, 40]);
  }

  const refreshCounts = debounce(() => loadServices().catch(() => {}), 1500);
  const offs = [live.on('service:count', refreshCounts), live.on('resource:returned', () => loadMine().catch(() => {})),
    live.on('resource:otp', onOtp)];
  // Fallback when the live connection is down: check every 5 seconds.
  const poll = setInterval(async () => {
    if (live.connected || document.hidden || page !== 1) return;
    const before = $$('.otp-pill', el).length;
    await loadMine().catch(() => {});
    if ($$('.otp-pill', el).length > before) playSound('event');
  }, 5000);
  return () => { offs.forEach((f) => f()); clearInterval(poll); document.removeEventListener('click', outside); resultSheet?.close(); };
}
