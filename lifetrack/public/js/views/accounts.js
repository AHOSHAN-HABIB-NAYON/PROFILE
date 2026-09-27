/* Accounts: list with totals, account detail with history, edit / adjust / archive / delete / transfer. */
import { $, $$, el, html, icon, payMark, api, state, t, money, countUp, txRow, emptyState, errorState, skeletonRows, on, toast, confirmDialog, fmtDate, enableSwipe } from '../core.js';
import { openAccountForm, openAdjustForm, openTxForm, changed } from '../forms.js';

const GRAD = { bkash: 'linear-gradient(135deg,#E2136E,#B0105A)', nagad: 'linear-gradient(135deg,#F7941D,#E0301E)', rocket: 'linear-gradient(135deg,#8C3494,#5E1E6B)',
  bank: 'linear-gradient(135deg,#1E4FD8,#0B3AA8)', card: 'linear-gradient(135deg,#334155,#0F172A)', cash: 'linear-gradient(135deg,#16A34A,#0E7C3A)', wallet: 'linear-gradient(135deg,#0EA5A0,#0A7D79)' };

export function list(ctx) {
  let showArchived = false;
  const page = el(html`<div>
    <header class="ph"><h1>${t('nav.accounts')}</h1><div class="ph-actions"><button class="icon-btn" data-archived aria-label="${t('acc.show_archived')}" title="${t('acc.show_archived')}">${icon('archive')}</button><button class="btn btn-primary btn-sm" data-add>${icon('plus', 'i-sm')}${t('acc.add')}</button></div></header>
    <div class="hero" style="margin-bottom:12px"><div class="hero-top"><span class="hero-label">${icon('layers', 'i-sm')}${t('acc.total')}</span><span class="pill" data-count></span></div><div class="hero-amt" data-total>—</div>
      <div class="hero-foot" data-types></div></div>
    <div class="acc-grid stagger" data-list>${skeletonRows(3)}</div>
    <div class="row" style="margin-top:12px"><button class="btn btn-outline" data-transfer>${icon('transfer', 'i-sm')}${t('acc.transfer')}</button><a class="btn btn-outline" href="/app/transactions">${icon('layers', 'i-sm')}${t('acc.all_history')}</a></div>
  </div>`);
  async function load(force) {
    const box = $('[data-list]', page);
    try {
      const [accs, dash] = await Promise.all([api.get('/api/accounts' + (showArchived ? '?archived=1' : ''), { force: true }), api.get('/api/insights/dashboard', { maxAge: force ? 0 : 15000 })]);
      if (!showArchived) state.accounts = accs;
      countUp($('[data-total]', page), dash.totalBalance, (v) => money(v, dash.currency, { decimals: 0 }));
      $('[data-count]', page).textContent = t('acc.count', { n: dash.accounts.length });
      const byType = {}; dash.accounts.forEach((a) => { byType[a.type] = (byType[a.type] || 0) + 1; });
      $('[data-types]', page).innerHTML = String(html`${Object.entries(byType).map(([k, n]) => html`<span class="hero-acc">${payMark(k)}<span>${t('acc.type.' + k)}<b>${n}</b></span></span>`)}`);
      box.innerHTML = accs.length ? String(html`${accs.map((a) => html`<a class="acc-card" href="/app/accounts/${a.id}">${payMark(a.type)}<span class="li-main"><span class="li-title">${a.name}${a.number_hint ? html` <span class="muted">•• ${a.number_hint}</span>` : ''}</span><span class="li-sub">${t('acc.type.' + a.type)} · ${a.currency}${!a.include_in_total ? ' · ' + t('acc.excluded') : ''}</span></span><span class="li-end"><span class="li-amt ${Number(a.balance) < 0 ? 'neg' : ''}">${money(a.balance, a.currency)}</span><span class="li-sub">${t('acc.tx_count', { n: a.tx_count })}</span></span></a>`)}`)
        : String(emptyState(showArchived ? t('acc.no_archived') : t('acc.empty'), t('acc.empty_sub')));
    } catch (e) { box.innerHTML = String(errorState(e.message)); box.querySelector('[data-retry]').onclick = () => load(true); }
  }
  $('[data-add]', page).onclick = () => openAccountForm();
  $('[data-transfer]', page).onclick = () => openTxForm('transfer');
  $('[data-archived]', page).onclick = (e) => { showArchived = !showArchived; e.currentTarget.classList.toggle('bordered', showArchived); load(true); };
  load();
  const off = on('data:changed', () => load(true));
  return { el: page, title: t('nav.accounts'), refresh: () => load(true), destroy: off };
}

export function detail(ctx) {
  const id = ctx.params.id;
  let acc = null; let pageNo = 1;
  const page = el(html`<div>
    <header class="ph"><a class="icon-btn back" href="/app/accounts" aria-label="${t('common.back')}">${icon('chevron-left')}</a><h1 data-title>${t('nav.accounts')}</h1>
      <div class="ph-actions"><button class="icon-btn" data-edit aria-label="${t('common.edit')}">${icon('edit')}</button><button class="icon-btn" data-menu aria-label="${t('common.more')}">${icon('dots-v')}</button></div></header>
    <div class="acc-hero" data-hero><div class="sk" style="height:110px;background:rgba(255,255,255,.15)"></div></div>
    <div class="qa card" style="margin-top:12px;grid-template-columns:repeat(4,1fr)">
      <button data-a="income"><span class="tile" style="--c:var(--green)">${icon('income')}</span>${t('tx.type.income')}</button>
      <button data-a="expense"><span class="tile" style="--c:var(--red)">${icon('expense')}</span>${t('tx.type.expense')}</button>
      <button data-a="transfer"><span class="tile" style="--c:var(--primary)">${icon('transfer')}</span>${t('tx.type.transfer')}</button>
      <button data-a="adjust"><span class="tile" style="--c:var(--muted)">${icon('edit')}</span>${t('acc.adjust_short')}</button></div>
    <div class="section-head section"><h2>${t('acc.history')}</h2></div>
    <div class="card tx-list"><div class="list" data-list>${skeletonRows(5)}</div><div class="pager" data-more hidden><button class="btn btn-soft btn-sm">${t('common.load_more')}</button></div></div>
  </div>`);
  async function load() {
    try {
      acc = await api.get(`/api/accounts/${id}`, { force: true });
      $('[data-title]', page).textContent = acc.name;
      const hero = $('[data-hero]', page);
      hero.style.setProperty('--acc-bg', GRAD[acc.type] || GRAD.wallet);
      hero.innerHTML = String(html`<div style="display:flex;align-items:center;gap:12px">${payMark(acc.type)}<div><b style="font-size:15px">${acc.name}</b><div style="font-size:11.5px;opacity:.8">${t('acc.type.' + acc.type)}${acc.number_hint ? ` •• ${acc.number_hint}` : ''} · ${acc.currency}</div></div>${acc.archived_at ? html`<span class="badge" style="margin-left:auto">${t('acc.archived')}</span>` : ''}</div>
        <div style="font-size:11.5px;opacity:.8;margin-top:16px">${t('acc.balance')}</div><div class="hero-amt" data-bal>${money(0, acc.currency)}</div>
        <div style="display:flex;gap:16px;font-size:11.5px"><span>${icon('arrow-down-left', 'i-xs')} ${t('acc.in_30')} <b>${money(acc.stats.inflow, acc.currency)}</b></span><span>${icon('arrow-up-right', 'i-xs')} ${t('acc.out_30')} <b>${money(acc.stats.outflow, acc.currency)}</b></span></div>`);
      countUp($('[data-bal]', page), Number(acc.balance), (v) => money(v, acc.currency));
    } catch (e) { $('[data-hero]', page).innerHTML = String(errorState(e.message)); return; }
    pageNo = 1; loadTx(false);
  }
  async function loadTx(append) {
    const box = $('[data-list]', page);
    try {
      const d = await api.get(`/api/transactions?account_id=${id}&page=${pageNo}&limit=25`, { force: true });
      const rows = String(html`${d.items.map((x) => txRow(x, { swipe: true }))}`);
      if (append) box.insertAdjacentHTML('beforeend', rows); else box.innerHTML = d.items.length ? rows : String(emptyState(t('acc.no_tx'), t('acc.no_tx_sub')));
      $('[data-more]', page).hidden = d.page >= d.pages;
      $$('[data-tx]', box).forEach((b) => b.onclick = () => { if (!b.dataset.noclick) import('./transactions.js').then((m) => m.openTxDetail(b.dataset.tx)); });
      enableSwipe(box, async (txId) => { const m = await import('./transactions.js'); return m.deleteTx(txId); });
    } catch (e) { box.innerHTML = String(errorState(e.message)); }
  }
  $('[data-more] button', page).onclick = () => { pageNo++; loadTx(true); };
  $$('[data-a]', page).forEach((b) => b.onclick = () => { if (!acc) return; if (b.dataset.a === 'adjust') openAdjustForm(acc); else openTxForm(b.dataset.a, { account_id: acc.id }); });
  $('[data-edit]', page).onclick = () => acc && openAccountForm(acc);
  $('[data-menu]', page).onclick = async () => {
    if (!acc) return;
    const { openSheet } = await import('../core.js');
    const body = el(html`<div class="list set-list">
      <button class="li" data-x="archive"><span class="tile" style="--c:var(--orange)">${icon('archive')}</span><span class="li-main"><span class="li-title">${acc.archived_at ? t('acc.unarchive') : t('acc.archive')}</span><span class="li-sub">${t('acc.archive_hint')}</span></span></button>
      <button class="li" data-x="delete"><span class="tile" style="--c:var(--red)">${icon('trash')}</span><span class="li-main"><span class="li-title neg">${t('acc.delete')}</span><span class="li-sub">${t('acc.delete_hint')}</span></span></button></div>`);
    const s = openSheet({ title: acc.name, body });
    body.querySelector('[data-x=archive]').onclick = async () => { s.close(); try { await api.post(`/api/accounts/${acc.id}/archive`); changed(); toast(t('common.done')); } catch (e) { toast(e.message, { type: 'error' }); } };
    body.querySelector('[data-x=delete]').onclick = async () => {
      s.close();
      if (!(await confirmDialog({ title: t('acc.delete'), message: t('acc.delete_confirm', { name: acc.name }), danger: true, confirm: t('common.delete') }))) return;
      try { await api.del(`/api/accounts/${acc.id}`); changed(); toast(t('common.deleted')); ctx.navigate('/app/accounts'); } catch (e) { toast(e.message, { type: 'error' }); }
    };
  };
  load();
  const off = on('data:changed', load);
  return { el: page, title: t('nav.accounts'), refresh: load, destroy: off };
}
