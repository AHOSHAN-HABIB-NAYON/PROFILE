import { api, esc, pageHead, listPage, formSheet, toast, toastError, sheet } from './kit.js';
import { chip, relEl, fmtDate, money, num, confirmSheet } from '/assets/js/core.js';

export async function mount(el) {
  const plans = (await api('/admin/plans')).items;
  const list = listPage(el, {
    head: pageHead('fa-solid fa-users', 'Users', 'Search, filter and manage accounts', '<button class="btn btn-primary btn-sm" data-new><i class="fa-solid fa-user-plus"></i>Add user</button>'),
    endpoint: '/admin/users',
    filters: [
      { name: 'q', type: 'search', label: 'Search name, email or ID…' },
      { name: 'status', type: 'select', options: [['', 'All status'], ['active', 'Active'], ['suspended', 'Suspended']] },
      { name: 'premium', type: 'select', options: [['', 'All plans'], ['1', 'Premium'], ['0', 'Free']] },
      { name: 'role', type: 'select', options: [['', 'All roles'], ['user', 'Users'], ['admin', 'Admins']] },
    ],
    // One compact line per user; all actions live in the 👁 details sheet.
    row: (u) => `<div class="user-row">
      <span class="avatar">${esc(String(u.name || u.email).charAt(0).toUpperCase())}</span>
      <div class="user-main"><div class="user-title">${esc(u.name)}${u.role === 'admin' ? ' <i class="fa-solid fa-shield-halved" style="color:var(--primary)" title="Admin"></i>' : ''}${u.premium_plan ? ' <i class="fa-solid fa-crown" style="color:#f59e0b" title="Premium"></i>' : ''}</div>
        <div class="user-sub">#${u.id} · ${esc(u.email)} · ${num(u.used_resources)} used</div></div>
      <span class="user-bal">${esc(money(u.balance))}</span>
      ${chip(u.status)}
      <button class="icon-mini" data-a="view" aria-label="View details"><i class="fa-solid fa-eye"></i></button>
    </div>`,
    async onAction(a, u, ctx) {
      if (a === 'view') return viewUser(u, (act) => this.onAction(act, u, ctx));
      if (a === 'edit') {
        return formSheet({
          title: `Edit ${u.name}`, fields: [
            { name: 'name', label: 'Name', value: u.name, required: true },
            { name: 'email', label: 'Email', type: 'email', value: u.email, required: true },
            { name: 'role', label: 'Role', type: 'select', value: u.role, options: [['user', 'User'], ['admin', 'Admin']] },
            { name: 'email_verified', label: 'Email verified', type: 'switch', value: !!u.email_verified_at },
          ],
          onSubmit: async (d) => { const r = await api(`/admin/users/${u.id}`, { method: 'PUT', body: d }); ctx.reload(); return r; },
        });
      }
      if (a === 'wallet') {
        return formSheet({
          title: 'Adjust wallet', icon: 'fa-solid fa-wallet', two: false, fields: [
            { name: 'amount', label: `Amount (current ${money(u.balance)})`, placeholder: 'e.g. 5.00 or -2.50', required: true, hint: 'Positive credits, negative debits. Logged in the audit trail.' },
            { name: 'reason', label: 'Reason', required: true, placeholder: 'Bonus, correction, …' },
          ],
          onSubmit: async (d) => { const r = await api(`/admin/users/${u.id}/wallet`, { method: 'POST', body: d }); ctx.reload(); return r; },
        });
      }
      if (a === 'premium') {
        return formSheet({
          title: 'Change premium', icon: 'fa-solid fa-crown', two: false, fields: [
            { name: 'action', label: 'Action', type: 'select', options: [['grant', 'Grant / extend plan'], ['revoke', 'Revoke active plan']] },
            { name: 'plan_id', label: 'Plan', type: 'select', options: plans.map((p) => [p.id, `${p.name} · $${p.price} · ${p.resource_limit ?? 'unlimited'}`]) },
          ],
          onSubmit: async (d) => { const r = await api(`/admin/users/${u.id}/premium`, { method: 'POST', body: d }); ctx.reload(); return r; },
        });
      }
      if (a === 'limits') {
        const full = await api(`/admin/users/${u.id}`);
        return formSheet({
          title: 'Change limits', icon: 'fa-solid fa-gauge', fields: [
            { name: 'custom_hourly_limit', label: 'Hourly limit', type: 'number', value: full.user.custom_hourly_limit ?? '', placeholder: `Default ${full.limits.hourly_limit}` },
            { name: 'custom_daily_limit', label: 'Daily limit', type: 'number', value: full.user.custom_daily_limit ?? '', placeholder: 'Default' },
            { name: 'custom_quota', label: 'Quota override', type: 'number', value: full.user.custom_quota ?? '', placeholder: 'Plan default', full: true, hint: 'Leave blank to use global / plan defaults.' },
          ],
          onSubmit: async (d) => { const r = await api(`/admin/users/${u.id}/limits`, { method: 'PUT', body: d }); return r; },
        });
      }
      if (a === 'reset') {
        if (!(await confirmSheet({ title: 'Reset password?', message: `Send a password reset link to ${u.email}.`, confirm: 'Send reset link' }))) return;
        const r = await api(`/admin/users/${u.id}/reset-password`, { method: 'POST' });
        if (r.link) sheet({ title: 'One-time reset link', body: `<p class="muted">${esc(r.message)}</p><div class="address-box">${esc(r.link)}</div>` });
        else toast(r.message);
        return;
      }
      if (a === 'suspend' || a === 'unsuspend') {
        if (a === 'suspend' && !(await confirmSheet({ title: 'Suspend user?', message: `${u.email} will be signed out and blocked.`, confirm: 'Suspend', danger: true }))) return;
        const r = await api(`/admin/users/${u.id}/${a}`, { method: 'POST' });
        toast(r.message); ctx.reload();
      }
    },
  });

  el.addEventListener('click', (e) => {
    if (!e.target.closest('[data-new]')) return;
    formSheet({
      title: 'Add user', icon: 'fa-solid fa-user-plus', fields: [
        { name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true, hint: '8+ chars, letters & numbers' },
        { name: 'role', label: 'Role', type: 'select', options: [['user', 'User'], ['admin', 'Admin']] },
      ],
      onSubmit: async (d) => { const r = await api('/admin/users', { method: 'POST', body: d }); list.reload(); return r; },
    });
  });
}

const ACTIONS = [
  ['edit', 'fa-pen', 'Edit'], ['wallet', 'fa-wallet', 'Adjust wallet'], ['premium', 'fa-crown', 'Change premium'],
  ['limits', 'fa-gauge', 'Change limits'], ['reset', 'fa-key', 'Reset password'],
];

async function viewUser(row, run) {
  const r = await api(`/admin/users/${row.id}`);
  const u = r.user;
  const s = sheet({
    title: u.name, icon: 'fa-solid fa-user', wide: true,
    body: `<div class="row-flex" style="margin-bottom:12px"><span class="avatar lg">${esc(u.initial)}</span><div><strong>${esc(u.email)}</strong><div class="row-flex" style="gap:6px">${chip(u.status)} ${u.twofa ? chip('info', '2FA') : ''} ${u.email_verified ? chip('success', 'verified') : chip('warning', 'unverified')}</div></div></div>
      <div class="grid grid-2"><dl class="kv"><dt>Joined</dt><dd>${esc(fmtDate(u.created_at))}</dd><dt>Last login</dt><dd>${u.last_login_at ? relEl(new Date(u.last_login_at).toISOString()) : '—'}</dd>
        <dt>Last IP</dt><dd>${esc(u.last_login_ip || '—')}</dd><dt>Failed logins</dt><dd>${u.security?.failed_login_attempts ?? 0}</dd><dt>Binance UID</dt><dd>${esc(u.binance_uid || '—')}</dd></dl>
      <dl class="kv"><dt>Balance</dt><dd>${esc(money(r.wallet.balance))}</dd><dt>Earned</dt><dd>${esc(money(r.wallet.earned))}</dd><dt>Withdrawn</dt><dd>${esc(money(r.wallet.withdrawn))}</dd>
        <dt>Limits</dt><dd>${r.limits.hourly_limit}/h · ${r.limits.daily_limit}/d</dd><dt>Quota</dt><dd>${r.limits.quota_used}/${r.limits.quota ?? '∞'}</dd></dl></div>
      <div class="divider"></div><h3>Recent transactions</h3>
      <div class="list">${r.transactions.map((t) => `<div class="list-item"><div class="li-body"><div class="li-title">${esc(t.description)}</div><div class="li-sub">${esc(t.type)} · ${relEl(new Date(t.created_at).toISOString())}</div></div><strong>${esc(money(t.amount))}</strong></div>`).join('') || '<div class="muted">None</div>'}</div>
      <div class="divider"></div><h3>Recent resources</h3>
      <div class="list">${r.assignments.map((a) => `<div class="list-item"><div class="li-body"><div class="li-title mono">${esc(a.resource_value)}</div><div class="li-sub">${esc(a.country_code)} ${esc(a.app_code)}</div></div>${chip(a.status)}</div>`).join('') || '<div class="muted">None</div>'}</div>`,
    foot: `<div class="row-flex" style="width:100%">${ACTIONS.map(([k, i, l]) => `<button class="btn btn-ghost btn-sm" data-act="${k}"><i class="fa-solid ${i}"></i>${l}</button>`).join('')}
      ${u.status === 'suspended' ? '<button class="btn btn-success btn-sm" data-act="unsuspend"><i class="fa-solid fa-user-check"></i>Unsuspend</button>'
    : '<button class="btn btn-danger btn-sm" data-act="suspend"><i class="fa-solid fa-user-slash"></i>Suspend</button>'}</div>`,
  });
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    s.close();
    Promise.resolve(run(b.dataset.act)).catch((err) => toastError(err));
  });
}
