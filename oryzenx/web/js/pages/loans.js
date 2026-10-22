import { api } from '../api.js';
import {
  html, mount, usd, coinIcon, date, skeleton, empty, cls, price, qty, pct, icon,
} from '../ui.js';
import * as market from '../market.js';
import { state } from '../app.js';
import { setLive, statCard, pnlText } from './common.js';

const daysLeft = (d) => (d ? Math.ceil((Date.parse(d) - Date.parse(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }))) / 864e5) : null);

export async function render({ el }) {
  mount(el, skeleton(110, 3));
  const { rows } = await api.get('/loans');
  const open = rows.filter((l) => l.status === 'open');
  const coinLoans = open.filter((l) => l.kind === 'coin');
  market.watch([...state.watchlist, ...coinLoans.map((l) => l.coin)]);
  const usdRemaining = open.filter((l) => l.kind === 'usd').reduce((s, l) => s + l.remaining_usd, 0);
  const next = open.filter((l) => l.repay_date).sort((a, b) => a.repay_date.localeCompare(b.repay_date))[0];

  const card = (l) => {
    const dl = daysLeft(l.repay_date);
    return html`<div class="card">
      <div class="row between"><div class="row">${l.kind === 'coin' ? coinIcon(l.coin) : html`<span class="coin-ico" style="background:#26a17b">USD</span>`}
        <div><b>${l.kind === 'coin' ? `${qty(l.quantity)} ${l.coin}` : usd(l.amount_usd)}</b><div class="faint" style="font-size:12px">${l.lender || 'Loan'} · since ${date(l.borrowed_at)}</div></div></div>
        <span class="chip ${l.status === 'repaid' ? 'up' : dl !== null && dl <= 3 ? 'down' : 'warn'}">${l.status === 'repaid' ? 'Repaid' : dl === null ? 'Open' : dl < 0 ? `${-dl}d overdue` : dl === 0 ? 'Due today' : `${dl}d left`}</span></div>
      <div class="kv mt">
        <div><div class="k">Repayment date</div><div class="v">${date(l.repay_date)}</div></div>
        <div><div class="k">Remaining</div><div class="v num">${usd(l.remaining_usd)}</div></div>
        ${l.kind === 'coin' ? html`
          <div><div class="k">Price when borrowed</div><div class="v num">${price(l.entry_price)}</div></div>
          <div><div class="k">Live price</div><div class="v num" data-lp="${l.id}">—</div></div>
          <div><div class="k">Value now</div><div class="v num" data-lv="${l.id}">—</div></div>
          <div><div class="k">Gain / loss for us</div><div class="v num" data-lg="${l.id}">—</div></div>` : ''}
      </div>${l.note ? html`<p class="faint" style="margin:10px 0 0;font-size:13px">${l.note}</p>` : ''}</div>`;
  };

  mount(el, html`<div class="stack">
    <div class="grid g3">
      <div class="card hero stat"><div class="label">Loan balance (live)</div><div class="value num" id="v-total">${usd(usdRemaining)}</div><div class="sub">${open.length} open loan${open.length === 1 ? '' : 's'}</div></div>
      ${statCard('USD loans remaining', usd(usdRemaining), { ic: 'loan' })}
      ${statCard('Next repayment', next ? date(next.repay_date) : '—', { ic: 'calendar', sub: next ? (next.kind === 'coin' ? `${qty(next.quantity)} ${next.coin}` : usd(next.remaining_usd)) : 'Nothing due', subCls: 'faint' })}
    </div>
    <p class="faint" style="margin:0;font-size:13px">${icon('loan')} For coin loans, a price rise means we owe more in USD (shown as a loss); a price drop is a gain.</p>
    ${open.length ? html`<div class="grid g2">${open.map(card)}</div>` : html`<div class="card">${empty('No open loans', 'loan')}</div>`}
    ${rows.length > open.length ? html`<h2 class="mt">Repaid</h2><div class="grid g2">${rows.filter((l) => l.status !== 'open').map(card)}</div>` : ''}
  </div>`);

  return market.subscribe(() => {
    let total = usdRemaining;
    for (const l of coinLoans) {
      const p = market.getPrice(l.coin) ?? l.entry_price;
      const value = l.quantity * p;
      const gain = l.quantity * l.entry_price - value; // positive = good for us
      total += value;
      setLive(el.querySelector(`[data-lp="${l.id}"]`), price(p), p);
      setLive(el.querySelector(`[data-lv="${l.id}"]`), usd(value), value);
      const g = el.querySelector(`[data-lg="${l.id}"]`);
      if (g) { g.className = `v num ${cls(gain)}`; g.textContent = `${pnlText(gain)} (${pct(((p - l.entry_price) / l.entry_price) * 100)} price)`; }
    }
    setLive(el.querySelector('#v-total'), usd(total), total);
  });
}
