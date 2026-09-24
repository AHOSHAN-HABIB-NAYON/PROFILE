import { api, esc, $, $$, pageHead, listPage, toast, toastError, withLoading, formData } from './kit.js';
import { chip, appIcon, relEl, APP_LIST, confirmSheet, num } from '/assets/js/core.js';

export async function mount(el, { live }) {
  el.innerHTML = `${pageHead('fa-solid fa-bolt', 'OTP / Test Events', 'Live events, expiration, rewards & the demo generator')}
    <div class="grid grid-2" data-top></div><div style="margin-top:16px" data-list></div>`;

  async function renderTop() {
    const c = await api('/admin/events/config');
    const d = c.demo.settings || {};
    const apps = new Set(d.applications || []);
    const countries = (d.countries || []).join(',');
    $('[data-top]', el).innerHTML = `
    <div class="card"><div class="card-head"><h2><i class="fa-solid fa-flask"></i> Demo OTP Generator</h2>${c.demo.running ? '<span class="chip demo">running</span>' : '<span class="chip">stopped</span>'}</div>
      <div class="alert warning"><i class="fa-solid fa-triangle-exclamation"></i><span>Admin-only tool for UI testing. Every generated event is stored separately and always shown with a <strong>DEMO</strong> badge. Demo events never credit wallets.</span></div>
      <form data-demo><div class="form-grid two">
        <div class="field"><label>Events per second</label><select class="input" name="events_per_second">${[1, 2, 5].map((n) => `<option ${n === Number(d.events_per_second) ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="field"><label>Generation interval (ms)</label><input class="input" type="number" name="interval_ms" min="200" max="60000" value="${esc(d.interval_ms || 1000)}"></div>
        <div class="field"><label>Expiration (hours)</label><select class="input" name="expiration_hours">${[1, 6, 12, 24, 48].map((n) => `<option ${n === Number(d.expiration_hours) ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="field"><label>Starting count</label><input class="input" type="number" name="starting_count" min="0" value="${esc(d.starting_count || 0)}"><span class="hint">Generated so far: ${num(d.generated_total || 0)}</span></div>
        <div class="field" style="grid-column:1/-1"><label>Countries (comma separated)</label><input class="input" name="countries" value="${esc(countries)}" placeholder="PK,IQ,IN,BD"></div>
        <div class="field" style="grid-column:1/-1"><label>Applications</label><div class="row-flex">${APP_LIST.map((a) => `<label class="check"><input type="checkbox" name="app_${a.code}" ${apps.has(a.code) ? 'checked' : ''}>${appIcon(a.code, 'sm')} ${a.code}</label>`).join('')}</div></div>
        <div class="field" style="grid-column:1/-1"><label class="switch"><input type="checkbox" name="enabled" ${d.enabled ? 'checked' : ''}><span class="track"></span><span>Enabled</span></label></div>
      </div>
      <div class="row-flex"><button class="btn btn-primary" type="submit">Save & apply</button>
        <button type="button" class="btn ${c.demo.running ? 'btn-danger' : 'btn-success'}" data-toggle="${c.demo.running ? 0 : 1}"><i class="fa-solid ${c.demo.running ? 'fa-stop' : 'fa-play'}"></i>${c.demo.running ? 'Stop' : 'Start'}</button>
        <button type="button" class="btn btn-ghost" data-purge><i class="fa-solid fa-broom"></i>Purge demo events</button></div></form>
    </div>
    <div class="card"><div class="card-head"><h2>Event settings</h2></div>
      <form data-config><div class="field"><label>Event expiration</label><select class="input" name="expiration_hours">${[1, 6, 12, 24, 48].map((n) => `<option value="${n}" ${n === c.expiration_hours ? 'selected' : ''}>${n} hour${n > 1 ? 's' : ''}</option>`).join('')}</select>
        <span class="hint">Expired events disappear from the public feed and are marked expired in the database.</span></div>
        <div class="field"><label>Reward per valid event (USD)</label><input class="input" name="event_reward" inputmode="decimal" value="${esc(c.event_reward)}"><span class="hint">Default 0.01 — credited to the user who holds the authorized resource.</span></div>
        <button class="btn btn-primary" type="submit">Save</button></form>
      <div class="divider"></div>
      <div class="row-flex"><button class="btn btn-ghost btn-sm" data-expire="all_live"><i class="fa-solid fa-hourglass-end"></i>Expire all live events</button>
        <button class="btn btn-ghost btn-sm" data-expire="all_demo"><i class="fa-solid fa-hourglass-end"></i>Expire all demo events</button></div>
    </div>`;
  }

  await renderTop();
  const list = listPage($('[data-list]', el), {
    endpoint: '/admin/events',
    filters: [
      { name: 'q', type: 'search', label: 'Search code or resource…' },
      { name: 'status', type: 'select', options: [['', 'All status'], ['received', 'Received'], ['expired', 'Expired']] },
      { name: 'app', type: 'select', options: [['', 'All apps'], ...APP_LIST.map((a) => [a.code, a.code])] },
    ],
    bulk: [{ action: 'expire', label: 'Expire selected', danger: true }],
    async onBulk(action, ids, c) { toast((await api('/admin/events/expire', { method: 'POST', body: { scope: 'ids', ids } })).message); c.reload(); },
    columns: [
      { label: 'ID', render: (e) => `#${e.id}` },
      { label: 'App', render: (e) => `<span class="row-flex" style="gap:6px">${appIcon(e.application, 'sm')}${esc(e.application)}</span>` },
      { label: 'Code', render: (e) => `<strong class="mono">${esc(e.code)}</strong>` },
      { label: 'Resource', render: (e) => `<span class="mono small">${esc(e.resource_value || '')}</span>` },
      { label: 'Provider', render: (e) => esc(e.provider || '—') },
      { label: 'User', render: (e) => esc(e.user_email || '—') },
      { label: 'Reward', render: (e) => `$${esc(e.reward_amount)}` },
      { label: 'Status', render: (e) => chip(e.status) },
      { label: 'Received', render: (e) => relEl(new Date(e.received_at).toISOString()) },
    ],
    empty: 'No authorized events yet. Enable an API provider or start the demo generator.',
  });

  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    await withLoading(e.submitter, async () => {
      try {
        if (f.matches('[data-demo]')) {
          const d = formData(f);
          d.applications = APP_LIST.filter((a) => d[`app_${a.code}`]).map((a) => a.code);
          toast((await api('/admin/demo', { method: 'PUT', body: d })).message);
          await renderTop();
        } else if (f.matches('[data-config]')) {
          toast((await api('/admin/events/config', { method: 'PUT', body: formData(f) })).message);
        }
      } catch (err) { toastError(err); }
    });
  });
  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-toggle]');
    const p = e.target.closest('[data-purge]');
    const x = e.target.closest('[data-expire]');
    try {
      if (t) { toast((await api('/admin/demo/toggle', { method: 'POST', body: { enabled: t.dataset.toggle === '1' } })).message); await renderTop(); }
      if (p && await confirmSheet({ title: 'Purge demo events?', message: 'All demo/test events will be deleted.', confirm: 'Purge', danger: true })) { toast((await api('/admin/demo/purge', { method: 'POST' })).message); }
      if (x && await confirmSheet({ title: 'Expire events?', message: 'They will be removed from the live feed immediately.', confirm: 'Expire', danger: true })) {
        toast((await api('/admin/events/expire', { method: 'POST', body: { scope: x.dataset.expire } })).message); list.reload();
      }
    } catch (err) { toastError(err); }
  });
  let pending = null;
  const off = live.on('admin:event', () => { clearTimeout(pending); pending = setTimeout(() => { if (list.state.page === 1) list.reload(); }, 1500); });
  return () => { off(); clearTimeout(pending); };
}
