import { api } from '../api.js';
import {
  html, mount, icon, usd, coinIcon, price, pct, cls, dateTime, qty, $, $$, empty,
} from '../ui.js';
import * as market from '../market.js';
import { mountChart, INTERVALS } from '../chart.js';
import { state } from '../app.js';
import { setLive, pnlText } from './common.js';

const getInterval = () => { try { return localStorage.getItem('ox-interval') || '15m'; } catch { return '15m'; } };
const saveInterval = (i) => { try { localStorage.setItem('ox-interval', i); } catch { /* ignore */ } };

export async function render({ el, sub }) {
  const coin = String(sub[0] || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15) || 'BTC';
  document.getElementById('page-title').textContent = `${coin}/USDT`;
  market.watch([...new Set([...state.watchlist, coin])]);
  let interval = getInterval();

  mount(el, html`<div class="stack">
    <button class="back-link" id="back">${icon('back')} Back</button>
    <div class="card coin-head">
      <div class="row" style="gap:14px">${coinIcon(coin, 'xl')}
        <div class="grow"><div class="row" style="gap:8px"><h1>${coin}</h1><span class="faint">/USDT</span></div>
          <div class="row" style="gap:10px;margin-top:2px"><span class="coin-price num" id="cp">—</span><span class="chip" id="cc">—</span></div></div>
      </div>
      <div class="coin-stats">
        <div><span>24h High</span><b class="num" id="ch">—</b></div>
        <div><span>24h Low</span><b class="num" id="cl">—</b></div>
        <div><span>24h Vol (USDT)</span><b class="num" id="cv">—</b></div>
      </div>
    </div>

    <div class="card pad-0 chart-card">
      <div class="interval-bar" role="tablist">${INTERVALS.map(([v, l]) => html`<button class="iv ${v === interval ? 'active' : ''}" data-iv="${v}" role="tab">${l}</button>`)}</div>
      <div class="ohlc" id="legend"></div>
      <div class="chart-box" id="box"><div class="loading"><span class="spin dark"></span></div></div>
    </div>

    <div class="grid g2">
      <div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h2>Our holdings in ${coin}</h2></div><div id="hold"></div></div>
      <div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h2>Recent ${coin} trades</h2><a href="#/history">All ›</a></div><div id="trades"></div></div>
    </div>
  </div>`);

  $('#back', el).onclick = () => { if (history.length > 1) history.back(); else location.hash = '#/trading'; };
  let dispose = null;
  const load = async () => {
    dispose?.(); dispose = null;
    const box = $('#box', el);
    mount(box, html`<div class="loading"><span class="spin dark"></span></div>`);
    try {
      dispose = await mountChart(box, coin, interval, { legend: $('#legend', el) });
    } catch {
      mount(box, html`<div class="loading">${icon('chart')}<div>Chart unavailable. ${coin}/USDT may not be listed on Binance, or the connection is offline.</div></div>`);
    }
  };
  $('.interval-bar', el).onclick = (e) => {
    const b = e.target.closest('[data-iv]'); if (!b || b.dataset.iv === interval) return;
    interval = b.dataset.iv; saveInterval(interval);
    $$('.iv', el).forEach((x) => x.classList.toggle('active', x === b));
    load();
  };
  const onTheme = () => load();
  window.addEventListener('ox:theme', onTheme);
  load();

  // Holdings and trades for this coin.
  Promise.all([api.get('/investments'), api.get(`/trades?coin=${coin}&limit=8`), api.get('/loans')]).then(([inv, tr, ln]) => {
    if (!el.isConnected) return;
    const hold = inv.rows.filter((r) => r.coin === coin && r.status === 'open');
    const loans = ln.rows.filter((l) => l.coin === coin && l.status === 'open');
    mount($('#hold', el), hold.length || loans.length ? html`
      ${hold.map((h) => html`<div class="list-item"><div class="grow"><div class="t num">${qty(h.quantity)} ${coin}</div><div class="s">Entry ${price(h.entry_price)} · cost ${usd(h.quantity * h.entry_price)}</div></div>
        <div class="right"><div class="num" style="font-weight:700" data-hv="${h.id}">—</div><div class="num" style="font-size:12px" data-hp="${h.id}"></div></div></div>`)}
      ${loans.map((l) => html`<div class="list-item"><div class="grow"><div class="t">Loan · ${qty(l.quantity)} ${coin}</div><div class="s">Borrowed at ${price(l.entry_price)}</div></div><span class="chip warn">Loan</span></div>`)}`
      : empty(`We don't hold ${coin} right now`, 'invest'));
    mount($('#trades', el), tr.rows.length ? tr.rows.map((t) => {
      const net = t.profit - t.fee;
      return html`<div class="list-item"><div class="grow"><div class="t">${t.side.toUpperCase()}</div><div class="s">${dateTime(t.traded_at)} · fee ${usd(t.fee)}</div></div><b class="num ${cls(net)}">${pnlText(net)}</b></div>`;
    }) : empty(`No ${coin} trades yet`));
    el._hold = hold;
  }).catch(() => {});

  const off = market.subscribe(() => {
    const t = market.getTicker(coin);
    if (!t) return;
    setLive($('#cp', el), price(t.price), t.price);
    const c = $('#cc', el); c.className = `chip ${cls(t.change)}`; c.textContent = pct(t.change);
    $('#ch', el).textContent = price(t.high);
    $('#cl', el).textContent = price(t.low);
    $('#cv', el).textContent = usd(t.volume, { compact: true }).replace('$', '');
    for (const h of el._hold || []) {
      const v = h.quantity * t.price; const pl = v - h.quantity * h.entry_price;
      setLive(el.querySelector(`[data-hv="${h.id}"]`), usd(v), v);
      const p = el.querySelector(`[data-hp="${h.id}"]`);
      if (p) { p.className = `num ${cls(pl)}`; p.textContent = pnlText(pl); }
    }
  });

  return () => { off(); dispose?.(); window.removeEventListener('ox:theme', onTheme); };
}
