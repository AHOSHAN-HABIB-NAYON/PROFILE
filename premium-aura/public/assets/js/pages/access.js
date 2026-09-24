import { api, esc, $, $$, toast, toastError, flag, appIcon, pageHead, num, relEl, pagination, withLoading, sheet, debounce, copyText, chip } from '../core.js';

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

export async function mount(el, { query, live }) {
  let page = 1;
  el.innerHTML = `${pageHead('fa-solid fa-sim-card', 'Access Services', 'Live servers & numbers')}
    <div class="grid grid-main">
      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>Today Access Numbers</h2><span class="chip live">Live</span><span class="link small muted" data-limits></span></div>
          <div class="service-grid" data-services><div class="skeleton sk-card"></div><div class="skeleton sk-card"></div></div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Number List</h2><div class="actions"><button class="btn btn-ghost btn-xs" data-refresh><i class="fa-solid fa-rotate"></i></button></div></div>
          <div data-mine></div>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>Add Number</h2></div>
          <form data-add>
            <div class="field"><label>Select Country / Service</label><select class="input" name="service_id" data-select></select></div>
            <button class="btn btn-primary btn-block" type="submit"><i class="fa-solid fa-plus"></i>Get Number</button>
          </form>
          <div class="divider"></div>
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

  async function loadServices() {
    const r = await api('/services');
    renderLimits(r.limits);
    $('[data-services]', el).innerHTML = r.services.length ? r.services.map((s) => `
      <div class="service-card" data-service="${s.id}">
        ${flag(s.flag_code)}
        <div class="sc-body"><div class="sc-codes">${esc(s.country_code)} ${appIcon(s.app_icon || s.app_code, 'sm')} ${esc(s.app_code)}</div>
          <div class="sc-name">${esc(s.country_name)} ${esc(s.app_name)}</div>${s.status !== 'active' ? chip(s.status) : ''}</div>
        <div class="sc-end"><span class="sc-count" data-count>${num(s.available)}</span>
          <button class="btn btn-primary btn-xs" data-get="${s.id}" ${s.status !== 'active' || !s.available ? 'disabled' : ''}><i class="fa-solid fa-plus"></i>Get</button></div>
      </div>`).join('') : '<div class="empty"><i class="fa-solid fa-sim-card"></i><div>No services available yet</div></div>';
    $('[data-select]', el).innerHTML = r.services.filter((s) => s.status === 'active')
      .map((s) => `<option value="${s.id}">${esc(s.country_name)} (${esc(s.country_code)} - ${esc(s.app_code)}) · ${num(s.available)} available</option>`).join('');
  }

  async function loadMine(p = page) {
    page = p;
    const box = $('[data-mine]', el);
    const r = await api('/resources/mine', { query: { page } });
    box.innerHTML = r.items.length ? `<table class="table responsive"><thead><tr><th>#</th><th>Number</th><th>Service</th><th>OTP</th><th>Status</th><th></th></tr></thead><tbody>
      ${r.items.map((a, i) => `<tr><td data-label="#">${(r.pagination.page - 1) * r.pagination.pageSize + i + 1}</td>
        <td data-label="Number" class="mono">${esc(a.resource_value)}</td>
        <td data-label="Service"><span class="row-flex" style="gap:6px;justify-content:flex-end">${flag(a.flag_code)}${esc(a.country_code)} ${esc(a.app_code)}</span></td>
        <td data-label="OTP">${a.last_code ? `<strong class="mono">${esc(a.last_code)}</strong> <button class="btn btn-ghost btn-xs" data-copy="${esc(a.last_code)}">copy</button>` : '<span class="muted">—</span>'}</td>
        <td data-label="Status">${chip(a.status)}<div class="small muted">${relEl(a.assigned_at)}</div></td>
        <td class="actions"><button class="btn btn-ghost btn-xs" data-copy="${esc(a.resource_value)}"><i class="fa-regular fa-copy"></i></button>
          <button class="btn btn-ghost btn-xs" data-release="${a.id}" title="Release"><i class="fa-solid fa-xmark"></i></button></td></tr>`).join('')}
      </tbody></table>${pagination(r.pagination, loadMine)}` : '<div class="empty"><i class="fa-solid fa-hashtag"></i><div>No numbers yet</div><div class="small">Tap “Get” on a service to receive an authorized number.</div></div>';
  }

  async function assign(serviceId, btn) {
    await withLoading(btn, async () => {
      try {
        const r = await api('/resource/assign', { method: 'POST', body: { service_id: serviceId } });
        toast(`Number assigned: ${r.assignment.resource_value}`);
        renderLimits(r.limits);
        navigator.vibrate?.(30);
        await Promise.all([loadMine(1), loadServices()]);
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
    const g = e.target.closest('[data-get]');
    if (g) return assign(Number(g.dataset.get), g);
    const c = e.target.closest('[data-copy]');
    if (c) return copyText(c.dataset.copy, c);
    const rel = e.target.closest('[data-release]');
    if (rel) {
      try { await api(`/resources/${rel.dataset.release}/release`, { method: 'POST' }); toast('Released'); loadMine(); } catch (err) { toastError(err); }
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
  $('[data-add]', el).addEventListener('submit', (e) => { e.preventDefault(); assign(Number(e.target.service_id.value), e.submitter || $('[data-add] [type=submit]', el)); });
  $('[data-search]', el).addEventListener('submit', (e) => { e.preventDefault(); search(e.target.serial.value.trim()); });
  const deb = debounce((v) => { if (/^\d{5,8}$/.test(v)) search(v); }, 450);
  $('[name=serial]', el).addEventListener('input', (e) => deb(e.target.value.trim()));

  await Promise.all([loadServices(), loadMine(1)]);
  if (query.serial) search(query.serial);

  const refreshCounts = debounce(() => loadServices().catch(() => {}), 1500);
  const offs = [live.on('service:count', refreshCounts), live.on('event:new', (ev) => { if (!ev.is_demo) loadMine().catch(() => {}); })];
  return () => offs.forEach((f) => f());
}
