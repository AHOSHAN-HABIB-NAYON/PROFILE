/* Lending & borrowing: receivable/payable summary, open/settled lists, detail with repayments & reminders. */
import { $, $$, el, html, icon, api, t, money, fmtDay, fmtDate, relTime, emptyState, errorState, on, toast, confirmDialog, segmented, animateProgress } from '../core.js';
import { openLoanForm, openRepayForm, changed } from '../forms.js';

export function list() {
  let tab = 'lent';
  const page = el(html`<div>
    <header class="ph"><h1>${t('nav.loans')}</h1><div class="ph-actions"><button class="btn btn-primary btn-sm" data-add>${icon('plus', 'i-sm')}${t('loan.add')}</button></div></header>
    <div class="stats" style="grid-template-columns:1fr 1fr;margin-bottom:12px">
      <div class="stat"><span class="stat-top"><span class="tile" style="--c:var(--green)">${icon('lend')}</span>${t('loan.to_receive')}</span><span class="stat-val pos" data-rec>—</span></div>
      <div class="stat"><span class="stat-top"><span class="tile" style="--c:var(--red)">${icon('borrow')}</span>${t('loan.to_pay')}</span><span class="stat-val neg" data-pay>—</span></div></div>
    <div class="seg" data-tabs style="display:flex;margin-bottom:10px"><button data-v="lent" class="active" style="flex:1">${t('loan.lent_tab')}</button><button data-v="borrowed" style="flex:1">${t('loan.borrowed_tab')}</button></div>
    <div class="card tx-list"><div class="list stagger" data-list></div></div></div>`);
  let data = null;
  const render = () => {
    const box = $('[data-list]', page); const items = data?.[tab] || [];
    box.innerHTML = items.length ? String(html`${items.map((l) => {
      const p = Math.min(100, (Number(l.paid_amount) / Number(l.amount)) * 100); const rest = Number(l.amount) - Number(l.paid_amount);
      const overdue = l.status === 'open' && l.due_date && new Date(String(l.due_date).slice(0, 10) + 'T23:59:59') < new Date();
      return html`<a class="li" href="/app/loans/${tab}/${l.id}" style="align-items:flex-start;padding-top:12px;padding-bottom:12px"><span class="tile" style="--c:${tab === 'lent' ? 'var(--orange)' : 'var(--pink)'}">${icon(tab === 'lent' ? 'lend' : 'borrow')}</span>
        <span class="li-main" style="display:grid;gap:5px"><span class="li-title">${l.person_name}</span><span class="li-sub">${l.due_date ? html`<span class="${overdue ? 'neg' : ''}">${overdue ? t('rem.overdue') : t('loan.due')} ${fmtDay(l.due_date)}</span>` : t('loan.no_due')}${l.status !== 'open' ? html` · <span class="badge ${l.status === 'settled' ? 'green' : ''}">${t('loan.status.' + l.status)}</span>` : ''}</span>
        <span class="progress" style="height:5px"><span data-w="${p}" style="--pc:${tab === 'lent' ? 'var(--green)' : 'var(--primary)'}"></span></span></span>
        <span class="li-end"><span class="li-amt">${money(rest, l.currency)}</span><span class="li-sub">${t('loan.of', { total: money(l.amount, l.currency) })}</span></span></a>`;
    })}`) : String(emptyState(t(tab === 'lent' ? 'loan.empty_lent' : 'loan.empty_borrowed'), t('loan.empty_sub')));
    animateProgress(box);
  };
  async function load() {
    try { data = await api.get('/api/loans', { force: true }); $('[data-rec]', page).textContent = money(data.receivable); $('[data-pay]', page).textContent = money(data.payable); render(); }
    catch (e) { $('[data-list]', page).innerHTML = String(errorState(e.message)); }
  }
  segmented($('[data-tabs]', page), (v) => { tab = v; render(); });
  $('[data-add]', page).onclick = () => openLoanForm(tab);
  load();
  return { el: page, title: t('nav.loans'), refresh: load, destroy: on('data:changed', load) };
}

export function detail(ctx) {
  const { kind, id } = ctx.params;
  const page = el(html`<div><header class="ph"><a class="icon-btn back" href="/app/loans" aria-label="${t('common.back')}">${icon('chevron-left')}</a><h1 data-title>${t('nav.loans')}</h1></header><div data-body><div class="card card-pad"><div class="sk" style="height:160px"></div></div></div></div>`);
  async function load() {
    const body = $('[data-body]', page);
    let l;
    try { l = await api.get(`/api/loans/${kind}/${id}`, { force: true }); } catch (e) { body.innerHTML = String(errorState(e.message)); return; }
    $('[data-title]', page).textContent = l.person_name;
    const rest = Number(l.amount) - Number(l.paid_amount); const p = Math.min(100, (Number(l.paid_amount) / Number(l.amount)) * 100);
    body.innerHTML = String(html`
      <div class="hero" style="background:${kind === 'lent' ? 'linear-gradient(135deg,#EE8A0B,#D9480F)' : 'linear-gradient(135deg,#DB2777,#9D174D)'}">
        <div class="hero-top"><span class="hero-label">${icon(kind === 'lent' ? 'lend' : 'borrow', 'i-sm')}${t(kind === 'lent' ? 'loan.you_lent' : 'loan.you_borrowed')}</span><span class="pill">${t('loan.status.' + l.status)}</span></div>
        <div class="hero-amt">${money(rest, l.currency)}</div><div style="font-size:12px;opacity:.85">${t('loan.remaining_of', { total: money(l.amount, l.currency) })}</div>
        <div class="progress" style="margin-top:12px;background:rgba(255,255,255,.25)"><span data-w="${p}" style="--pc:#fff"></span></div></div>
      ${l.status === 'open' ? html`<div class="row" style="margin-top:12px"><button class="btn btn-primary" data-pay>${icon('check', 'i-sm')}${t(kind === 'lent' ? 'loan.receive_payment' : 'loan.make_payment')}</button><button class="btn btn-outline" data-close style="flex:0 0 auto">${t('loan.write_off')}</button></div>` : ''}
      <div class="two-col-even" style="margin-top:12px">
        <section class="card card-pad"><dl class="kv"><dt>${t('loan.person')}</dt><dd>${l.person_name}</dd>${l.contact ? html`<dt>${t('loan.contact')}</dt><dd>${l.contact}</dd>` : ''}<dt>${t('tx.account')}</dt><dd>${l.account_name || '—'}</dd><dt>${t(kind === 'lent' ? 'loan.given_date' : 'loan.received_date')}</dt><dd>${fmtDay(l.given_at)}</dd><dt>${t('loan.due_date')}</dt><dd>${l.due_date ? fmtDay(l.due_date) : '—'}</dd>${l.note ? html`<dt>${t('tx.note')}</dt><dd>${l.note}</dd>` : ''}</dl>
          ${l.reminders.length ? html`<hr class="divider"><div style="font-size:12px;font-weight:700;margin-bottom:6px">${icon('alarm', 'i-xs')} ${t('loan.reminders')}</div>${l.reminders.map((r) => html`<div class="muted" style="font-size:12px;display:flex;justify-content:space-between"><span>${fmtDate(r.remind_at)}</span><span>${r.done_at ? t('loan.rem_cancelled') : r.sent_at ? t('loan.rem_sent') : t('loan.rem_scheduled')}</span></div>`)}` : ''}</section>
        <section class="card"><div class="card-head"><div class="card-title">${t('loan.payments')}</div></div><div class="list">${l.payments.length ? l.payments.map((x) => html`<div class="li"><span class="tile" style="--c:var(--green)">${icon('check')}</span><span class="li-main"><span class="li-title">${money(x.amount, l.currency)}</span><span class="li-sub">${fmtDay(x.paid_at)} · ${x.account_name || ''}</span></span></div>`) : emptyState(t('loan.no_payments'), '')}</div></section>
      </div>
      <button class="btn btn-danger-soft btn-block" style="margin-top:12px" data-del>${icon('trash', 'i-sm')}${t('loan.delete')}</button>`);
    animateProgress(body);
    body.querySelector('[data-pay]')?.addEventListener('click', () => openRepayForm({ ...l, kind }));
    body.querySelector('[data-close]')?.addEventListener('click', async () => { if (await confirmDialog({ title: t('loan.write_off'), message: t('loan.write_off_confirm') })) { try { await api.post(`/api/loans/${kind}/${id}/close`); changed('loan'); } catch (e) { toast(e.message, { type: 'error' }); } } });
    body.querySelector('[data-del]').onclick = async () => { if (await confirmDialog({ title: t('loan.delete'), message: t('loan.delete_confirm'), danger: true, confirm: t('common.delete') })) { try { await api.del(`/api/loans/${kind}/${id}`); changed('loan'); toast(t('common.deleted')); ctx.navigate('/app/loans'); } catch (e) { toast(e.message, { type: 'error' }); } } };
  }
  load();
  return { el: page, title: t('nav.loans'), refresh: load, destroy: on('data:changed', load) };
}
