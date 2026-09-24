import { api, esc, $, toast, toastError, pageHead, relEl, pagination, chip, money, withLoading, formData, fmtDateTime } from '../core.js';

const STEPS = ['pending', 'waiting_admin', 'approved', 'paid'];

export async function mount(el, { live }) {
  let page = 1;
  el.innerHTML = `${pageHead('fa-solid fa-money-bill-transfer', 'Withdraw', 'Cash out to your Binance account')}
    <div class="grid grid-main">
      <div class="card"><div class="card-head"><h2>Withdrawal History</h2><span class="link small muted">Live status</span></div><div data-list></div><div data-pages></div></div>
      <div class="card"><div class="card-head"><h2>Request Withdrawal</h2></div><div data-form></div></div>
    </div>`;

  async function load(p = page) {
    page = p;
    const r = await api('/withdrawals', { query: { page } });
    const canWithdraw = Number(r.balance) >= Number(r.min_withdrawal);
    $('[data-form]', el).innerHTML = `
      <div class="card hero-card" style="margin-bottom:14px"><div class="muted small">Available balance</div><div style="font-size:28px;font-weight:800" data-wallet>${esc(money(r.balance))}</div>
      <div class="small muted">Minimum withdrawal ${esc(money(r.min_withdrawal))}</div>
      <div class="progress" style="margin-top:10px;background:rgba(255,255,255,.25)"><span style="width:${Math.min(100, (Number(r.balance) / Number(r.min_withdrawal)) * 100)}%;background:#fff"></span></div></div>
      <form data-withdraw novalidate>
        <div class="field"><label>Amount (USD)</label><div class="input-group"><i class="fa-solid fa-dollar-sign"></i>
          <input class="input" name="amount" inputmode="decimal" placeholder="${esc(r.min_withdrawal)}" required></div>
          <button type="button" class="btn btn-ghost btn-xs" data-max style="justify-self:start">Max</button></div>
        <div class="field"><label>Binance UID</label><div class="input-group"><i class="fa-brands fa-bitcoin"></i>
          <input class="input" name="binance_uid" inputmode="numeric" pattern="\\d{5,20}" value="${esc(r.binance_uid)}" placeholder="e.g. 1193351097" required></div></div>
        <button class="btn btn-primary btn-block" type="submit" ${canWithdraw ? '' : 'disabled'}><i class="fa-solid fa-paper-plane"></i>Withdraw</button>
        ${canWithdraw ? '' : `<p class="small muted center" style="margin-top:10px">You need at least ${esc(money(r.min_withdrawal))} to withdraw.</p>`}
      </form>`;
    $('[data-max]', el).addEventListener('click', () => { $('[name=amount]', el).value = r.balance.replace(/0+$/, '').replace(/\.$/, ''); });
    $('[data-withdraw]', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      await withLoading(e.submitter, async () => {
        try {
          const res = await api('/withdraw', { method: 'POST', body: formData(e.target) });
          toast(res.message);
          load(1);
        } catch (err) { toastError(err); }
      });
    });
    $('[data-list]', el).innerHTML = r.items.length ? `<div class="list">${r.items.map((w) => {
      const idx = STEPS.indexOf(w.status);
      return `<div class="list-item" style="flex-wrap:wrap"><span class="li-ic withdrawal"><i class="fa-solid fa-money-bill-transfer"></i></span>
        <div class="li-body"><div class="li-title">${esc(money(w.amount))} → Binance ${esc(w.binance_uid)}</div>
        <div class="li-sub" title="${esc(fmtDateTime(w.created_at))}">#${w.id} · ${relEl(w.created_at)}${w.admin_note ? ` · ${esc(w.admin_note)}` : ''}</div></div>
        <div class="li-end">${chip(w.status, w.status === 'waiting_admin' ? 'Waiting for Admin' : w.status)}</div>
        ${w.status !== 'rejected' ? `<div class="progress" style="width:100%;margin-top:8px"><span style="width:${((idx + 1) / STEPS.length) * 100}%"></span></div>` : ''}</div>`;
    }).join('')}</div>` : '<div class="empty"><i class="fa-solid fa-money-bill-transfer"></i><div>No withdrawals yet</div></div>';
    $('[data-pages]', el).innerHTML = pagination(r.pagination, load);
  }

  await load(1);
  const offs = [live.on('withdrawal:update', () => load().catch(() => {})), live.on('wallet:update', () => load().catch(() => {}))];
  // AJAX status refresh when realtime is unavailable
  const t = setInterval(() => { if (!live.connected && !document.hidden) load().catch(() => {}); }, 15000);
  return () => { offs.forEach((f) => f()); clearInterval(t); };
}
