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
    <div class="grid grid-main">
      <div class="stack">
        <div class="card get-card">
          <div class="card-head"><h2>Get Number</h2><span class="chip live">Live</span></div>
          <div class="svc-pick" data-services role="radiogroup" aria-label="Country / service">
            <div class="skeleton" style="height:64px;border-radius:16px"></div><div class="skeleton" style="height:64px;border-radius:16px"></div></div>
          <p class="small muted limits-line" data-limits></p>
          <button class="btn btn-primary btn-block get-btn" data-get-selected><i class="fa-solid fa-plus"></i><span data-get-label>Get Number</span></button>
        </div>
        <div class="card">
          <div class="card-head"><h2>Number List</h2><div class="actions"><button class="btn btn-ghost btn-xs" data-refresh aria-label="Refresh"><i class="fa-solid fa-rotate"></i></button></div></div>
          <div data-mine></div>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head" style="margin-bottom:8px"><h3>Advanced Search</h3><span class="link small muted">Serial 5–8 digits</span></div>
          <form data-search class="row-flex" style="flex-wrap:nowrap">
            <div class="input-group" style="flex:1"><i class="fa-solid fa-magnifying-glass"></i><input class="input" name="serial" inputmode="numeric" pattern="\\d{5,8}" maxlength="8" placeholder="e.g. 123456" value="${esc(query.serial || '')}"></div>
            <button class="btn btn-primary" type="submit">Search</button>
          </form>
          <div data-results style="margin-top:10px"></div>
        </div>
      </div>
    </div>`;

  const renderLimits = (l) => {
    $('[data-limits]', el).textContent = `${l.hour_used}/${l.hourly_limit} this hour · ${l.quota === null ? '∞' : `${l.quota_used}/${l.quota}`} quota`;
  };
  const usable = (s) => s.status === 'active' && s.available;

  function renderPicker() {
    const box = $('[data-services]', el);
    if (!services.length) { box.innerHTML = '<div class="empty"><i class="fa-solid fa-sim-card"></i><div>No services available yet</div></div>'; return; }
    if (!services.some((s) => s.id === selected && usable(s))) selected = (services.find(usable) || services[0]).id;
    box.innerHTML = services.map((s) => `
      <button type="button" class="svc-tile ${s.id === selected ? 'selected' : ''} ${usable(s) ? '' : 'off'}" data-pick="${s.id}" role="radio" aria-checked="${s.id === selected}" ${usable(s) ? '' : 'disabled'}>
        <span class="svc-icons">${flag(s.flag_code)}${appIcon(s.app_icon || s.app_code, 'sm')}</span>
        <span class="svc-text"><strong>${esc(s.country_code)} ${esc(s.app_code)}</strong><small>${esc(s.country_name)} ${esc(s.app_name)}</small></span>
        <span class="svc-state">${usable(s) ? (s.hot ? '<span class="hot-dot">🔥</span>' : '<span class="ok-dot"></span>') : '<span class="off-dot"></span>'}</span>
      </button>`).join('');
    const cur = services.find((s) => s.id === selected);
    const btn = $('[data-get-selected]', el);
    btn.disabled = !cur || !usable(cur);
    $('[data-get-label]', el).textContent = cur ? (usable(cur) ? `Get ${cur.country_code} ${cur.app_code} Number` : `${cur.country_code} ${cur.app_code} unavailable`) : 'Get Number';
  }

  let returnMinutes = 10;
  async function loadServices() {
    const r = await api('/services');
    returnMinutes = r.return_minutes || 10;
    renderLimits(r.limits);
    services = r.services;
    renderPicker();
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

  async function search(serial) {
    const box = $('[data-results]', el);
    if (!/^\d{5,8}$/.test(serial)) { box.innerHTML = '<div class="small muted">Enter 5–8 digits.</div>'; return; }
    try {
      const r = await api('/resource/search', { query: { serial } });
      if (r.count) {
        const pop = document.createElement('div');
        pop.className = 'search-pop';
        pop.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${esc(r.message)} (${r.count})`;
        document.body.append(pop);
        setTimeout(() => pop.remove(), 1600);
      }
      box.innerHTML = r.items.length ? `<div class="list">${r.items.map((x) => `<div class="list-item">${flag(x.flag_code)}
        <div class="li-body"><div class="li-title mono">${esc(x.resource_value)}</div><div class="li-sub">${esc(x.country_code)} ${esc(x.app_code)} · ${x.mine ? 'Assigned to you' : 'Available'}</div></div>
        ${x.mine ? chip('assigned', 'Yours') : `<button class="btn btn-primary btn-xs" data-claim="${x.id}">Claim</button>`}</div>`).join('')}</div>`
        : '<div class="empty" style="padding:14px"><i class="fa-solid fa-magnifying-glass"></i><div>No matching resources</div></div>';
    } catch (err) { toastError(err); }
  }

  el.addEventListener('click', async (e) => {
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      selected = Number(pick.dataset.pick);
      try { localStorage.setItem(LAST_KEY, String(selected)); } catch { /* ignore */ }
      renderPicker();
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
    const cl = e.target.closest('[data-claim]');
    if (cl) {
      await withLoading(cl, async () => {
        try {
          const r = await api('/resource/claim', { method: 'POST', body: { resource_id: Number(cl.dataset.claim) } });
          toast(`Number assigned: ${r.assignment.resource_value}`);
          await Promise.all([loadMine(1), loadServices(), search($('[name=serial]', el).value)]);
        } catch (err) { if (err.body?.upgrade) upgradePrompt(err.message); else toastError(err); }
      });
      return;
    }
    if (e.target.closest('[data-refresh]')) loadMine();
  });
  $('[data-search]', el).addEventListener('submit', (e) => { e.preventDefault(); search(e.target.serial.value.trim()); });
  const deb = debounce((v) => { if (/^\d{5,8}$/.test(v)) search(v); }, 450);
  $('[name=serial]', el).addEventListener('input', (e) => deb(e.target.value.trim()));

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
  return () => { offs.forEach((f) => f()); clearInterval(poll); };
}
