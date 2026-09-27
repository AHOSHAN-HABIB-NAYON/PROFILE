/* Home dashboard: balance hero, KPI cards, income-vs-expense chart, recent transactions, reminders, goals, quick actions. */
import { $, $$, el, html, raw, icon, payMark, moodIcon, api, state, t, money, fmtDay, fmtDate, relTime, greeting, countUp, animateProgress, txRow, errorState, emptyState, skeletonRows, on, toast } from '../core.js';
import { lineChart, sparkline } from '../charts.js';
import { avatar } from '../app.js';
import * as outbox from '../outbox.js';

const MONTHS = (ym) => new Intl.DateTimeFormat(state.lang === 'bn' ? 'bn-BD' : state.lang === 'hi' ? 'hi-IN' : 'en-US', { month: 'short' }).format(new Date(ym + '-15T00:00:00Z'));

export default function home(ctx) {
  const page = el(html`<div>
    <header class="ph">
      <a class="greet" href="/app/settings/profile">${avatar(state.me)}<span style="min-width:0"><small>${greeting()}</small><strong>${state.me.name}</strong></span></a>
      <div class="ph-actions m-only"><button class="icon-btn" data-theme-toggle></button><a class="icon-btn" href="/app/notifications" data-unread aria-label="${t('nav.notifications')}">${icon('bell')}</a></div>
    </header>
    ${state.me.verified || !state.config?.mail ? '' : html`<div class="alert warn" style="margin-bottom:10px" data-verify>${icon('mail', 'i-sm')}<span style="flex:1">${t('verify.banner')}</span><button class="link" data-resend>${t('verify.resend')}</button></div>`}
    <div class="dash" data-dash>
      <section class="d-hero"><div class="hero" data-hero>
        <div class="hero-top"><span class="hero-label">${icon('wallet', 'i-sm')}${t('home.total_balance')}</span><button class="icon-btn" data-hide aria-label="${t('home.toggle_balance')}">${icon(state.profile?.hide_balances ? 'eye-off' : 'eye', 'i-sm')}</button></div>
        <div class="hero-amt" data-total><span class="sk" style="display:inline-block;width:160px;height:30px;background:rgba(255,255,255,.2)"></span></div>
        <span class="pill" data-chg>${icon('trend-up', 'i-xs')}—</span>
        <div class="hero-foot" data-accs></div>
      </div></section>
      <section class="d-stats section"><div class="stats stagger" data-stats>${['income', 'expense', 'savings', 'investment'].map(() => html`<div class="stat"><div class="sk sk-line" style="width:60%"></div><div class="sk" style="height:18px;width:80%"></div></div>`)}</div></section>
      <section class="d-chart section card"><div class="card-head"><div><div class="card-title">${t('home.income_vs_expense')}</div><div class="card-sub">${t('home.last_6_months')}</div></div><div class="legend"><span style="--c:var(--green)"><i></i>${t('tx.type.income')}</span><span style="--c:var(--red)"><i></i>${t('tx.type.expense')}</span></div></div>
        <div style="padding:6px 10px 10px"><div data-chart style="height:180px"></div></div></section>
      <section class="d-rem section card"><div class="card-head"><div class="card-title">${t('home.upcoming')}</div><a class="link" href="/app/reminders">${t('common.view_all')}${icon('chevron-right', 'i-xs')}</a></div><div class="list" data-rem style="padding-top:4px">${skeletonRows(3)}</div></section>
      <section class="d-recent section card" style="overflow:hidden"><div class="card-head"><div class="card-title">${t('home.recent')}</div><a class="link" href="/app/transactions">${t('common.view_all')}${icon('chevron-right', 'i-xs')}</a></div><div class="list" data-recent style="padding-top:4px">${skeletonRows(4)}</div></section>
      <section class="d-side section stack">
        <div class="card"><div class="card-head"><div class="card-title">${t('home.quick_actions')}</div></div><div class="qa" data-qa>
          ${[['income', 'income', 'var(--green)'], ['expense', 'expense', 'var(--red)'], ['transfer', 'transfer', 'var(--primary)'], ['lend', 'lend', 'var(--orange)'], ['goal', 'target', 'var(--teal)'], ['reminder', 'alarm', 'var(--orange)'], ['mood', 'smile', 'var(--yellow)'], ['reports', 'pie', 'var(--violet)']]
    .map(([k, ic, c]) => html`<button data-qa="${k}"><span class="tile" style="--c:${c}">${icon(ic)}</span>${t('quick.' + k)}</button>`)}</div></div>
        <div class="card" data-goals-card hidden><div class="card-head"><div class="card-title">${t('nav.goals')}</div><a class="link" href="/app/goals">${t('common.view_all')}${icon('chevron-right', 'i-xs')}</a></div><div data-goals style="padding:10px 14px 14px;display:grid;gap:12px"></div></div>
        <a class="card card-pad" href="/app/mood" data-mood style="display:flex;align-items:center;gap:12px;color:inherit"></a>
      </section>
    </div></div>`);

  const hide = () => !!state.profile?.hide_balances;
  const fmtHidden = (v, cur) => (hide() ? '••••••' : money(v, cur));

  async function load(force = false) {
    let d;
    try { d = await api.get('/api/insights/dashboard', { maxAge: force ? 0 : 15000, force }); }
    catch (e) {
      $('[data-dash]', page).replaceWith(el(html`<div class="card">${errorState(e.message)}</div>`));
      page.querySelector('[data-retry]').onclick = () => ctx.navigate(location.pathname, { replace: true });
      return;
    }
    const cur = d.currency;
    // Hero
    const total = $('[data-total]', page);
    total.classList.toggle('blurred', hide());
    total.innerHTML = '';
    countUp(total, d.totalBalance, (v) => money(v, cur, { decimals: 0 }), 1000);
    const chg = d.balanceChangePct;
    $('[data-chg]', page).innerHTML = String(html`${icon(chg < 0 ? 'trend-down' : 'trend-up', 'i-xs')}${chg === null ? t('home.this_month') : `${chg > 0 ? '+' : ''}${chg}% ${t('home.this_month')}`}`);
    $('[data-accs]', page).innerHTML = String(html`${d.accounts.slice(0, 6).map((a) => html`<a class="hero-acc" href="/app/accounts/${a.id}" style="color:#fff">${payMark(a.type)}<span><span style="opacity:.8">${a.name}</span><b class="${hide() ? 'blurred' : ''}">${money(a.balance, a.currency, { decimals: 0 })}</b></span></a>`)}`);
    // KPI cards
    const series = d.series;
    const K = [
      ['income', 'income', 'var(--green)', d.month.income, d.change.income, series.map((s) => s.income)],
      ['expense', 'expense', 'var(--red)', d.month.expense, d.change.expense, series.map((s) => s.expense), true],
      ['savings', 'piggy', 'var(--primary)', d.month.savings, d.change.savings, series.map((s) => s.income - s.expense)],
      ['investment', 'trend-up', 'var(--violet)', d.investments.value || d.month.investment, d.change.investment, null],
    ];
    $('[data-stats]', page).innerHTML = String(html`${K.map(([k, ic, c, v, pct, sp, inverse]) => html`<a class="stat" href="/app/reports" style="color:inherit">
      <span class="stat-top"><span class="tile" style="--c:${c}">${icon(ic)}</span>${t('home.kpi.' + k)}</span>
      <span class="stat-val ${hide() ? 'blurred' : ''}" data-v="${v}">${money(0, cur)}</span>
      <span class="stat-chg ${pct === null ? 'muted' : (pct >= 0) !== !!inverse ? 'pos' : 'neg'}">${pct === null ? t('home.kpi.this_month') : raw(`${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% ${esc2(t('home.vs_last'))}`)}</span>
      ${raw(sp ? sparkline(sp, c) : '')}</a>`)}`);
    $$('[data-stats] .stat-val', page).forEach((n) => countUp(n, Number(n.dataset.v), (v) => money(v, cur, { decimals: 0 }), 900));
    // Chart
    const ch = $('[data-chart]', page);
    lineChart(ch, { labels: series.map((s) => MONTHS(s.label)), series: [{ name: t('tx.type.income'), color: 'var(--green)', values: series.map((s) => s.income) }, { name: t('tx.type.expense'), color: 'var(--red)', values: series.map((s) => s.expense) }], height: 180, fmt: (v) => money(v, cur) });
    // Recent (+ offline pending items)
    const pend = outbox.list();
    const rec = $('[data-recent]', page);
    rec.innerHTML = d.recent.length || pend.length ? String(html`${pend.map((p) => txRow({ ...p.preview, occurred_at: p.preview.occurred_at, id: '' }, { pending: true }))}${d.recent.map((x) => txRow(x))}`)
      : String(emptyState(t('home.no_tx'), t('home.no_tx_sub'), html`<button class="btn btn-primary btn-sm" data-quick>${icon('plus', 'i-sm')}${t('quick.add')}</button>`));
    rec.classList.add('stagger');
    $$('[data-tx]', rec).forEach((b) => b.dataset.tx && (b.onclick = () => import('./transactions.js').then((m) => m.openTxDetail(b.dataset.tx))));
    // Reminders
    const rem = $('[data-rem]', page);
    rem.innerHTML = d.reminders.length ? String(html`${d.reminders.map((r) => {
      const dd = new Date(r.due_at); const overdue = dd < new Date();
      const ic = { lend: 'lend', borrow: 'borrow', bill: 'bolt', goal: 'target', payment: 'coin' }[r.type] || 'alarm';
      const c = { lend: 'var(--orange)', borrow: 'var(--pink)', bill: 'var(--yellow)', goal: 'var(--teal)', payment: 'var(--primary)' }[r.type] || 'var(--primary)';
      return html`<a class="li" href="${r.ref_type === 'lent' || r.ref_type === 'borrowed' ? `/app/loans/${r.ref_type}/${r.ref_id}` : '/app/reminders'}"><span class="tile" style="--c:${c}">${icon(ic)}</span><span class="li-main"><span class="li-title">${r.title}</span><span class="li-sub ${overdue ? 'neg' : ''}">${overdue ? t('rem.overdue') + ' · ' : ''}${relTime(dd)}</span></span>${r.amount ? html`<span class="li-amt">${money(r.amount)}</span>` : ''}</a>`;
    })}`) : String(emptyState(t('home.no_rem'), t('home.no_rem_sub')));
    // Goals
    if (d.goals.length) {
      $('[data-goals-card]', page).hidden = false;
      $('[data-goals]', page).innerHTML = String(html`${d.goals.map((g) => { const p = Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100); return html`<a href="/app/goals" style="color:inherit;display:grid;gap:6px"><div style="display:flex;justify-content:space-between;font-size:12.5px"><b>${g.name}</b><span class="muted">${Math.round(p)}%</span></div><div class="progress"><span data-w="${p}" style="--pc:${g.color || 'var(--brand-grad)'}"></span></div><div class="goal-meta"><span>${money(g.current_amount, g.currency)}</span><span>${money(g.target_amount, g.currency)}</span></div></a>`; })}`);
      animateProgress(page);
    }
    // Mood
    $('[data-mood]', page).innerHTML = String(d.mood ? html`${moodIcon(d.mood.mood, 'mood-lg')}<span style="flex:1"><b style="font-size:13px">${t('mood.today_is', { mood: t('mood.m' + d.mood.mood) })}</b><small class="muted" style="display:block;font-size:11.5px">${d.mood.activity || t('mood.tap_update')}</small></span>${icon('chevron-right', 'i-sm muted')}`
      : html`<span class="tile" style="--c:var(--yellow)">${icon('smile')}</span><span style="flex:1"><b style="font-size:13px">${t('mood.how_today')}</b><small class="muted" style="display:block;font-size:11.5px">${t('mood.log_prompt')}</small></span>${icon('chevron-right', 'i-sm muted')}`);
    $$('[data-mood] svg.mood-lg', page).forEach((s) => { s.style.width = '38px'; s.style.height = '38px'; });
  }
  const esc2 = (s) => String(s).replace(/[<>&]/g, '');

  $('[data-hide]', page).onclick = async (e) => {
    const v = !hide(); state.profile.hide_balances = v;
    e.currentTarget.innerHTML = String(icon(v ? 'eye-off' : 'eye', 'i-sm'));
    $$('.stat-val, [data-total], .hero-acc b', page).forEach((n) => n.classList.toggle('blurred', v));
    api.patch('/api/me/profile', { hide_balances: v }).catch(() => {});
  };
  $$('[data-qa]', page).forEach((b) => b.onclick = () => {
    const k = b.dataset.qa;
    import('../forms.js').then((m) => {
      if (['income', 'expense', 'transfer'].includes(k)) m.openTxForm(k);
      else if (k === 'lend') m.openLoanForm('lent'); else if (k === 'goal') m.openGoalForm(); else if (k === 'reminder') m.openReminderForm();
      else if (k === 'mood') import('./mood.js').then((x) => x.openMoodForm()); else if (k === 'reports') ctx.navigate('/app/reports');
    });
  });
  page.querySelector('[data-resend]')?.addEventListener('click', async (e) => { try { await api.post('/api/auth/resend-verification'); toast(t('verify.sent')); e.target.closest('[data-verify]').remove(); } catch (er) { toast(er.message, { type: 'error' }); } });

  load();
  const off = [];
  const handler = () => load(true);
  off.push(on('data:changed', handler), on('outbox', handler));
  return { el: page, title: t('nav.dashboard'), refresh: () => load(true), destroy: () => off.forEach((f) => f()) };
}
