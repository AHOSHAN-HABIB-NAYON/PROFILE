// Admin Panel (dark sidebar on desktop, dark list on phones), following the OryzenX mockup.
import { api } from '../api.js';
import {
  html, mount, icon, usd, avatar, date, dateTime, skeleton, empty, $, $$, modal, formValues, busy, toast,
  confirmDialog, monthName, coinIcon, price, qty, cls, readFileAsDataUrl, raw, ago, ordinal, pct,
} from '../ui.js';
import {
  state, go, ADMIN_NAV, setAdminBadges,
} from '../app.js';
import * as market from '../market.js';
import { METHOD_NAMES, methodLogo } from './profile.js';
import { pnlText, liveTotals, setLive } from './common.js';

const nowLocal = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 16); // Asia/Dhaka
const today = () => nowLocal().slice(0, 10);
const thisMonth = () => today().slice(0, 7);
const SUBS = {
  dashboard: 'Dashboard', users: 'Users', kyc: 'KYC Verification', payments: 'Payments', deposits: 'Deposits',
  trades: 'Trading', investments: 'Investments', loans: 'Loan Monitor', notices: 'Notifications', logs: 'Email & Logs',
  settings: 'Settings', invites: 'Invites', menu: 'Menu',
};

async function refreshBadges() {
  try {
    const o = await api.get('/admin/overview');
    setAdminBadges({ kyc: o.kyc.pending + o.kyc.held, users: o.users.pending, payments: o.payments.pending });
    return o;
  } catch { return null; }
}

export async function render({ el, sub }) {
  const key = SUBS[sub[0]] ? sub[0] : 'dashboard';
  const t = $('#page-title'); if (t) t.textContent = SUBS[key];
  refreshBadges();
  mount(el, skeleton(90, 4));
  const head = (title, desc, actions = '') => html`<div class="apage-head"><div><h1>${title}</h1>${desc ? html`<p>${desc}</p>` : ''}</div><div class="row" id="sec-actions">${actions}</div></div>`;
  return VIEWS[key](el, sub.slice(1), head);
}

// ---------- Form helpers ----------
function field(f, v) {
  const id = `af-${f.name}`;
  const val = v ?? f.default ?? '';
  let input;
  if (f.type === 'select') {
    input = html`<select class="input" id="${id}" name="${f.name}">${f.options.map(([ov, ol]) => html`<option value="${ov}" ${String(val) === String(ov) ? 'selected' : ''}>${ol}</option>`)}</select>`;
  } else if (f.type === 'textarea') {
    input = html`<textarea class="input" id="${id}" name="${f.name}">${val}</textarea>`;
  } else {
    const shown = f.type === 'datetime-local' && val ? String(val).replace(' ', 'T').slice(0, 16) : val;
    input = html`<input class="input" id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${shown}" ${f.step ? raw(`step="${f.step}"`) : ''} ${f.required ? raw('required') : ''} ${f.type === 'number' ? raw('inputmode="decimal"') : ''} autocomplete="off">`;
  }
  return html`<div class="field ${f.half ? 'half' : ''}" data-field="${f.name}"><label for="${id}">${f.label}${f.required ? '' : html` <span class="faint">(optional)</span>`}</label>${input}${f.hint ? html`<span class="hint">${f.hint}</span>` : ''}</div>`;
}

function formModal({ title, fields, values = {}, submit, onChange, okLabel = 'Save', intro = '' }) {
  const m = modal({
    title,
    body: html`${intro}<form class="form form-grid" id="af">${fields.map((f) => field(f, values[f.name]))}<div class="form-error hidden" id="aerr"></div></form>`,
    foot: html`<button class="btn ghost" data-close>Cancel</button><button class="btn" id="asave">${okLabel}</button>`,
  });
  const form = $('#af', m.el);
  const sync = () => onChange?.(form);
  form.onchange = sync; sync();
  form.onsubmit = (e) => { e.preventDefault(); $('#asave', m.el).click(); };
  const btn = $('#asave', m.el);
  btn.onclick = () => busy(btn, async () => { await submit(formValues(form)); m.close(); }, $('#aerr', m.el));
  return m;
}

const tabsBar = (items, active, attr = 'data-f') => html`<div class="atabs">${items.map(([k, l, n]) => html`<button class="${k === active ? 'active' : ''}" ${raw(`${attr}="${k}"`)}>${l}${n ? html` <span class="abadge">${n}</span>` : ''}</button>`)}</div>`;

const STATUS_CHIP = { pending: 'warn', active: 'up', restricted: 'warn', disabled: 'down' };
const KYC_CHIP = {
  none: ['', 'Not started'], submitted: ['warn', 'To review'], review: ['down', 'Manual review'],
  approved: ['up', 'Verified'], rejected: ['down', 'Rejected'], resubmit: ['warn', 'Redo asked'],
};

// ---------- Dashboard ----------
async function dashboard(el, _sub, head) {
  const [s, o] = await Promise.all([api.get('/summary', { fresh: true }), api.get('/admin/overview', { fresh: true })]);
  const trades = (await api.get('/trades?limit=8', { fresh: true })).rows;
  const b = s.balances;
  const alerts = [
    o.kyc.pending && { href: 'kyc', tone: 'warn', ic: 'shield', text: `${o.kyc.pending} KYC verification${o.kyc.pending > 1 ? 's' : ''} to review` },
    o.kyc.held && { href: 'kyc', tone: 'down', ic: 'shield', text: `${o.kyc.held} account${o.kyc.held > 1 ? 's' : ''} on security hold` },
    o.users.pending && { href: 'users', tone: 'brand', ic: 'users', text: `${o.users.pending} member${o.users.pending > 1 ? 's' : ''} waiting for approval` },
    !o.pay_date && { href: 'payments', tone: 'warn', ic: 'calendar', text: `Payment date for ${monthName(o.month)} is not set` },
    o.payments.pending && { href: 'payments', tone: 'brand', ic: 'calendar', text: `${o.payments.pending} payment${o.payments.pending > 1 ? 's' : ''} pending · ${usd(o.payments.due)} due` },
    o.emails.failed && { href: 'logs', tone: 'down', ic: 'mail', text: `${o.emails.failed} email${o.emails.failed > 1 ? 's' : ''} failed this week` },
  ].filter(Boolean);
  const kpi = (id, label, ic, tone, value, sub = '', subCls = '') => html`<div class="kpi"><span class="kpi-ic ${tone}">${icon(ic)}</span>
    <div class="kpi-body"><span class="kpi-l">${label}</span><b class="kpi-v num" id="${id}">${value}</b>${sub ? html`<span class="kpi-s ${subCls}" id="${id}-s">${sub}</span>` : ''}</div></div>`;
  const coins = s.watchlist.slice(0, 8);

  mount(el, html`<div class="stack">
    ${head(`${monthName(o.month)}`, `Payment date: ${o.pay_date ? `${ordinal(Number(o.pay_date.slice(8, 10)))} (${date(o.pay_date)})` : 'not set'}`)}
    <div class="kpis">
      ${kpi('k-all', 'Total Balance', 'home', 'brand', usd(b.main_balance), `${pnlText(s.profit.today.net)} today`, cls(s.profit.today.net))}
      ${kpi('k-today', 'Today Profit', 'invest', 'green', usd(s.profit.today.profit), `${s.profit.today.trades} trades`)}
      ${kpi('k-loan', 'Loan Balance', 'loan', 'red', usd(b.usd_loan_remaining), 'USD + coin loans')}
      ${kpi('k-inv', 'Investment Balance', 'chart', 'violet', usd(b.investment_cost), 'live value')}
      ${kpi('k-trade', 'Trading Balance', 'history', 'amber', usd(b.trading_balance))}
      ${kpi('k-users', 'Total Users', 'users', 'brand', String(o.users.active), `${o.users.pending} waiting`)}
      ${kpi('k-loss', 'Loss Balance', 'x', 'red', usd(b.loss_balance), 'all time', 'down')}
      ${kpi('k-paid', 'Payments', 'check', 'green', `${o.payments.paid}/${o.payments.paid + o.payments.pending}`, `${usd(o.payments.due)} due`)}
    </div>

    ${alerts.length ? html`<div class="card pad-0"><div class="card-head pad"><h2>Needs your attention</h2></div>
      ${alerts.map((a) => html`<a class="list-item link" href="#/admin/${a.href}" data-admin="${a.href}"><span class="dot-ic ${a.tone}">${icon(a.ic)}</span><div class="grow t">${a.text}</div>${icon('back', 'flip faint')}</a>`)}</div>` : ''}

    <div class="amenu hide-d">${ADMIN_NAV.filter(([k]) => k !== 'dashboard').map(([k, l, ic]) => html`<a class="amenu-row" href="#/admin/${k}" data-admin="${k}">${icon(ic)}<span class="grow">${l}</span><em class="abadge hidden" data-badge="${k}"></em>${icon('back', 'flip')}</a>`)}</div>

    <div class="grid g2">
      <div class="card pad-0"><div class="card-head pad"><h2>Recent Activities</h2><a href="#/admin/trades" data-admin="trades" class="small">All trades</a></div>
        ${trades.length ? html`<table class="atable"><thead><tr><th>Coin</th><th class="right">Profit</th><th class="right hide-s">Date</th><th class="right">Time</th></tr></thead><tbody>
          ${trades.map((t) => html`<tr><td><span class="row" style="gap:8px">${coinIcon(t.coin, 'sm')}<b>${t.coin}</b></span></td><td class="right num ${cls(t.profit - t.fee)}"><b>${pnlText(t.profit - t.fee)}</b></td>
            <td class="right faint hide-s">${date(t.traded_at)}</td><td class="right faint">${ago(t.traded_at)}</td></tr>`)}</tbody></table>` : empty('No trades yet')}</div>
      <div class="card pad-0"><div class="card-head pad"><h2>Live Market</h2><span class="live-tag"><span class="live-dot"></span>Binance</span></div>
        <table class="atable"><thead><tr><th>Coin</th><th class="right">Price</th><th class="right">24h</th><th class="right hide-s">7 days</th></tr></thead><tbody>
          ${coins.map((c) => html`<tr data-coin="${c}"><td><span class="row" style="gap:8px">${coinIcon(c, 'sm')}<b>${c}</b></span></td><td class="right num" data-p="${c}">—</td>
            <td class="right"><span class="chg sm" data-ch="${c}">—</span></td><td class="right hide-s"><svg class="spark" viewBox="0 0 80 24" data-sp="${c}"></svg></td></tr>`)}</tbody></table></div>
    </div>
  </div>`);

  // Sparklines (last 7 days, 4h candles).
  coins.forEach(async (c) => {
    try {
      const rows = await market.restFetch(`/api/v3/klines?symbol=${c}USDT&interval=4h&limit=42`);
      const v = rows.map((k) => +k[4]); const mn = Math.min(...v); const mx = Math.max(...v);
      const pts = v.map((x, i) => `${(i / (v.length - 1)) * 80},${22 - ((x - mn) / ((mx - mn) || 1)) * 20}`).join(' ');
      const svg = el.querySelector(`[data-sp="${c}"]`);
      if (svg) svg.innerHTML = `<polyline points="${pts}" fill="none" stroke="var(--${v.at(-1) >= v[0] ? 'up' : 'down'})" stroke-width="1.6" stroke-linejoin="round"/>`;
    } catch { /* offline */ }
  });
  el.querySelector('.atable tbody')?.closest('.card');
  el.querySelectorAll('[data-coin]').forEach((r) => { r.onclick = () => { location.hash = `#/coin/${r.dataset.coin}`; }; });
  return market.subscribe(() => {
    const t = liveTotals(s);
    setLive($('#k-all', el), usd(t.all), t.all);
    setLive($('#k-inv', el), usd(t.investment), t.investment);
    setLive($('#k-loan', el), usd(t.loan), t.loan);
    for (const c of coins) {
      const tk = market.getTicker(c); if (!tk) continue;
      setLive(el.querySelector(`[data-p="${c}"]`), price(tk.price), tk.price);
      const ch = el.querySelector(`[data-ch="${c}"]`); if (ch) { ch.className = `chg sm ${tk.change > 0 ? 'up' : tk.change < 0 ? 'down' : ''}`; ch.textContent = pct(tk.change); }
    }
  });
}

// Phone: full admin menu (dark list).
async function menu(el, _sub, head) {
  mount(el, html`<div class="stack">${head('Admin menu', 'Everything you can manage')}
    <div class="amenu">${ADMIN_NAV.map(([k, l, ic]) => html`<a class="amenu-row" href="#/admin/${k === 'dashboard' ? '' : k}" data-admin="${k}">${icon(ic)}<span class="grow">${l}</span><em class="abadge hidden" data-badge="${k}"></em>${icon('back', 'flip')}</a>`)}
      <a class="amenu-row" href="#/admin/invites" data-admin="invites">${icon('mail')}<span class="grow">Invites</span>${icon('back', 'flip')}</a>
      <a class="amenu-row exit" href="#/home">${icon('back')}<span class="grow">Back to app</span></a></div></div>`);
  refreshBadges();
}

// ---------- Users ----------
async function users(el, _sub, head, filter = 'all', q = '') {
  const { rows } = await api.get('/admin/users', { fresh: true });
  const waiting = rows.filter((u) => u.status === 'pending').length;
  const list = rows.filter((u) => (filter === 'all' || u.status === filter) && (!q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())));
  mount(el, html`<div class="stack">
    ${head('Users', `${rows.length} accounts`, html`<a class="btn sm" href="#/admin/invites" data-admin="invites">${icon('plus')} Invite</a>`)}
    <div class="toolbar">${tabsBar([['all', 'All'], ['pending', 'Waiting', waiting], ['active', 'Active'], ['restricted', 'Restricted'], ['disabled', 'Disabled']], filter)}
      <input class="input sm search" id="uq" placeholder="Search name or email" value="${q}" aria-label="Search users"></div>
    <div class="card pad-0 rows">${list.length ? list.map((u) => html`<div class="arow">
      ${avatar(u)}<div class="grow arow-main"><b>${u.name}</b><small>${u.email}</small>
        <div class="chips"><span class="chip ${STATUS_CHIP[u.status]}">${u.status}</span>${u.role !== 'user' ? html`<span class="chip brand">${u.role.replace('_', ' ')}</span>` : html`<span class="chip ${KYC_CHIP[u.kyc_status][0]}">KYC: ${KYC_CHIP[u.kyc_status][1]}</span>`}</div></div>
      <div class="arow-nums hide-s"><span>Deposit</span><b class="num">${usd(u.deposit_amount)}</b><span>Salary</span><b class="num">${usd(u.salary)}</b></div>
      <div class="arow-act">${u.status === 'pending' ? html`<button class="btn success sm" data-approve="${u.id}">Approve</button>` : ''}
        ${['submitted', 'review'].includes(u.kyc_status) ? html`<a class="btn sm" href="#/admin/kyc/${u.id}">Review KYC</a>` : ''}
        <button class="btn ghost sm" data-edit="${u.id}">Manage</button></div></div>`) : empty('No users here', 'users')}</div></div>`);
  $('#uq', el).oninput = (e) => {
    clearTimeout(el._t);
    el._t = setTimeout(() => users(el, _sub, head, filter, e.target.value).then(() => { const i = $('#uq', el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }), 250);
  };
  el.onclick = async (e) => {
    const f = e.target.closest('[data-f]'); if (f) { users(el, _sub, head, f.dataset.f, q); return; }
    const a = e.target.closest('[data-approve]');
    if (a) { await busy(a, async () => { await api.post(`/admin/users/${a.dataset.approve}/approve`); toast('User approved'); await users(el, _sub, head, filter, q); refreshBadges(); }); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) editUser(rows.find((u) => u.id === Number(ed.dataset.edit)), () => users(el, _sub, head, filter, q));
  };
}

function editUser(u, done) {
  const superAdmin = state.me.role === 'super_admin';
  const m = modal({
    title: u.name,
    wide: true,
    body: html`<div class="grid g2">
      <div class="stack">
        <div class="item-card"><div class="row" style="gap:12px">${avatar(u, 'lg')}<div><b style="font-size:17px">${u.name}</b><div class="faint">${u.role.replace('_', ' ')} · since ${date(u.member_since)}</div>
          <div class="chips" style="margin-top:6px"><span class="chip ${STATUS_CHIP[u.status]}">${u.status}</span>${u.role === 'user' ? html`<span class="chip ${KYC_CHIP[u.kyc_status][0]}">KYC: ${KYC_CHIP[u.kyc_status][1]}</span>` : ''}</div></div></div></div>
        <div class="item-card"><div class="card-head"><h3>Private details</h3><span class="chip">${icon('shield')} Admins only</span></div>
          <div class="info-grid one"><div><span>Email</span><b>${u.email} ${u.email_verified ? '✓' : '(not verified)'}</b></div>
          <div><span>Phone</span><b>${u.phone || '—'}</b></div><div><span>Address</span><b>${u.address || '—'}</b></div>
          <div><span>Login</span><b>${[u.has_password && 'Password', u.google_linked && 'Google', u.totp_enabled && '2-step'].filter(Boolean).join(' + ') || '—'}</b></div></div></div>
        <div class="item-card pad-0"><div class="card-head pad"><h3>Payment methods</h3></div>
          ${u.payment_methods.length ? u.payment_methods.map((pm) => html`<div class="list-item">${methodLogo(pm.type)}<div class="grow"><div class="t">${METHOD_NAMES[pm.type]} ${pm.is_default ? html`<span class="chip brand">Default</span>` : ''}</div>
            <div class="s" style="user-select:all">${pm.account}${pm.network ? ` · ${pm.network}` : ''}${pm.holder ? ` · ${pm.holder}` : ''}</div></div></div>`) : empty('No payment methods added')}</div>
      </div>
      <form class="form form-grid" id="uf">
        ${field({ name: 'name', label: 'Name', required: true }, u.name)}
        ${field({ name: 'deposit_amount', label: 'Deposit amount (USD)', type: 'number', step: '0.01', required: true, half: true }, u.deposit_amount)}
        ${field({ name: 'deposit_date', label: 'Deposit date', type: 'date', half: true }, u.deposit_date)}
        ${field({ name: 'salary', label: 'Monthly salary (USD)', type: 'number', step: '0.01', required: true, hint: 'Paid on the monthly payment date.' }, u.salary)}
        ${field({ name: 'status', label: 'Account status', type: 'select', options: [['pending', 'Pending approval'], ['active', 'Active'], ['restricted', 'Restricted'], ['disabled', 'Disabled (cannot log in)']], required: true }, u.status)}
        ${superAdmin && u.id !== state.me.id ? field({ name: 'role', label: 'Role', type: 'select', options: [['user', 'User'], ['admin', 'Admin'], ['super_admin', 'Super Admin']], required: true }, u.role) : ''}
        <label class="check"><input type="checkbox" name="deposit_received" ${u.deposit_received_at ? 'checked' : ''}><span>Deposit received${u.deposit_received_at ? ` (${date(u.deposit_received_at)})` : ''}</span></label>
        <div class="form-error hidden" id="uerr"></div>
      </form></div>`,
    foot: html`<button class="btn ghost" data-close>Cancel</button><button class="btn" id="usave">Save changes</button>`,
  });
  const btn = $('#usave', m.el);
  btn.onclick = () => busy(btn, async () => {
    const v = formValues($('#uf', m.el));
    await api.put(`/admin/users/${u.id}`, {
      name: v.name, deposit_amount: v.deposit_amount, deposit_date: v.deposit_date || null, salary: v.salary, status: v.status,
    });
    if (v.role && v.role !== u.role) await api.put(`/admin/users/${u.id}/role`, { role: v.role });
    if (v.deposit_received !== !!u.deposit_received_at) await api.post(`/admin/users/${u.id}/deposit-received`, { received: v.deposit_received });
    m.close(); toast('User saved'); done();
  }, $('#uerr', m.el));
}

// ---------- KYC (mockup: Pending / Approved / Rejected tabs, View · Approve · Reject per row) ----------
function matchLabel(d) {
  if (d === null || d === undefined) return ['', 'No face check'];
  if (d <= 0.4) return ['up', 'Strong match'];
  if (d <= 0.55) return ['up', 'Match'];
  return ['down', 'No match'];
}
const PROMPT_LABEL = {
  look_left: 'Look left', look_right: 'Look right', look_up: 'Look up', nod_down: 'Nod your head down',
  smile: 'Smile', blink: 'Blink', eyes_closed: 'Close your eyes, then open',
};
const maskId = (id) => `ID: ******${String(id).padStart(4, '0').slice(-4)}`;

async function approveKyc(u, after) {
  if (!await confirmDialog(`Approve ${u.name}?`, 'They will get an email and can open the dashboard.', { okLabel: 'Approve' })) return;
  await api.post(`/admin/kyc/${u.id}/approve`);
  toast(`${u.name} approved`);
  refreshBadges();
  after();
}
function rejectKyc(u, resubmit, after) {
  formModal({
    title: resubmit ? `Ask ${u.name} to redo` : `Reject ${u.name}`,
    okLabel: resubmit ? 'Send request' : 'Reject',
    fields: [{ name: 'reason', label: 'Reason (sent to the member)', type: 'textarea', required: true, default: resubmit ? 'The ID card photo is blurry. Please retake it in good light.' : '' }],
    submit: async (v) => { await api.post(`/admin/kyc/${u.id}/reject`, { reason: v.reason, resubmit }); toast(resubmit ? 'Request sent' : 'Verification rejected'); refreshBadges(); after(); },
  });
}

async function kyc(el, sub, head, filter = 'pending') {
  if (sub[0]) return kycReview(el, Number(sub[0]), head);
  const [{ rows }, o] = await Promise.all([api.get(`/admin/kyc?status=${filter}`, { fresh: true }), api.get('/admin/overview', { fresh: true })]);
  mount(el, html`<div class="stack">
    ${head('KYC Verification', 'Check ID cards and live faces')}
    ${tabsBar([['pending', 'Pending', o.kyc.pending], ['approved', 'Approved'], ['rejected', 'Rejected'], ['security', 'Security', o.kyc.held], ['waiting', 'Not started']], filter)}
    <div class="card pad-0 rows">${rows.length ? rows.map((u) => {
    const [mc, ml] = matchLabel(u.match_distance);
    return html`<div class="arow">${avatar(u)}
        <div class="grow arow-main"><b>${u.name}</b><small>${maskId(u.id)}</small><small class="faint">${u.kyc_submitted_at ? `Submitted ${ago(u.kyc_submitted_at)}` : u.email}</small>
          <div class="chips">${u.match_distance != null ? html`<span class="chip ${mc}">${ml}</span>` : ''}${u.reverify_reason ? html`<span class="chip down">${u.status === 'restricted' ? 'On hold' : 'Re-check'}: ${u.reverify_reason}</span>` : ''}</div></div>
        <div class="arow-act"><a class="btn ghost sm" href="#/admin/kyc/${u.id}">View</a>
          ${['submitted', 'review'].includes(u.kyc_status) ? html`<button class="btn success sm" data-ok="${u.id}">Approve</button><button class="btn danger-soft sm" data-no="${u.id}">Reject</button>` : ''}</div></div>`;
  }) : empty(filter === 'pending' ? 'No verifications waiting' : 'Nothing here', 'shield')}</div></div>`);
  const again = () => kyc(el, [], head, filter);
  el.onclick = (e) => {
    const f = e.target.closest('[data-f]'); if (f) { kyc(el, [], head, f.dataset.f); return; }
    const ok = e.target.closest('[data-ok]'); if (ok) { approveKyc(rows.find((u) => u.id === Number(ok.dataset.ok)), again); return; }
    const no = e.target.closest('[data-no]'); if (no) rejectKyc(rows.find((u) => u.id === Number(no.dataset.no)), false, again);
  };
}

async function kycReview(el, id, head) {
  const d = await api.get(`/admin/kyc/${id}`, { fresh: true });
  const u = d.user; const p = d.profile; const live = p?.liveness;
  const [mc, ml] = matchLabel(p?.match_distance);
  const img = (kind, label) => html`<figure class="kyc-img">${d.files.includes(kind)
    ? html`<a href="/api/admin/kyc/${u.id}/file/${kind}" target="_blank" rel="noopener"><img src="/api/admin/kyc/${u.id}/file/${kind}" alt="${label}" loading="lazy"></a>`
    : html`<div class="kyc-missing">${icon('camera')}<span>Not provided</span></div>`}<figcaption>${label}</figcaption></figure>`;
  mount(el, html`<div class="stack">
    ${head('KYC Review', u.name, html`<a class="btn ghost sm" href="#/admin/kyc">${icon('back')} All</a>`)}
    <div class="card"><div class="row wrap" style="gap:14px">${avatar(u, 'lg')}<div class="grow"><b style="font-size:18px">${u.name}</b><div class="faint">${u.email}${u.phone ? ` · ${u.phone}` : ''} · ${maskId(u.id)}</div>
      <div class="chips" style="margin-top:6px"><span class="chip ${KYC_CHIP[u.kyc_status][0]}">${KYC_CHIP[u.kyc_status][1]}</span><span class="chip ${mc}">${ml}${p?.match_distance != null ? ` · ${Number(p.match_distance).toFixed(3)}` : ''}</span>
      ${u.kyc_submitted_at ? html`<span class="chip">Submitted ${dateTime(u.kyc_submitted_at)}</span>` : ''}</div>
      ${u.kyc_note ? html`<div class="note-bar mt-s">${icon('shield')}<span>${u.kyc_note}</span></div>` : ''}</div></div></div>
    ${u.reverify_reason ? html`<div class="note-bar ${u.status === 'restricted' ? 'warn' : ''}">${icon('shield')}<span><b>${u.status === 'restricted' ? 'Account on hold' : 'Security face re-check pending'}:</b> ${u.reverify_reason}${u.reverify_fails ? ` · ${u.reverify_fails} failed tries` : ''}</span>
      <button class="btn sm" id="k-clear">${u.status === 'restricted' ? 'Lift hold' : 'Skip check'}</button></div>` : ''}
    <div class="kyc-images">${img('id_front', 'ID card · front')}${img('id_back', 'ID card · back')}${img('face', 'Live face')}</div>
    <div class="grid g2">
      <div class="card"><div class="card-head"><h3>Liveness check</h3>${live ? html`<span class="chip ${live.timing_ok && live.same_face ? 'up' : 'down'}">${live.timing_ok && live.same_face ? 'Passed' : 'Check carefully'}</span>` : ''}</div>
        ${live ? html`<div class="stack" style="gap:8px">${live.steps.map((s) => html`<div class="row between"><span class="row" style="gap:8px"><span class="dot-ic up sm">${icon('check')}</span>${PROMPT_LABEL[s.prompt] || s.prompt}</span><span class="faint num">${(s.ms / 1000).toFixed(1)}s</span></div>`)}
          <div class="faint small">Same face throughout: <b>${live.same_face ? 'yes' : 'no'}</b> · Human-speed timing: <b>${live.timing_ok ? 'yes' : 'no'}</b></div>
          <div class="faint small ellipsis" title="${live.device}">Device: ${live.device}</div></div>` : empty('No face check yet', 'shield')}</div>
      <div class="card pad-0"><div class="card-head pad"><h3>Attempt log</h3></div>
        <div class="scroll-y">${d.events.length ? d.events.map((ev) => html`<div class="list-item"><div class="grow"><div class="t small">${ev.kind.replace(/_/g, ' ')} <span class="chip ${/fail|mismatch|rejected|locked/.test(ev.result || '') ? 'down' : /match|approved|uploaded|ok|issued|passed/.test(ev.result || '') ? 'up' : ''}">${ev.result}</span></div>
          <div class="s">${dateTime(ev.created_at)} · ${ev.ip || ''}${ev.detail?.distance != null ? ` · distance ${Number(ev.detail.distance).toFixed(3)}` : ''}${ev.detail?.reason ? ` · ${ev.detail.reason}` : ''}</div></div></div>`) : empty('No attempts yet')}</div></div>
    </div>
    <div class="action-bar">
      <button class="btn ghost-danger" id="k-del">${icon('trash')} Delete data</button><span class="grow"></span>
      <button class="btn ghost" id="k-redo">Ask to redo</button>
      <button class="btn danger" id="k-rej">${icon('x')} Reject</button>
      <button class="btn success" id="k-ok">${icon('check')} Approve</button>
    </div>
    <p class="faint small">Viewing these images is recorded in the activity log. Approving also activates the member's account.</p>
  </div>`);
  const reload = () => kycReview(el, id, head);
  $('#k-ok', el).onclick = () => approveKyc(u, reload);
  $('#k-redo', el).onclick = () => rejectKyc(u, true, reload);
  $('#k-rej', el).onclick = () => rejectKyc(u, false, reload);
  $('#k-clear', el)?.addEventListener('click', async () => {
    if (!await confirmDialog('Clear the security check?', `${u.name} will be able to use the app again without the face re-check.`, { okLabel: 'Clear' })) return;
    await api.post(`/admin/kyc/${id}/clear-reverify`); toast('Cleared'); refreshBadges(); reload();
  });
  $('#k-del', el).onclick = async () => {
    if (!await confirmDialog('Delete KYC data?', `This permanently deletes ${u.name}'s ID photos, face photo and face templates. They must verify again.`, { okLabel: 'Delete', danger: true })) return;
    await api.del(`/admin/kyc/${id}/data`); toast('KYC data deleted'); reload();
  };
}

// ---------- Payments (pay any member) ----------
async function payments(el, _sub, head, month = thisMonth()) {
  const [d, sched] = await Promise.all([api.get(`/admin/payments?month=${month}`, { fresh: true }), api.get('/schedule', { fresh: true })]);
  const rows = d.rows;
  const s = sched.rows.find((r) => r.month === month);
  const months = [];
  for (let i = -6; i <= 3; i += 1) { const x = new Date(`${thisMonth()}-01T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + i); months.push(x.toISOString().slice(0, 7)); }
  const paid = rows.filter((r) => r.status === 'paid');
  const due = rows.filter((r) => r.status !== 'paid');
  const paidAmt = paid.reduce((a, r) => a + r.amount, 0);
  const dueAmt = due.reduce((a, r) => a + (r.amount || 0), 0);
  const defMethod = (r) => r.payment_methods.find((x) => x.is_default) || r.payment_methods[0];
  mount(el, html`<div class="stack">
    ${head('Payments', 'Set the payment date and mark members as paid', html`<select class="input sm" id="pm" aria-label="Month">${months.reverse().map((m) => html`<option value="${m}" ${m === month ? 'selected' : ''}>${monthName(m)}</option>`)}</select>`)}
    <div class="grid g2">
      <div class="card"><div class="card-head"><h3>${icon('calendar')} Payment date · ${monthName(month)}</h3><span class="chip ${s ? 'brand' : 'warn'}">${s ? `${ordinal(Number(s.pay_date.slice(8, 10)))}` : 'Not set'}</span></div>
        <form class="form form-grid" id="sf">
          <div class="field half"><label for="s-date">Date</label><input class="input" type="date" id="s-date" name="pay_date" value="${s?.pay_date || `${month}-20`}" required></div>
          <div class="field half"><label for="s-note">Note <span class="faint">(optional)</span></label><input class="input" id="s-note" name="note" value="${s?.note || ''}" placeholder="e.g. after the holiday"></div>
          <button class="btn block" type="submit">${s ? 'Change date and notify' : 'Set date and notify'}</button>
        </form>
        <p class="faint small" style="margin:10px 0 0">Everyone gets an email, push and in-app notice. Reminders go out 3 days before, 1 day before and on the day.</p></div>
      <div class="card"><div class="card-head"><h3>Summary</h3></div>
        <div class="big-num num">${usd(paidAmt)}</div><div class="faint">paid of ${usd(paidAmt + dueAmt)}</div>
        <div class="progress"><span style="width:${paidAmt + dueAmt ? Math.round((paidAmt / (paidAmt + dueAmt)) * 100) : 0}%"></span></div>
        <div class="mini-kv mt"><div><span>Paid</span><b class="up">${paid.length}</b></div><div><span>Not paid yet</span><b class="${due.length ? 'down' : ''}">${due.length}</b></div></div></div>
    </div>
    <div class="card pad-0 rows">${rows.length ? rows.map((r) => {
    const m = defMethod(r);
    return html`<div class="arow">${avatar(r)}
      <div class="grow arow-main"><b>${r.name}</b>
        <small>${r.status === 'paid' ? `${METHOD_NAMES[r.method] || r.method} · ${dateTime(r.paid_at)}` : m ? html`Send to <b>${METHOD_NAMES[m.type]}</b> <span class="mono" style="user-select:all">${m.account}</span>${m.network ? ` (${m.network})` : ''}` : html`<span class="down">No payment method on file</span>`}</small></div>
      <div class="arow-nums"><b class="num">${r.amount ? usd(r.amount) : html`<span class="faint">No salary</span>`}</b><span class="chip ${r.status === 'paid' ? 'up' : 'warn'}">${r.status === 'paid' ? 'Paid' : 'Pending'}</span></div>
      <div class="arow-act">${r.status === 'paid'
    ? html`<button class="btn ghost sm" data-unpaid="${r.id}">Undo</button>`
    : html`<button class="btn success sm" data-pay="${r.user_id}">${icon('check')} Pay</button>`}</div></div>`;
  }) : empty('No active members yet', 'users')}</div></div>`);

  $('#pm', el).onchange = (e) => payments(el, _sub, head, e.target.value);
  $('#sf', el).onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      await api.put('/admin/schedule', { month, ...formValues(e.target) });
      toast('Payment date saved and members notified'); payments(el, _sub, head, month);
    });
  };
  el.onclick = async (e) => {
    const un = e.target.closest('[data-unpaid]');
    if (un) {
      if (await confirmDialog('Mark as not paid?', 'The payment will show as Pending again.', { okLabel: 'Mark pending' })) { await api.post(`/admin/payments/${un.dataset.unpaid}/unpaid`); payments(el, _sub, head, month); }
      return;
    }
    const pay = e.target.closest('[data-pay]'); if (!pay) return;
    const r = rows.find((x) => x.user_id === Number(pay.dataset.pay));
    const m = defMethod(r);
    formModal({
      title: `Pay ${r.name}`,
      okLabel: 'Mark as paid',
      intro: m ? html`<div class="send-to">${methodLogo(m.type)}<span>Send to <b>${METHOD_NAMES[m.type]}</b><br><span class="mono" style="user-select:all">${m.account}</span>${m.network ? ` · ${m.network}` : ''}${m.holder ? ` · ${m.holder}` : ''}</span></div>` : html`<div class="note-bar warn">${icon('shield')}<span>${r.name} has not added a payment method yet.</span></div>`,
      fields: [
        { name: 'amount', label: 'Amount (USD)', type: 'number', step: '0.01', required: true, default: r.amount || r.salary || '', half: true },
        { name: 'method', label: 'Method', type: 'select', required: true, options: Object.entries(METHOD_NAMES), default: m?.type || 'bkash', half: true },
        { name: 'paid_at', label: 'Paid on', type: 'datetime-local', required: true, default: nowLocal() },
        { name: 'note', label: 'Note / transaction ID' },
      ],
      submit: async (v) => { await api.post('/admin/payments/pay', { ...v, user_id: r.user_id, month }); toast(`${r.name} marked Paid and notified`); payments(el, _sub, head, month); refreshBadges(); },
    });
  };
}

// ---------- Deposits ----------
async function deposits(el, _sub, head) {
  const { rows } = await api.get('/admin/users?status=active', { fresh: true });
  const total = rows.reduce((a, u) => a + u.deposit_amount, 0);
  const got = rows.filter((u) => u.deposit_received_at).reduce((a, u) => a + u.deposit_amount, 0);
  mount(el, html`<div class="stack">
    ${head('Deposits', 'Each member\'s deposit amount, due date and status')}
    <div class="kpis three">
      <div class="kpi"><span class="kpi-ic brand">${icon('download')}</span><div class="kpi-body"><span class="kpi-l">Total deposits</span><b class="kpi-v num">${usd(total)}</b></div></div>
      <div class="kpi"><span class="kpi-ic green">${icon('check')}</span><div class="kpi-body"><span class="kpi-l">Received</span><b class="kpi-v num up">${usd(got)}</b></div></div>
      <div class="kpi"><span class="kpi-ic amber">${icon('clock')}</span><div class="kpi-body"><span class="kpi-l">Still due</span><b class="kpi-v num">${usd(total - got)}</b></div></div>
    </div>
    <div class="card pad-0 rows">${rows.length ? rows.map((u) => html`<div class="arow">${avatar(u)}
      <div class="grow arow-main"><b>${u.name}</b><small>Due ${date(u.deposit_date)}</small></div>
      <div class="arow-nums"><b class="num">${usd(u.deposit_amount)}</b><span class="chip ${u.deposit_received_at ? 'up' : 'warn'}">${u.deposit_received_at ? `Received ${date(u.deposit_received_at)}` : 'Not received'}</span></div>
      <div class="arow-act"><button class="btn ghost sm" data-dep="${u.id}">Edit</button>
        <button class="btn ${u.deposit_received_at ? 'ghost' : 'success'} sm" data-rcv="${u.id}">${u.deposit_received_at ? 'Undo' : 'Received'}</button></div></div>`) : empty('No members yet', 'users')}</div></div>`);
  el.onclick = async (e) => {
    const r = e.target.closest('[data-rcv]');
    if (r) {
      const u = rows.find((x) => x.id === Number(r.dataset.rcv));
      await busy(r, async () => { await api.post(`/admin/users/${u.id}/deposit-received`, { received: !u.deposit_received_at }); toast(u.deposit_received_at ? 'Marked as not received' : 'Deposit received · member emailed'); deposits(el, _sub, head); });
      return;
    }
    const d = e.target.closest('[data-dep]'); if (!d) return;
    const u = rows.find((x) => x.id === Number(d.dataset.dep));
    formModal({
      title: `Deposit · ${u.name}`,
      fields: [{ name: 'deposit_amount', label: 'Amount (USD)', type: 'number', step: '0.01', required: true, half: true }, { name: 'deposit_date', label: 'Due date', type: 'date', half: true }],
      values: u,
      submit: async (v) => { await api.put(`/admin/users/${u.id}`, { deposit_amount: v.deposit_amount, deposit_date: v.deposit_date || null }); toast('Saved'); deposits(el, _sub, head); },
    });
  };
}

// ---------- Trades / investments / loans ----------
const CRUD = {
  trades: {
    title: 'Trade', head: ['Trading', 'Add trades: profit, loss and fees. Results flow into the Main Balance.'],
    fields: [
      { name: 'coin', label: 'Coin', required: true, hint: 'Ticker, e.g. BTC, SOL, PEPE', half: true },
      { name: 'side', label: 'Side', type: 'select', options: [['spot', 'Spot'], ['long', 'Long'], ['short', 'Short']], required: true, half: true },
      { name: 'profit', label: 'Profit (USD, minus for loss)', type: 'number', step: '0.01', required: true, half: true },
      { name: 'fee', label: 'Fee (USD)', type: 'number', step: '0.01', default: 0, half: true },
      { name: 'traded_at', label: 'Date and time', type: 'datetime-local', required: true, default: () => nowLocal() },
      { name: 'note', label: 'Note' },
    ],
    row: (t) => html`${coinIcon(t.coin)}<div class="grow arow-main"><b>${t.coin} <span class="chip">${t.side}</span></b><small>${dateTime(t.traded_at)}${t.note ? ` · ${t.note}` : ''}</small></div>
      <div class="arow-nums"><b class="num ${cls(t.profit - t.fee)}">${pnlText(t.profit - t.fee)}</b><span class="faint small">fee ${usd(t.fee)}</span></div>`,
  },
  investments: {
    title: 'Investment', head: ['Investments', 'Main Flow Invest holdings (live value on the member side)'],
    fields: [
      { name: 'coin', label: 'Coin', required: true, half: true },
      { name: 'status', label: 'Status', type: 'select', options: [['open', 'Open'], ['closed', 'Closed']], required: true, half: true },
      { name: 'quantity', label: 'Quantity', type: 'number', step: 'any', required: true, half: true },
      { name: 'entry_price', label: 'Entry price (USD)', type: 'number', step: 'any', required: true, half: true },
      { name: 'invested_at', label: 'Date', type: 'date', required: true, default: () => today() },
      { name: 'note', label: 'Note' },
    ],
    row: (x) => html`${coinIcon(x.coin)}<div class="grow arow-main"><b>${x.coin} <span class="chip ${x.status === 'open' ? 'up' : ''}">${x.status}</span></b><small class="num">${qty(x.quantity)} @ ${price(x.entry_price)} · ${date(x.invested_at)}</small></div>
      <div class="arow-nums"><b class="num">${usd(x.quantity * x.entry_price)}</b><span class="faint small">cost</span></div>`,
  },
  loans: {
    title: 'Loan', head: ['Loan Monitor', 'Borrowed USD and coins, repayment dates'],
    fields: [
      { name: 'kind', label: 'Loan type', type: 'select', options: [['usd', 'USD loan'], ['coin', 'Coin loan']], required: true, half: true },
      { name: 'status', label: 'Status', type: 'select', options: [['open', 'Open'], ['repaid', 'Repaid']], required: true, half: true },
      { name: 'coin', label: 'Coin', required: true, coinOnly: true, half: true },
      { name: 'quantity', label: 'Quantity borrowed', type: 'number', step: 'any', required: true, coinOnly: true, half: true },
      { name: 'entry_price', label: 'Price when borrowed (USD)', type: 'number', step: 'any', required: true, coinOnly: true },
      { name: 'amount_usd', label: 'Amount (USD)', type: 'number', step: '0.01', hint: 'Coin loans: empty = quantity × price.', half: true },
      { name: 'remaining_usd', label: 'Remaining (USD)', type: 'number', step: '0.01', hint: 'Empty = full amount.', half: true },
      { name: 'lender', label: 'Lender' },
      { name: 'borrowed_at', label: 'Borrowed on', type: 'date', required: true, default: () => today(), half: true },
      { name: 'repay_date', label: 'Repayment date', type: 'date', half: true },
      { name: 'note', label: 'Note' },
    ],
    row: (l) => html`${l.kind === 'coin' ? coinIcon(l.coin) : html`<span class="coin-ico" style="background:#26a17b">USD</span>`}
      <div class="grow arow-main"><b>${l.kind === 'coin' ? `${qty(l.quantity)} ${l.coin}` : 'USD loan'} <span class="chip ${l.status === 'open' ? 'warn' : 'up'}">${l.status}</span></b><small>${l.lender || 'Loan'} · repay by ${date(l.repay_date)}</small></div>
      <div class="arow-nums"><b class="num">${usd(l.remaining_usd)}</b><span class="faint small">of ${usd(l.amount_usd)}</span></div>`,
    onChange: (form) => {
      const coin = form.elements.kind.value === 'coin';
      CRUD.loans.fields.filter((f) => f.coinOnly).forEach((f) => {
        $(`[data-field="${f.name}"]`, form).classList.toggle('hidden', !coin);
        form.elements[f.name].required = coin;
      });
    },
  },
};

function crudView(table) {
  const def = CRUD[table];
  const view = async (el, _sub, head, pageNo = 1) => {
    const d = table === 'trades' ? await api.get(`/trades?page=${pageNo}&limit=25`, { fresh: true }) : await api.get(`/${table}`, { fresh: true });
    const rows = d.rows;
    const open = (r) => formModal({
      title: r ? `Edit ${def.title.toLowerCase()}` : `Add ${def.title.toLowerCase()}`,
      fields: def.fields.map((f) => ({ ...f, default: typeof f.default === 'function' ? f.default() : f.default })),
      values: r || {},
      onChange: def.onChange,
      submit: async (v) => {
        if (r) await api.put(`/admin/${table}/${r.id}`, v); else await api.post(`/admin/${table}`, v);
        toast(`${def.title} saved`); view(el, _sub, head, pageNo);
      },
    });
    const pages = table === 'trades' ? Math.max(1, Math.ceil(d.total / d.limit)) : 1;
    mount(el, html`<div class="stack">
      ${head(def.head[0], def.head[1], html`<button class="btn sm" id="add">${icon('plus')} Add ${def.title.toLowerCase()}</button>`)}
      ${table === 'trades' && d.sums ? html`<div class="kpis three">
        <div class="kpi"><span class="kpi-ic brand">${icon('history')}</span><div class="kpi-body"><span class="kpi-l">Trades</span><b class="kpi-v num">${d.total}</b></div></div>
        <div class="kpi"><span class="kpi-ic green">${icon('invest')}</span><div class="kpi-body"><span class="kpi-l">Net result</span><b class="kpi-v num ${cls(d.sums.net)}">${pnlText(d.sums.net)}</b></div></div>
        <div class="kpi"><span class="kpi-ic red">${icon('x')}</span><div class="kpi-body"><span class="kpi-l">Total loss</span><b class="kpi-v num down">${usd(d.sums.loss)}</b></div></div></div>` : ''}
      <div class="card pad-0 rows">${rows.length ? rows.map((r) => html`<div class="arow">${def.row(r)}
        <div class="arow-act"><button class="btn ghost sm" data-ed="${r.id}">Edit</button><button class="btn ghost sm icon-only" data-del="${r.id}" aria-label="Delete">${icon('trash')}</button></div></div>`) : empty(`No ${table} yet. Tap Add to create one.`, 'plus')}
      ${pages > 1 ? html`<div class="row between pad"><span class="faint">Page ${pageNo} of ${pages}</span><span class="row">
        <button class="btn ghost sm" data-page="${pageNo - 1}" ${pageNo <= 1 ? raw('disabled') : ''}>Previous</button><button class="btn ghost sm" data-page="${pageNo + 1}" ${pageNo >= pages ? raw('disabled') : ''}>Next</button></span></div>` : ''}</div></div>`);
    $('#add', el).onclick = () => open(null);
    el.onclick = async (e) => {
      const pg = e.target.closest('[data-page]'); if (pg) { view(el, _sub, head, Number(pg.dataset.page)); return; }
      const ed = e.target.closest('[data-ed]'); if (ed) { open(rows.find((r) => r.id === Number(ed.dataset.ed))); return; }
      const del = e.target.closest('[data-del]');
      if (del && await confirmDialog(`Delete ${def.title.toLowerCase()}?`, 'This cannot be undone. The deletion is recorded in the activity log.', { okLabel: 'Delete', danger: true })) {
        await api.del(`/admin/${table}/${del.dataset.del}`); toast('Deleted'); view(el, _sub, head, pageNo);
      }
    };
  };
  return view;
}

// ---------- Invites ----------
async function invites(el, _sub, head) {
  const { rows } = await api.get('/admin/invites', { fresh: true });
  mount(el, html`<div class="stack">
    ${head('Invites', 'Invite links skip account approval. Members still do KYC.', html`<button class="btn sm" id="new">${icon('plus')} New invite</button>`)}
    <div class="card pad-0 rows">${rows.length ? rows.map((i) => html`<div class="arow"><span class="kpi-ic brand">${icon('mail')}</span>
      <div class="grow arow-main"><b class="mono">${i.code}</b><small>${i.email ? `Only for ${i.email} · ` : ''}${i.used_by ? `Used by ${i.used_by_name || 'deleted user'} on ${date(i.used_at)}` : `Expires ${date(i.expires_at)}`}</small></div>
      <div class="arow-act">${i.used_by ? html`<span class="chip up">Used</span>` : html`<button class="btn ghost sm" data-copy="${i.code}">Copy link</button><button class="btn ghost sm icon-only" data-del="${i.code}" aria-label="Delete">${icon('trash')}</button>`}</div></div>`) : empty('No invites yet', 'mail')}</div></div>`);
  $('#new', el).onclick = () => formModal({
    title: 'New invite', okLabel: 'Create invite',
    fields: [{ name: 'email', label: 'Only for this email', type: 'email' }, { name: 'days', label: 'Valid for (days)', type: 'number', default: 14 }],
    submit: async (v) => {
      const r = await api.post('/admin/invites', v);
      await navigator.clipboard?.writeText(r.link).catch(() => {});
      toast(`Invite ${r.code} created, link copied`); invites(el, _sub, head);
    },
  });
  el.onclick = async (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) { await navigator.clipboard?.writeText(`${location.origin}/#/signup?invite=${c.dataset.copy}`).catch(() => {}); toast('Invite link copied'); }
    const d = e.target.closest('[data-del]');
    if (d) { await api.del(`/admin/invites/${d.dataset.del}`); invites(el, _sub, head); }
  };
}

// ---------- Notifications ----------
async function notices(el, _sub, head) {
  const d = await api.get('/notifications', { fresh: true });
  mount(el, html`<div class="stack">
    ${head('Notifications', 'Send a notice to every member (in-app + push)')}
    <div class="grid g2">
      <div class="card"><form class="form" id="bc">
        ${field({ name: 'title', label: 'Title', required: true })}${field({ name: 'body', label: 'Message', type: 'textarea', required: true })}
        <button class="btn block" type="submit">${icon('bell')} Send to everyone</button></form></div>
      <div class="card pad-0"><div class="card-head pad"><h3>Recent</h3></div>${d.rows.slice(0, 12).map((n) => html`<div class="list-item"><span class="dot-ic brand sm">${icon('bell')}</span><div class="grow"><div class="t small">${n.title}</div><div class="s">${n.body}</div></div><span class="faint small">${ago(n.created_at)}</span></div>`)}</div>
    </div></div>`);
  $('#bc', el).onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => { await api.post('/admin/notify', formValues(e.target)); toast('Sent'); notices(el, _sub, head); });
  };
}

// ---------- Settings ----------
async function settings(el, _sub, head) {
  const s = await api.get('/admin/settings', { fresh: true });
  mount(el, html`<div class="stack">${head('Settings', 'Balances, coins, emails, logos and backup')}<div class="grid g2">
    <div class="stack">
      <div class="card"><div class="card-head"><h3>${icon('home')} Balances</h3></div><form class="form form-grid" id="bal">
        ${field({ name: 'main_base', label: 'Starting main balance (USD)', type: 'number', step: '0.01', required: true, hint: 'Main Balance = this + all trade results (after fees) − salaries paid.' }, s.balances.main_base)}
        ${field({ name: 'trading_capital', label: 'Trading balance (USD)', type: 'number', step: '0.01', required: true, hint: 'Capital currently in the trading account.' }, s.balances.trading_capital)}
        <div><button class="btn" type="submit">Save balances</button></div></form></div>
      <div class="card"><div class="card-head"><h3>${icon('download')} Standard deposit</h3></div><form class="form form-grid" id="dep">
        ${field({ name: 'amount', label: 'Amount (USD)', type: 'number', step: '0.01', required: true, half: true }, s.default_deposit.amount)}
        ${field({ name: 'date', label: 'Deposit date', type: 'date', half: true }, s.default_deposit.date)}
        <label class="check"><input type="checkbox" name="apply"><span>Also apply to all existing members</span></label>
        <div><button class="btn" type="submit">Save deposit</button></div></form></div>
      <div class="card"><div class="card-head"><h3>${icon('chart')} Watchlist coins</h3></div><form class="form" id="wl">
        ${field({ name: 'watchlist', label: 'Tickers, separated by commas', required: true, hint: 'Coins in investments, loans and trades are added automatically.' }, (s.watchlist || state.watchlist).join(', '))}
        <div><button class="btn" type="submit">Save watchlist</button></div></form></div>
    </div>
    <div class="stack">
      <div class="card"><div class="card-head"><h3>${icon('mail')} Email types</h3></div><form class="form" id="em">
        ${Object.entries(s.email_types).map(([k, t]) => html`<label class="switch-row"><span>${t.label}${t.locked ? html` <span class="faint">(always on)</span>` : ''}</span>
          <input type="checkbox" class="switch" name="${k}" ${t.locked || s.email_toggles[k] !== false ? 'checked' : ''} ${t.locked ? raw('disabled') : ''}></label>`)}
        <div><button class="btn" type="submit">Save email settings</button></div></form></div>
      <div class="card pad-0"><div class="card-head pad"><h3>Payment method logos</h3></div>
        ${Object.keys(METHOD_NAMES).map((t) => html`<div class="list-item">${methodLogo(t, s.method_logos)}<div class="grow t">${METHOD_NAMES[t]}</div>
          <label class="btn ghost sm">Upload<input type="file" class="hidden" accept="image/png,image/jpeg,image/svg+xml,image/webp" data-logo="${t}"></label></div>`)}
        <p class="faint small pad">PNG, JPG or SVG, up to 200 KB.</p></div>
      <div class="card"><div class="card-head"><h3>${icon('bell')} Push notifications</h3><span class="chip ${s.push_enabled ? 'up' : 'warn'}">${s.push_enabled ? 'Connected' : 'Not set up'}</span></div>
        <p class="faint small" style="margin:0">${s.push_enabled ? 'Phones with the Android app get every notification as a push message.' : 'Add the FCM_SERVICE_ACCOUNT environment variable (Firebase) to send push messages. Email and in-app notices work without it.'}</p></div>
      ${state.me.role === 'super_admin' ? html`<div class="card"><div class="card-head"><h3>${icon('download')} Backup</h3></div>
        <p class="faint small" style="margin:0 0 12px">Download the whole database as a compressed file. KYC files stay encrypted inside.</p>
        <a class="btn ghost" href="/api/admin/backup" download>${icon('download')} Download backup</a></div>` : ''}
    </div></div></div>`);
  const on = (id, fn) => { $(id, el).onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => { await fn(formValues(e.target), e.target); toast('Saved'); }); }; };
  on('#bal', (v) => api.put('/admin/settings', { balances: v }));
  on('#dep', (v) => api.put('/admin/settings', { default_deposit: { amount: v.amount, date: v.date || null }, apply_deposit_to_all: v.apply }));
  on('#wl', (v) => api.put('/admin/settings', { watchlist: v.watchlist }));
  on('#em', (v) => api.put('/admin/settings', { email_toggles: v }));
  el.onchange = async (e) => {
    const t = e.target.dataset?.logo; const f = e.target.files?.[0];
    if (!t || !f) return;
    try {
      const image = await readFileAsDataUrl(f);
      await api.put(`/admin/method-logos/${t}`, { image });
      toast(`${METHOD_NAMES[t]} logo updated`); settings(el, _sub, head);
    } catch (err) { toast(err.message, 'err'); }
  };
}

// ---------- Logs ----------
async function logs(el, _sub, head, kind = 'audit', pageNo = 1) {
  const d = await api.get(kind === 'security' ? `/admin/kyc/events/all?page=${pageNo}` : `/admin/${kind}?page=${pageNo}`, { fresh: true });
  const item = {
    audit: (r) => html`<div class="list-item"><span class="dot-ic brand sm">${icon('edit')}</span><div class="grow"><div class="t small">${r.actor_name || 'System'} <span class="chip">${r.action.replace(/_/g, ' ')}</span> ${r.entity ? html`<span class="faint">${r.entity} ${r.entity_id || ''}</span>` : ''}</div>
      <div class="s ellipsis" title="${r.details ? JSON.stringify(r.details) : ''}">${dateTime(r.created_at)}${r.details ? ` · ${JSON.stringify(r.details).slice(0, 140)}` : ''}</div></div></div>`,
    security: (r) => html`<a class="list-item link" href="#/admin/kyc/${r.user_id}"><span class="dot-ic ${/fail|mismatch|locked|rejected/.test(r.result || '') ? 'down' : /passed|approved|matched|uploaded|issued|ok/.test(r.result || '') ? 'up' : 'warn'} sm">${icon('shield')}</span><div class="grow"><div class="t small">${r.name} <span class="chip">${r.kind.replace(/_/g, ' ')}</span> <span class="faint">${r.result || ''}</span></div>
      <div class="s ellipsis">${dateTime(r.created_at)} · ${r.ip || ''}${r.detail?.reason ? ` · ${r.detail.reason}` : ''}${r.detail?.distance != null ? ` · distance ${Number(r.detail.distance).toFixed(3)}` : ''}</div></div></a>`,
    emails: (r) => html`<div class="list-item"><span class="dot-ic ${r.status === 'sent' ? 'up' : r.status === 'failed' ? 'down' : 'warn'} sm">${icon('mail')}</span><div class="grow"><div class="t small ellipsis">${r.subject}</div>
      <div class="s ellipsis" title="${r.last_error || ''}">${r.to_email} · ${dateTime(r.created_at)} · ${r.status}${r.attempts > 1 ? ` ×${r.attempts}` : ''}${r.last_error ? ` · ${r.last_error}` : ''}</div></div></div>`,
    logins: (r) => html`<div class="list-item"><span class="dot-ic ${r.success ? 'up' : 'down'} sm">${icon(r.success ? 'check' : 'x')}</span><div class="grow"><div class="t small">${r.name || r.email || 'Unknown'} <span class="chip ${r.success ? 'up' : 'down'}">${r.success ? 'Success' : 'Failed'}</span></div>
      <div class="s ellipsis" title="${r.user_agent || ''}">${dateTime(r.created_at)} · ${r.ip} · ${r.user_agent || ''}</div></div></div>`,
  }[kind];
  mount(el, html`<div class="stack">${head('Email & Logs', 'Who changed what and when')}
    ${tabsBar([['audit', 'Admin activity'], ['security', 'Security & KYC'], ['emails', 'Email log'], ['logins', 'Logins']], kind, 'data-log')}
    <div class="card pad-0">${d.rows.length ? html`${d.rows.map(item)}
    <div class="row between pad"><span class="faint">Page ${pageNo}</span><span class="row">
      <button class="btn ghost sm" data-pg="${pageNo - 1}" ${pageNo <= 1 ? raw('disabled') : ''}>Newer</button>
      <button class="btn ghost sm" data-pg="${pageNo + 1}" ${d.rows.length < d.limit ? raw('disabled') : ''}>Older</button></span></div>` : empty('Nothing logged yet', 'shield')}</div></div>`);
  el.onclick = (e) => {
    const t = e.target.closest('[data-log]'); if (t) { logs(el, _sub, head, t.dataset.log); return; }
    const p = e.target.closest('[data-pg]'); if (p) logs(el, _sub, head, kind, Number(p.dataset.pg));
  };
}

const VIEWS = {
  dashboard,
  menu,
  users: (el, s, h) => users(el, s, h),
  kyc: (el, s, h) => kyc(el, s, h),
  payments: (el, s, h) => payments(el, s, h),
  deposits,
  trades: crudView('trades'),
  investments: crudView('investments'),
  loans: crudView('loans'),
  invites,
  notices,
  settings,
  logs: (el, s, h) => logs(el, s, h),
};

export { $$, go };
