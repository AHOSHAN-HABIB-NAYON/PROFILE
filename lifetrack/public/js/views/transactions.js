/* Transactions: search, filters (type/account/category/date), sort, grouped by day, swipe-to-delete, detail sheet. */
import { $, $$, el, html, icon, payMark, api, state, t, money, fmtDate, fmtTime, localDateStr, inputToIso, txRow, emptyState, errorState, skeletonRows, on, toast, openSheet, confirmDialog, segmented, enableSwipe, TX_META } from '../core.js';
import { ensureRefs, openTxForm, changed } from '../forms.js';
import * as outbox from '../outbox.js';

export async function deleteTx(id) {
  if (!(await confirmDialog({ title: t('tx.delete'), message: t('tx.delete_confirm'), danger: true, confirm: t('common.delete') }))) return false;
  try { await api.del(`/api/transactions/${id}`); changed('tx'); toast(t('tx.deleted')); return true; }
  catch (e) { toast(e.message, { type: 'error' }); return false; }
}

export async function openTxDetail(id) {
  let tx;
  try { tx = await api.get(`/api/transactions/${id}`, { force: true }); } catch (e) { toast(e.message, { type: 'error' }); return; }
  const m = TX_META[tx.type] || TX_META.expense;
  const managed = ['loan', 'loan_payment'].includes(tx.ref_type);
  const sign = tx.type === 'adjustment' ? Math.sign(tx.amount) : m.sign;
  const body = el(html`<div>
    <div style="display:grid;place-items:center;gap:8px;padding:6px 0 14px;text-align:center">
      <span class="tile tile-lg" style="--c:${tx.category_color || m.c}">${icon(tx.category_icon || m.icon)}</span>
      <div style="font-size:26px;font-weight:800;letter-spacing:-.02em" class="${sign > 0 ? 'pos' : sign < 0 ? 'neg' : ''}">${money(Math.abs(tx.amount) * (sign || 1), tx.currency, { sign: sign > 0 })}</div>
      <span class="badge ${sign > 0 ? 'green' : sign < 0 ? 'red' : 'blue'}">${t('tx.type.' + tx.type)}</span></div>
    <dl class="kv card card-pad" style="margin:0">
      <dt>${t('tx.account')}</dt><dd style="display:flex;justify-content:flex-end;gap:6px;align-items:center">${payMark(tx.account_type, 'i-sm')}${tx.account_name}</dd>
      ${tx.to_account_name ? html`<dt>${t('tx.to_account')}</dt><dd>${tx.to_account_name}${tx.to_amount && tx.to_amount !== tx.amount ? ` (${tx.to_amount})` : ''}</dd>` : ''}
      ${tx.category_name ? html`<dt>${t('tx.category')}</dt><dd>${tx.category_name}</dd>` : ''}
      <dt>${t('tx.date')}</dt><dd>${fmtDate(tx.occurred_at, 'long')} · ${fmtTime(tx.occurred_at)}</dd>
      ${tx.note ? html`<dt>${t('tx.note')}</dt><dd>${tx.note}</dd>` : ''}
      ${tx.tags ? html`<dt>${t('tx.tags')}</dt><dd>${tx.tags.split(',').map((g) => html`<span class="badge blue" style="margin-left:4px">#${g}</span>`)}</dd>` : ''}
      <dt>${t('tx.id')}</dt><dd class="muted" style="font-size:11px;font-weight:500">${tx.uuid.slice(0, 8)}</dd>
    </dl>
    ${tx.has_attachment ? html`<a class="btn btn-outline btn-block" style="margin-top:10px" href="/api/transactions/${tx.id}/attachment" target="_blank" rel="noopener">${icon('paperclip', 'i-sm')}${t('tx.view_attachment')}</a>` : ''}
    ${managed ? html`<div class="alert" style="margin-top:10px">${icon('info', 'i-sm')}<span>${t('tx.managed_by_loan')}</span></div>` : ''}
  </div>`);
  const foot = managed ? el(html`<a class="btn btn-soft btn-block" href="/app/loans">${t('nav.loans')}</a>`) : el(html`<div style="display:flex;gap:10px;width:100%"><button class="btn btn-danger-soft btn-block" data-del>${icon('trash', 'i-sm')}${t('common.delete')}</button>${tx.type !== 'transfer' ? html`<button class="btn btn-primary btn-block" data-edit>${icon('edit', 'i-sm')}${t('common.edit')}</button>` : ''}</div>`);
  const s = openSheet({ title: t('tx.details'), body, foot });
  foot.querySelector('a')?.addEventListener('click', () => s.close());
  foot.querySelector('[data-del]')?.addEventListener('click', async () => { if (await deleteTx(tx.id)) s.close(); });
  foot.querySelector('[data-edit]')?.addEventListener('click', () => { s.close(); setTimeout(() => openTxForm(tx.type, { tx }), 150); });
}

export default function transactions(ctx) {
  const f = { q: ctx.query.q || '', type: ctx.query.type || '', account_id: ctx.query.account_id || '', category_id: '', range: ctx.query.range || '', sort: 'date_desc' };
  let pageNo = 1;
  const page = el(html`<div>
    <header class="ph"><h1>${t('nav.transactions')}</h1><div class="ph-actions"><button class="icon-btn" data-filter aria-label="${t('tx.filters')}">${icon('filter')}</button><button class="btn btn-primary btn-sm" data-quick>${icon('plus', 'i-sm')}${t('quick.add')}</button></div></header>
    <form class="input-group" data-search style="margin-bottom:10px">${icon('search', 'i-sm')}<input class="input" name="q" placeholder="${t('tx.search_ph')}" value="${f.q}" aria-label="${t('tx.search_ph')}"></form>
    <div class="chips" data-types style="margin-bottom:10px">${['', 'income', 'expense', 'transfer', 'investment', 'deposit', 'lend', 'borrow'].map((k) => html`<button class="chip ${f.type === k ? 'active' : ''}" data-v="${k}">${k ? t('tx.type.' + k) : t('common.all')}</button>`)}</div>
    <div class="card card-pad" style="display:flex;gap:12px;align-items:center;margin-bottom:6px" data-sum><div class="sk sk-line" style="width:100%"></div></div>
    <div data-list>${html`<div class="card">${skeletonRows(6)}</div>`}</div>
    <div class="pager" data-more hidden><button class="btn btn-soft btn-sm">${t('common.load_more')}</button></div>
  </div>`);
  const rangeToDates = (r) => {
    const now = new Date(); const today = localDateStr(now);
    if (r === 'today') return [inputToIso(today + 'T00:00'), null];
    if (r === 'week') return [inputToIso(localDateStr(new Date(now - 6 * 864e5)) + 'T00:00'), null];
    if (r === 'month') return [inputToIso(today.slice(0, 8) + '01T00:00'), null];
    if (r === 'year') return [inputToIso(today.slice(0, 5) + '01-01T00:00'), null];
    if (r && r.includes('~')) { const [a, b] = r.split('~'); return [a ? inputToIso(a + 'T00:00') : null, b ? inputToIso(b + 'T23:59') : null]; }
    return [null, null];
  };
  async function load(append = false) {
    const box = $('[data-list]', page);
    const qs = new URLSearchParams({ page: pageNo, limit: 30, sort: f.sort });
    if (f.q) qs.set('q', f.q); if (f.type) qs.set('type', f.type); if (f.account_id) qs.set('account_id', f.account_id); if (f.category_id) qs.set('category_id', f.category_id);
    const [from, to] = rangeToDates(f.range); if (from) qs.set('from', from); if (to) qs.set('to', to);
    try {
      const d = await api.get('/api/transactions?' + qs, { force: true });
      $('[data-sum]', page).innerHTML = String(html`<span class="tile tile-sm" style="--c:var(--green)">${icon('arrow-down-left')}</span><span style="flex:1"><small class="muted" style="display:block;font-size:11px">${t('tx.money_in')}</small><b class="pos">${money(d.inflow)}</b></span>
        <span class="tile tile-sm" style="--c:var(--red)">${icon('arrow-up-right')}</span><span style="flex:1"><small class="muted" style="display:block;font-size:11px">${t('tx.money_out')}</small><b class="neg">${money(d.outflow)}</b></span><span class="badge">${t('tx.count', { n: d.total })}</span>`);
      const pend = !append && pageNo === 1 && !f.q && !f.type ? outbox.list() : [];
      const groups = {};
      d.items.forEach((x) => { const k = localDateStr(new Date(x.occurred_at)); (groups[k] = groups[k] || []).push(x); });
      const markup = String(html`${pend.length ? html`<div class="tx-date">${t('tx.pending_sync')}</div><div class="card tx-list">${pend.map((p) => txRow({ ...p.preview, id: '' }, { pending: true }))}</div>` : ''}
        ${Object.entries(groups).map(([day, items]) => html`<div class="tx-date"><span>${fmtDate(new Date(day + 'T12:00:00'), 'long')}</span></div><div class="card tx-list stagger">${items.map((x) => txRow(x, { swipe: true }))}</div>`)}`);
      if (append) box.insertAdjacentHTML('beforeend', markup);
      else box.innerHTML = d.items.length || pend.length ? markup : String(html`<div class="card">${emptyState(t('tx.empty'), f.q || f.type || f.range ? t('tx.empty_filtered') : t('tx.empty_sub'))}</div>`);
      $('[data-more]', page).hidden = d.page >= d.pages;
      $$('[data-tx]', box).forEach((b) => { if (b.dataset.bound) return; b.dataset.bound = 1; b.onclick = () => { if (!b.dataset.noclick && b.dataset.tx) openTxDetail(b.dataset.tx); }; });
      enableSwipe(box, (id) => deleteTx(id));
    } catch (e) { box.innerHTML = String(html`<div class="card">${errorState(e.message)}</div>`); box.querySelector('[data-retry]').onclick = () => load(); }
  }
  const reload = () => { pageNo = 1; load(false); };
  $$('[data-types] .chip', page).forEach((c) => c.onclick = () => { f.type = c.dataset.v; $$('[data-types] .chip', page).forEach((x) => x.classList.toggle('active', x === c)); reload(); });
  let deb; $('[data-search] input', page).addEventListener('input', (e) => { clearTimeout(deb); deb = setTimeout(() => { f.q = e.target.value.trim(); reload(); }, 300); });
  $('[data-search]', page).onsubmit = (e) => { e.preventDefault(); f.q = e.target.q.value.trim(); reload(); };
  $('[data-more] button', page).onclick = () => { pageNo++; load(true); };
  $('[data-filter]', page).onclick = async () => {
    await ensureRefs();
    const [a, b] = f.range.includes('~') ? f.range.split('~') : ['', ''];
    const body = el(html`<form>
      <div class="field"><label>${t('tx.period')}</label><div class="chips" data-range style="flex-wrap:wrap">${['', 'today', 'week', 'month', 'year'].map((k) => html`<button type="button" class="chip ${f.range === k ? 'active' : ''}" data-v="${k}">${t('tx.range.' + (k || 'all'))}</button>`)}</div></div>
      <div class="row"><div class="field"><label>${t('tx.from')}</label><input class="input" type="date" name="from" value="${a}"></div><div class="field"><label>${t('tx.to')}</label><input class="input" type="date" name="to" value="${b}"></div></div>
      <div class="field"><label>${t('tx.account')}</label><select class="select" name="account_id"><option value="">${t('common.all')}</option>${state.accounts.map((x) => html`<option value="${x.id}" ${String(x.id) === String(f.account_id) ? 'selected' : ''}>${x.name}</option>`)}</select></div>
      <div class="field"><label>${t('tx.category')}</label><select class="select" name="category_id"><option value="">${t('common.all')}</option>${state.categories.map((c) => html`<option value="${c.id}" ${String(c.id) === String(f.category_id) ? 'selected' : ''}>${c.name} · ${t('cat.kind.' + c.kind)}</option>`)}</select></div>
      <div class="field"><label>${t('tx.sort')}</label><select class="select" name="sort">${['date_desc', 'date_asc', 'amount_desc', 'amount_asc'].map((k) => html`<option value="${k}" ${f.sort === k ? 'selected' : ''}>${t('tx.sort.' + k)}</option>`)}</select></div></form>`);
    let range = f.range.includes('~') ? '' : f.range;
    $$('[data-range] .chip', body).forEach((c) => c.onclick = () => { range = c.dataset.v; $$('[data-range] .chip', body).forEach((x) => x.classList.toggle('active', x === c)); body.from.value = ''; body.to.value = ''; });
    const foot = el(html`<div style="display:flex;gap:10px;width:100%"><button class="btn btn-outline btn-block" data-reset>${t('common.reset')}</button><button class="btn btn-primary btn-block" data-apply>${t('common.apply')}</button></div>`);
    const s = openSheet({ title: t('tx.filters'), body, foot });
    foot.querySelector('[data-reset]').onclick = () => { Object.assign(f, { type: '', account_id: '', category_id: '', range: '', sort: 'date_desc' }); $$('[data-types] .chip', page).forEach((x) => x.classList.toggle('active', !x.dataset.v)); s.close(); reload(); };
    foot.querySelector('[data-apply]').onclick = () => {
      const fd = new FormData(body);
      f.account_id = fd.get('account_id'); f.category_id = fd.get('category_id'); f.sort = fd.get('sort');
      f.range = fd.get('from') || fd.get('to') ? `${fd.get('from')}~${fd.get('to')}` : range;
      $('[data-filter]', page).classList.toggle('bordered', !!(f.account_id || f.category_id || f.range || f.sort !== 'date_desc'));
      s.close(); reload();
    };
  };
  load();
  const offs = [on('data:changed', reload), on('outbox', reload)];
  return { el: page, title: t('nav.transactions'), refresh: reload, destroy: () => offs.forEach((x) => x()) };
}
