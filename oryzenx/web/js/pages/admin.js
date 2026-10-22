import { api } from '../api.js';
import {
  html, mount, icon, usd, avatar, date, dateTime, skeleton, empty, $, $$, modal, formValues, busy, toast,
  confirmDialog, monthName, coinIcon, price, qty, cls, pager, readFileAsDataUrl, raw,
} from '../ui.js';
import { state, go } from '../app.js';
import { METHOD_NAMES, methodLogo } from './profile.js';
import { pnlText } from './common.js';

const TABS = [
  ['users', 'Users', 'users'], ['payments', 'Payments', 'calendar'], ['trades', 'Trades', 'history'],
  ['investments', 'Investments', 'invest'], ['loans', 'Loans', 'loan'], ['invites', 'Invites', 'mail'],
  ['settings', 'Settings', 'settings'], ['logs', 'Logs', 'shield'],
];

const nowLocal = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 16); // Asia/Dhaka
const today = () => nowLocal().slice(0, 10);
const thisMonth = () => today().slice(0, 7);

export async function render({ el, sub }) {
  const tab = TABS.some(([k]) => k === sub[0]) ? sub[0] : 'users';
  mount(el, html`<div class="stack">
    <div class="tabs" style="align-self:flex-start">${TABS.map(([k, l]) => html`<button class="tab ${k === tab ? 'active' : ''}" data-tab="${k}">${l}</button>`)}</div>
    <div id="admin-body">${skeleton(60, 5)}</div></div>`);
  $$('[data-tab]', el).forEach((b) => { b.onclick = () => go(`admin/${b.dataset.tab}`); });
  await VIEWS[tab]($('#admin-body', el));
}

// ---------- Generic form ----------
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
    input = html`<input class="input" id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${shown}" ${f.step ? raw(`step="${f.step}"`) : ''} ${f.required ? raw('required') : ''} autocomplete="off">`;
  }
  return html`<div class="field" data-field="${f.name}"><label for="${id}">${f.label}${f.required ? '' : html` <span class="faint">(optional)</span>`}</label>${input}${f.hint ? html`<span class="hint">${f.hint}</span>` : ''}</div>`;
}

function formModal({ title, fields, values = {}, submit, onChange, wide }) {
  const m = modal({
    title,
    wide,
    body: html`<form class="form" id="af">${fields.map((f) => field(f, values[f.name]))}<div class="form-error hidden" id="aerr"></div></form>`,
    foot: html`<button class="btn ghost" data-close>Cancel</button><button class="btn" id="asave">Save</button>`,
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

// ---------- Users ----------
const STATUS_CHIP = { pending: 'warn', active: 'up', restricted: 'warn', disabled: 'down' };

async function users(box) {
  const { rows } = await api.get('/admin/users', { fresh: true });
  const pending = rows.filter((u) => u.status === 'pending');
  mount(box, html`
    ${pending.length ? html`<div class="card pad-0" style="margin-bottom:14px;border-color:var(--warn)"><div class="card-head" style="padding:16px 16px 0"><h2>Waiting for approval (${pending.length})</h2></div>
      ${pending.map((u) => html`<div class="list-item wrap-m">${avatar(u, 'sm')}<div class="grow"><div class="t">${u.name}</div><div class="s">${u.email} · signed up ${dateTime(u.member_since)} · ${u.email_verified ? 'email verified' : 'email NOT verified'}</div></div>
        <button class="btn success sm" data-approve="${u.id}">${icon('check')} Approve</button><button class="btn ghost sm" data-edit="${u.id}">Details</button></div>`)}</div>` : ''}
    <div class="card pad-0"><div class="table-wrap"><table><thead><tr><th>User</th><th>Status</th><th class="right">Deposit</th><th class="right hide-m">Deposit date</th><th class="right">Salary</th><th></th></tr></thead><tbody>
      ${rows.filter((u) => u.status !== 'pending').map((u) => html`<tr><td><div class="row">${avatar(u, 'sm')}<div><b>${u.name}</b><div class="faint" style="font-size:12px">${u.email} · ${u.role.replace('_', ' ')}</div></div></div></td>
        <td><span class="chip ${STATUS_CHIP[u.status]}">${u.status}</span></td>
        <td class="right num">${usd(u.deposit_amount)}<div>${u.deposit_received_at ? html`<span class="chip up">Received</span>` : html`<span class="chip">Not received</span>`}</div></td>
        <td class="right hide-m">${date(u.deposit_date)}</td><td class="right num">${usd(u.salary)}</td>
        <td class="right"><button class="btn ghost sm" data-edit="${u.id}">${icon('edit')} Manage</button></td></tr>`)}
    </tbody></table></div></div>`);

  box.onclick = async (e) => {
    const a = e.target.closest('[data-approve]');
    if (a) {
      await busy(a, async () => { await api.post(`/admin/users/${a.dataset.approve}/approve`); toast('User approved'); await users(box); });
      return;
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) editUser(rows.find((u) => u.id === Number(ed.dataset.edit)), () => users(box));
  };
}

function editUser(u, done) {
  const superAdmin = state.me.role === 'super_admin';
  const m = modal({
    title: u.name,
    wide: true,
    body: html`<div class="grid g2">
      <div class="stack">
        <div class="card"><div class="card-head"><h3>Private details</h3><span class="chip">${icon('shield')} Admins only</span></div>
          <div class="kv"><div><div class="k">Email</div><div class="v">${u.email} ${u.email_verified ? '✓' : '(not verified)'}</div></div>
          <div><div class="k">Phone</div><div class="v">${u.phone || '—'}</div></div>
          <div><div class="k">Address</div><div class="v">${u.address || '—'}</div></div>
          <div><div class="k">Login</div><div class="v">${[u.has_password && 'Password', u.google_linked && 'Google'].filter(Boolean).join(' + ') || '—'}</div></div></div></div>
        <div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h3>Payment methods</h3></div>
          ${u.payment_methods.length ? u.payment_methods.map((pm) => html`<div class="list-item"><div class="grow"><div class="t">${METHOD_NAMES[pm.type]} ${pm.is_default ? html`<span class="chip brand">Default</span>` : ''}</div>
            <div class="s" style="user-select:all">${pm.account}${pm.network ? ` · ${pm.network}` : ''}${pm.holder ? ` · ${pm.holder}` : ''}</div></div></div>`) : empty('No payment methods added')}</div>
      </div>
      <form class="form" id="uf">
        ${field({ name: 'name', label: 'Name', required: true }, u.name)}
        <div class="grid g2 keep">${field({ name: 'deposit_amount', label: 'Deposit amount (USD)', type: 'number', step: '0.01', required: true }, u.deposit_amount)}
        ${field({ name: 'deposit_date', label: 'Deposit date', type: 'date' }, u.deposit_date)}</div>
        ${field({ name: 'salary', label: 'Monthly salary (USD)', type: 'number', step: '0.01', required: true, hint: 'Paid on the monthly payment date.' }, u.salary)}
        ${field({ name: 'status', label: 'Status', type: 'select', options: [['pending', 'Pending approval'], ['active', 'Active'], ['restricted', 'Restricted'], ['disabled', 'Disabled (cannot log in)']], required: true }, u.status)}
        ${superAdmin && u.id !== state.me.id ? field({ name: 'role', label: 'Role', type: 'select', options: [['user', 'User'], ['admin', 'Admin'], ['super_admin', 'Super Admin']], required: true }, u.role) : ''}
        <label class="check"><input type="checkbox" name="deposit_received" ${u.deposit_received_at ? 'checked' : ''}><span>Deposit received${u.deposit_received_at ? ` (${date(u.deposit_received_at)})` : ''}</span></label>
        <div class="form-error hidden" id="uerr"></div>
      </form></div>`,
    foot: html`<button class="btn ghost" data-close>Cancel</button><button class="btn" id="usave">Save</button>`,
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

// ---------- Payments ----------
async function payments(box, month = thisMonth()) {
  const [{ rows }, sched] = await Promise.all([api.get(`/admin/payments?month=${month}`, { fresh: true }), api.get('/schedule', { fresh: true })]);
  const s = sched.rows.find((r) => r.month === month);
  const months = [];
  for (let i = -6; i <= 3; i += 1) { const d = new Date(`${thisMonth()}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + i); months.push(d.toISOString().slice(0, 7)); }
  const paid = rows.filter((r) => r.status === 'paid');
  mount(box, html`<div class="stack">
    <div class="card"><div class="card-head"><h2>Monthly payment date</h2>
      <select class="input sm" id="pm" style="width:auto">${months.reverse().map((m) => html`<option value="${m}" ${m === month ? 'selected' : ''}>${monthName(m)}</option>`)}</select></div>
      <form class="row wrap" id="sf" style="align-items:flex-end;gap:12px">
        <div class="field"><label for="s-date">Payment date</label><input class="input" type="date" id="s-date" name="pay_date" value="${s?.pay_date || `${month}-20`}" required></div>
        <div class="field grow"><label for="s-note">Note <span class="faint">(optional)</span></label><input class="input" id="s-note" name="note" value="${s?.note || ''}" placeholder="e.g. Paid after the bank holiday"></div>
        <button class="btn" type="submit">${s ? 'Change date' : 'Set date'}</button>
      </form>
      <p class="faint" style="font-size:13px;margin:10px 0 0">Everyone gets an email and in-app notification when the date is set or changed. Reminders go out 3 days before, 1 day before and on the day.</p>
    </div>
    <div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h2>${monthName(month)} · ${paid.length}/${rows.length} paid</h2>
      <span class="num faint">${usd(paid.reduce((a, r) => a + r.amount, 0))} of ${usd(rows.reduce((a, r) => a + r.amount, 0))}</span></div>
      ${rows.length ? rows.map((r) => html`<div class="list-item"><div class="grow"><div class="t">${r.name} <span class="chip ${r.status === 'paid' ? 'up' : 'warn'}">${r.status === 'paid' ? 'Paid' : 'Pending'}</span></div>
        <div class="s">${r.status === 'paid' ? `${METHOD_NAMES[r.method]} · ${dateTime(r.paid_at)}` : (r.payment_methods.find((x) => x.is_default) || r.payment_methods[0]) ? `Send to ${METHOD_NAMES[(r.payment_methods.find((x) => x.is_default) || r.payment_methods[0]).type]}: ${(r.payment_methods.find((x) => x.is_default) || r.payment_methods[0]).account}` : 'No payment method on file'}</div></div>
        <b class="num">${usd(r.amount)}</b>
        ${r.status === 'paid' ? html`<button class="btn ghost sm" data-unpaid="${r.id}">Undo</button>` : html`<button class="btn ghost sm" data-amount="${r.id}">${icon('edit')}</button><button class="btn success sm" data-paid="${r.id}">${icon('check')} Mark paid</button>`}</div>`)
    : empty('No members with a salary. Set salaries in the Users tab.')}</div></div>`);

  $('#pm', box).onchange = (e) => payments(box, e.target.value);
  $('#sf', box).onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      await api.put('/admin/schedule', { month, ...formValues(e.target) });
      toast('Payment date saved and members notified'); payments(box, month);
    });
  };
  box.onclick = async (e) => {
    const b = e.target.closest('[data-paid],[data-unpaid],[data-amount]'); if (!b) return;
    const r = rows.find((x) => x.id === Number(b.dataset.paid || b.dataset.unpaid || b.dataset.amount));
    if (b.dataset.unpaid) {
      if (await confirmDialog('Mark as pending?', `${r.name}'s payment will show as Pending again.`, { okLabel: 'Mark pending' })) {
        await api.post(`/admin/payments/${r.id}/unpaid`); payments(box, month);
      }
    } else if (b.dataset.amount) {
      formModal({
        title: `Edit amount · ${r.name}`,
        fields: [{ name: 'amount', label: 'Amount (USD)', type: 'number', step: '0.01', required: true }, { name: 'note', label: 'Note' }],
        values: r,
        submit: async (v) => { await api.put(`/admin/payments/${r.id}`, v); payments(box, month); },
      });
    } else {
      const def = r.payment_methods.find((x) => x.is_default) || r.payment_methods[0];
      formModal({
        title: `Mark paid · ${r.name} · ${usd(r.amount)}`,
        fields: [
          { name: 'method', label: 'Method', type: 'select', required: true, options: Object.entries(METHOD_NAMES), default: def?.type || 'bkash' },
          { name: 'paid_at', label: 'Paid on', type: 'datetime-local', required: true, default: nowLocal() },
          { name: 'note', label: 'Note / transaction ID' },
        ],
        submit: async (v) => { await api.post(`/admin/payments/${r.id}/paid`, v); toast(`${r.name} marked Paid and emailed`); payments(box, month); },
      });
    }
  };
}

// ---------- Trades / investments / loans ----------
const CRUD = {
  trades: {
    title: 'Trade',
    fields: [
      { name: 'coin', label: 'Coin', required: true, hint: 'Ticker, e.g. BTC, SOL, PEPE' },
      { name: 'side', label: 'Side', type: 'select', options: [['spot', 'Spot'], ['long', 'Long'], ['short', 'Short']], required: true },
      { name: 'profit', label: 'Profit (USD, negative for a loss)', type: 'number', step: '0.01', required: true },
      { name: 'fee', label: 'Fee (USD)', type: 'number', step: '0.01', default: 0 },
      { name: 'traded_at', label: 'Date and time', type: 'datetime-local', required: true, default: () => nowLocal() },
      { name: 'note', label: 'Note' },
    ],
    head: html`<th>Date</th><th>Coin</th><th class="right">Profit</th><th class="right">Fee</th><th class="right">Net</th>`,
    row: (t) => html`<td class="faint">${dateTime(t.traded_at)}</td><td><div class="row">${coinIcon(t.coin)}<b>${t.coin}</b> <span class="chip">${t.side}</span></div></td>
      <td class="right num ${cls(t.profit)}">${pnlText(t.profit)}</td><td class="right num">${usd(t.fee)}</td><td class="right num ${cls(t.profit - t.fee)}"><b>${pnlText(t.profit - t.fee)}</b></td>`,
  },
  investments: {
    title: 'Investment',
    fields: [
      { name: 'coin', label: 'Coin', required: true },
      { name: 'quantity', label: 'Quantity', type: 'number', step: 'any', required: true },
      { name: 'entry_price', label: 'Entry price (USD)', type: 'number', step: 'any', required: true },
      { name: 'invested_at', label: 'Date', type: 'date', required: true, default: () => today() },
      { name: 'status', label: 'Status', type: 'select', options: [['open', 'Open'], ['closed', 'Closed']], required: true },
      { name: 'note', label: 'Note' },
    ],
    head: html`<th>Coin</th><th class="right">Quantity</th><th class="right">Entry</th><th class="right">Cost</th><th>Status</th>`,
    row: (x) => html`<td><div class="row">${coinIcon(x.coin)}<div><b>${x.coin}</b><div class="faint" style="font-size:12px">${date(x.invested_at)}</div></div></div></td>
      <td class="right num">${qty(x.quantity)}</td><td class="right num">${price(x.entry_price)}</td><td class="right num">${usd(x.quantity * x.entry_price)}</td><td><span class="chip ${x.status === 'open' ? 'up' : ''}">${x.status}</span></td>`,
  },
  loans: {
    title: 'Loan',
    fields: [
      { name: 'kind', label: 'Loan type', type: 'select', options: [['usd', 'USD loan'], ['coin', 'Coin loan']], required: true },
      { name: 'coin', label: 'Coin', required: true, coinOnly: true },
      { name: 'quantity', label: 'Quantity borrowed', type: 'number', step: 'any', required: true, coinOnly: true },
      { name: 'entry_price', label: 'Price when borrowed (USD)', type: 'number', step: 'any', required: true, coinOnly: true },
      { name: 'amount_usd', label: 'Amount (USD)', type: 'number', step: '0.01', hint: 'For coin loans, leave empty to use quantity × price.' },
      { name: 'remaining_usd', label: 'Remaining to repay (USD)', type: 'number', step: '0.01', hint: 'Leave empty to use the full amount.' },
      { name: 'lender', label: 'Lender' },
      { name: 'borrowed_at', label: 'Borrowed on', type: 'date', required: true, default: () => today() },
      { name: 'repay_date', label: 'Repayment date', type: 'date' },
      { name: 'status', label: 'Status', type: 'select', options: [['open', 'Open'], ['repaid', 'Repaid']], required: true },
      { name: 'note', label: 'Note' },
    ],
    head: html`<th>Loan</th><th class="right">Amount</th><th class="right">Remaining</th><th>Repay by</th><th>Status</th>`,
    row: (l) => html`<td><div class="row">${l.kind === 'coin' ? coinIcon(l.coin) : html`<span class="coin-ico" style="background:#26a17b">USD</span>`}<div><b>${l.kind === 'coin' ? `${qty(l.quantity)} ${l.coin}` : 'USD loan'}</b><div class="faint" style="font-size:12px">${l.lender || ''}</div></div></div></td>
      <td class="right num">${usd(l.amount_usd)}</td><td class="right num">${usd(l.remaining_usd)}</td><td>${date(l.repay_date)}</td><td><span class="chip ${l.status === 'open' ? 'warn' : 'up'}">${l.status}</span></td>`,
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
  const view = async (box, pageNo = 1) => {
    const d = table === 'trades'
      ? await api.get(`/trades?page=${pageNo}&limit=25`, { fresh: true })
      : await api.get(`/${table}`, { fresh: true });
    const rows = d.rows;
    mount(box, html`<div class="card pad-0">
      <div class="card-head" style="padding:16px 16px 0"><h2>${def.title}s</h2><button class="btn sm" id="add">${icon('plus')} Add ${def.title.toLowerCase()}</button></div>
      ${rows.length ? html`<div class="table-wrap"><table><thead><tr>${def.head}<th></th></tr></thead><tbody>
        ${rows.map((r) => html`<tr>${def.row(r)}<td class="right"><button class="btn ghost sm" data-ed="${r.id}" aria-label="Edit">${icon('edit')}</button>
          <button class="btn ghost sm" data-del="${r.id}" aria-label="Delete">${icon('trash')}</button></td></tr>`)}</tbody></table></div>
        ${table === 'trades' ? pager(d.page, d.limit, d.total) : ''}` : empty(`No ${table} yet`)}</div>`);
    const open = (r) => formModal({
      title: r ? `Edit ${def.title.toLowerCase()}` : `Add ${def.title.toLowerCase()}`,
      fields: def.fields.map((f) => ({ ...f, default: typeof f.default === 'function' ? f.default() : f.default })),
      values: r || {},
      onChange: def.onChange,
      submit: async (v) => {
        if (r) await api.put(`/admin/${table}/${r.id}`, v); else await api.post(`/admin/${table}`, v);
        toast(`${def.title} saved`); view(box, pageNo);
      },
    });
    $('#add', box).onclick = () => open(null);
    box.onclick = async (e) => {
      const pg = e.target.closest('[data-page]'); if (pg) { view(box, Number(pg.dataset.page)); return; }
      const ed = e.target.closest('[data-ed]'); if (ed) { open(rows.find((r) => r.id === Number(ed.dataset.ed))); return; }
      const del = e.target.closest('[data-del]');
      if (del && await confirmDialog(`Delete ${def.title.toLowerCase()}?`, 'This cannot be undone. The deletion is recorded in the activity log.', { okLabel: 'Delete', danger: true })) {
        await api.del(`/admin/${table}/${del.dataset.del}`); toast('Deleted'); view(box, pageNo);
      }
    };
  };
  return view;
}

// ---------- Invites ----------
async function invites(box) {
  const { rows } = await api.get('/admin/invites', { fresh: true });
  mount(box, html`<div class="card pad-0">
    <div class="card-head" style="padding:16px 16px 0"><h2>Invite codes</h2><button class="btn sm" id="new">${icon('plus')} New invite</button></div>
    <p class="faint" style="margin:0 16px 8px;font-size:13px">People who sign up with a valid code are approved automatically after verifying their email.</p>
    ${rows.length ? rows.map((i) => html`<div class="list-item"><div class="grow"><div class="t mono" style="user-select:all">${i.code}</div>
      <div class="s">${i.email ? `For ${i.email} · ` : ''}${i.used_by ? `Used by ${i.used_by_name || 'deleted user'} on ${date(i.used_at)}` : `Expires ${date(i.expires_at)}`}</div></div>
      ${i.used_by ? html`<span class="chip up">Used</span>` : html`<button class="btn ghost sm" data-copy="${i.code}">Copy link</button><button class="btn ghost sm" data-del="${i.code}">${icon('trash')}</button>`}</div>`) : empty('No invites yet', 'mail')}</div>`);
  $('#new', box).onclick = () => formModal({
    title: 'New invite',
    fields: [{ name: 'email', label: 'Only for this email', type: 'email' }, { name: 'days', label: 'Valid for (days)', type: 'number', default: 14 }],
    submit: async (v) => {
      const r = await api.post('/admin/invites', v);
      await navigator.clipboard?.writeText(r.link).catch(() => {});
      toast(`Invite ${r.code} created, link copied`); invites(box);
    },
  });
  box.onclick = async (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) { await navigator.clipboard?.writeText(`${location.origin}/#/signup?invite=${c.dataset.copy}`).catch(() => {}); toast('Invite link copied'); }
    const d = e.target.closest('[data-del]');
    if (d) { await api.del(`/admin/invites/${d.dataset.del}`); invites(box); }
  };
}

// ---------- Settings ----------
async function settings(box) {
  const s = await api.get('/admin/settings', { fresh: true });
  mount(box, html`<div class="grid g2">
    <div class="stack">
      <div class="card"><div class="card-head"><h2>Balances</h2></div><form class="form" id="bal">
        ${field({ name: 'main_base', label: 'Starting main balance (USD)', type: 'number', step: '0.01', required: true, hint: 'Main Balance = this + all trade results (after fees) − salaries paid.' }, s.balances.main_base)}
        ${field({ name: 'trading_capital', label: 'Trading balance (USD)', type: 'number', step: '0.01', required: true, hint: 'Capital currently in the trading account.' }, s.balances.trading_capital)}
        <div><button class="btn" type="submit">Save balances</button></div></form></div>
      <div class="card"><div class="card-head"><h2>Standard deposit</h2></div><form class="form" id="dep">
        <div class="grid g2 keep">${field({ name: 'amount', label: 'Amount (USD)', type: 'number', step: '0.01', required: true }, s.default_deposit.amount)}
        ${field({ name: 'date', label: 'Deposit date', type: 'date' }, s.default_deposit.date)}</div>
        <label class="check"><input type="checkbox" name="apply"><span>Also apply to all existing members</span></label>
        <div><button class="btn" type="submit">Save deposit</button></div></form></div>
      <div class="card"><div class="card-head"><h2>Coins on the watchlist</h2></div><form class="form" id="wl">
        ${field({ name: 'watchlist', label: 'Tickers, separated by commas', required: true, hint: 'Coins in investments, loans and trades are added automatically.' }, (s.watchlist || state.watchlist).join(', '))}
        <div><button class="btn" type="submit">Save watchlist</button></div></form></div>
    </div>
    <div class="stack">
      <div class="card"><div class="card-head"><h2>Email types</h2></div><form class="form" id="em">
        ${Object.entries(s.email_types).map(([k, t]) => html`<label class="check"><input type="checkbox" name="${k}" ${t.locked || s.email_toggles[k] !== false ? 'checked' : ''} ${t.locked ? raw('disabled') : ''}><span>${t.label}${t.locked ? html` <span class="faint">(always on)</span>` : ''}${t.reminder ? html` <span class="faint">(members can opt out)</span>` : ''}</span></label>`)}
        <div><button class="btn" type="submit">Save email settings</button></div></form></div>
      <div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h2>Payment method logos</h2></div>
        ${Object.keys(METHOD_NAMES).map((t) => html`<div class="list-item">${methodLogo(t, s.method_logos)}<div class="grow t">${METHOD_NAMES[t]}</div>
          <label class="btn ghost sm">Upload<input type="file" class="hidden" accept="image/png,image/jpeg,image/svg+xml,image/webp" data-logo="${t}"></label></div>`)}
        <p class="faint" style="margin:8px 16px 14px;font-size:12px">PNG, JPG or SVG, up to 200 KB.</p></div>
      <div class="card"><div class="card-head"><h2>Send a notice to everyone</h2></div><form class="form" id="bc">
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
      toast(`${METHOD_NAMES[t]} logo updated`); settings(box);
    } catch (err) { toast(err.message, 'err'); }
  };
}

// ---------- Logs ----------
async function logs(box, kind = 'audit', pageNo = 1) {
  const d = await api.get(`/admin/${kind === 'audit' ? 'audit' : kind}?page=${pageNo}`, { fresh: true });
  const tabs = [['audit', 'Admin activity'], ['emails', 'Email log'], ['logins', 'Logins']];
  const tablesByKind = {
    audit: () => html`<thead><tr><th>When</th><th>Who</th><th>Action</th><th>Item</th><th>Details</th></tr></thead><tbody>${d.rows.map((r) => html`<tr>
      <td class="faint">${dateTime(r.created_at)}</td><td>${r.actor_name || 'System'}</td><td><span class="chip">${r.action}</span></td><td>${r.entity || ''} ${r.entity_id || ''}</td>
      <td class="faint" style="max-width:380px;overflow:hidden;text-overflow:ellipsis" title="${r.details ? JSON.stringify(r.details) : ''}">${r.details ? JSON.stringify(r.details) : ''}</td></tr>`)}</tbody>`,
    emails: () => html`<thead><tr><th>When</th><th>To</th><th>Type</th><th>Subject</th><th>Result</th></tr></thead><tbody>${d.rows.map((r) => html`<tr>
      <td class="faint">${dateTime(r.created_at)}</td><td>${r.to_email}</td><td><span class="chip">${r.type}</span></td><td>${r.subject}</td>
      <td><span class="chip ${r.status === 'sent' ? 'up' : r.status === 'failed' ? 'down' : 'warn'}" title="${r.last_error || ''}">${r.status}${r.attempts > 1 ? ` ×${r.attempts}` : ''}</span></td></tr>`)}</tbody>`,
    logins: () => html`<thead><tr><th>When</th><th>User</th><th>Result</th><th>IP</th><th>Device</th></tr></thead><tbody>${d.rows.map((r) => html`<tr>
      <td class="faint">${dateTime(r.created_at)}</td><td>${r.name || r.email || '—'}</td><td><span class="chip ${r.success ? 'up' : 'down'}">${r.success ? 'Success' : 'Failed'}</span></td>
      <td class="mono">${r.ip}</td><td class="faint" style="max-width:320px;overflow:hidden;text-overflow:ellipsis">${r.user_agent}</td></tr>`)}</tbody>`,
  };
  mount(box, html`<div class="stack"><div class="tabs" style="align-self:flex-start">${tabs.map(([k, l]) => html`<button class="tab ${k === kind ? 'active' : ''}" data-log="${k}">${l}</button>`)}</div>
    <div class="card pad-0">${d.rows.length ? html`<div class="table-wrap"><table>${tablesByKind[kind]()}</table></div>
    <div class="row between" style="padding:12px 16px"><span class="faint">Page ${pageNo}</span><span class="row">
      <button class="btn ghost sm" data-pg="${pageNo - 1}" ${pageNo <= 1 ? raw('disabled') : ''}>Newer</button>
      <button class="btn ghost sm" data-pg="${pageNo + 1}" ${d.rows.length < d.limit ? raw('disabled') : ''}>Older</button></span></div>` : empty('Nothing logged yet', 'shield')}</div></div>`);
  box.onclick = (e) => {
    const t = e.target.closest('[data-log]'); if (t) { logs(box, t.dataset.log); return; }
    const p = e.target.closest('[data-pg]'); if (p) logs(box, kind, Number(p.dataset.pg));
  };
}

const VIEWS = {
  users,
  payments: (box) => payments(box),
  trades: crudView('trades'),
  investments: crudView('investments'),
  loans: crudView('loans'),
  invites,
  settings,
  logs: (box) => logs(box),
};
