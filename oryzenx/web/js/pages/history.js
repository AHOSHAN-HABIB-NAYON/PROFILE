import { api } from '../api.js';
import {
  html, mount, usd, coinIcon, dateTime, skeleton, empty, $, cls, icon, pager,
} from '../ui.js';
import { state } from '../app.js';
import { pnlText } from './common.js';

export async function render({ el }) {
  const f = { coin: '', from: '', to: '', result: '', page: 1 };
  mount(el, html`<div class="stack">
    <div class="card"><form class="row wrap" id="filters" style="align-items:flex-end;gap:12px">
      <div class="field" style="min-width:120px"><label for="h-coin">Coin</label><select class="input sm" id="h-coin" name="coin"><option value="">All coins</option>${state.watchlist.map((c) => html`<option>${c}</option>`)}</select></div>
      <div class="field"><label for="h-from">From</label><input class="input sm" type="date" id="h-from" name="from"></div>
      <div class="field"><label for="h-to">To</label><input class="input sm" type="date" id="h-to" name="to"></div>
      <div class="field" style="min-width:120px"><label for="h-res">Result</label><select class="input sm" id="h-res" name="result"><option value="">All</option><option value="profit">Profit</option><option value="loss">Loss</option></select></div>
      <div class="grow"></div>
      <a class="btn ghost sm" id="csv" href="/api/trades.csv" download>${icon('download')} Export CSV</a>
    </form></div>
    <div class="grid g4" id="sums"></div>
    <div class="card pad-0" id="list">${skeleton(48, 6)}</div>
  </div>`);

  const qs = () => new URLSearchParams(Object.entries({ ...f, limit: 25 }).filter(([, v]) => v !== '')).toString();
  const load = async () => {
    const d = await api.get(`/trades?${qs()}`);
    $('#csv', el).href = `/api/trades.csv?${qs()}`;
    const s = d.sums;
    mount($('#sums', el), html`${[['Trades', String(d.total), ''], ['Profit', usd(s.profit), 'up'], ['Loss', usd(s.loss), 'down'], ['Net (adds to Main Balance)', pnlText(s.net), cls(s.net)]]
      .map(([k, v, c]) => html`<div class="card stat"><div class="label">${k}</div><div class="value num ${c}" style="font-size:18px">${v}</div></div>`)}`);
    mount($('#list', el), d.rows.length ? html`${d.rows.map((t) => { const net = t.profit - t.fee; return html`<a class="list-item link" href="#/coin/${t.coin}">${coinIcon(t.coin)}
        <div class="grow"><div class="t">${t.coin} <span class="chip">${t.side}</span></div><div class="s">${dateTime(t.traded_at)}${t.note ? ` · ${t.note}` : ''}</div></div>
        <div class="right"><div class="num ${cls(net)}" style="font-weight:700">${pnlText(net)}</div><div class="faint num" style="font-size:12px">P/L ${pnlText(t.profit)} · fee ${usd(t.fee)}</div></div></a>`; })}
      ${pager(d.page, d.limit, d.total)}` : empty('No trades match these filters'));
  };
  $('#filters', el).onchange = (e) => { f[e.target.name] = e.target.value; f.page = 1; load(); };
  $('#filters', el).onsubmit = (e) => e.preventDefault();
  $('#list', el).onclick = (e) => {
    const p = e.target.closest('[data-page]');
    if (p) { f.page = Number(p.dataset.page); load(); return; }
  };
  await load();
}
