/* Notifications, reminders, notes and investments. */
import { $, $$, el, html, icon, api, t, money, fmtDate, fmtDay, fmtTime, relTime, emptyState, errorState, on, toast, confirmDialog, openSheet, withBusy, segmented, emit } from '../core.js';
import { openReminderForm, openNoteForm, changed } from '../forms.js';
import { setUnread } from '../app.js';

const NOTIF_ICON = { welcome: ['sparkle', 'var(--primary)'], security: ['shield', 'var(--red)'], lend_reminder: ['lend', 'var(--orange)'], borrow_reminder: ['borrow', 'var(--pink)'], bill_reminder: ['bolt', 'var(--yellow)'],
  goal_reminder: ['target', 'var(--teal)'], goal: ['target', 'var(--teal)'], payment_reminder: ['coin', 'var(--primary)'], custom_reminder: ['alarm', 'var(--violet)'], announcement: ['megaphone', 'var(--violet)'], system: ['info', 'var(--primary)'] };

export function notifications(ctx) {
  let before = 0;
  const page = el(html`<div><header class="ph"><h1>${t('nav.notifications')}</h1><div class="ph-actions"><button class="btn btn-soft btn-sm" data-all>${icon('check', 'i-sm')}${t('notif.mark_all')}</button><a class="icon-btn" href="/app/settings/notifications" aria-label="${t('nav.settings')}">${icon('settings')}</a></div></header>
    <div class="card tx-list"><div class="list stagger" data-list></div></div><div class="pager" data-more hidden><button class="btn btn-soft btn-sm">${t('common.load_more')}</button></div></div>`);
  async function load(append = false) {
    const box = $('[data-list]', page);
    try {
      const d = await api.get('/api/notifications?limit=30' + (append && before ? `&before=${before}` : ''), { force: true });
      setUnread(d.unread);
      const markup = String(html`${d.items.map((n) => { const [ic, c] = NOTIF_ICON[n.type] || NOTIF_ICON.system; return html`<div class="swipe" data-swipe="${n.id}"><div class="swipe-bg">${icon('trash', 'i-sm')}</div><button class="li" data-n="${n.id}" data-link="${n.link || ''}" style="align-items:flex-start;${n.read_at ? '' : 'background:color-mix(in srgb, var(--primary) 5%, var(--surface))'}"><span class="tile" style="--c:${c}">${icon(ic)}</span><span class="li-main"><span class="li-title" style="white-space:normal">${n.title}</span><span class="li-sub" style="white-space:normal">${n.body || ''}</span><span class="li-sub" style="margin-top:3px">${relTime(n.created_at)}</span></span>${n.read_at ? '' : html`<span style="width:8px;height:8px;border-radius:50%;background:var(--primary);margin-top:6px"></span>`}</button></div>`; })}`);
      if (append) box.insertAdjacentHTML('beforeend', markup); else box.innerHTML = d.items.length ? markup : String(emptyState(t('notif.empty'), t('notif.empty_sub')));
      before = d.items.length ? d.items[d.items.length - 1].id : 0;
      $('[data-more]', page).hidden = !d.more;
      $$('[data-n]', box).forEach((b) => { if (b.dataset.bound) return; b.dataset.bound = 1; b.onclick = async () => { if (b.dataset.noclick) return; await api.post(`/api/notifications/${b.dataset.n}/read`).catch(() => {}); if (b.dataset.link && b.dataset.link.startsWith('/app')) ctx.navigate(b.dataset.link); else load(); }; });
      const { enableSwipe } = await import('../core.js');
      enableSwipe(box, async (id) => { try { await api.del(`/api/notifications/${id}`); return true; } catch { return false; } });
    } catch (e) { box.innerHTML = String(errorState(e.message)); box.querySelector('[data-retry]').onclick = () => load(); }
  }
  $('[data-all]', page).onclick = async () => { await api.post('/api/notifications/read-all').catch(() => {}); setUnread(0); load(); };
  $('[data-more] button', page).onclick = () => load(true);
  load();
  return { el: page, title: t('nav.notifications'), refresh: () => load(), destroy: on('notifications:new', () => load()) };
}

export function reminders() {
  let scope = 'open';
  const page = el(html`<div><header class="ph"><h1>${t('nav.reminders')}</h1><div class="ph-actions"><button class="btn btn-primary btn-sm" data-add>${icon('plus', 'i-sm')}${t('rem.add')}</button></div></header>
    <div class="seg" data-scope style="display:flex;margin-bottom:10px"><button data-v="open" class="active" style="flex:1">${t('rem.upcoming')}</button><button data-v="done" style="flex:1">${t('rem.done')}</button></div>
    <div class="card tx-list"><div class="list stagger" data-list></div></div></div>`);
  async function load() {
    const box = $('[data-list]', page);
    try {
      const list = await api.get('/api/reminders' + (scope === 'done' ? '?scope=done' : ''), { force: true });
      const ic = { lend: ['lend', 'var(--orange)'], borrow: ['borrow', 'var(--pink)'], bill: ['bolt', 'var(--yellow)'], goal: ['target', 'var(--teal)'], payment: ['coin', 'var(--primary)'], custom: ['alarm', 'var(--violet)'] };
      box.innerHTML = list.length ? String(html`${list.map((r) => { const [i, c] = ic[r.type] || ic.custom; const overdue = !r.done_at && new Date(r.due_at) < new Date(); return html`<div class="li"><button class="tile" style="--c:${r.done_at ? 'var(--green)' : c}" data-done="${r.id}" aria-label="${t('rem.toggle_done')}">${icon(r.done_at ? 'check' : i)}</button><span class="li-main"><span class="li-title" style="${r.done_at ? 'text-decoration:line-through;opacity:.6' : ''}">${r.title}</span><span class="li-sub ${overdue ? 'neg' : ''}">${fmtDate(r.due_at)} · ${fmtTime(r.due_at)}${r.repeat_rule !== 'none' ? ' · ' + t('rem.repeat.' + r.repeat_rule) : ''}${overdue ? ' · ' + t('rem.overdue') : ''}</span></span>${r.amount ? html`<span class="li-amt">${money(r.amount)}</span>` : ''}${r.ref_type ? html`<a class="icon-btn" href="${['lent', 'borrowed'].includes(r.ref_type) ? `/app/loans/${r.ref_type}/${r.ref_id}` : '/app/goals'}">${icon('chevron-right', 'i-sm')}</a>` : html`<button class="icon-btn" data-edit="${r.id}">${icon('dots-v', 'i-sm')}</button>`}</div>`; })}`)
        : String(emptyState(t('rem.empty'), t('rem.empty_sub')));
      $$('[data-done]', box).forEach((b) => b.onclick = async () => { try { await api.post(`/api/reminders/${b.dataset.done}/done`); load(); } catch (e) { toast(e.message, { type: 'error' }); } });
      $$('[data-edit]', box).forEach((b) => b.onclick = () => {
        const r = list.find((x) => String(x.id) === b.dataset.edit);
        const body = el(html`<div class="list set-list"><button class="li" data-x="edit"><span class="tile" style="--c:var(--primary)">${icon('edit')}</span><span class="li-main"><span class="li-title">${t('common.edit')}</span></span></button><button class="li" data-x="del"><span class="tile" style="--c:var(--red)">${icon('trash')}</span><span class="li-main"><span class="li-title neg">${t('common.delete')}</span></span></button></div>`);
        const s = openSheet({ title: r.title, body });
        body.querySelector('[data-x=edit]').onclick = () => { s.close(); setTimeout(() => openReminderForm(r), 150); };
        body.querySelector('[data-x=del]').onclick = async () => { s.close(); try { await api.del(`/api/reminders/${r.id}`); load(); } catch (e) { toast(e.message, { type: 'error' }); } };
      });
    } catch (e) { box.innerHTML = String(errorState(e.message)); }
  }
  segmented($('[data-scope]', page), (v) => { scope = v; load(); });
  $('[data-add]', page).onclick = () => openReminderForm();
  load();
  return { el: page, title: t('nav.reminders'), refresh: load, destroy: on('data:changed', load) };
}

export function notes() {
  const page = el(html`<div><header class="ph"><h1>${t('nav.notes')}</h1><div class="ph-actions"><button class="btn btn-primary btn-sm" data-add>${icon('plus', 'i-sm')}${t('note.add')}</button></div></header><div class="goal-grid stagger" data-list></div></div>`);
  async function load() {
    const box = $('[data-list]', page);
    try {
      const list = await api.get('/api/notes', { force: true });
      box.innerHTML = list.length ? String(html`${list.map((n) => html`<button class="goal" data-id="${n.id}" style="gap:6px"><div style="display:flex;gap:8px;align-items:center"><b style="font-size:13.5px;flex:1" class="ellipsis">${n.title}</b>${n.pinned ? icon('pin', 'i-sm') : ''}</div><p class="muted" style="font-size:12.5px;white-space:pre-wrap;max-height:90px;overflow:hidden">${n.body || ''}</p><small class="muted" style="font-size:11px">${relTime(n.updated_at)}</small></button>`)}`)
        : String(html`<div class="card" style="grid-column:1/-1">${emptyState(t('note.empty'), t('note.empty_sub'))}</div>`);
      $$('[data-id]', box).forEach((b) => b.onclick = () => {
        const n = list.find((x) => String(x.id) === b.dataset.id);
        const body = el(html`<div><p style="white-space:pre-wrap;font-size:14px">${n.body || ''}</p></div>`);
        const foot = el(html`<div style="display:flex;gap:10px;width:100%"><button class="btn btn-danger-soft btn-block" data-del>${icon('trash', 'i-sm')}${t('common.delete')}</button><button class="btn btn-primary btn-block" data-edit>${icon('edit', 'i-sm')}${t('common.edit')}</button></div>`);
        const s = openSheet({ title: n.title, body, foot });
        foot.querySelector('[data-edit]').onclick = () => { s.close(); setTimeout(() => openNoteForm(n), 150); };
        foot.querySelector('[data-del]').onclick = async () => { s.close(); if (await confirmDialog({ title: t('common.delete'), message: t('note.delete_confirm'), danger: true, confirm: t('common.delete') })) { await api.del(`/api/notes/${n.id}`).catch((e) => toast(e.message, { type: 'error' })); load(); } };
      });
    } catch (e) { box.innerHTML = String(errorState(e.message)); }
  }
  $('[data-add]', page).onclick = () => openNoteForm();
  load();
  return { el: page, title: t('nav.notes'), refresh: load, destroy: on('data:changed', load) };
}

export function investments() {
  const page = el(html`<div><header class="ph"><h1>${t('nav.investments')}</h1><div class="ph-actions"><button class="btn btn-primary btn-sm" data-add>${icon('plus', 'i-sm')}${t('inv.add')}</button></div></header>
    <div class="stats" style="grid-template-columns:repeat(3,1fr);margin-bottom:12px" data-sum></div><div class="card tx-list"><div class="list stagger" data-list></div></div></div>`);
  async function load() {
    const box = $('[data-list]', page);
    try {
      const list = await api.get('/api/investments', { force: true });
      const open = list.filter((x) => !x.closed_at);
      const inv = open.reduce((s, x) => s + Number(x.amount), 0); const val = open.reduce((s, x) => s + Number(x.current_value), 0);
      $('[data-sum]', page).innerHTML = String(html`<div class="stat"><span class="stat-top">${t('inv.invested')}</span><span class="stat-val">${money(inv, undefined, { compact: true })}</span></div><div class="stat"><span class="stat-top">${t('inv.value')}</span><span class="stat-val">${money(val, undefined, { compact: true })}</span></div><div class="stat"><span class="stat-top">${t('inv.pnl')}</span><span class="stat-val ${val - inv >= 0 ? 'pos' : 'neg'}">${money(val - inv, undefined, { sign: true, compact: true })}</span></div>`);
      box.innerHTML = list.length ? String(html`${list.map((x) => { const pnl = Number(x.current_value) - Number(x.amount); const pct = Number(x.amount) ? (pnl / Number(x.amount)) * 100 : 0; return html`<button class="li" data-id="${x.id}" ${x.closed_at ? 'style="opacity:.55"' : ''}><span class="tile" style="--c:var(--violet)">${icon('trend-up')}</span><span class="li-main"><span class="li-title">${x.name}</span><span class="li-sub">${fmtDay(x.started_at)} · ${t('inv.invested')} ${money(x.amount, x.currency)}${x.closed_at ? ' · ' + t('inv.closed') : ''}</span></span><span class="li-end"><span class="li-amt">${money(x.current_value, x.currency)}</span><span class="li-sub ${pnl >= 0 ? 'pos' : 'neg'}">${pnl >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%</span></span></button>`; })}`)
        : String(emptyState(t('inv.empty'), t('inv.empty_sub')));
      $$('[data-id]', box).forEach((b) => b.onclick = () => {
        const x = list.find((i) => String(i.id) === b.dataset.id); if (x.closed_at) return;
        const body = el(html`<form><div class="field"><label>${t('inv.current_value')}</label><input class="input" name="current_value" inputmode="decimal" value="${Number(x.current_value)}"></div><p class="hint">${t('inv.value_hint')}</p></form>`);
        const foot = el(html`<button class="btn btn-primary btn-lg btn-block">${t('common.save')}</button>`);
        const s = openSheet({ title: x.name, body, foot });
        foot.onclick = () => withBusy(foot, async () => { try { await api.patch(`/api/investments/${x.id}`, { current_value: body.current_value.value }); s.close(); toast(t('common.saved')); load(); emit('data:changed'); } catch (e) { toast(e.message, { type: 'error' }); } });
      });
    } catch (e) { box.innerHTML = String(errorState(e.message)); }
  }
  $('[data-add]', page).onclick = () => import('../forms.js').then((m) => m.openTxForm('investment'));
  load();
  return { el: page, title: t('nav.investments'), refresh: load, destroy: on('data:changed', load) };
}
