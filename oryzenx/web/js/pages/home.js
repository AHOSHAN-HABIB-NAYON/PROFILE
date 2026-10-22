import { api } from '../api.js';
import {
  html, mount, icon, usd, coinIcon, dateTime, ordinal, skeleton, empty, $, $$, cls, avatar, pct, modal,
} from '../ui.js';
import * as market from '../market.js';
import { state, isAdmin } from '../app.js';
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
  const greet = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
  const pay = s.schedule;
  const mine = s.my_payment;
  const b = s.balances;
  const p = s.profit;
  const todayPct = b.main_balance ? (p.today.net / b.main_balance) * 100 : 0;
  const tile = (id, label, ic, value, sub = '', tone = '') => html`<div class="tile"><span class="tile-ic ${tone}">${icon(ic)}</span>
    <span class="tile-l">${label}</span><span class="tile-v num" id="${id}" data-money>${value}</span><span class="tile-s" id="${id}-s">${sub}</span></div>`;

  mount(el, html`<div class="home">
    <section class="stack">
      <div class="greet">
        <div class="grow"><div class="greet-hi">${greet}, <b>${state.me.name.split(' ')[0]}</b></div>
          <a class="pay-pill ${mine?.status === 'paid' ? 'paid' : ''}" href="#/members">${icon('calendar')}
            ${pay ? html`<span>Your Monthly Payment: <b>${ordinal(Number(pay.pay_date.slice(8, 10)))}</b></span>` : html`<span>Payment date not set yet</span>`}
            ${mine ? html`<em>${mine.status === 'paid' ? 'Paid' : 'Pending'}</em>` : ''}</a></div>
      </div>

      <div class="balance-card">
        <div class="row between"><span class="bc-label">Total Balance <button class="eye" id="eye" aria-label="Hide or show balances">${icon('eye')}</button></span>
          <span class="live-pill" id="live-pill"><span class="live-dot"></span>Live</span></div>
        <div class="hero-v num" id="v-all" data-money>${usd(b.main_balance)}</div>
        <div class="bc-change ${cls(p.today.net)}">${icon(p.today.net >= 0 ? 'invest' : 'chart')} ${pnlText(p.today.net)} (${pct(todayPct)}) <span class="faint">today</span></div>
      </div>

      <div class="mini-row">
        <div class="mini-tile"><span>Today Profit</span><b class="num" data-money>${usd(p.today.profit)}</b><small class="${cls(p.today.net)}">${icon('invest')} ${pnlText(p.today.net)} net</small></div>
        <div class="mini-tile loss"><span>Loss Balance</span><b class="num" data-money>${usd(b.loss_balance)}</b><small>${icon('chart')} all time</small></div>
      </div>

      <nav class="qa" aria-label="Quick actions">
        <a href="#/invest"><span>${icon('invest')}</span>Invest</a>
        <a href="#/trading"><span>${icon('chart')}</span>Trade</a>
        <a href="#/loans"><span>${icon('loan')}</span>Loan</a>
        <button id="qa-more"><span>${icon('more')}</span>More</button>
      </nav>

      <div class="tiles">
        ${tile('t-main', 'Main Balance', 'home', usd(b.main_balance), 'Pool + trades − salaries')}
        ${tile('t-inv', 'Investment Balance', 'invest', usd(b.investment_cost))}
        ${tile('t-trade', 'Trading Balance', 'chart', usd(b.trading_balance), `7 days ${pnlText(p.d7.net)}`)}
        ${tile('t-loan', 'Loan Balance', 'loan', usd(b.usd_loan_remaining), '', 'warn')}
        ${tile('t-users', 'Total Users', 'users', String(s.total_users), 'Active members', 'violet')}
        ${tile('t-pay', 'Payments', 'check', `${s.payment_status.paid}/${s.payment_status.paid + s.payment_status.pending}`, `${s.payment_status.pending} pending this month`, 'green')}
      </div>
    </section>

    <section class="stack">
      <div class="card pad-0">
        <div class="card-head pad"><h2>Today's Recent History</h2><a href="#/history" class="small">See all</a></div>
        ${s.recent.length ? s.recent.slice(0, 6).map((t) => {
    const net = t.profit - t.fee;
    return html`<a class="list-item link" href="#/coin/${t.coin}">${coinIcon(t.coin)}<div class="grow"><div class="t">${t.coin}</div><div class="s">${t.side.toUpperCase()} · fee ${usd(t.fee)}</div></div>
            <div class="right"><div class="num ${cls(net)}" style="font-weight:700">${pnlText(net)}</div><div class="s faint">${dateTime(t.traded_at).split(', ')[1]}</div></div></a>`;
  }) : empty('No trades yet today')}
      </div>
      <div class="card pad-0">
        <div class="card-head pad"><h2>Markets</h2>
          <div class="seg" id="mtabs"><button class="active" data-m="watch">Watchlist</button><button data-m="gain">Gainers</button><button data-m="lose">Losers</button></div></div>
        <div id="mkt"></div>
        <a class="more-link" href="#/trading">View all markets ${icon('back', 'flip')}</a>
      </div>
    </section>
  </div>`);

  const applyHide = () => el.classList.toggle('money-hidden', hidden());
  applyHide();
  $('#eye', el).onclick = () => { try { localStorage.setItem(HIDE_KEY, hidden() ? '0' : '1'); } catch { /* ignore */ } applyHide(); };
  $('#qa-more', el).onclick = () => {
    const item = (href, ic, label, sub) => html`<a class="menu-row" href="${href}"><span class="mr-ic">${icon(ic)}</span><span class="grow"><b>${label}</b><small>${sub}</small></span>${icon('back', 'flip faint')}</a>`;
    const m = modal({
      title: 'More',
      body: html`<div class="menu-list">
        ${item('#/members', 'users', 'Members & Payments', 'Who is paid, deposits, salaries')}
        ${item('#/loans', 'loan', 'Loan Monitor', 'Borrowed coins and USD')}
        ${item('#/notifications', 'bell', 'Notifications', 'Payment dates and alerts')}
        ${item('#/settings', 'settings', 'Settings', 'Theme, App Lock, security')}
        ${isAdmin() ? item('#/admin', 'admin', 'Admin Panel', 'Manage everything') : ''}</div>`,
    });
    m.el.addEventListener('click', (e) => { if (e.target.closest('a')) m.close(); });
  };

  let offMarket = null;
  const showMarket = (mode) => {
    offMarket?.();
    let coins = [...s.watchlist];
    if (mode !== 'watch') {
      coins.sort((a, b2) => (market.getTicker(b2)?.change ?? 0) - (market.getTicker(a)?.change ?? 0));
      if (mode === 'lose') coins.reverse();
    }
    offMarket = marketList($('#mkt', el), coins, { limit: 6 });
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
