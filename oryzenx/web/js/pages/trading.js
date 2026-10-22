import { api } from '../api.js';
import {
  html, mount, usd, coinIcon, dateTime, skeleton, empty, $, $$, cls, icon,
} from '../ui.js';
import * as market from '../market.js';
import { state } from '../app.js';
import { marketList, pnlText } from './common.js';

const PERIODS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['d7', '7D'], ['d30', '30D'], ['y1', '1Y']];

export async function render({ el }) {
  mount(el, skeleton(110, 3));
  const d = await api.get('/trading');
  const coins = [...new Set([...state.watchlist, ...d.by_coin.map((c) => c.coin)])];
  market.watch(coins);

  mount(el, html`<div class="stack">
    <div class="card">
      <div class="card-head"><h2>Profit summary</h2><div class="seg" id="tabs">${PERIODS.map(([k, l], i) => html`<button class="${i === 0 ? 'active' : ''}" data-k="${k}">${l}</button>`)}</div></div>
      <div class="pnl-grid" id="period"></div>
    </div>
    <div class="tiles three">
      <div class="tile"><div class="tile-ic">${icon('home')}</div><div class="tile-l">Main Balance</div><div class="tile-v num">${usd(d.balances.main_balance)}</div><div class="tile-s">After salaries paid</div></div>
      <div class="tile"><div class="tile-ic">${icon('chart')}</div><div class="tile-l">Trading Balance</div><div class="tile-v num">${usd(d.balances.trading_balance)}</div><div class="tile-s">Set by admin</div></div>
      <div class="tile"><div class="tile-ic down">${icon('x')}</div><div class="tile-l">Total Loss</div><div class="tile-v num down">${usd(d.balances.loss_balance)}</div><div class="tile-s">All time, after fees</div></div>
    </div>
    <div class="grid g2">
      <div class="card pad-0">
        <div class="card-head" style="padding:14px 16px 6px"><h2>Coins we trade</h2><span class="faint" style="font-size:12px">Tap for chart</span></div>
        ${d.by_coin.length ? d.by_coin.map((c) => html`<a class="list-item link" href="#/coin/${c.coin}">${coinIcon(c.coin)}
          <div class="grow"><div class="t">${c.coin}</div><div class="s">${c.trades} trade${c.trades === 1 ? '' : 's'} · last ${dateTime(c.last_trade)}</div></div>
          <b class="num ${cls(c.net)}">${pnlText(c.net)}</b></a>`) : empty('No trades recorded yet')}
      </div>
      <div class="card pad-0">
        <div class="card-head" style="padding:14px 16px 6px"><h2>Markets</h2><input class="input sm search" id="q" placeholder="Search coin" aria-label="Search coin" autocomplete="off"></div>
        <div id="mkt"></div>
      </div>
    </div>
  </div>`);

  const showPeriod = (k) => {
    const p = d.profit[k];
    mount($('#period', el), html`
      <div><span>Profit</span><b class="num up">${usd(p.profit)}</b><small>${p.trades} trade${p.trades === 1 ? '' : 's'}</small></div>
      <div><span>Loss</span><b class="num down">${usd(p.loss)}</b><small>Losing trades + fees</small></div>
      <div><span>Net result</span><b class="num ${cls(p.net)}">${pnlText(p.net)}</b><small>Added to Main Balance</small></div>`);
  };
  showPeriod('today');
  $('#tabs', el).onclick = (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    $$('#tabs button', el).forEach((t) => t.classList.toggle('active', t === b));
    showPeriod(b.dataset.k);
  };
  let off = marketList($('#mkt', el), coins);
  $('#q', el).oninput = (e) => {
    const q = e.target.value.trim().toUpperCase();
    off();
    off = marketList($('#mkt', el), q ? coins.filter((c) => c.includes(q)).concat(/^[A-Z0-9]{2,10}$/.test(q) && !coins.includes(q) ? [q] : []) : coins);
    if (q && !coins.includes(q)) market.watch([...coins, q]);
  };
  return () => off();
}
