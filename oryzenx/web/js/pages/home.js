import { api } from '../api.js';
import {
  html, mount, icon, usd, coinIcon, dateTime, date, ordinal, monthName, skeleton, empty, $, cls,
} from '../ui.js';
import * as market from '../market.js';
import { state } from '../app.js';
import {
  liveTotals, setLive, marketList, statCard, pnlText,
} from './common.js';

export async function render({ el }) {
  mount(el, skeleton(120, 3));
  const s = await api.get('/summary');
  market.watch(s.watchlist);
  const hour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Dhaka' }));
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const pay = s.schedule;
  const mine = s.my_payment;
  const b = s.balances;
  const p = s.profit;

  mount(el, html`<div class="stack">
    <div class="row between wrap"><div><div class="muted">${greet},</div><h1>${state.me.name.split(' ')[0]}</h1></div></div>

    <div class="pay-banner">${icon('calendar')}<div class="grow">
      ${pay ? html`<div class="big">This month's payment: ${ordinal(Number(pay.pay_date.slice(8, 10)))}</div>
        <div class="muted" style="font-size:13px">${date(pay.pay_date)}${pay.note ? ` · ${pay.note}` : ''}</div>`
    : html`<div class="big">Payment date for ${monthName(s.month)} not set yet</div><div class="muted" style="font-size:13px">You'll be notified when an admin sets it.</div>`}
      </div>${mine ? html`<span class="chip ${mine.status === 'paid' ? 'up' : 'warn'}">${mine.status === 'paid' ? `Paid ${usd(mine.amount)}` : 'Pending'}</span>` : ''}</div>

    <div class="grid g3">
      <div class="card hero stat" style="grid-column:span 2">
        <div class="label">All Balance <span class="chip" id="live-chip">Live</span></div>
        <div class="value num" id="v-all">${usd(b.main_balance)}</div>
        <div class="sub">Today <b class="num">${pnlText(p.today.net)}</b> · ${p.today.trades} trade${p.today.trades === 1 ? '' : 's'}</div>
      </div>
      ${statCard('Today Profit', usd(p.today.profit), { sub: `Net ${pnlText(p.today.net)}`, subCls: cls(p.today.net), ic: 'invest' })}
    </div>

    <div class="grid g4">
      ${statCard('Main Balance', usd(b.main_balance), { ic: 'home', sub: 'Pool + trade results − salaries', subCls: 'faint' })}
      ${statCard('Investment Balance', usd(b.investment_cost), { id: 'v-inv', ic: 'invest', sub: '' })}
      ${statCard('Trading Balance', usd(b.trading_balance), { ic: 'chart' })}
      ${statCard('Loan Balance', usd(b.usd_loan_remaining), { id: 'v-loan', ic: 'loan' })}
      ${statCard('Loss Balance', usd(b.loss_balance), { ic: 'x', extra: 'loss' })}
      ${statCard('Total Users', String(s.total_users), { ic: 'users' })}
      ${statCard('Payments this month', `${s.payment_status.paid} paid`, { ic: 'check', sub: `${s.payment_status.pending} pending`, subCls: s.payment_status.pending ? 'muted' : 'up' })}
      ${statCard('Yesterday', pnlText(p.yesterday.net), { ic: 'history', sub: `7 days ${pnlText(p.d7.net)}`, subCls: cls(p.d7.net) })}
    </div>

    <div class="grid g2">
      <div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h2>Live market</h2><a href="#/trading">Trading ›</a></div><div id="mkt"></div></div>
      <div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h2>Today's recent history</h2><a href="#/history">All ›</a></div>
        ${s.recent.length ? s.recent.map((t) => {
    const net = t.profit - t.fee;
    return html`<div class="list-item">${coinIcon(t.coin)}<div class="grow"><div class="t">${t.coin} <span class="chip">${t.side}</span></div><div class="s">${dateTime(t.traded_at)}</div></div>
            <div class="right"><div class="num ${cls(net)}" style="font-weight:700">${pnlText(net)}</div><div class="s faint" style="font-size:12px">Fee ${usd(t.fee)}</div></div></div>`;
  }) : empty('No trades yet today')}
      </div>
    </div>
  </div>`);

  const offMarket = marketList($('#mkt', el), s.watchlist.slice(0, 8), { compact: true });
  const off = market.subscribe(() => {
    const t = liveTotals(s);
    setLive($('#v-all', el), usd(t.all), t.all);
    setLive($('#v-inv', el), usd(t.investment), t.investment);
    const sub = $('#v-inv-sub', el);
    if (sub) { sub.className = `sub ${cls(t.investmentPnl)}`; sub.textContent = `${pnlText(t.investmentPnl)} vs cost`; }
    setLive($('#v-loan', el), usd(t.loan), t.loan);
    $('#live-chip', el).textContent = market.isLive() ? '● Live' : 'Offline';
  });
  return () => { off(); offMarket(); };
}
