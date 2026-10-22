import { api } from '../api.js';
import {
  html, mount, icon, usd, avatar, date, dateTime, skeleton, empty, $, $$, modal, formValues, busy, toast,
  confirmDialog, monthName, coinIcon, price, qty, cls, readFileAsDataUrl, raw, ago, ordinal,
} from '../ui.js';
import { state } from '../app.js';
import { METHOD_NAMES, methodLogo } from './profile.js';
import { pnlText } from './common.js';

const nowLocal = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 16); // Asia/Dhaka
const today = () => nowLocal().slice(0, 10);
const thisMonth = () => today().slice(0, 7);

const SECTIONS = [
  { key: 'users', title: 'Users', desc: 'Approve, deposits, salaries, roles', icon: 'users', color: '#2f6bff' },
  { key: 'kyc', title: 'KYC Verification', desc: 'Review ID card and live face', icon: 'shield', color: '#0ecb81' },
  { key: 'payments', title: 'Payments', desc: 'Payment date and Paid marking', icon: 'calendar', color: '#f0b90b' },
  { key: 'trades', title: 'Trades', desc: 'Add profit, loss and fees', icon: 'history', color: '#7b61ff' },
  { key: 'investments', title: 'Investments', desc: 'Main Flow Invest holdings', icon: 'invest', color: '#00b8d9' },
  { key: 'loans', title: 'Loans', desc: 'USD and coin loans', icon: 'loan', color: '#f6465d' },
  { key: 'invites', title: 'Invites', desc: 'Invite links for new members', icon: 'mail', color: '#e040fb' },
  { key: 'settings', title: 'Settings', desc: 'Balances, coins, emails, logos', icon: 'settings', color: '#64748b' },
  { key: 'logs', title: 'Activity Logs', desc: 'Admin actions, emails, logins', icon: 'clock', color: '#94a3b8' },
];

export async function render({ el, sub }) {
  const sec = SECTIONS.find((s) => s.key === sub[0]);
  if (!sec) return overview(el);
  document.getElementById('page-title').textContent = sec.title;
  mount(el, html`<div class="stack">
    <div class="sec-head">
      <a class="icon-btn" href="#/admin" aria-label="Back to Admin">${icon('back')}</a>
      <span class="sec-ic" style="background:${sec.color}1f;color:${sec.color}">${icon(sec.icon)}</span>
      <div class="grow"><h1>${sec.title}</h1><div class="faint" style="font-size:13px">${sec.desc}</div></div>
      <div id="sec-actions" class="row"></div>
    </div>
    <div id="admin-body">${skeleton(80, 4)}</div></div>`);
  await VIEWS[sec.key]($('#admin-body', el), sub.slice(1), $('#sec-actions', el));
}

// ---------- Overview ----------
async function overview(el) {
  mount(el, skeleton(110, 3));
  const o = await api.get('/admin/overview', { fresh: true });
  const alerts = [
    o.kyc.pending && { href: 'kyc', tone: 'warn', ic: 'shield', text: `${o.kyc.pending} KYC verification${o.kyc.pending > 1 ? 's' : ''} to review${o.kyc.review ? ` (${o.kyc.review} need manual review)` : ''}` },
    o.kyc.held && { href: 'kyc', tone: 'down', ic: 'shield', text: `${o.kyc.held} account${o.kyc.held > 1 ? 's' : ''} on security hold (failed face re-check)` },
    o.users.pending && { href: 'users', tone: 'brand', ic: 'users', text: `${o.users.pending} member${o.users.pending > 1 ? 's' : ''} waiting for approval` },
    !o.pay_date && { href: 'payments', tone: 'warn', ic: 'calendar', text: `Payment date for ${monthName(o.month)} is not set` },
    o.payments.pending && { href: 'payments', tone: 'brand', ic: 'calendar', text: `${o.payments.pending} payment${o.payments.pending > 1 ? 's' : ''} pending · ${usd(o.payments.due)} due` },
    o.emails.failed && { href: 'logs', tone: 'down', ic: 'mail', text: `${o.emails.failed} email${o.emails.failed > 1 ? 's' : ''} failed in the last 7 days` },
    o.failed_logins_24h >= 5 && { href: 'logs', tone: 'down', ic: 'shield', text: `${o.failed_logins_24h} failed logins in 24 hours` },
  ].filter(Boolean);
  const badge = { kyc: o.kyc.pending, users: o.users.pending, payments: o.payments.pending };

  mount(el, html`<div class="stack">
    <div class="admin-hero">
      <div><div class="faint-w">Admin Panel · ${state.me.role === 'super_admin' ? 'Super Admin' : 'Admin'}</div><h1>${monthName(o.month)}</h1>
        <div class="faint-w">Payment date: <b>${o.pay_date ? `${ordinal(Number(o.pay_date.slice(8, 10)))} (${date(o.pay_date)})` : 'not set'}</b></div></div>
      <div class="admin-hero-stats">
        <div><span>Members</span><b>${o.users.active}</b></div>
        <div><span>Paid</span><b>${o.payments.paid}/${o.payments.paid + o.payments.pending}</b></div>
        <div><span>Today</span><b class="${o.trades_today.net >= 0 ? '' : 'neg'}">${pnlText(o.trades_today.net)}</b></div>
      </div>
    </div>

    ${alerts.length ? html`<div class="card pad-0"><div class="card-head" style="padding:14px 16px 4px"><h2>Needs your attention</h2></div>
      ${alerts.map((a) => html`<a class="list-item link" href="#/admin/${a.href}"><span class="dot-ic ${a.tone}">${icon(a.ic)}</span><div class="grow t">${a.text}</div>${icon('back', 'flip faint')}</a>`)}</div>`
    : html`<div class="card row" style="gap:12px"><span class="dot-ic up">${icon('check')}</span><div><b>All caught up</b><div class="faint" style="font-size:13px">Nothing needs your attention right now.</div></div></div>`}

    <div class="menu-grid">${SECTIONS.map((s) => html`<a class="menu-card" href="#/admin/${s.key}">
      <span class="sec-ic" style="background:${s.color}1f;color:${s.color}">${icon(s.icon)}</span>
      <span class="grow"><b>${s.title}</b><small>${s.desc}</small></span>
      ${badge[s.key] ? html`<span class="badge">${badge[s.key]}</span>` : ''}${icon('back', 'flip faint chev')}</a>`)}</div>
  </div>`);
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

function formModal({ title, fields, values = {}, submit, onChange, okLabel = 'Save' }) {
  const m = modal({
    title,
    body: html`<form class="form form-grid" id="af">${fields.map((f) => field(f, values[f.name]))}<div class="form-error hidden" id="aerr"></div></form>`,
    foot: html`<button class="btn ghost" data-close>Cancel</button><button class="btn" id="asave">${okLabel}</button>`,
  });
  const form = $('#af', m.el);
  const sync = () => onChange?.(form);
  form.onchange = sync; sync();
  form.onsubmit = (e) => { e.preventDefault(); $('#asave', m.el).click(); };
  $('#asave', m.el).onclick = (e) => busy(e.currentTarget, async () => {
    await submit(formValues(form));
    m.close();
  }, $('#aerr', m.el));
  return m;
}

function seg(items, active, attr = 'data-f') {
  return html`<div class="seg scroll">${items.map(([k, l, n]) => html`<button class="${k === active ? 'active' : ''}" ${raw(`${attr}="${k}"`)}>${l}${n ? html` <span class="badge sm">${n}</span>` : ''}</button>`)}</div>`;
}

// ---------- Users ----------
const STATUS_CHIP = { pending: 'warn', active: 'up', restricted: 'warn', disabled: 'down' };
const KYC_CHIP = {
  none: ['', 'KYC not started'], submitted: ['warn', 'KYC to review'], review: ['down', 'KYC manual review'],
  approved: ['up', 'KYC verified'], rejected: ['down', 'KYC rejected'], resubmit: ['warn', 'KYC redo asked'],
};

async function users(box, _sub, actions, filter = 'all', q = '') {
  const { rows } = await api.get('/admin/users', { fresh: true });
  mount(actions, html`<a class="btn sm" href="#/admin/invites">${icon('plus')} Invite</a>`);
  const counts = { pending: rows.filter((u) => u.status === 'pending').length };
  const list = rows.filter((u) => (filter === 'all' || u.status === filter)
    && (!q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())));
  mount(box, html`<div class="stack">
    <div class="toolbar">${seg([['all', 'All'], ['pending', 'Waiting', counts.pending], ['active', 'Active'], ['restricted', 'Restricted'], ['disabled', 'Disabled']], filter)}
      <input class="input sm search" id="uq" placeholder="Search name or email" value="${q}" aria-label="Search users"></div>
    ${list.length ? html`<div class="item-grid">${list.map((u) => html`<div class="item-card">
      <div class="row" style="gap:12px">${avatar(u)}<div class="grow" style="min-width:0"><b class="ellipsis">${u.name}</b><div class="faint ellipsis" style="font-size:12px">${u.email}</div></div>
        <span class="chip ${STATUS_CHIP[u.status]}">${u.status}</span></div>
      <div class="chips">${u.role !== 'user' ? html`<span class="chip brand">${u.role.replace('_', ' ')}</span>` : ''}
        ${u.role === 'user' ? html`<span class="chip ${KYC_CHIP[u.kyc_status][0]}">${KYC_CHIP[u.kyc_status][1]}</span>` : ''}
        ${u.email_verified ? '' : html`<span class="chip warn">Email not verified</span>`}</div>
      <div class="mini-kv"><div><span>Deposit</span><b class="num">${usd(u.deposit_amount)}</b></div><div><span>Due</span><b>${date(u.deposit_date)}</b></div>
        <div><span>Salary</span><b class="num">${usd(u.salary)}</b></div><div><span>Deposit</span><b class="${u.deposit_received_at ? 'up' : 'faint'}">${u.deposit_received_at ? 'Received' : 'Not yet'}</b></div></div>
      <div class="item-actions">${u.status === 'pending' ? html`<button class="btn success sm" data-approve="${u.id}">${icon('check')} Approve</button>` : ''}
        ${['submitted', 'review'].includes(u.kyc_status) ? html`<a class="btn sm" href="#/admin/kyc/${u.id}">${icon('shield')} Review KYC</a>` : ''}
        <button class="btn ghost sm" data-edit="${u.id}">${icon('edit')} Manage</button></div>
    </div>`)}</div>` : html`<div class="card">${empty('No users here', 'users')}</div>`}</div>`);

  $('#uq', box).oninput = (e) => {
    clearTimeout(box._t);
    box._t = setTimeout(() => users(box, _sub, actions, filter, e.target.value).then(() => { const i = $('#uq', box); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }), 250);
  };
  box.onclick = async (e) => {
    const f = e.target.closest('[data-f]'); if (f) { users(box, _sub, actions, f.dataset.f, q); return; }
    const a = e.target.closest('[data-approve]');
    if (a) { await busy(a, async () => { await api.post(`/admin/users/${a.dataset.approve}/approve`); toast('User approved'); await users(box, _sub, actions, filter, q); }); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) editUser(rows.find((u) => u.id === Number(ed.dataset.edit)), () => users(box, _sub, actions, filter, q));
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
          <div class="chips" style="margin-top:6px"><span class="chip ${STATUS_CHIP[u.status]}">${u.status}</span>${u.role === 'user' ? html`<span class="chip ${KYC_CHIP[u.kyc_status][0]}">${KYC_CHIP[u.kyc_status][1]}</span>` : ''}</div></div></div></div>
        <div class="item-card"><div class="card-head"><h3>Private details</h3><span class="chip">${icon('shield')} Admins only</span></div>
          <div class="kv"><div><div class="k">Email</div><div class="v">${u.email} ${u.email_verified ? '✓' : '(not verified)'}</div></div>
          <div><div class="k">Phone</div><div class="v">${u.phone || '—'}</div></div>
          <div><div class="k">Address</div><div class="v">${u.address || '—'}</div></div>
          <div><div class="k">Login</div><div class="v">${[u.has_password && 'Password', u.google_linked && 'Google'].filter(Boolean).join(' + ') || '—'}</div></div></div></div>
        <div class="item-card pad-0"><div class="card-head" style="padding:14px 16px 0"><h3>Payment methods</h3></div>
          ${u.payment_methods.length ? u.payment_methods.map((pm) => html`<div class="list-item"><div class="grow"><div class="t">${METHOD_NAMES[pm.type]} ${pm.is_default ? html`<span class="chip brand">Default</span>` : ''}</div>
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
  $('#usave', m.el).onclick = (e) => busy(e.currentTarget, async () => {
    const v = formValues($('#uf', m.el));
    await api.put(`/admin/users/${u.id}`, {
      name: v.name, deposit_amount: v.deposit_amount, deposit_date: v.deposit_date || null, salary: v.salary, status: v.status,
    });
    if (v.role && v.role !== u.role) await api.put(`/admin/users/${u.id}/role`, { role: v.role });
    if (v.deposit_received !== !!u.deposit_received_at) await api.post(`/admin/users/${u.id}/deposit-received`, { received: v.deposit_received });
    m.close(); toast('User saved'); done();
  }, $('#uerr', m.el));
}

// ---------- KYC ----------
function matchLabel(d) {
  if (d === null || d === undefined) return ['', 'No face check'];
  if (d <= 0.4) return ['up', 'Strong match'];
  if (d <= 0.55) return ['up', 'Match'];
  return ['down', 'Does not match'];
}
const PROMPT_LABEL = {
  look_left: 'Look left', look_right: 'Look right', look_up: 'Look up', nod_down: 'Nod your head down',
  smile: 'Smile', blink: 'Blink', eyes_closed: 'Close your eyes, then open',
};

async function kyc(box, sub, actions, filter = 'pending') {
  if (sub[0]) return kycReview(box, Number(sub[0]), actions);
  mount(actions, '');
  const { rows } = await api.get(`/admin/kyc?status=${filter}`, { fresh: true });
  mount(box, html`<div class="stack">
    <div class="toolbar">${seg([['pending', 'To review'], ['security', 'Security checks'], ['approved', 'Approved'], ['rejected', 'Rejected / redo'], ['waiting', 'Not started']], filter)}</div>
    ${rows.length ? html`<div class="item-grid">${rows.map((u) => {
    const [mc, ml] = matchLabel(u.match_distance);
    return html`<a class="item-card link" href="#/admin/kyc/${u.id}">
        <div class="row" style="gap:12px">${avatar(u)}<div class="grow" style="min-width:0"><b class="ellipsis">${u.name}</b><div class="faint ellipsis" style="font-size:12px">${u.email}</div></div>
          <span class="chip ${KYC_CHIP[u.kyc_status][0]}">${KYC_CHIP[u.kyc_status][1]}</span></div>
        <div class="chips">${u.match_distance !== null && u.match_distance !== undefined ? html`<span class="chip ${mc}">${ml} · ${Number(u.match_distance).toFixed(2)}</span>` : ''}
          ${u.kyc_submitted_at ? html`<span class="chip">${icon('clock')} ${ago(u.kyc_submitted_at)}</span>` : ''}
          ${u.kyc_note ? html`<span class="chip warn">${u.kyc_note}</span>` : ''}
          ${u.reverify_reason ? html`<span class="chip ${u.status === 'restricted' ? 'down' : 'warn'}">${u.status === 'restricted' ? 'On hold' : 'Face re-check'}: ${u.reverify_reason}</span>` : ''}</div>
      </a>`;
  })}</div>` : html`<div class="card">${empty(filter === 'pending' ? 'No verifications waiting. Nice!' : 'Nothing here', 'shield')}</div>`}</div>`);
  box.onclick = (e) => { const f = e.target.closest('[data-f]'); if (f) kyc(box, [], actions, f.dataset.f); };
}

async function kycReview(box, id, actions) {
  const d = await api.get(`/admin/kyc/${id}`, { fresh: true });
  const u = d.user; const p = d.profile; const live = p?.liveness;
  const [mc, ml] = matchLabel(p?.match_distance);
  const img = (kind, label) => html`<figure class="kyc-img">${d.files.includes(kind)
    ? html`<a href="/api/admin/kyc/${u.id}/file/${kind}" target="_blank" rel="noopener"><img src="/api/admin/kyc/${u.id}/file/${kind}" alt="${label}" loading="lazy"></a>`
    : html`<div class="kyc-missing">${icon('camera')}<span>Not provided</span></div>`}<figcaption>${label}</figcaption></figure>`;
  mount(actions, html`<a class="btn ghost sm" href="#/admin/kyc">${icon('back')} All</a>`);
  mount(box, html`<div class="stack">
    <div class="item-card"><div class="row wrap" style="gap:12px">${avatar(u, 'lg')}<div class="grow"><b style="font-size:18px">${u.name}</b><div class="faint">${u.email}${u.phone ? ` · ${u.phone}` : ''}</div>
      <div class="chips" style="margin-top:6px"><span class="chip ${KYC_CHIP[u.kyc_status][0]}">${KYC_CHIP[u.kyc_status][1]}</span><span class="chip ${mc}">${ml}${p?.match_distance != null ? ` · distance ${Number(p.match_distance).toFixed(3)}` : ''}</span>
      ${u.kyc_submitted_at ? html`<span class="chip">Submitted ${dateTime(u.kyc_submitted_at)}</span>` : ''}</div>
      ${u.kyc_note ? html`<div class="note-bar mt-s">${icon('shield')}<span>${u.kyc_note}</span></div>` : ''}</div></div></div>

    ${u.reverify_reason ? html`<div class="note-bar ${u.status === 'restricted' ? 'warn' : ''}">${icon('shield')}<span><b>${u.status === 'restricted' ? 'Account on hold' : 'Security face re-check pending'}:</b> ${u.reverify_reason}${u.reverify_fails ? ` · ${u.reverify_fails} failed tries` : ''}</span>
      <button class="btn sm" id="k-clear">${u.status === 'restricted' ? 'Lift hold' : 'Skip check'}</button></div>` : ''}
    <div class="kyc-images">${img('id_front', 'ID card · front')}${img('id_back', 'ID card · back')}${img('face', 'Live face')}</div>

    <div class="grid g2">
      <div class="item-card"><div class="card-head"><h3>Liveness check</h3>${live ? html`<span class="chip ${live.timing_ok && live.same_face ? 'up' : 'down'}">${live.timing_ok && live.same_face ? 'Passed' : 'Check carefully'}</span>` : ''}</div>
        ${live ? html`<div class="stack" style="gap:8px">${live.steps.map((s) => html`<div class="row between"><span class="row" style="gap:8px"><span class="dot-ic up sm">${icon('check')}</span>${PROMPT_LABEL[s.prompt] || s.prompt}</span><span class="faint num">${(s.ms / 1000).toFixed(1)}s</span></div>`)}
          <div class="faint" style="font-size:12px">Same face throughout: <b>${live.same_face ? 'yes' : 'no'}</b> · Human-speed timing: <b>${live.timing_ok ? 'yes' : 'no'}</b>${live.lighting != null ? ` · Light level ${Math.round(live.lighting)}` : ''}</div>
          <div class="faint ellipsis" style="font-size:12px" title="${live.device}">Device: ${live.device}</div></div>` : empty('No face check yet', 'shield')}</div>
      <div class="item-card pad-0"><div class="card-head" style="padding:14px 16px 0"><h3>Attempt log</h3></div>
        <div class="scroll-y">${d.events.length ? d.events.map((ev) => html`<div class="list-item"><div class="grow"><div class="t" style="font-size:13px">${ev.kind.replace(/_/g, ' ')} <span class="chip ${/match|approved|uploaded|ok|issued/.test(ev.result || '') && !/mis/.test(ev.result || '') ? 'up' : /fail|mismatch|rejected/.test(ev.result || '') ? 'down' : ''}">${ev.result}</span></div>
          <div class="s">${dateTime(ev.created_at)} · ${ev.ip || ''}${ev.detail?.distance != null ? ` · distance ${Number(ev.detail.distance).toFixed(3)}` : ''}${ev.detail?.reason ? ` · ${ev.detail.reason}` : ''}</div></div></div>`) : empty('No attempts yet')}</div></div>
    </div>

    <div class="action-bar">
      <button class="btn danger ghost-danger" id="k-del">${icon('trash')} Delete KYC data</button><span class="grow"></span>
      <button class="btn ghost" id="k-redo">Ask to redo</button>
      <button class="btn danger" id="k-rej">${icon('x')} Reject</button>
      <button class="btn success" id="k-ok">${icon('check')} Approve</button>
    </div>
    <p class="faint" style="font-size:12px;margin:0">Viewing these images is recorded in the activity log. Approving also activates the member's account.</p>
  </div>`);

  const reload = () => kycReview(box, id, actions);
  $('#k-clear', box)?.addEventListener('click', async () => {
    if (!await confirmDialog('Clear the security check?', `${u.name} will be able to use the app again without the face re-check. Only do this if you are sure it is really them.`, { okLabel: 'Clear' })) return;
    await api.post(`/admin/kyc/${id}/clear-reverify`); toast('Cleared'); reload();
  });
  $('#k-ok', box).onclick = async (e) => {
    if (!await confirmDialog(`Approve ${u.name}?`, 'They will get an email and can open the dashboard.', { okLabel: 'Approve' })) return;
    busy(e.currentTarget, async () => { await api.post(`/admin/kyc/${id}/approve`); toast('Verification approved'); reload(); });
  };
  const reason = (resubmit) => formModal({
    title: resubmit ? 'Ask to redo verification' : 'Reject verification',
    okLabel: resubmit ? 'Send request' : 'Reject',
    fields: [{ name: 'reason', label: 'Reason (sent to the member)', type: 'textarea', required: true, default: resubmit ? 'The ID card photo is blurry. Please retake it in good light.' : '' }],
    submit: async (v) => { await api.post(`/admin/kyc/${id}/reject`, { reason: v.reason, resubmit }); toast(resubmit ? 'Request sent' : 'Verification rejected'); reload(); },
  });
  $('#k-redo', box).onclick = () => reason(true);
  $('#k-rej', box).onclick = () => reason(false);
  $('#k-del', box).onclick = async () => {
    if (!await confirmDialog('Delete KYC data?', `This permanently deletes ${u.name}'s ID photos, face photo and face templates. They must verify again to use the app.`, { okLabel: 'Delete', danger: true })) return;
    await api.del(`/admin/kyc/${id}/data`); toast('KYC data deleted'); reload();
  };
}

// ---------- Payments ----------
async function payments(box, _sub, actions, month = thisMonth()) {
  mount(actions, '');
  const [{ rows }, sched] = await Promise.all([api.get(`/admin/payments?month=${month}`, { fresh: true }), api.get('/schedule', { fresh: true })]);
  const s = sched.rows.find((r) => r.month === month);
  const months = [];
  for (let i = -6; i <= 3; i += 1) { const d = new Date(`${thisMonth()}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + i); months.push(d.toISOString().slice(0, 7)); }
  const paid = rows.filter((r) => r.status === 'paid');
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const paidAmt = paid.reduce((a, r) => a + r.amount, 0);
  const defMethod = (r) => r.payment_methods.find((x) => x.is_default) || r.payment_methods[0];

  mount(box, html`<div class="stack">
    <div class="grid g2">
      <div class="item-card"><div class="card-head"><h3>Payment date</h3>
        <select class="input sm" id="pm" style="width:auto">${months.reverse().map((m) => html`<option value="${m}" ${m === month ? 'selected' : ''}>${monthName(m)}</option>`)}</select></div>
        <form class="form" id="sf">
          <div class="field"><label for="s-date">Payment date for ${monthName(month)}</label><input class="input" type="date" id="s-date" name="pay_date" value="${s?.pay_date || `${month}-20`}" required></div>
          <div class="field"><label for="s-note">Note <span class="faint">(optional)</span></label><input class="input" id="s-note" name="note" value="${s?.note || ''}" placeholder="e.g. Paid after the bank holiday"></div>
          <button class="btn block" type="submit">${icon('calendar')} ${s ? 'Change date and notify' : 'Set date and notify'}</button>
        </form>
        <p class="faint" style="font-size:12px;margin:10px 0 0">Members get an email and in-app notice. Reminders go out 3 days before, 1 day before and on the day.</p></div>
      <div class="item-card"><div class="card-head"><h3>${monthName(month)}</h3><span class="chip ${s ? 'brand' : 'warn'}">${s ? `Pay day ${ordinal(Number(s.pay_date.slice(8, 10)))}` : 'Date not set'}</span></div>
        <div class="big-num num">${usd(paidAmt)} <span class="faint" style="font-size:15px">of ${usd(total)}</span></div>
        <div class="progress"><span style="width:${total ? Math.round((paidAmt / total) * 100) : 0}%"></span></div>
        <div class="mini-kv" style="margin-top:12px"><div><span>Paid</span><b class="up">${paid.length}</b></div><div><span>Pending</span><b class="${rows.length - paid.length ? 'down' : ''}">${rows.length - paid.length}</b></div></div></div>
    </div>
    ${rows.length ? html`<div class="item-grid">${rows.map((r) => html`<div class="item-card">
      <div class="row" style="gap:12px">${avatar(r)}<div class="grow" style="min-width:0"><b class="ellipsis">${r.name}</b><div class="faint" style="font-size:12px">${r.status === 'paid' ? `${METHOD_NAMES[r.method]} · ${dateTime(r.paid_at)}` : 'Waiting for payment'}</div></div>
        <div class="right"><b class="num" style="font-size:16px">${usd(r.amount)}</b><div><span class="chip ${r.status === 'paid' ? 'up' : 'warn'}">${r.status === 'paid' ? 'Paid' : 'Pending'}</span></div></div></div>
      ${r.status !== 'paid' ? html`<div class="send-to">${defMethod(r) ? html`<span class="faint">Send to</span> <b>${METHOD_NAMES[defMethod(r).type]}</b> <span class="mono" style="user-select:all">${defMethod(r).account}</span>${defMethod(r).network ? html` <span class="chip">${defMethod(r).network}</span>` : ''}` : html`<span class="down">No payment method on file</span>`}</div>` : ''}
      <div class="item-actions">${r.status === 'paid'
    ? html`<button class="btn ghost sm" data-unpaid="${r.id}">Undo paid</button>`
    : html`<button class="btn ghost sm" data-amount="${r.id}">${icon('edit')} Amount</button><button class="btn success sm" data-paid="${r.id}">${icon('check')} Mark paid</button>`}</div>
    </div>`)}</div>` : html`<div class="card">${empty('No members with a salary yet. Set salaries in Users.', 'calendar')}</div>`}
  </div>`);

  $('#pm', box).onchange = (e) => payments(box, _sub, actions, e.target.value);
  $('#sf', box).onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      await api.put('/admin/schedule', { month, ...formValues(e.target) });
      toast('Payment date saved and members notified'); payments(box, _sub, actions, month);
    });
  };
  box.onclick = async (e) => {
    const b = e.target.closest('[data-paid],[data-unpaid],[data-amount]'); if (!b) return;
    const r = rows.find((x) => x.id === Number(b.dataset.paid || b.dataset.unpaid || b.dataset.amount));
    if (b.dataset.unpaid) {
      if (await confirmDialog('Mark as pending?', `${r.name}'s payment will show as Pending again.`, { okLabel: 'Mark pending' })) {
        await api.post(`/admin/payments/${r.id}/unpaid`); payments(box, _sub, actions, month);
      }
    } else if (b.dataset.amount) {
      formModal({
        title: `Edit amount · ${r.name}`,
        fields: [{ name: 'amount', label: 'Amount (USD)', type: 'number', step: '0.01', required: true }, { name: 'note', label: 'Note' }],
        values: r,
        submit: async (v) => { await api.put(`/admin/payments/${r.id}`, v); payments(box, _sub, actions, month); },
      });
    } else {
      formModal({
        title: `Mark paid · ${r.name} · ${usd(r.amount)}`,
        okLabel: 'Mark paid',
        fields: [
          { name: 'method', label: 'Method', type: 'select', required: true, options: Object.entries(METHOD_NAMES), default: defMethod(r)?.type || 'bkash' },
          { name: 'paid_at', label: 'Paid on', type: 'datetime-local', required: true, default: nowLocal() },
          { name: 'note', label: 'Note / transaction ID' },
        ],
        submit: async (v) => { await api.post(`/admin/payments/${r.id}/paid`, v); toast(`${r.name} marked Paid and emailed`); payments(box, _sub, actions, month); },
      });
    }
  };
}

// ---------- Trades / investments / loans ----------
const CRUD = {
  trades: {
    title: 'Trade',
    fields: [
      { name: 'coin', label: 'Coin', required: true, hint: 'Ticker, e.g. BTC, SOL, PEPE', half: true },
      { name: 'side', label: 'Side', type: 'select', options: [['spot', 'Spot'], ['long', 'Long'], ['short', 'Short']], required: true, half: true },
      { name: 'profit', label: 'Profit (USD, minus for loss)', type: 'number', step: '0.01', required: true, half: true },
      { name: 'fee', label: 'Fee (USD)', type: 'number', step: '0.01', default: 0, half: true },
      { name: 'traded_at', label: 'Date and time', type: 'datetime-local', required: true, default: () => nowLocal() },
      { name: 'note', label: 'Note' },
    ],
    card: (t) => html`<div class="row" style="gap:12px">${coinIcon(t.coin)}<div class="grow"><b>${t.coin}</b> <span class="chip">${t.side}</span><div class="faint" style="font-size:12px">${dateTime(t.traded_at)}${t.note ? ` · ${t.note}` : ''}</div></div>
      <div class="right"><b class="num ${cls(t.profit - t.fee)}">${pnlText(t.profit - t.fee)}</b><div class="faint num" style="font-size:12px">P/L ${pnlText(t.profit)} · fee ${usd(t.fee)}</div></div></div>`,
  },
  investments: {
    title: 'Investment',
    fields: [
      { name: 'coin', label: 'Coin', required: true, half: true },
      { name: 'status', label: 'Status', type: 'select', options: [['open', 'Open'], ['closed', 'Closed']], required: true, half: true },
      { name: 'quantity', label: 'Quantity', type: 'number', step: 'any', required: true, half: true },
      { name: 'entry_price', label: 'Entry price (USD)', type: 'number', step: 'any', required: true, half: true },
      { name: 'invested_at', label: 'Date', type: 'date', required: true, default: () => today() },
      { name: 'note', label: 'Note' },
    ],
    card: (x) => html`<div class="row" style="gap:12px">${coinIcon(x.coin)}<div class="grow"><b>${x.coin}</b> <span class="chip ${x.status === 'open' ? 'up' : ''}">${x.status}</span><div class="faint num" style="font-size:12px">${qty(x.quantity)} @ ${price(x.entry_price)} · ${date(x.invested_at)}</div></div>
      <div class="right"><b class="num">${usd(x.quantity * x.entry_price)}</b><div class="faint" style="font-size:12px">cost</div></div></div>`,
  },
  loans: {
    title: 'Loan',
    fields: [
      { name: 'kind', label: 'Loan type', type: 'select', options: [['usd', 'USD loan'], ['coin', 'Coin loan']], required: true, half: true },
      { name: 'status', label: 'Status', type: 'select', options: [['open', 'Open'], ['repaid', 'Repaid']], required: true, half: true },
      { name: 'coin', label: 'Coin', required: true, coinOnly: true, half: true },
      { name: 'quantity', label: 'Quantity borrowed', type: 'number', step: 'any', required: true, coinOnly: true, half: true },
      { name: 'entry_price', label: 'Price when borrowed (USD)', type: 'number', step: 'any', required: true, coinOnly: true },
      { name: 'amount_usd', label: 'Amount (USD)', type: 'number', step: '0.01', hint: 'For coin loans, leave empty to use quantity × price.', half: true },
      { name: 'remaining_usd', label: 'Remaining (USD)', type: 'number', step: '0.01', hint: 'Empty = full amount.', half: true },
      { name: 'lender', label: 'Lender' },
      { name: 'borrowed_at', label: 'Borrowed on', type: 'date', required: true, default: () => today(), half: true },
      { name: 'repay_date', label: 'Repayment date', type: 'date', half: true },
      { name: 'note', label: 'Note' },
    ],
    card: (l) => html`<div class="row" style="gap:12px">${l.kind === 'coin' ? coinIcon(l.coin) : html`<span class="coin-ico" style="background:#26a17b">USD</span>`}
      <div class="grow"><b>${l.kind === 'coin' ? `${qty(l.quantity)} ${l.coin}` : 'USD loan'}</b> <span class="chip ${l.status === 'open' ? 'warn' : 'up'}">${l.status}</span>
        <div class="faint" style="font-size:12px">${l.lender || 'Loan'} · repay by ${date(l.repay_date)}</div></div>
      <div class="right"><b class="num">${usd(l.remaining_usd)}</b><div class="faint num" style="font-size:12px">of ${usd(l.amount_usd)}</div></div></div>`,
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
  const view = async (box, _sub, actions, pageNo = 1) => {
    const d = table === 'trades'
      ? await api.get(`/trades?page=${pageNo}&limit=24`, { fresh: true })
      : await api.get(`/${table}`, { fresh: true });
    const rows = d.rows;
    const open = (r) => formModal({
      title: r ? `Edit ${def.title.toLowerCase()}` : `Add ${def.title.toLowerCase()}`,
      fields: def.fields.map((f) => ({ ...f, default: typeof f.default === 'function' ? f.default() : f.default })),
      values: r || {},
      onChange: def.onChange,
      submit: async (v) => {
        if (r) await api.put(`/admin/${table}/${r.id}`, v); else await api.post(`/admin/${table}`, v);
        toast(`${def.title} saved`); view(box, _sub, actions, pageNo);
      },
    });
    mount(actions, html`<button class="btn sm" id="add">${icon('plus')} Add</button>`);
    $('#add', actions).onclick = () => open(null);
    const pages = table === 'trades' ? Math.max(1, Math.ceil(d.total / d.limit)) : 1;
    mount(box, html`<div class="stack">
      ${table === 'trades' && d.sums ? html`<div class="tiles three">
        <div class="tile"><div class="tile-l">Trades</div><div class="tile-v num">${d.total}</div></div>
        <div class="tile"><div class="tile-l">Net result</div><div class="tile-v num ${cls(d.sums.net)}">${pnlText(d.sums.net)}</div></div>
        <div class="tile"><div class="tile-l">Total loss</div><div class="tile-v num down">${usd(d.sums.loss)}</div></div></div>` : ''}
      ${rows.length ? html`<div class="item-grid">${rows.map((r) => html`<div class="item-card">${def.card(r)}
        <div class="item-actions"><button class="btn ghost sm" data-ed="${r.id}">${icon('edit')} Edit</button><button class="btn ghost sm" data-del="${r.id}" aria-label="Delete">${icon('trash')}</button></div></div>`)}</div>
        ${pages > 1 ? html`<div class="row between"><span class="faint">Page ${pageNo} of ${pages}</span><span class="row">
          <button class="btn ghost sm" data-page="${pageNo - 1}" ${pageNo <= 1 ? raw('disabled') : ''}>Previous</button><button class="btn ghost sm" data-page="${pageNo + 1}" ${pageNo >= pages ? raw('disabled') : ''}>Next</button></span></div>` : ''}`
    : html`<div class="card">${empty(`No ${table} yet. Tap Add to create one.`, 'plus')}</div>`}</div>`);
    box.onclick = async (e) => {
      const pg = e.target.closest('[data-page]'); if (pg) { view(box, _sub, actions, Number(pg.dataset.page)); return; }
      const ed = e.target.closest('[data-ed]'); if (ed) { open(rows.find((r) => r.id === Number(ed.dataset.ed))); return; }
      const del = e.target.closest('[data-del]');
      if (del && await confirmDialog(`Delete ${def.title.toLowerCase()}?`, 'This cannot be undone. The deletion is recorded in the activity log.', { okLabel: 'Delete', danger: true })) {
        await api.del(`/admin/${table}/${del.dataset.del}`); toast('Deleted'); view(box, _sub, actions, pageNo);
      }
    };
  };
  return view;
}

// ---------- Invites ----------
async function invites(box, _sub, actions) {
  const { rows } = await api.get('/admin/invites', { fresh: true });
  mount(actions, html`<button class="btn sm" id="new">${icon('plus')} New invite</button>`);
  mount(box, html`<div class="stack">
    <div class="note-bar">${icon('mail')}<span>People who sign up with an invite link skip account approval. They still verify their ID and face, which you review in KYC.</span></div>
    ${rows.length ? html`<div class="item-grid">${rows.map((i) => html`<div class="item-card">
      <div class="row between"><b class="mono" style="font-size:17px;letter-spacing:.06em;user-select:all">${i.code}</b>${i.used_by ? html`<span class="chip up">Used</span>` : html`<span class="chip brand">Active</span>`}</div>
      <div class="faint" style="font-size:13px">${i.email ? `Only for ${i.email} · ` : ''}${i.used_by ? `Used by ${i.used_by_name || 'deleted user'} on ${date(i.used_at)}` : `Expires ${date(i.expires_at)}`}</div>
      ${i.used_by ? '' : html`<div class="item-actions"><button class="btn ghost sm" data-copy="${i.code}">Copy link</button><button class="btn ghost sm" data-del="${i.code}" aria-label="Delete">${icon('trash')}</button></div>`}
    </div>`)}</div>` : html`<div class="card">${empty('No invites yet', 'mail')}</div>`}</div>`);
  $('#new', actions).onclick = () => formModal({
    title: 'New invite',
    okLabel: 'Create invite',
    fields: [{ name: 'email', label: 'Only for this email', type: 'email' }, { name: 'days', label: 'Valid for (days)', type: 'number', default: 14 }],
    submit: async (v) => {
      const r = await api.post('/admin/invites', v);
      await navigator.clipboard?.writeText(r.link).catch(() => {});
      toast(`Invite ${r.code} created, link copied`); invites(box, _sub, actions);
    },
  });
  box.onclick = async (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) { await navigator.clipboard?.writeText(`${location.origin}/#/signup?invite=${c.dataset.copy}`).catch(() => {}); toast('Invite link copied'); }
    const d = e.target.closest('[data-del]');
    if (d) { await api.del(`/admin/invites/${d.dataset.del}`); invites(box, _sub, actions); }
  };
}

// ---------- Settings ----------
async function settings(box, _sub, actions) {
  mount(actions, '');
  const s = await api.get('/admin/settings', { fresh: true });
  mount(box, html`<div class="grid g2">
    <div class="stack">
      <div class="item-card"><div class="card-head"><h3>${icon('home')} Balances</h3></div><form class="form form-grid" id="bal">
        ${field({ name: 'main_base', label: 'Starting main balance (USD)', type: 'number', step: '0.01', required: true, hint: 'Main Balance = this + all trade results (after fees) − salaries paid.' }, s.balances.main_base)}
        ${field({ name: 'trading_capital', label: 'Trading balance (USD)', type: 'number', step: '0.01', required: true, hint: 'Capital currently in the trading account.' }, s.balances.trading_capital)}
        <div><button class="btn" type="submit">Save balances</button></div></form></div>
      <div class="item-card"><div class="card-head"><h3>${icon('calendar')} Standard deposit</h3></div><form class="form form-grid" id="dep">
        ${field({ name: 'amount', label: 'Amount (USD)', type: 'number', step: '0.01', required: true, half: true }, s.default_deposit.amount)}
        ${field({ name: 'date', label: 'Deposit date', type: 'date', half: true }, s.default_deposit.date)}
        <label class="check"><input type="checkbox" name="apply"><span>Also apply to all existing members</span></label>
        <div><button class="btn" type="submit">Save deposit</button></div></form></div>
      <div class="item-card"><div class="card-head"><h3>${icon('chart')} Watchlist coins</h3></div><form class="form" id="wl">
        ${field({ name: 'watchlist', label: 'Tickers, separated by commas', required: true, hint: 'Coins in investments, loans and trades are added automatically.' }, (s.watchlist || state.watchlist).join(', '))}
        <div><button class="btn" type="submit">Save watchlist</button></div></form></div>
    </div>
    <div class="stack">
      <div class="item-card"><div class="card-head"><h3>${icon('mail')} Email types</h3></div><form class="form" id="em">
        ${Object.entries(s.email_types).map(([k, t]) => html`<label class="switch-row"><span>${t.label}${t.locked ? html` <span class="faint">(always on)</span>` : ''}${t.reminder ? html` <span class="faint">(members can opt out)</span>` : ''}</span>
          <input type="checkbox" class="switch" name="${k}" ${t.locked || s.email_toggles[k] !== false ? 'checked' : ''} ${t.locked ? raw('disabled') : ''}></label>`)}
        <div><button class="btn" type="submit">Save email settings</button></div></form></div>
      <div class="item-card pad-0"><div class="card-head" style="padding:14px 16px 0"><h3>Payment method logos</h3></div>
        ${Object.keys(METHOD_NAMES).map((t) => html`<div class="list-item">${methodLogo(t, s.method_logos)}<div class="grow t">${METHOD_NAMES[t]}</div>
          <label class="btn ghost sm">Upload<input type="file" class="hidden" accept="image/png,image/jpeg,image/svg+xml,image/webp" data-logo="${t}"></label></div>`)}
        <p class="faint" style="margin:8px 16px 14px;font-size:12px">PNG, JPG or SVG, up to 200 KB.</p></div>
      <div class="item-card"><div class="card-head"><h3>${icon('bell')} Push notifications</h3><span class="chip ${s.push_enabled ? 'up' : 'warn'}">${s.push_enabled ? 'Connected' : 'Not set up'}</span></div>
        <p class="faint" style="margin:0;font-size:13px">${s.push_enabled ? 'Phones with the Android app get every notification as a push message.' : 'Add the FCM_SERVICE_ACCOUNT environment variable (Firebase) to send push messages to the Android app. Email and in-app notices work without it.'}</p></div>
      ${state.me.role === 'super_admin' ? html`<div class="item-card"><div class="card-head"><h3>${icon('download')} Backup</h3></div>
        <p class="faint" style="margin:0;font-size:13px">Download the whole database as a compressed file. Keep it somewhere private. KYC files stay encrypted inside.</p>
        <div><a class="btn ghost" href="/api/admin/backup" download>${icon('download')} Download backup</a></div></div>` : ''}
      <div class="item-card"><div class="card-head"><h3>${icon('bell')} Notice to everyone</h3></div><form class="form" id="bc">
        ${field({ name: 'title', label: 'Title', required: true })}${field({ name: 'body', label: 'Message', type: 'textarea', required: true })}
        <div><button class="btn" type="submit">Send in-app notice</button></div></form></div>
    </div></div>`);

  const on = (id, fn) => { $(id, box).onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => { await fn(formValues(e.target), e.target); toast('Saved'); }); }; };
  on('#bal', (v) => api.put('/admin/settings', { balances: v }));
  on('#dep', (v) => api.put('/admin/settings', { default_deposit: { amount: v.amount, date: v.date || null }, apply_deposit_to_all: v.apply }));
  on('#wl', (v) => api.put('/admin/settings', { watchlist: v.watchlist }));
  on('#em', (v) => api.put('/admin/settings', { email_toggles: v }));
  on('#bc', async (v, form) => { await api.post('/admin/notify', v); form.reset(); });
  box.onchange = async (e) => {
    const t = e.target.dataset?.logo; const f = e.target.files?.[0];
    if (!t || !f) return;
    try {
      const image = await readFileAsDataUrl(f);
      await api.put(`/admin/method-logos/${t}`, { image });
      toast(`${METHOD_NAMES[t]} logo updated`); settings(box, _sub, actions);
    } catch (err) { toast(err.message, 'err'); }
  };
}

// ---------- Logs ----------
async function logs(box, _sub, actions, kind = 'audit', pageNo = 1) {
  mount(actions, '');
  const d = await api.get(kind === 'security' ? `/admin/kyc/events/all?page=${pageNo}` : `/admin/${kind}?page=${pageNo}`, { fresh: true });
  const item = {
    audit: (r) => html`<div class="list-item"><span class="dot-ic brand sm">${icon('edit')}</span><div class="grow"><div class="t" style="font-size:13px">${r.actor_name || 'System'} <span class="chip">${r.action.replace(/_/g, ' ')}</span> ${r.entity ? html`<span class="faint">${r.entity} ${r.entity_id || ''}</span>` : ''}</div>
      <div class="s ellipsis" title="${r.details ? JSON.stringify(r.details) : ''}">${dateTime(r.created_at)}${r.details ? ` · ${JSON.stringify(r.details).slice(0, 140)}` : ''}</div></div></div>`,
    emails: (r) => html`<div class="list-item"><span class="dot-ic ${r.status === 'sent' ? 'up' : r.status === 'failed' ? 'down' : 'warn'} sm">${icon('mail')}</span><div class="grow"><div class="t ellipsis" style="font-size:13px">${r.subject}</div>
      <div class="s ellipsis" title="${r.last_error || ''}">${r.to_email} · ${dateTime(r.created_at)} · ${r.status}${r.attempts > 1 ? ` ×${r.attempts}` : ''}${r.last_error ? ` · ${r.last_error}` : ''}</div></div></div>`,
    logins: (r) => html`<div class="list-item"><span class="dot-ic ${r.success ? 'up' : 'down'} sm">${icon(r.success ? 'check' : 'x')}</span><div class="grow"><div class="t" style="font-size:13px">${r.name || r.email || 'Unknown'} <span class="chip ${r.success ? 'up' : 'down'}">${r.success ? 'Success' : 'Failed'}</span></div>
      <div class="s ellipsis" title="${r.user_agent || ''}">${dateTime(r.created_at)} · ${r.ip} · ${r.user_agent || ''}</div></div></div>`,
    security: (r) => html`<a class="list-item link" href="#/admin/kyc/${r.user_id}"><span class="dot-ic ${/passed|approved|matched|uploaded|issued|ok/.test(r.result || '') ? 'up' : /fail|mismatch|locked|rejected/.test(r.result || '') ? 'down' : 'warn'} sm">${icon('shield')}</span><div class="grow"><div class="t" style="font-size:13px">${r.name} <span class="chip">${r.kind.replace(/_/g, ' ')}</span> <span class="faint">${r.result || ''}</span></div>
      <div class="s ellipsis">${dateTime(r.created_at)} · ${r.ip || ''}${r.detail?.reason ? ` · ${r.detail.reason}` : ''}${r.detail?.distance != null ? ` · distance ${Number(r.detail.distance).toFixed(3)}` : ''} · ${r.user_agent || ''}</div></div></a>`,
  }[kind];
  mount(box, html`<div class="stack"><div class="toolbar">${seg([['audit', 'Admin activity'], ['security', 'Security & KYC'], ['emails', 'Email log'], ['logins', 'Logins']], kind, 'data-log')}</div>
    <div class="card pad-0">${d.rows.length ? html`${d.rows.map(item)}
    <div class="row between" style="padding:12px 16px"><span class="faint">Page ${pageNo}</span><span class="row">
      <button class="btn ghost sm" data-pg="${pageNo - 1}" ${pageNo <= 1 ? raw('disabled') : ''}>Newer</button>
      <button class="btn ghost sm" data-pg="${pageNo + 1}" ${d.rows.length < d.limit ? raw('disabled') : ''}>Older</button></span></div>` : empty('Nothing logged yet', 'shield')}</div></div>`);
  box.onclick = (e) => {
    const t = e.target.closest('[data-log]'); if (t) { logs(box, _sub, actions, t.dataset.log); return; }
    const p = e.target.closest('[data-pg]'); if (p) logs(box, _sub, actions, kind, Number(p.dataset.pg));
  };
}

const VIEWS = {
  users: (b, s, a) => users(b, s, a),
  kyc: (b, s, a) => kyc(b, s, a),
  payments: (b, s, a) => payments(b, s, a),
  trades: crudView('trades'),
  investments: crudView('investments'),
  loans: crudView('loans'),
  invites,
  settings,
  logs: (b, s, a) => logs(b, s, a),
};

export { $$ };
