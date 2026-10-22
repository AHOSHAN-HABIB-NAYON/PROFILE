import {
  html, mount, icon, modal, coinIcon, price, pct, cls, usd, $, $$,
} from '../ui.js';
import * as market from '../market.js';
import { mountChart } from '../chart.js';

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

export function openChart(coin) {
  const intervals = ['15m', '1h', '4h', '1d', '1w'];
  let dispose = null;
  const m = modal({
    title: `${coin}/USDT`,
    wide: true,
    body: html`<div class="row between wrap" style="margin-bottom:12px">
        <div class="row">${coinIcon(coin)}<div><div class="num" style="font-size:22px;font-weight:700" id="c-price">—</div>
          <div class="num" id="c-change"></div></div></div>
        <div class="tabs" id="c-int">${intervals.map((i) => html`<button class="tab ${i === '1h' ? 'active' : ''}" data-i="${i}">${i}</button>`)}</div>
      </div>
      <div class="grid g4 keep" style="margin-bottom:12px;gap:10px" id="c-stats"></div>
      <div class="chart-box" id="c-box"><div class="loading">Loading chart…</div></div>
      <p class="faint" style="font-size:11px;margin:8px 0 0">Live data from Binance. Charts by TradingView Lightweight Charts.</p>`,
  });
  const box = $('#c-box', m.el);
  const load = async (iv) => {
    dispose?.();
    mount(box, html`<div class="loading">Loading chart…</div>`);
    try { dispose = await mountChart(box, coin, iv); } catch (err) { mount(box, html`<div class="loading">${err.message || 'Chart unavailable'}</div>`); }
  };
  load('1h');
  $('#c-int', m.el).onclick = (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    $$('.tab', m.el).forEach((t) => t.classList.toggle('active', t === b));
    load(b.dataset.i);
  };
  const stat = (k, v) => html`<div class="card" style="padding:10px"><div class="faint" style="font-size:11px">${k}</div><div class="num" style="font-weight:600">${v}</div></div>`;
  const off = market.subscribe(() => {
    const t = market.getTicker(coin);
    if (!t || !m.el.isConnected) return;
    setLive($('#c-price', m.el), price(t.price), t.price);
    const ch = $('#c-change', m.el);
    ch.className = `num ${cls(t.change)}`; ch.textContent = `${pct(t.change)} (24h)`;
    mount($('#c-stats', m.el), html`${stat('24h High', price(t.high))}${stat('24h Low', price(t.low))}${stat('24h Open', price(t.open))}${stat('24h Volume', usd(t.volume, { compact: true }))}`);
  });
  new MutationObserver((_, obs) => {
    if (!m.el.isConnected) { obs.disconnect(); off(); dispose?.(); }
  }).observe(document.body, { childList: true });
}

// A live market list. Rows open the chart.
export function marketList(el, coins, { compact = false } = {}) {
  const hl = compact ? 'hidden' : 'hide-m';
  mount(el, html`<div class="table-wrap"><table>
    <thead><tr><th>Coin</th><th class="right">Price</th><th class="right">24h</th><th class="right ${hl}">24h High</th><th class="right ${hl}">24h Low</th></tr></thead>
    <tbody>${coins.map((c) => html`<tr class="clickable" data-coin="${c}" tabindex="0">
      <td><div class="row">${coinIcon(c)}<div><b>${c}</b><span class="faint">/USDT</span></div></div></td>
      <td class="right num" data-p="${c}">—</td><td class="right"><span class="chip" data-ch="${c}">—</span></td>
      <td class="right num ${hl}" data-h="${c}">—</td><td class="right num ${hl}" data-l="${c}">—</td></tr>`)}</tbody></table></div>`);
  el.onclick = (e) => { const r = e.target.closest('[data-coin]'); if (r) openChart(r.dataset.coin); };
  el.onkeydown = (e) => { const r = e.target.closest('[data-coin]'); if (r && e.key === 'Enter') openChart(r.dataset.coin); };
  return market.subscribe(() => {
    for (const c of coins) {
      const t = market.getTicker(c);
      if (!t) continue;
      setLive(el.querySelector(`[data-p="${c}"]`), price(t.price), t.price);
      const ch = el.querySelector(`[data-ch="${c}"]`);
      if (ch) { ch.className = `chip ${cls(t.change)}`; ch.textContent = pct(t.change); }
      const h = el.querySelector(`[data-h="${c}"]`); if (h) h.textContent = price(t.high);
      const l = el.querySelector(`[data-l="${c}"]`); if (l) l.textContent = price(t.low);
    }
  });
}

export const statCard = (label, value, { id, sub, subCls = '', ic, extra = '' } = {}) => html`<div class="card stat ${extra}">
  <div class="label">${ic ? icon(ic) : ''}${label}</div><div class="value" ${id ? html`id="${id}"` : ''}>${value}</div>${sub !== undefined ? html`<div class="sub ${subCls}" ${id ? html`id="${id}-sub"` : ''}>${sub}</div>` : ''}</div>`;

export const pnlText = (n) => usd(n, { sign: true });
