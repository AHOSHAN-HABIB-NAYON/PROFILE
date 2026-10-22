import {
  html, mount, icon, coinIcon, price, pct, cls, usd, $,
} from '../ui.js';
import * as market from '../market.js';

// Live value of coin positions, falling back to entry price until the first tick arrives.
export const liveValue = (rows) => rows.reduce((s, r) => s + Number(r.quantity) * (market.getPrice(r.coin) ?? Number(r.entry_price)), 0);

// Totals shared by Home and other pages. "All Balance" = Main + live investments - loans.
export function liveTotals(s) {
  const investment = liveValue(s.investments);
  const coinLoans = liveValue(s.coin_loans);
  const loan = s.balances.usd_loan_remaining + coinLoans;
  return {
    investment,
    investmentPnl: investment - s.balances.investment_cost,
    loan,
    all: s.balances.main_balance + investment - loan,
  };
}

// Set a class list safely (an empty colour class must not throw).
export function setClass(el, base, extra) {
  if (el) el.className = [base, extra].filter(Boolean).join(' ');
}

// Update a number in place and flash green/red when it changes.
export function setLive(el, text, value) {
  if (!el) return;
  const prev = Number(el.dataset.v);
  if (el.textContent !== text) {
    el.textContent = text;
    if (!Number.isNaN(prev) && prev !== value) {
      el.classList.remove('flash-up', 'flash-down');
      void el.offsetWidth;
      el.classList.add(value > prev ? 'flash-up' : 'flash-down');
    }
  }
  el.dataset.v = value;
}

// Tapping a coin anywhere opens its full chart page.
export function openChart(coin) { location.hash = `#/coin/${coin}`; }

// Binance-style market list: logo, ticker, volume, live price and 24h change.
export function marketList(el, coins, { limit } = {}) {
  const list = limit ? coins.slice(0, limit) : coins;
  mount(el, html`<div class="mkt">
    <div class="mkt-head"><span>Coin / Volume</span><span class="right">Last price</span><span class="right">24h change</span></div>
    ${list.map((c) => html`<button class="mkt-row" data-coin="${c}">
      <span class="row" style="gap:10px;min-width:0">${coinIcon(c)}<span class="mkt-name"><b>${c}</b><span class="faint">/USDT</span><small class="faint" data-v="${c}">—</small></span></span>
      <span class="right num mkt-price" data-p="${c}">—</span>
      <span class="right"><span class="chg" data-ch="${c}">—</span></span></button>`)}</div>`);
  el.onclick = (e) => { const r = e.target.closest('[data-coin]'); if (r) openChart(r.dataset.coin); };
  return market.subscribe(() => {
    for (const c of list) {
      const t = market.getTicker(c);
      if (!t) continue;
      setLive(el.querySelector(`[data-p="${c}"]`), price(t.price), t.price);
      setClass(el.querySelector(`[data-ch="${c}"]`), 'chg', t.change > 0 ? 'up' : t.change < 0 ? 'down' : '');
      const ch = el.querySelector(`[data-ch="${c}"]`); if (ch) ch.textContent = pct(t.change);
      const v = el.querySelector(`[data-v="${c}"]`); if (v) v.textContent = `Vol ${usd(t.volume, { compact: true })}`;
    }
  });
}

export const statCard = (label, value, { id, sub, subCls = '', ic, extra = '' } = {}) => html`<div class="card stat ${extra}">
  <div class="label">${ic ? icon(ic) : ''}${label}</div><div class="value" ${id ? html`id="${id}"` : ''}>${value}</div>${sub !== undefined ? html`<div class="sub ${subCls}" ${id ? html`id="${id}-sub"` : ''}>${sub}</div>` : ''}</div>`;

export const pnlText = (n) => usd(n, { sign: true });

export { $ };
