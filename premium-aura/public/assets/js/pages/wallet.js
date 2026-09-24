import { api, esc, $, $$, pageHead, relEl, pagination, chip, money, fmtDateTime } from '../core.js';

const TYPES = { '': 'All', credit: 'Credit', debit: 'Debit', withdraw: 'Withdraw', refund: 'Refund', admin_adjustment: 'Admin' };

export async function mount(el, { live }) {
  let page = 1;
  let type = '';
  el.innerHTML = `${pageHead('fa-solid fa-wallet', 'Wallet', 'Balance & transaction history', '<a class="btn btn-primary btn-sm" href="/withdraw"><i class="fa-solid fa-money-bill-transfer"></i>Withdraw</a>')}
    <div class="grid grid-stats" data-summary style="margin-bottom:16px"></div>
    <div class="card"><div class="card-head"><h2>Transactions</h2></div>
      <div class="tabs" style="margin-bottom:12px">${Object.entries(TYPES).map(([k, v]) => `<button class="tab ${k === '' ? 'active' : ''}" data-type="${k}">${v}</button>`).join('')}</div>
      <div data-list></div><div data-pages></div></div>`;

  async function load(p = page) {
    page = p;
    const r = await api('/wallet', { query: { page, type } });
    const w = r.wallet;
    $('[data-summary]', el).innerHTML = `
      <div class="card stat-card"><span class="ic"><i class="fa-solid fa-wallet"></i></span><div><div class="label">Balance</div><div class="value" data-wallet>${esc(money(w.balance))}</div></div></div>
      <div class="card stat-card"><span class="ic green"><i class="fa-solid fa-arrow-trend-up"></i></span><div><div class="label">Total earned</div><div class="value">${esc(money(w.earned))}</div></div></div>
      <div class="card stat-card"><span class="ic orange"><i class="fa-solid fa-money-bill-transfer"></i></span><div><div class="label">Withdrawn</div><div class="value">${esc(money(w.withdrawn))}</div></div></div>
      <div class="card stat-card"><span class="ic purple"><i class="fa-solid fa-coins"></i></span><div><div class="label">Reward</div><div class="value" style="font-size:17px">1 event = ${esc(money(w.reward))}</div><div class="sub muted" style="color:var(--muted)">Min. withdraw ${esc(money(w.min_withdrawal))}</div></div></div>`;
    $('[data-list]', el).innerHTML = r.items.length ? `<table class="table responsive"><thead><tr><th>ID</th><th>Type</th><th>Description</th><th>Amount</th><th>Balance</th><th>Status</th><th>Date</th></tr></thead><tbody>
      ${r.items.map((t) => `<tr><td data-label="ID" class="mono">#${t.id}</td><td data-label="Type">${chip(t.type === 'credit' || t.type === 'refund' ? 'success' : t.type === 'admin_adjustment' ? 'info' : 'warning', t.type.replace('_', ' '))}</td>
        <td data-label="Description"><span class="truncate" style="display:inline-block">${esc(t.description)}</span></td>
        <td data-label="Amount"><strong style="color:${t.amount.startsWith('-') ? 'var(--danger)' : 'var(--success)'}">${t.amount.startsWith('-') ? '' : '+'}${esc(money(t.amount))}</strong></td>
        <td data-label="Balance">${esc(money(t.balance_after))}</td><td data-label="Status">${chip(t.status)}</td>
        <td data-label="Date" class="nowrap" title="${esc(fmtDateTime(t.created_at))}">${relEl(t.created_at)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty"><i class="fa-solid fa-receipt"></i><div>No transactions yet</div></div>';
    $('[data-pages]', el).innerHTML = pagination(r.pagination, load);
  }

  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-type]');
    if (!t) return;
    $$('[data-type]', el).forEach((b) => b.classList.toggle('active', b === t));
    type = t.dataset.type;
    load(1);
  });
  await load(1);
  const off = live.on('wallet:update', () => { if (page === 1) load(1).catch(() => {}); });
  return off;
}
