import { api } from '../api.js';
import {
  html, mount, icon, usd, coinIcon, dateTime, date, ordinal, monthName, skeleton, empty, $, $$, cls, avatar, pct,
} from '../ui.js';
import * as market from '../market.js';
import { state } from '../app.js';
import {
  liveTotals, setLive, marketList, pnlText, setClass,
} from './common.js';

const HIDE_KEY = 'ox-hide-balance';
const hidden = () => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } };

export async function render({ el }) {
  mount(el, skeleton(150, 3));
  const s = await api.get('/summary');
  market.watch([...new Set([...s.watchlist, ...s.investments.map((i) => i.coin), ...s.coin_loans.map((l) => l.coin)])]);
  const hour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Dhaka' }));
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const pay = s.schedule;
  const mine = s.my_payment;
  const b = s.balances;
  const p = s.profit;
  const tile = (id, label, ic, value, sub = '') => html`<div class="tile"><div class="tile-ic">${icon(ic)}</div>
    <div class="tile-l">${label}</div><div class="tile-v num" id="${id}" data-money>${value}</div>${sub ? html`<div class="tile-s" id="${id}-s">${sub}</div>` : html`<div class="tile-s" id="${id}-s"></div>`}</div>`;

  mount(el, html`<div class="home">
    <section class="stack">
      <div class="greet">
        ${avatar(state.me)}
        <div class="grow"><div class="faint" style="font-size:13px">${greet},</div><div class="greet-name">${state.me.name.split(' ')[0]}</div></div>
        <a class="pay-pill ${mine?.status === 'paid' ? 'paid' : ''}" href="#/members">${icon('calendar')}
          ${pay ? html`<span>Monthly payment: <b>${ordinal(Number(pay.pay_date.slice(8, 10)))}</b></span>` : html`<span>Payment date not set</span>`}</a>
      </div>

      <div class="hero2">
        <div class="row between"><span class="hero-l">Total Balance (USD) <button class="eye" id="eye" aria-label="Hide or show balances">${icon('eye')}</button></span>
          <span class="live-pill" id="live-pill"><span class="live-dot"></span>Live</span></div>
        <div class="hero-v num" id="v-all" data-money>${usd(b.main_balance)}</div>
        <div class="hero-sub"><span class="chg ${p.today.net > 0 ? 'up' : p.today.net < 0 ? 'down' : ''}">${pnlText(p.today.net)} today</span>
          <span>${p.today.trades} trade${p.today.trades === 1 ? '' : 's'} · ${monthName(s.month)}</span></div>
        <div class="hero-minis">
          <div><span>Today Profit</span><b class="num" data-money>${usd(p.today.profit)}</b><small class="${cls(p.today.net)}">Net ${pnlText(p.today.net)}</small></div>
          <div><span>Loss Balance</span><b class="num" data-money>${usd(b.loss_balance)}</b><small>All time</small></div>
          <div class="hide-m"><span>This month payment</span><b class="num">${mine ? usd(mine.amount) : '—'}</b><small>${mine ? (mine.status === 'paid' ? 'Paid' : 'Pending') : 'No salary set'}</small></div>
        </div>
      </div>

      <nav class="qa" aria-label="Quick actions">
        <a href="#/invest"><span>${icon('invest')}</span>Invest</a>
        <a href="#/trading"><span>${icon('chart')}</span>Trade</a>
        <a href="#/loans"><span>${icon('loan')}</span>Loans</a>
        <a href="#/history"><span>${icon('history')}</span>History</a>
        <a href="#/members"><span>${icon('users')}</span>Members</a>
      </nav>

      <div class="tiles">
        ${tile('t-main', 'Main Balance', 'home', usd(b.main_balance), 'Pool + trades − salaries')}
        ${tile('t-inv', 'Investment Balance', 'invest', usd(b.investment_cost))}
        ${tile('t-trade', 'Trading Balance', 'chart', usd(b.trading_balance), `7 days ${pnlText(p.d7.net)}`)}
        ${tile('t-loan', 'Loan Balance', 'loan', usd(b.usd_loan_remaining))}
        ${tile('t-users', 'Total Users', 'users', String(s.total_users), 'Active members')}
        ${tile('t-pay', 'Payments', 'check', `${s.payment_status.paid}/${s.payment_status.paid + s.payment_status.pending}`, `${s.payment_status.pending} pending this month`)}
      </div>
      ${pay ? html`<div class="note-bar">${icon('calendar')}<span>This month's payment is on <b>${date(pay.pay_date)}</b>${pay.note ? ` · ${pay.note}` : ''}</span>
        ${mine ? html`<span class="chip ${mine.status === 'paid' ? 'up' : 'warn'}">${mine.status === 'paid' ? `Paid ${usd(mine.amount)}` : 'Pending'}</span>` : ''}</div>` : ''}
    </section>

    <section class="stack">
      <div class="card pad-0">
        <div class="card-head" style="padding:14px 16px 6px"><h2>Markets</h2>
          <div class="seg" id="mtabs"><button class="active" data-m="watch">Watchlist</button><button data-m="gain">Gainers</button><button data-m="lose">Losers</button></div></div>
        <div id="mkt"></div>
        <a class="more-link" href="#/trading">View all markets ${icon('back', 'flip')}</a>
      </div>
      <div class="card pad-0">
        <div class="card-head" style="padding:14px 16px 6px"><h2>Today's recent history</h2><a href="#/history">All ›</a></div>
        ${s.recent.length ? s.recent.slice(0, 8).map((t) => {
    const net = t.profit - t.fee;
    return html`<a class="list-item link" href="#/coin/${t.coin}">${coinIcon(t.coin)}<div class="grow"><div class="t">${t.coin} <span class="chip">${t.side}</span></div><div class="s">${dateTime(t.traded_at)}</div></div>
            <div class="right"><div class="num ${cls(net)}" style="font-weight:700">${pnlText(net)}</div><div class="s faint" style="font-size:12px">Fee ${usd(t.fee)}</div></div></a>`;
  }) : empty('No trades yet today')}
      </div>
    </section>
  </div>`);

  // Hide / show money amounts (handy in public).
  const applyHide = () => el.classList.toggle('money-hidden', hidden());
  applyHide();
  $('#eye', el).onclick = () => { try { localStorage.setItem(HIDE_KEY, hidden() ? '0' : '1'); } catch { /* ignore */ } applyHide(); };

  // Markets tabs: order is fixed per tab so rows don't jump on every tick.
  let offMarket = null;
  const showMarket = (mode) => {
    offMarket?.();
    let coins = [...s.watchlist];
    if (mode !== 'watch') {
      coins.sort((a, b2) => (market.getTicker(b2)?.change ?? 0) - (market.getTicker(a)?.change ?? 0));
      if (mode === 'lose') coins.reverse();
    }
    offMarket = marketList($('#mkt', el), coins, { limit: 8 });
  };
  showMarket('watch');
  $('#mtabs', el).onclick = (e) => {
    const btn = e.target.closest('[data-m]'); if (!btn) return;
    $$('#mtabs button', el).forEach((x) => x.classList.toggle('active', x === btn));
    showMarket(btn.dataset.m);
  };

  const off = market.subscribe(() => {
    const t = liveTotals(s);
    setLive($('#v-all', el), usd(t.all), t.all);
    setLive($('#t-inv', el), usd(t.investment), t.investment);
    const invSub = $('#t-inv-s', el);
    if (invSub) { setClass(invSub, 'tile-s', cls(t.investmentPnl)); invSub.textContent = `${pnlText(t.investmentPnl)} (${pct((t.investmentPnl / (b.investment_cost || 1)) * 100)})`; }
    setLive($('#t-loan', el), usd(t.loan), t.loan);
    const loanSub = $('#t-loan-s', el); if (loanSub) loanSub.textContent = 'USD + coin loans (live)';
    $('#live-pill', el)?.classList.toggle('off', !market.isLive());
  });
  return () => { off(); offMarket?.(); };
}
