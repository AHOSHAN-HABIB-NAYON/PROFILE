import { api } from '../api.js';
import {
  html, mount, usd, coinIcon, date, skeleton, empty, $, cls, price, qty, pct, monthName,
} from '../ui.js';
import * as market from '../market.js';
import { state } from '../app.js';
import {
  setLive, statCard, pnlText, openChart,
} from './common.js';

export async function render({ el }) {
  mount(el, skeleton(110, 3));
  const d = await api.get('/investments');
  const open = d.rows.filter((r) => r.status === 'open');
  const closed = d.rows.filter((r) => r.status !== 'open');
  const r = d.reinvest;

  mount(el, html`<div class="stack">
    <div class="grid g3">
      <div class="card hero stat"><div class="label">Investment value (live)</div><div class="value num" id="v-val">${usd(d.balances.investment_cost)}</div><div class="sub num" id="v-pnl">—</div></div>
      ${statCard('Invested (cost)', usd(d.balances.investment_cost), { ic: 'invest' })}
      ${statCard('Main Balance', usd(d.balances.main_balance), { ic: 'home', sub: `Loss balance ${usd(d.balances.loss_balance)}`, subCls: 'down' })}
    </div>

    <div class="card">
      <div class="card-head"><h2>Reinvest plan · ${monthName(r.month)}</h2></div>
      <div class="grid g3">
        <div><div class="faint">Net trading profit this month</div><div class="num ${cls(r.net_profit)}" style="font-size:18px;font-weight:700">${pnlText(r.net_profit)}</div></div>
        <div><div class="faint">Monthly salaries (deducted)</div><div class="num" style="font-size:18px;font-weight:700">− ${usd(r.salaries)}</div></div>
        <div><div class="faint">Remaining profit to reinvest</div><div class="num up" style="font-size:18px;font-weight:700">${usd(r.reinvest)}</div></div>
      </div>
    </div>

    <div class="card pad-0">
      <div class="card-head" style="padding:16px 16px 0"><h2>Holdings</h2><span class="faint">Live from Binance · tap for chart</span></div>
      ${open.length ? html`<div class="table-wrap"><table><thead><tr><th>Coin</th><th class="right">Quantity</th><th class="right hide-m">Entry price</th><th class="right">Live price</th><th class="right">Value</th><th class="right">P/L</th></tr></thead><tbody>
        ${open.map((x) => html`<tr class="clickable" data-coin="${x.coin}"><td><div class="row">${coinIcon(x.coin)}<div><b>${x.coin}</b><div class="faint" style="font-size:12px">${date(x.invested_at)}</div></div></div></td>
          <td class="right num">${qty(x.quantity)}</td><td class="right num hide-m">${price(x.entry_price)}</td>
          <td class="right num" data-p="${x.id}">—</td><td class="right num" data-v="${x.id}">—</td><td class="right num" data-pl="${x.id}">—</td></tr>`)}
      </tbody></table></div>` : empty('No open investments', 'invest')}
    </div>

    ${closed.length ? html`<div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h2>Closed positions</h2></div>
      <div class="table-wrap"><table><thead><tr><th>Coin</th><th class="right">Quantity</th><th class="right">Entry price</th><th class="right">Date</th></tr></thead><tbody>
      ${closed.map((x) => html`<tr><td><div class="row">${coinIcon(x.coin)}<b>${x.coin}</b></div></td><td class="right num">${qty(x.quantity)}</td><td class="right num">${price(x.entry_price)}</td><td class="right faint">${date(x.invested_at)}</td></tr>`)}
      </tbody></table></div></div>` : ''}
  </div>`);

  // Make sure every held coin is streaming, alongside the normal watchlist.
  market.watch([...state.watchlist, ...open.map((x) => x.coin)]);

  el.querySelector('tbody')?.addEventListener('click', (e) => { const row = e.target.closest('[data-coin]'); if (row) openChart(row.dataset.coin); });
  return market.subscribe(() => {
    let total = 0;
    for (const x of open) {
      const p = market.getPrice(x.coin) ?? x.entry_price;
      const value = x.quantity * p;
      const pl = value - x.quantity * x.entry_price;
      total += value;
      setLive(el.querySelector(`[data-p="${x.id}"]`), price(p), p);
      setLive(el.querySelector(`[data-v="${x.id}"]`), usd(value), value);
      const plEl = el.querySelector(`[data-pl="${x.id}"]`);
      if (plEl) { plEl.className = `right num ${cls(pl)}`; plEl.textContent = `${pnlText(pl)} (${pct((pl / (x.quantity * x.entry_price || 1)) * 100)})`; }
    }
    const cost = d.balances.investment_cost;
    setLive($('#v-val', el), usd(total), total);
    $('#v-pnl', el).textContent = `${pnlText(total - cost)} (${pct(((total - cost) / (cost || 1)) * 100)}) vs cost`;
  });
}
