/* Reports: daily/weekly/monthly/yearly — income vs expense, category donut, savings, investment, profit/loss, net worth. */
import { $, $$, el, html, icon, api, state, t, money, num, errorState, segmented, countUp, on } from '../core.js';
import { lineChart, barChart, donut, PALETTE } from '../charts.js';

const LOC = () => ({ bn: 'bn-BD', hi: 'hi-IN' }[state.lang] || 'en-US');
function label(period, s) {
  if (period === 'monthly') return new Intl.DateTimeFormat(LOC(), { month: 'short' }).format(new Date(s + '-15T00:00:00Z'));
  if (period === 'yearly') return s;
  return new Intl.DateTimeFormat(LOC(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(s + 'T12:00:00Z'));
}

export default function reports() {
  let period = 'monthly'; let shift = 0; let catType = 'expense';
  const page = el(html`<div>
    <header class="ph"><h1>${t('nav.reports')}</h1><div class="ph-actions"><a class="icon-btn" href="/api/me/export.csv" download aria-label="${t('rep.export')}" title="${t('rep.export')}">${icon('download')}</a></div></header>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><div class="seg" data-period style="flex:1;display:flex">${['daily', 'weekly', 'monthly', 'yearly'].map((p) => html`<button data-v="${p}" class="${p === period ? 'active' : ''}" style="flex:1">${t('rep.' + p)}</button>`)}</div>
      <button class="icon-btn bordered" data-prev aria-label="${t('common.previous')}">${icon('chevron-left', 'i-sm')}</button><button class="icon-btn bordered" data-next aria-label="${t('common.next')}" disabled>${icon('chevron-right', 'i-sm')}</button></div>
    <div data-body><div class="card card-pad"><div class="sk" style="height:220px"></div></div></div>
  </div>`);
  async function load() {
    const body = $('[data-body]', page);
    let d;
    try { d = await api.get(`/api/insights/reports?period=${period}&shift=${shift}`, { force: true }); }
    catch (e) { body.innerHTML = String(errorState(e.message)); body.querySelector('[data-retry]').onclick = load; return; }
    const cur = d.currency; const s = d.series; const labels = s.map((x) => label(period, x.label));
    const tt = d.totals;
    body.innerHTML = String(html`
      <div class="stats stagger" style="margin-bottom:12px">
        ${[['income', 'income', 'var(--green)', tt.income], ['expense', 'expense', 'var(--red)', tt.expense], ['savings', 'piggy', 'var(--primary)', tt.savings], ['investment', 'trend-up', 'var(--violet)', tt.investment]]
    .map(([k, ic, c, v]) => html`<div class="stat"><span class="stat-top"><span class="tile" style="--c:${c}">${icon(ic)}</span>${t('home.kpi.' + k)}</span><span class="stat-val" data-cnt="${v}">${money(0, cur)}</span>${k === 'savings' ? html`<span class="stat-chg ${tt.savingsRate >= 0 ? 'pos' : 'neg'}">${t('rep.savings_rate', { n: tt.savingsRate })}</span>` : ''}</div>`)}
      </div>
      <div class="two-col">
        <section class="card"><div class="card-head"><div><div class="card-title">${t('home.income_vs_expense')}</div><div class="card-sub">${t('rep.' + period)}</div></div><div class="legend"><span style="--c:var(--green)"><i></i>${t('tx.type.income')}</span><span style="--c:var(--red)"><i></i>${t('tx.type.expense')}</span></div></div><div style="padding:6px 10px 10px"><div data-c1></div></div></section>
        <section class="card"><div class="card-head"><div class="card-title">${t('rep.by_category')}</div><div class="seg" data-cat>${['expense', 'income', 'investment'].map((k) => html`<button data-v="${k}" class="${k === catType ? 'active' : ''}">${t('tx.type.' + k)}</button>`)}</div></div><div style="padding:12px 14px 14px" data-cats></div></section>
      </div>
      <div class="two-col-even" style="margin-top:12px">
        <section class="card"><div class="card-head"><div class="card-title">${t('rep.savings_trend')}</div><span class="badge ${tt.savings >= 0 ? 'green' : 'red'}">${t('rep.profit_loss')}: ${money(tt.savings, cur, { sign: true })}</span></div><div style="padding:6px 10px 10px"><div data-c2></div></div></section>
        <section class="card"><div class="card-head"><div class="card-title">${t('rep.net_worth')}</div><b class="num">${money(d.netWorth.now, cur)}</b></div><div style="padding:6px 10px 10px"><div data-c3></div></div>
          <dl class="kv" style="padding:0 14px 14px"><dt>${t('rep.cash_accounts')}</dt><dd>${money(d.netWorth.cash, cur)}</dd><dt>${t('rep.receivable')}</dt><dd class="pos">${money(d.netWorth.receivable, cur)}</dd><dt>${t('rep.payable')}</dt><dd class="neg">${money(-d.netWorth.payable, cur)}</dd><dt>${t('rep.investments')}</dt><dd>${money(d.netWorth.investments, cur)}</dd></dl></section>
      </div>
      <div class="two-col-even" style="margin-top:12px">
        <section class="card"><div class="card-head"><div class="card-title">${t('rep.investment')}</div><a class="link" href="/app/investments">${t('common.view_all')}${icon('chevron-right', 'i-xs')}</a></div>
          <div style="padding:10px 14px 14px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center">
            <div><small class="muted">${t('inv.invested')}</small><div style="font-weight:800">${money(d.investments.invested, cur, { compact: true })}</div></div>
            <div><small class="muted">${t('inv.value')}</small><div style="font-weight:800">${money(d.investments.value, cur, { compact: true })}</div></div>
            <div><small class="muted">${t('inv.pnl')}</small><div style="font-weight:800" class="${d.investments.pnl >= 0 ? 'pos' : 'neg'}">${money(d.investments.pnl, cur, { sign: true, compact: true })}</div></div></div>
          <div style="padding:0 10px 10px"><div data-c4></div></div></section>
        <section class="card"><div class="card-head"><div class="card-title">${t('rep.by_account_type')}</div></div><div style="padding:12px 14px 14px" data-acct></div></section>
      </div>`);
    $$('[data-cnt]', body).forEach((n) => countUp(n, Number(n.dataset.cnt), (v) => money(v, cur, { decimals: 0 })));
    lineChart($('[data-c1]', body), { labels, series: [{ name: t('tx.type.income'), color: 'var(--green)', values: s.map((x) => x.income) }, { name: t('tx.type.expense'), color: 'var(--red)', values: s.map((x) => x.expense) }], height: 200, fmt: (v) => money(v, cur) });
    barChart($('[data-c2]', body), { labels, series: [{ name: t('home.kpi.savings'), color: 'var(--primary)', values: s.map((x) => Math.max(0, x.savings)) }, { name: t('rep.deficit'), color: 'var(--red)', values: s.map((x) => Math.max(0, -x.savings)) }], height: 170, fmt: (v) => money(v, cur) });
    lineChart($('[data-c3]', body), { labels, series: [{ name: t('rep.net_worth'), color: 'var(--teal)', values: s.map((x) => x.netWorth) }], height: 150, fmt: (v) => money(v, cur) });
    barChart($('[data-c4]', body), { labels, series: [{ name: t('home.kpi.investment'), color: 'var(--violet)', values: s.map((x) => x.investment) }], height: 130, fmt: (v) => money(v, cur) });
    const renderCats = () => {
      const list = d[catType + 'Categories'] || []; const box = $('[data-cats]', body);
      const total = list.reduce((a, x) => a + x.total, 0);
      if (!list.length) { box.innerHTML = `<p class="muted" style="text-align:center;padding:30px 0;font-size:12.5px">${t('rep.no_data')}</p>`; return; }
      const top = list.slice(0, 6); const rest = list.slice(6).reduce((a, x) => a + x.total, 0);
      const segs = top.map((x, i) => ({ label: x.name, value: x.total, color: x.color || PALETTE[i] })); if (rest) segs.push({ label: t('rep.others'), value: rest, color: '#94A3B8' });
      box.innerHTML = '<div class="donut-wrap"><div data-donut></div><div class="cat-rows"></div></div>';
      donut(box.querySelector('[data-donut]'), { segments: segs, centerTop: money(total, cur, { compact: true }), centerSub: t('rep.total') });
      box.querySelector('.cat-rows').innerHTML = String(html`${segs.map((x) => html`<div class="cat-row" style="--c:${x.color}"><i></i><span class="ellipsis">${x.label}</span><span class="p">${num((x.value / total) * 100)}%</span><b>${money(x.value, cur, { compact: true })}</b></div>`)}`);
    };
    renderCats();
    segmented($('[data-cat]', body), (v) => { catType = v; renderCats(); });
    const at = Object.entries(d.accountsByType); const atTotal = at.reduce((a, [, v]) => a + Math.max(0, v), 0) || 1;
    $('[data-acct]', body).innerHTML = at.length ? String(html`<div style="display:grid;gap:10px">${at.map(([k, v]) => html`<div><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px"><span style="display:flex;gap:8px;align-items:center"><svg class="pm" style="width:20px;height:20px;border-radius:6px"><use href="#pay-${k}"/></svg>${t('acc.type.' + k)}</span><b>${money(v, cur)}</b></div><div class="progress"><span data-w="${(Math.max(0, v) / atTotal) * 100}"></span></div></div>`)}</div>`) : `<p class="muted">${t('rep.no_data')}</p>`;
    import('../core.js').then((m) => m.animateProgress(body));
    $('[data-next]', page).disabled = shift === 0;
  }
  segmented($('[data-period]', page), (v) => { period = v; shift = 0; load(); });
  $('[data-prev]', page).onclick = () => { shift++; load(); };
  $('[data-next]', page).onclick = () => { shift = Math.max(0, shift - 1); load(); };
  load();
  return { el: page, title: t('nav.reports'), refresh: load, destroy: on('data:changed', load) };
}
