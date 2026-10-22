import { api } from '../api.js';
import {
  html, mount, usd, coinIcon, dateTime, skeleton, empty, $, $$, cls,
} from '../ui.js';
import * as market from '../market.js';
import { state } from '../app.js';
import {
  marketList, statCard, pnlText, openChart,
} from './common.js';

const PERIODS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['d7', '7 Days'], ['d30', '30 Days'], ['y1', '1 Year']];

export async function render({ el }) {
  mount(el, skeleton(110, 3));
  const d = await api.get('/trading');
  const coins = [...new Set([...state.watchlist, ...d.by_coin.map((c) => c.coin)])];
  market.watch(coins);

  mount(el, html`<div class="stack">
    <div class="card">
      <div class="card-head"><h2>Profit summary</h2><div class="tabs" id="tabs">${PERIODS.map(([k, l], i) => html`<button class="tab ${i === 0 ? 'active' : ''}" data-k="${k}">${l}</button>`)}</div></div>
      <div class="grid g3" id="period"></div>
    </div>
    <div class="grid g3">
      ${statCard('Main Balance', usd(d.balances.main_balance), { ic: 'home' })}
      ${statCard('Trading Balance', usd(d.balances.trading_balance), { ic: 'chart' })}
      ${statCard('Total Loss (all time)', usd(d.balances.loss_balance), { ic: 'x', extra: 'loss' })}
    </div>
    <div class="card pad-0">
      <div class="card-head" style="padding:16px 16px 0"><h2>Coins we trade</h2><span class="faint">Tap a coin for its live chart</span></div>
      ${d.by_coin.length ? html`<div class="table-wrap"><table><thead><tr><th>Coin</th><th class="right">Trades</th><th class="right">Net result</th><th class="right hide-m">Last trade</th></tr></thead><tbody>
        ${d.by_coin.map((c) => html`<tr class="clickable" data-coin="${c.coin}"><td><div class="row">${coinIcon(c.coin)}<b>${c.coin}</b></div></td>
          <td class="right">${c.trades}</td><td class="right num ${cls(c.net)}"><b>${pnlText(c.net)}</b></td><td class="right faint hide-m">${dateTime(c.last_trade)}</td></tr>`)}
      </tbody></table></div>` : empty('No trades recorded yet')}
    </div>
    <div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h2>Live market</h2></div><div id="mkt"></div></div>
  </div>`);

  const showPeriod = (k) => {
    const p = d.profit[k];
    mount($('#period', el), html`
      ${statCard('Profit', usd(p.profit), { sub: `${p.trades} trades`, subCls: 'faint', extra: '' })}
      ${statCard('Loss', usd(p.loss), { extra: 'loss' })}
      ${statCard('Net result', pnlText(p.net), { sub: 'After fees', subCls: 'faint' })}`);
    $('#period .card:last-child .value', el).classList.add(cls(p.net));
  };
  showPeriod('today');
  $('#tabs', el).onclick = (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    $$('#tabs .tab', el).forEach((t) => t.classList.toggle('active', t === b));
    showPeriod(b.dataset.k);
  };
  el.querySelector('tbody')?.addEventListener('click', (e) => { const r = e.target.closest('[data-coin]'); if (r) openChart(r.dataset.coin); });
  return marketList($('#mkt', el), coins);
}
