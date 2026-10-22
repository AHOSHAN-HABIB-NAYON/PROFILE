import { api } from '../api.js';
import {
  html, mount, usd, avatar, date, dateTime, skeleton, empty, $, modal, monthName, ordinal,
} from '../ui.js';
import { METHOD_NAMES } from './profile.js';

function monthOptions(current) {
  const out = [];
  const [y, m] = current.split('-').map(Number);
  for (let i = -12; i <= 2; i += 1) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out.reverse();
}

export async function render({ el }) {
  mount(el, skeleton(90, 4));
  const members = await api.get('/members');
  let month = members.month;

  mount(el, html`<div class="stack">
    <div class="card pad-0">
      <div class="card-head" style="padding:16px 16px 0;flex-wrap:wrap"><h2>Payment status</h2>
        <select class="input sm" id="month" style="width:auto">${monthOptions(month).map((m) => html`<option value="${m}" ${m === month ? 'selected' : ''}>${monthName(m)}</option>`)}</select></div>
      <div id="pay">${skeleton(48, 3)}</div>
    </div>
    <div class="card pad-0">
      <div class="card-head" style="padding:16px 16px 0"><h2>Members (${members.rows.length})</h2><span class="faint">Tap for payment history</span></div>
      <div class="member-grid">${members.rows.map((u) => html`<button class="member-card" data-user="${u.id}">
        <div class="row" style="gap:10px">${avatar(u)}<div class="grow" style="text-align:left"><b>${u.name}</b><div class="faint" style="font-size:12px">${u.role === 'user' ? 'Member' : u.role.replace('_', ' ')} · since ${date(u.member_since)}</div></div>
          ${u.deposit_received_at ? html`<span class="chip up">Deposit ✓</span>` : html`<span class="chip warn">Deposit due</span>`}</div>
        <div class="mini-kv"><div><span>Deposit</span><b class="num">${usd(u.deposit_amount)}</b></div><div><span>Due date</span><b>${date(u.deposit_date)}</b></div>
          <div><span>Salary</span><b class="num">${usd(u.salary)}</b></div><div><span>Received</span><b class="num up">${usd(u.total_paid)}</b></div></div></button>`)}</div>
    </div>
  </div>`);

  const loadPay = async () => {
    const d = await api.get(`/payments?month=${month}`);
    const paid = d.rows.filter((r) => r.status === 'paid');
    mount($('#pay', el), html`<div style="padding:8px 16px 4px" class="muted">${d.schedule
      ? html`Payment date: <b style="color:var(--text)">${ordinal(Number(d.schedule.pay_date.slice(8, 10)))} (${date(d.schedule.pay_date)})</b>`
      : 'Payment date not set yet'} · ${paid.length} paid · ${d.rows.length - paid.length} pending</div>
      ${d.rows.length ? d.rows.map((r) => html`<div class="list-item">${avatar(r, 'sm')}<div class="grow"><div class="t">${r.name}</div>
        <div class="s">${r.status === 'paid' ? `${METHOD_NAMES[r.method] || r.method} · ${dateTime(r.paid_at)}` : 'Waiting for payment'}</div></div>
        <div class="right"><div class="num" style="font-weight:700">${usd(r.amount)}</div><span class="chip ${r.status === 'paid' ? 'up' : 'warn'}">${r.status === 'paid' ? 'Paid' : 'Pending'}</span></div></div>`)
    : empty('No payments for this month yet')}`);
  };
  $('#month', el).onchange = (e) => { month = e.target.value; loadPay(); };
  el.querySelector('.member-grid').onclick = async (e) => {
    const r = e.target.closest('[data-user]'); if (!r) return;
    const u = members.rows.find((x) => x.id === Number(r.dataset.user));
    const h = await api.get(`/payments/history?user_id=${u.id}`);
    modal({ title: `${u.name} · payments`, body: paymentHistory(h) });
  };
  await loadPay();
}

export function paymentHistory(h) {
  return html`<div class="muted" style="margin-bottom:10px">Total received: <b class="up">${usd(h.total_paid)}</b></div>
    ${h.rows.length ? html`<div class="card pad-0">${h.rows.map((p) => html`<div class="list-item"><div class="grow"><div class="t">${monthName(p.month)}</div>
      <div class="s">${p.status === 'paid' ? `${METHOD_NAMES[p.method] || p.method} · ${dateTime(p.paid_at)}` : 'Pending'}</div></div>
      <div class="right"><div class="num" style="font-weight:700">${usd(p.amount)}</div><span class="chip ${p.status === 'paid' ? 'up' : 'warn'}">${p.status === 'paid' ? 'Paid' : 'Pending'}</span></div></div>`)}</div>`
    : empty('No payments yet')}`;
}
