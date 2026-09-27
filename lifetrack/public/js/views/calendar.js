/* Compact calendar: income/expense per day, reminders, lending due dates, goal deadlines, moods; day detail list. */
import { $, $$, el, html, icon, moodIcon, api, state, t, money, localDateStr, inputToIso, txRow, emptyState, errorState, on } from '../core.js';

const LOC = () => ({ bn: 'bn-BD', hi: 'hi-IN' }[state.lang] || 'en-US');
const addMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };

export default function calendar(ctx) {
  const today = localDateStr();
  let month = ctx.query.month || today.slice(0, 7); let sel = today; let data = null;
  const page = el(html`<div>
    <header class="ph"><h1>${t('nav.calendar')}</h1><div class="ph-actions"><button class="btn btn-soft btn-sm" data-today>${t('cal.today')}</button><button class="icon-btn" data-quick aria-label="${t('quick.add')}">${icon('plus')}</button></div></header>
    <div class="two-col">
      <section class="card cal"><div class="cal-head"><button class="icon-btn" data-prev aria-label="${t('common.previous')}">${icon('chevron-left')}</button><b data-title></b><button class="icon-btn" data-next aria-label="${t('common.next')}">${icon('chevron-right')}</button></div>
        <div class="cal-grid" data-grid></div>
        <div class="legend" style="justify-content:center;margin-top:10px"><span style="--c:var(--green)"><i></i>${t('tx.type.income')}</span><span style="--c:var(--red)"><i></i>${t('tx.type.expense')}</span><span style="--c:var(--orange)"><i></i>${t('cal.due')}</span><span style="--c:var(--violet)"><i></i>${t('cal.reminder')}</span><span style="--c:var(--teal)"><i></i>${t('nav.goals')}</span></div>
        <div class="card-pad" data-month-sum style="display:flex;gap:12px;justify-content:space-around;border-top:1px solid var(--line);margin-top:10px;padding-bottom:4px"></div></section>
      <section><div class="section-head" style="margin-top:14px"><h2 data-day-title></h2></div><div data-day></div></section>
    </div></div>`);
  const dows = () => { const base = new Date(Date.UTC(2024, 0, 7)); return Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(LOC(), { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(base.getTime() + i * 864e5))); };
  function grid() {
    $('[data-title]', page).textContent = new Intl.DateTimeFormat(LOC(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(month + '-15T00:00:00Z'));
    const [y, m] = month.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(html`<span></span>`);
    for (let d = 1; d <= days; d++) {
      const ds = `${month}-${String(d).padStart(2, '0')}`; const info = data?.days[ds];
      const dots = [];
      if (info?.income) dots.push('var(--green)'); if (info?.expense) dots.push('var(--red)');
      (info?.events || []).forEach((e) => { const c = { lent: 'var(--orange)', borrowed: 'var(--orange)', reminder: 'var(--violet)', goal: 'var(--teal)' }[e.kind]; if (!dots.includes(c)) dots.push(c); });
      cells.push(html`<button class="cal-day ${ds === today ? 'today' : ''} ${ds === sel ? 'sel' : ''}" data-d="${ds}" aria-label="${ds}">${info?.mood ? html`<svg class="mood-mini" viewBox="0 0 24 24"><use href="#mood-${info.mood}"/></svg>` : ''}${new Intl.NumberFormat(LOC()).format(d)}<span class="dots">${dots.slice(0, 4).map((c) => html`<i style="--c:${c}"></i>`)}</span></button>`);
    }
    $('[data-grid]', page).innerHTML = String(html`${dows().map((w) => html`<span class="cal-dow">${w}</span>`)}${cells}`);
    $$('[data-d]', page).forEach((b) => b.onclick = () => { sel = b.dataset.d; $$('.cal-day', page).forEach((x) => x.classList.toggle('sel', x === b)); day(); });
    const sum = Object.values(data?.days || {}).reduce((a, x) => ({ i: a.i + x.income, e: a.e + x.expense }), { i: 0, e: 0 });
    $('[data-month-sum]', page).innerHTML = String(html`<span style="text-align:center"><small class="muted">${t('tx.type.income')}</small><br><b class="pos">${money(sum.i, data?.currency)}</b></span><span style="text-align:center"><small class="muted">${t('tx.type.expense')}</small><br><b class="neg">${money(sum.e, data?.currency)}</b></span><span style="text-align:center"><small class="muted">${t('cal.net')}</small><br><b>${money(sum.i - sum.e, data?.currency, { sign: true })}</b></span>`);
  }
  async function day() {
    const box = $('[data-day]', page);
    $('[data-day-title]', page).textContent = new Intl.DateTimeFormat(LOC(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(sel + 'T12:00:00Z'));
    const info = data?.days[sel];
    box.innerHTML = '<div class="card"><div class="sk" style="height:80px;margin:12px"></div></div>';
    try {
      const d = await api.get(`/api/transactions?from=${encodeURIComponent(inputToIso(sel + 'T00:00'))}&to=${encodeURIComponent(inputToIso(sel + 'T23:59'))}&limit=100`, { force: true });
      const ev = info?.events || [];
      const evIcon = { lent: ['lend', 'var(--orange)'], borrowed: ['borrow', 'var(--pink)'], reminder: ['alarm', 'var(--violet)'], goal: ['target', 'var(--teal)'] };
      box.innerHTML = String(html`${info?.mood ? html`<div class="card card-pad" style="display:flex;gap:10px;align-items:center;margin-bottom:10px">${moodIcon(info.mood)}<b>${t('mood.m' + info.mood)}</b></div>` : ''}
        ${ev.length ? html`<div class="card list" style="overflow:hidden;margin-bottom:10px">${ev.map((e) => html`<a class="li" href="${e.kind === 'lent' || e.kind === 'borrowed' ? `/app/loans/${e.kind}/${e.id}` : e.kind === 'goal' ? '/app/goals' : '/app/reminders'}"><span class="tile" style="--c:${evIcon[e.kind][1]}">${icon(evIcon[e.kind][0])}</span><span class="li-main"><span class="li-title">${e.kind === 'lent' ? t('cal.collect_from', { name: e.title }) : e.kind === 'borrowed' ? t('cal.repay_to', { name: e.title }) : e.title}</span><span class="li-sub">${t('cal.ev.' + e.kind)}</span></span>${e.amount ? html`<span class="li-amt">${money(e.amount, e.currency)}</span>` : ''}</a>`)}</div>` : ''}
        <div class="card tx-list"><div class="list">${d.items.length ? d.items.map((x) => txRow(x)) : emptyState(t('cal.no_activity'), t('cal.no_activity_sub'))}</div></div>`);
      $$('[data-tx]', box).forEach((b) => b.onclick = () => import('./transactions.js').then((m) => m.openTxDetail(b.dataset.tx)));
    } catch (e) { box.innerHTML = String(errorState(e.message)); }
  }
  async function load() {
    try { data = await api.get(`/api/insights/calendar?month=${month}`, { force: true }); grid(); day(); }
    catch (e) { $('[data-grid]', page).innerHTML = String(errorState(e.message)); }
  }
  $('[data-prev]', page).onclick = () => { month = addMonth(month, -1); sel = month + '-01'; load(); };
  $('[data-next]', page).onclick = () => { month = addMonth(month, 1); sel = month + '-01'; load(); };
  $('[data-today]', page).onclick = () => { month = today.slice(0, 7); sel = today; load(); };
  grid(); load();
  return { el: page, title: t('nav.calendar'), refresh: load, destroy: on('data:changed', load) };
}
