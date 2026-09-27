/* LifeTrack Admin — separate premium admin UI. Every action is permission-checked and audited on the server. */
import { $, $$, el, html, raw, icon, payMark, api, state, loadLang, toast, openSheet, confirmDialog, withBusy, formErrors, money, num, relTime, fmtDate, esc } from '../core.js';
import { lineChart, barChart, donut, PALETTE } from '../charts.js';

let ME = null; let PERMS = [];
const can = (p) => PERMS.includes(p);
const NAV = [
  ['dashboard', 'grid', 'Dashboard', 'stats.view'], 'Manage',
  ['users', 'users', 'Users', 'users.view'], ['transactions', 'layers', 'Transactions', 'tx.view'], ['accounts', 'wallet', 'Accounts & categories', 'tx.view'],
  'Engage', ['notifications', 'megaphone', 'Notifications & push', 'notifications.user'], ['emails', 'mail', 'Emails', 'emails.view'], ['translations', 'language', 'Languages', 'translations.manage'],
  'Configure', ['settings', 'settings', 'Settings', 'branding.manage'],
  'Monitor', ['security', 'shield', 'Security logs', 'logs.security'], ['audit', 'activity', 'Audit logs', 'logs.audit'], ['system', 'server', 'System & backups', 'settings.system'],
];
const initials = (n) => (n || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const av = (u) => (u.avatar_url ? html`<img class="avatar" src="${u.avatar_url}" alt="">` : html`<span class="avatar">${initials(u.name)}</span>`);
const badgeRole = (r) => html`<span class="badge ${{ super_admin: 'violet', admin: 'blue', support: 'teal' }[r] || ''}">${r.replace('_', ' ')}</span>`;

function chrome(route) {
  const c = state.config || {};
  $('#side').innerHTML = String(html`<a class="adm-brand" href="/admin">${c.logo ? html`<img src="${c.logo}" alt="">` : html`<svg><use href="#logo"/></svg>`}<span><b>${c.site || 'LifeTrack'}</b><small>Admin console</small></span></a>
    <nav class="adm-nav">${NAV.map((n) => typeof n === 'string' ? html`<div class="sep">${n}</div>` : can(n[3]) ? html`<a href="/admin/${n[0] === 'dashboard' ? '' : n[0]}" data-r="${n[0]}" class="${route === n[0] ? 'active' : ''}">${icon(n[1])}${n[2]}</a>` : '')}
      <div class="sep">App</div><a href="/app" data-ext>${icon('home')}Open LifeTrack</a></nav>
    <div class="me"><span class="avatar" style="width:30px;height:30px;font-size:11px">${initials(ME.name)}</span><div style="min-width:0"><b class="ellipsis">${ME.name}</b><span>${ME.role.replace('_', ' ')}</span></div></div>`);
  const title = (NAV.find((n) => Array.isArray(n) && n[0] === route) || [])[2] || 'Admin';
  $('#top').innerHTML = String(html`<button class="icon-btn menu-btn" data-menu aria-label="Menu">${icon('menu')}</button><h1>${title}</h1><button class="icon-btn bordered" data-theme aria-label="Theme">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button><a class="btn btn-outline btn-sm" href="/app">${icon('external', 'i-sm')}App</a>`);
  $('[data-menu]').onclick = () => $('#side').classList.toggle('open');
  $('[data-theme]').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; try { localStorage.setItem('lt-theme', t); } catch {} chrome(route); };
  document.title = `${title} · Admin · ${c.site || 'LifeTrack'}`;
}

/* ---------- routing ---------- */
const route = () => (location.pathname.replace(/^\/admin\/?/, '').split('/')[0] || 'dashboard');
async function render() {
  const r = route(); const def = NAV.find((n) => Array.isArray(n) && n[0] === r);
  if (!def || !can(def[3])) { history.replaceState({}, '', '/admin'); if (r !== 'dashboard') return render(); }
  chrome(r); $('#side').classList.remove('open');
  const view = $('#view'); view.innerHTML = '<div class="panel panel-b"><div class="sk" style="height:200px"></div></div>';
  try { await VIEWS[r](view); view.firstElementChild?.classList.add('page-in-up'); }
  catch (e) { view.innerHTML = String(html`<div class="panel"><div class="empty"><span class="tile tile-lg" style="--c:var(--red)">${icon('alert')}</span><h4>Couldn't load</h4><p>${e.message}</p></div></div>`); }
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/admin"]');
  if (!a || e.metaKey || e.ctrlKey || a.hasAttribute('download') || a.getAttribute('href').startsWith('/api')) return;
  e.preventDefault(); history.pushState({}, '', a.getAttribute('href')); render();
});
window.addEventListener('popstate', render);

/* ---------- helpers ---------- */
function pager(d, onPage) {
  const n = el(html`<div class="pag"><span>${num(d.total)} records · page ${d.page} of ${Math.max(1, d.pages)}</span><span style="display:flex;gap:6px"><button class="btn btn-outline btn-sm" data-p="-1" ${d.page <= 1 ? 'disabled' : ''}>${icon('chevron-left', 'i-sm')}</button><button class="btn btn-outline btn-sm" data-p="1" ${d.page >= d.pages ? 'disabled' : ''}>${icon('chevron-right', 'i-sm')}</button></span></div>`);
  $$('[data-p]', n).forEach((b) => b.onclick = () => onPage(d.page + Number(b.dataset.p)));
  return n;
}
const kpi = (label, value, ic, c, sub = '', subCls = 'muted') => html`<div class="kpi"><div class="top">${label}<span class="tile tile-sm" style="--c:${c}">${icon(ic)}</span></div><b>${value}</b><small class="${subCls}">${sub}</small></div>`;
const growth = (g) => (g === null || g === undefined ? html`<span class="muted">—</span>` : html`<span class="${g >= 0 ? 'pos' : 'neg'}">${g >= 0 ? '▲' : '▼'} ${Math.abs(g)}% vs prev.</span>`);
function barList(items, colorFn) {
  const max = Math.max(1, ...items.map((x) => x.n));
  const n = el(html`<div class="bar-list">${items.length ? items.map((x, i) => html`<div class="row2"><span class="ellipsis">${x.k}</span><span class="track"><span data-w="${(x.n / max) * 100}" style="--c:${colorFn ? colorFn(x, i) : PALETTE[i % PALETTE.length]}"></span></span><b style="text-align:right">${num(x.n)}</b></div>`) : html`<p class="muted" style="font-size:12px">No data yet</p>`}</div>`);
  requestAnimationFrame(() => requestAnimationFrame(() => $$('[data-w]', n).forEach((s) => { s.style.width = s.dataset.w + '%'; })));
  return n;
}

/* ---------- views ---------- */
const VIEWS = {
  async dashboard(view) {
    let days = 30;
    const draw = async () => {
      const d = await api.get(`/api/admin/stats?days=${days}`, { force: true });
      const cur = d.currency;
      view.innerHTML = String(html`<div>
        <div class="toolbar"><div class="seg" data-days>${[7, 30, 90].map((x) => html`<button data-v="${x}" class="${x === days ? 'active' : ''}">${x} days</button>`)}</div><span class="muted" style="font-size:12px;margin-left:auto">Live data · ${fmtDate(new Date(), 'long')}</span></div>
        <div class="kpis stagger">
          ${kpi('Total users', num(d.users.total), 'users', 'var(--primary)', `${num(d.users.verified)} verified · ${num(d.users.suspended)} suspended`)}
          ${kpi('Active users (30d)', num(d.users.active30), 'activity', 'var(--green)', `${num(d.users.active1)} today · ${num(d.users.active7)} this week`)}
          ${kpi(`New registrations (${days}d)`, num(d.users.new), 'sparkle', 'var(--violet)', growth(d.users.newGrowth))}
          ${kpi(`Transactions (${days}d)`, num(d.transactions.count), 'layers', 'var(--teal)', growth(d.transactions.growth))}
          ${kpi('Income volume', money(d.transactions.income, cur, { compact: true }), 'income', 'var(--green)', `${days} days, all users`)}
          ${kpi('Expense volume', money(d.transactions.expense, cur, { compact: true }), 'expense', 'var(--red)', `${days} days, all users`)}
          ${kpi('Active sessions (24h)', num(d.activeSessions), 'phone', 'var(--orange)', 'signed-in devices')}
          ${kpi('Protected accounts', num(d.users.twofa + d.users.passkeys), 'shield', 'var(--pink)', `${num(d.users.twofa)} 2FA · ${num(d.users.passkeys)} passkey`)}
        </div>
        <div class="adm-grid g2">
          <section class="panel"><div class="panel-h"><h3>Growth &amp; activity</h3><div class="legend"><span style="--c:var(--primary)"><i></i>Registrations</span><span style="--c:var(--teal)"><i></i>Daily sign-ins</span></div></div><div class="panel-b"><div data-c1></div></div></section>
          <section class="panel"><div class="panel-h"><h3>Users by role</h3></div><div class="panel-b" style="display:grid;place-items:center" data-roles></div></section>
        </div>
        <div class="adm-grid g2">
          <section class="panel"><div class="panel-h"><h3>Transactions per day</h3></div><div class="panel-b"><div data-c2></div></div></section>
          <section class="panel"><div class="panel-h"><h3>Top expense categories</h3></div><div class="panel-b" data-cats></div></section>
        </div>
        <div class="adm-grid g3">
          <section class="panel"><div class="panel-h"><h3>Notifications</h3><span class="badge blue">${num(d.notifications.reduce((a, x) => a + x.n, 0))}</span></div><div class="panel-b" data-notif></div></section>
          <section class="panel"><div class="panel-h"><h3>Email delivery</h3></div><div class="panel-b">
            <div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div><small class="muted">Sent</small><b style="display:block;font-size:18px" class="pos">${num(d.email.sent || 0)}</b></div><div><small class="muted">Failed</small><b style="display:block;font-size:18px" class="neg">${num(d.email.failed || 0)}</b></div><div><small class="muted">Skipped</small><b style="display:block;font-size:18px">${num(d.email.skipped || 0)}</b></div></div>
            <hr class="divider"><div style="font-size:12px;font-weight:700;margin-bottom:6px">Push delivery</div>
            <div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div><small class="muted">Sent</small><b style="display:block;font-size:18px" class="pos">${num(d.push.sent || 0)}</b></div><div><small class="muted">Failed</small><b style="display:block;font-size:18px" class="neg">${num(d.push.failed || 0)}</b></div><div><small class="muted">Expired</small><b style="display:block;font-size:18px">${num(d.push.expired || 0)}</b></div></div></div></section>
          <section class="panel"><div class="panel-h"><h3>Security events</h3><a class="link" href="/admin/security">View logs</a></div><div class="panel-b" data-sec></div></section>
        </div>
        <div class="adm-grid g3">
          <section class="panel"><div class="panel-h"><h3>Languages</h3></div><div class="panel-b" data-langs></div></section>
          <section class="panel"><div class="panel-h"><h3>Account types</h3></div><div class="panel-b" data-acct></div></section>
          <section class="panel"><div class="panel-h"><h3>Newest users</h3><a class="link" href="/admin/users">All users</a></div><div class="list">${d.recentUsers.map((u) => html`<div class="li"><span class="avatar" style="width:32px;height:32px;font-size:11px">${initials(u.name)}</span><span class="li-main"><span class="li-title">${u.name}</span><span class="li-sub">${u.email}</span></span><span class="li-sub">${relTime(u.created_at)}</span></div>`)}</div></section>
        </div>
        <section class="panel" style="margin-top:12px"><div class="panel-h"><h3>Recent warnings &amp; critical events</h3></div><div class="scroll-x"><table class="tbl"><thead><tr><th>Event</th><th>User</th><th>IP</th><th>When</th></tr></thead><tbody>${d.recentSecurity.length ? d.recentSecurity.map((s) => html`<tr><td><span class="badge ${s.severity === 'critical' ? 'red' : 'orange'}">${s.event}</span></td><td>${s.email || '—'}</td><td class="mono">${s.ip || ''}</td><td>${relTime(s.created_at)}</td></tr>`) : html`<tr><td colspan="4" class="muted">No warnings 🎉</td></tr>`}</tbody></table></div></section>
      </div>`);
      const lbl = (x) => x.d.slice(5);
      lineChart($('[data-c1]', view), { labels: d.series.registrations.map(lbl), series: [{ name: 'Registrations', color: 'var(--primary)', values: d.series.registrations.map((x) => x.n) }, { name: 'Sign-ins', color: 'var(--teal)', values: d.series.logins.map((x) => x.n) }], height: 220, fmt: (v) => num(v) });
      barChart($('[data-c2]', view), { labels: d.series.transactions.map(lbl), series: [{ name: 'Transactions', color: 'var(--violet)', values: d.series.transactions.map((x) => x.n) }], height: 200, fmt: (v) => num(v) });
      const roleC = { user: '#94A3B8', support: '#0EA5A0', admin: '#2F62F0', super_admin: '#8B5CF6' };
      const rw = el('<div class="donut-wrap"><div></div><div class="cat-rows"></div></div>'); $('[data-roles]', view).append(rw);
      donut(rw.firstElementChild, { segments: d.roles.map((r) => ({ label: r.k, value: r.n, color: roleC[r.k] })), centerTop: num(d.users.total), centerSub: 'users', size: 120 });
      rw.lastElementChild.innerHTML = String(html`${d.roles.map((r) => html`<div class="cat-row" style="--c:${roleC[r.k]}"><i></i><span>${r.k.replace('_', ' ')}</span><span></span><b>${r.n}</b></div>`)}`);
      $('[data-cats]', view).append(barList(d.topCategories));
      $('[data-notif]', view).append(barList(d.notifications.map((x) => ({ k: x.type.replace(/_/g, ' '), n: x.n }))));
      $('[data-sec]', view).append(barList(d.security.slice(0, 7).map((x) => ({ k: x.event.replace(/_/g, ' '), n: x.n, s: x.severity })), (x) => ({ critical: 'var(--red)', warning: 'var(--orange)' }[x.s] || 'var(--primary)')));
      $('[data-langs]', view).append(barList(d.languages.map((x) => ({ k: { en: 'English', bn: 'বাংলা', hi: 'हिन्दी' }[x.k] || x.k, n: x.n }))));
      $('[data-acct]', view).append(barList(d.accountTypes.map((x) => ({ k: x.k, n: x.n })), (x) => ({ bkash: '#E2136E', nagad: '#F7941D', rocket: '#8C3494', bank: '#1E4FD8', card: '#334155', cash: '#16A34A', wallet: '#0EA5A0' }[x.k])));
      const seg = $('[data-days]', view); const { segmented } = await import('../core.js');
      segmented(seg, (v) => { days = Number(v); draw(); });
    };
    await draw();
  },

  async users(view) {
    const f = { q: '', status: '', role: '', verified: '', sort: 'joined', page: 1 };
    view.innerHTML = String(html`<div><div class="toolbar"><div class="input-group" style="flex:1;min-width:200px">${icon('search', 'i-sm')}<input class="input" data-q placeholder="Search name, email or ID" style="width:100%"></div>
      <select class="select" data-f="status"><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
      <select class="select" data-f="role"><option value="">All roles</option><option value="user">User</option><option value="support">Support</option><option value="admin">Admin</option><option value="super_admin">Super admin</option></select>
      <select class="select" data-f="verified"><option value="">Any verification</option><option value="1">Verified</option><option value="0">Unverified</option></select>
      <select class="select" data-f="sort"><option value="joined">Newest</option><option value="login">Last login</option><option value="name">Name</option></select></div>
      <div class="panel" data-table></div></div>`);
    const load = async () => {
      const qs = new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '')));
      const d = await api.get('/api/admin/users?' + qs, { force: true });
      const box = $('[data-table]', view);
      box.innerHTML = String(html`<div class="scroll-x"><table class="tbl"><thead><tr><th>User</th><th>Status</th><th>Role</th><th>Joined</th><th>Last login</th><th>Security</th><th>Notifications</th><th></th></tr></thead><tbody>
        ${d.items.length ? d.items.map((u) => html`<tr><td><div class="u">${av(u)}<div style="min-width:0"><b style="display:block">${u.name}</b><span class="muted">${u.email}</span></div></div></td>
          <td><span class="badge ${u.status === 'active' ? 'green' : 'red'}">${u.status}</span></td><td>${badgeRole(u.role)}</td><td>${fmtDate(u.created_at)}</td><td>${u.last_login_at ? relTime(u.last_login_at) : html`<span class="muted">never</span>`}</td>
          <td style="white-space:nowrap">${u.email_verified_at ? html`<span class="badge green" title="Email verified">✓ email</span>` : html`<span class="badge orange">unverified</span>`} ${u.twofa ? html`<span class="badge violet">2FA</span>` : ''} ${Number(u.passkeys) ? html`<span class="badge blue">${u.passkeys} passkey</span>` : ''} ${u.google ? html`<span class="badge">Google</span>` : ''}</td>
          <td style="white-space:nowrap">${u.notify_email ? html`<span class="badge">email</span>` : ''} ${Number(u.push_devices) ? html`<span class="badge teal">push ×${u.push_devices}</span>` : ''}</td>
          <td><button class="btn btn-soft btn-sm" data-u="${u.id}">View</button></td></tr>`) : html`<tr><td colspan="8"><div class="empty"><h4>No users match</h4></div></td></tr>`}</tbody></table></div>`);
      box.append(pager(d, (p) => { f.page = p; load(); }));
      $$('[data-u]', box).forEach((b) => b.onclick = () => userDetail(b.dataset.u, load));
    };
    let deb; $('[data-q]', view).oninput = (e) => { clearTimeout(deb); deb = setTimeout(() => { f.q = e.target.value.trim(); f.page = 1; load(); }, 300); };
    $$('[data-f]', view).forEach((s) => s.onchange = () => { f[s.dataset.f] = s.value; f.page = 1; load(); });
    await load();
  },

  async transactions(view) {
    const f = { q: '', type: '', page: 1 };
    view.innerHTML = String(html`<div><div class="toolbar"><div class="input-group" style="flex:1;min-width:200px">${icon('search', 'i-sm')}<input class="input" data-q placeholder="Search user email or note" style="width:100%"></div>
      <select class="select" data-type><option value="">All types</option>${['income', 'expense', 'investment', 'transfer', 'deposit', 'lend', 'borrow', 'repay_in', 'repay_out', 'adjustment'].map((x) => html`<option>${x}</option>`)}</select></div>
      <div class="alert" style="margin-bottom:12px">${icon('info', 'i-sm')}<span>Read-only oversight. Administrators cannot create or modify user transactions.</span></div><div class="panel" data-table></div></div>`);
    const load = async () => {
      const d = await api.get(`/api/admin/transactions?page=${f.page}&q=${encodeURIComponent(f.q)}&type=${f.type}`, { force: true });
      const box = $('[data-table]', view);
      box.innerHTML = String(html`<div class="scroll-x"><table class="tbl"><thead><tr><th>Date</th><th>User</th><th>Type</th><th>Account</th><th>Category</th><th style="text-align:right">Amount</th><th>Ref</th></tr></thead><tbody>
        ${d.items.map((x) => html`<tr><td>${fmtDate(x.occurred_at)}</td><td><b>${x.user_name}</b><br><span class="muted">${x.email}</span></td><td><span class="badge">${x.type}</span></td><td style="display:flex;gap:6px;align-items:center">${payMark(x.account_type)}${x.account_type}</td><td>${x.category || '—'}</td><td style="text-align:right;font-weight:700">${money(x.amount, x.currency)}</td><td class="mono muted">${x.uuid.slice(0, 8)}</td></tr>`)}</tbody></table></div>`);
      $$('.tbl .pm', box).forEach((p) => { p.style.width = '22px'; p.style.height = '22px'; p.style.borderRadius = '6px'; });
      box.append(pager(d, (p) => { f.page = p; load(); }));
    };
    let deb; $('[data-q]', view).oninput = (e) => { clearTimeout(deb); deb = setTimeout(() => { f.q = e.target.value.trim(); f.page = 1; load(); }, 300); };
    $('[data-type]', view).onchange = (e) => { f.type = e.target.value; f.page = 1; load(); };
    await load();
  },

  async accounts(view) {
    const [accs, cats] = await Promise.all([api.get('/api/admin/accounts', { force: true }), can('categories.manage') ? api.get('/api/admin/categories', { force: true }) : Promise.resolve(null)]);
    view.innerHTML = String(html`<div class="adm-grid g11" style="margin-top:0">
      <section class="panel"><div class="panel-h"><h3>Accounts across all users</h3></div><div class="scroll-x"><table class="tbl"><thead><tr><th>Type</th><th>Currency</th><th>Count</th><th>Archived</th><th style="text-align:right">Total balance</th></tr></thead><tbody>${accs.map((a) => html`<tr><td style="display:flex;gap:8px;align-items:center">${payMark(a.type)}<b>${a.type}</b></td><td>${a.currency}</td><td>${num(a.n)}</td><td>${num(a.archived)}</td><td style="text-align:right;font-weight:700">${money(a.total, a.currency)}</td></tr>`)}</tbody></table></div></section>
      ${cats ? html`<section class="panel"><div class="panel-h"><h3>Global categories</h3><button class="btn btn-primary btn-sm" data-add>${icon('plus', 'i-sm')}Add</button></div><div class="panel-b"><p class="hint" style="margin-bottom:10px">Global categories are available to every user in addition to their personal ones.</p><div class="cat-pick">${cats.length ? cats.map((c) => html`<button data-c="${c.id}" style="${c.archived_at ? 'opacity:.4' : ''}"><span class="tile" style="--c:${c.color}">${icon(c.icon)}</span>${c.name}<small class="muted">${c.kind}</small></button>`) : html`<p class="muted" style="grid-column:1/-1;font-size:12px">No global categories yet.</p>`}</div></div></section>` : ''}</div>`);
    $$('.tbl .pm', view).forEach((p) => { p.style.width = '24px'; p.style.height = '24px'; });
    $$('[data-c]', view).forEach((b) => b.onclick = async () => { await api.del(`/api/admin/categories/${b.dataset.c}`); toast('Category toggled'); VIEWS.accounts(view); });
    $('[data-add]', view)?.addEventListener('click', () => {
      const body = el(html`<form><div class="field"><label>Name</label><input class="input" name="name"></div><div class="row"><div class="field"><label>Kind</label><select class="select" name="kind"><option>expense</option><option>income</option><option>investment</option><option>other</option></select></div><div class="field"><label>Icon</label><select class="select" name="icon">${['tag', 'utensils', 'car', 'bag', 'bolt', 'house', 'heart', 'book', 'film', 'wifi', 'users', 'plane', 'gift', 'briefcase', 'coin', 'trend-up'].map((i) => html`<option>${i}</option>`)}</select></div><div class="field"><label>Colour</label><input class="input" type="color" name="color" value="#2F62F0" style="padding:4px"></div></div></form>`);
      const foot = el(html`<button class="btn btn-primary btn-block">Create</button>`);
      const s = openSheet({ title: 'New global category', body, foot });
      foot.onclick = () => withBusy(foot, async () => { try { await api.post('/api/admin/categories', Object.fromEntries(new FormData(body))); s.close(); VIEWS.accounts(view); } catch (e) { toast(e.message, { type: 'error' }); formErrors(body, e); } });
    });
  },

  async notifications(view) {
    const list = await api.get('/api/admin/announcements', { force: true });
    view.innerHTML = String(html`<div class="adm-grid g11" style="margin-top:0">
      <section class="panel"><div class="panel-h"><h3>Send announcement</h3></div><div class="panel-b">${can('notifications.broadcast') ? html`<form data-form novalidate>
        <div class="field"><label>Title</label><input class="input" name="title" maxlength="190"></div>
        <div class="field"><label>Message</label><textarea class="textarea" name="body" maxlength="1000" rows="4"></textarea></div>
        <div class="row"><div class="field"><label>Audience</label><select class="select" name="audience"><option value="all">All active users</option><option value="verified">Verified users</option><option value="admins">Staff only</option></select></div><div class="field"><label>Link (optional)</label><input class="input" name="link" placeholder="/app/reports"></div></div>
        <label class="check" style="margin-bottom:8px"><input type="checkbox" name="push" checked> Also send push notification</label><label class="check" style="margin-bottom:14px"><input type="checkbox" name="email"> Also send email</label>
        <button class="btn btn-primary" type="submit">${icon('send', 'i-sm')}Send announcement</button></form>` : html`<p class="muted">Your role can notify individual users from the Users page.</p>`}</div></section>
      <section class="panel"><div class="panel-h"><h3>History</h3></div><div class="list">${list.length ? list.map((a) => html`<div class="li" style="align-items:flex-start"><span class="tile" style="--c:var(--violet)">${icon('megaphone')}</span><span class="li-main"><span class="li-title">${a.title}</span><span class="li-sub" style="white-space:normal">${a.body}</span><span class="li-sub">${a.audience} · ${a.channels} · ${num(a.recipients)} recipients · ${a.created_by_email || ''} · ${relTime(a.created_at)}</span></span></div>`) : html`<div class="empty"><p>No announcements yet</p></div>`}</div></section></div>`);
    const form = $('[data-form]', view);
    if (form) form.onsubmit = (e) => { e.preventDefault(); withBusy(form.querySelector('[type=submit]'), async () => {
      const fd = new FormData(form);
      if (!(await confirmDialog({ title: 'Send announcement?', message: `This will notify ${fd.get('audience') === 'all' ? 'all active users' : fd.get('audience')}.` }))) return;
      try { const r = await api.post('/api/admin/announcements', { title: fd.get('title'), body: fd.get('body'), link: fd.get('link') || undefined, audience: fd.get('audience'), push: !!fd.get('push'), email: !!fd.get('email') }); toast(`Sending to ${r.recipients} users`); VIEWS.notifications(view); }
      catch (er) { toast(er.message, { type: 'error' }); formErrors(form, er); }
    }); };
  },

  async emails(view) {
    const tabsHtml = html`<div class="tabs"><button data-t="logs" class="active">Delivery log</button>${can('emails.manage') ? html`<button data-t="templates">Templates</button><button data-t="test">Send test</button>` : ''}</div><div data-body></div>`;
    view.innerHTML = String(html`<div>${tabsHtml}</div>`);
    const body = $('[data-body]', view);
    const tabs = {
      async logs() {
        const f = { page: 1, status: '' };
        const load = async () => {
          const d = await api.get(`/api/admin/emails?page=${f.page}&status=${f.status}`, { force: true });
          body.innerHTML = String(html`${d.configured ? '' : html`<div class="alert warn" style="margin-bottom:12px">${icon('alert', 'i-sm')}<span>SMTP is not configured — emails are logged as “skipped”. Configure it in Settings → Email.</span></div>`}
            <div class="toolbar"><select class="select" data-s><option value="">All</option><option ${f.status === 'sent' ? 'selected' : ''}>sent</option><option ${f.status === 'failed' ? 'selected' : ''}>failed</option><option ${f.status === 'skipped' ? 'selected' : ''}>skipped</option></select></div>
            <div class="panel"><div class="scroll-x"><table class="tbl"><thead><tr><th>To</th><th>Template</th><th>Subject</th><th>Status</th><th>When</th></tr></thead><tbody>${d.items.map((x) => html`<tr><td>${x.to_email}</td><td><span class="badge">${x.template}</span></td><td class="ellipsis" style="max-width:260px">${x.subject}</td><td><span class="badge ${{ sent: 'green', failed: 'red' }[x.status] || ''}" title="${x.error || ''}">${x.status}</span></td><td>${relTime(x.created_at)}</td></tr>`)}</tbody></table></div></div>`);
          body.querySelector('.panel').append(pager(d, (p) => { f.page = p; load(); }));
          $('[data-s]', body).onchange = (e) => { f.status = e.target.value; f.page = 1; load(); };
        };
        await load();
      },
      async templates() {
        const list = await api.get('/api/admin/email-templates', { force: true });
        body.innerHTML = String(html`<div class="alert" style="margin-bottom:12px">${icon('info', 'i-sm')}<span>Leave a field empty to use the built-in translated default. Use {{variables}} shown under each template. Values are HTML-escaped automatically.</span></div>
          <div class="panel list">${list.map((x) => html`<button class="li" data-k="${x.key}"><span class="tile" style="--c:var(--orange)">${icon('mail')}</span><span class="li-main"><span class="li-title">${x.key.replace(/_/g, ' ')}</span><span class="li-sub">${x.subject ? 'Customised' : 'Default'} · ${x.vars.map((v) => `{{${v}}}`).join(' ')}</span></span>${icon('chevron-right', 'i-sm chev')}</button>`)}</div>`);
        $$('[data-k]', body).forEach((b) => b.onclick = () => {
          const x = list.find((i) => i.key === b.dataset.k);
          const f = el(html`<form><div class="field"><label>Subject</label><input class="input" name="subject" value="${x.subject}" placeholder="${x.defaultSubject}"></div><div class="field"><label>Body</label><textarea class="textarea" name="body" rows="10" placeholder="${x.defaultBody}">${x.body}</textarea><span class="hint">Variables: ${x.vars.map((v) => `{{${v}}}`).join(', ')}, {{site}}, {{app_url}}</span></div></form>`);
          const foot = el(html`<div style="display:flex;gap:10px;width:100%"><button class="btn btn-outline" data-reset>Reset to default</button><button class="btn btn-primary btn-block" data-save>Save template</button></div>`);
          const s = openSheet({ title: x.key.replace(/_/g, ' '), body: f, foot, wide: true });
          foot.querySelector('[data-save]').onclick = (e) => withBusy(e.currentTarget, async () => { await api.put(`/api/admin/email-templates/${x.key}`, Object.fromEntries(new FormData(f))); toast('Template saved'); s.close(); tabs.templates(); });
          foot.querySelector('[data-reset]').onclick = async () => { await api.put(`/api/admin/email-templates/${x.key}`, { subject: '', body: '' }); toast('Reset to default'); s.close(); tabs.templates(); };
        });
      },
      async test() {
        body.innerHTML = String(html`<div class="panel panel-b" style="max-width:520px"><form data-f><div class="field"><label>Send a test email to</label><input class="input" name="to" type="email" value="${ME.email}"></div><button class="btn btn-primary" type="submit">${icon('send', 'i-sm')}Send test</button></form></div>`);
        const form = $('[data-f]', body);
        form.onsubmit = (e) => { e.preventDefault(); withBusy(form.querySelector('button'), async () => { try { await api.post('/api/admin/emails/test', { to: form.to.value }); toast('Test email sent ✅'); } catch (er) { toast(er.message, { type: 'error', timeout: 7000 }); } }); };
      },
    };
    $$('[data-t]', view).forEach((b) => b.onclick = () => { $$('[data-t]', view).forEach((x) => x.classList.toggle('active', x === b)); tabs[b.dataset.t](); });
    await tabs.logs();
  },

  async translations(view) {
    let locale = 'bn'; let q = '';
    const load = async () => {
      const d = await api.get(`/api/admin/translations?locale=${locale}&q=${encodeURIComponent(q)}`, { force: true });
      view.innerHTML = String(html`<div><div class="toolbar"><div class="seg" data-loc>${d.locales.map((l) => html`<button data-v="${l.code}" class="${l.code === locale ? 'active' : ''}">${l.native}</button>`)}</div>
        <div class="input-group" style="flex:1;min-width:200px">${icon('search', 'i-sm')}<input class="input" data-q placeholder="Search keys or text" value="${q}" style="width:100%"></div><span class="muted" style="font-size:12px">${num(d.total)} strings</span></div>
        <div class="panel"><div class="scroll-x"><table class="tbl"><thead><tr><th style="width:22%">Key</th><th style="width:30%">English</th><th>${d.locales.find((l) => l.code === locale).native} (click to edit)</th></tr></thead><tbody>
        ${d.items.map((x) => html`<tr><td class="mono">${x.key}</td><td style="font-size:12px">${x.en}</td><td><div contenteditable="true" data-key="${x.key}" style="padding:4px 6px;border-radius:6px;min-height:22px;${x.override !== null ? 'background:var(--primary-soft)' : ''}">${x.override ?? x.base}</div></td></tr>`)}</tbody></table></div></div>
        <p class="hint" style="margin-top:8px">Edits are saved when you leave the field. Highlighted rows are custom overrides; clear the text to restore the default.</p></div>`);
      const { segmented } = await import('../core.js');
      segmented($('[data-loc]', view), (v) => { locale = v; load(); });
      let deb; $('[data-q]', view).oninput = (e) => { clearTimeout(deb); deb = setTimeout(() => { q = e.target.value; load().then(() => { const i = $('[data-q]', view); i.focus(); i.setSelectionRange(q.length, q.length); }); }, 400); };
      $$('[data-key]', view).forEach((c) => { const orig = c.textContent; c.onblur = async () => { if (c.textContent === orig) return; try { await api.put('/api/admin/translations', { locale, key: c.dataset.key, value: c.textContent.trim() }); c.style.background = c.textContent.trim() ? 'var(--primary-soft)' : ''; toast('Saved'); } catch (e) { toast(e.message, { type: 'error' }); } }; });
    };
    await load();
  },

  async settings(view) {
    const d = await api.get('/api/admin/settings', { force: true });
    const v = d.values;
    const has = (k) => k in v;
    const inp = (k, label, { type = 'text', hint = '', ph = '' } = {}) => has(k) ? html`<div class="field"><label>${label}</label><input class="input" name="${k}" type="${type}" value="${type === 'password' ? '' : v[k]}" placeholder="${type === 'password' && v[k] === '__set__' ? '•••••••• (saved — leave blank to keep)' : ph}" autocomplete="off">${hint ? html`<span class="hint">${hint}</span>` : ''}</div>` : '';
    const area = (k, label, hint = '', rows = 4) => has(k) ? html`<div class="field" style="grid-column:1/-1"><label>${label}</label><textarea class="textarea mono" name="${k}" rows="${rows}" placeholder="${v[k] === '__set__' ? '(saved securely — paste to replace)' : ''}">${v[k] === '__set__' ? '' : v[k]}</textarea>${hint ? html`<span class="hint">${hint}</span>` : ''}</div>` : '';
    const sw = (k, label, sub = '') => has(k) ? html`<label class="li" style="cursor:pointer;border-radius:12px;border:1px solid var(--line);margin-bottom:8px"><span class="li-main"><span class="li-title">${label}</span>${sub ? html`<span class="li-sub" style="white-space:normal">${sub}</span>` : ''}</span><span class="switch"><input type="checkbox" name="${k}" ${v[k] === '1' ? 'checked' : ''}><span></span></span></label>` : '';
    const asset = (kind, key, label, hint) => has(key) ? html`<div class="brand-asset"><div class="prev">${v[key] ? html`<img src="${kind === 'pwa_icon' ? v[key] + '/icon-192.png' : v[key]}" alt="">` : icon('image')}</div><div style="flex:1"><b style="font-size:13px">${label}</b><div class="hint">${hint}</div></div><label class="btn btn-soft btn-sm">${icon('upload', 'i-sm')}Upload<input type="file" hidden accept="image/*" data-asset="${kind}"></label>${v[key] ? html`<button type="button" class="icon-btn" data-reset-asset="${kind}" aria-label="Reset">${icon('x', 'i-sm')}</button>` : ''}</div>` : '';
    const TABS = [
      ['branding', 'Branding', html`<div class="form-grid">${inp('site_name', 'Site name', { hint: 'Shown next to the logo. Uploading a logo never removes the name.' })}${inp('site_tagline', 'Tagline')}</div>
        ${sw('logo_show_name', 'Show site name next to the logo', 'Turn off only if your logo already contains the name.')}
        <div style="display:grid;gap:10px;margin-top:6px">${asset('logo', 'logo_url', 'Logo', 'Square PNG/SVG/WebP, 512×512 recommended')}${asset('favicon', 'favicon_url', 'Favicon', 'SVG, PNG or ICO')}${asset('pwa_icon', 'pwa_icon_url', 'PWA app icon', '512×512 PNG — all sizes & maskable icons are generated')}${asset('og_image', 'og_image_url', 'Social share image (OG)', '1200×630 recommended')}</div>`],
      ['seo', 'SEO & landing', html`<div class="form-grid">${inp('seo_title', 'SEO title')}${inp('seo_keywords', 'Keywords')}${area('seo_description', 'Meta description', 'Around 150 characters works best.', 3)}${inp('landing_hero_title', 'Hero title')}${inp('landing_cta', 'Hero button label')}${area('landing_hero_subtitle', 'Hero subtitle', '', 3)}</div>${sw('landing_show_faq', 'Show FAQ section on landing page')}`],
      ['pwa', 'PWA', html`<div class="form-grid">${inp('theme_color', 'Theme colour', { type: 'color' })}${inp('background_color', 'Splash background colour', { type: 'color' })}</div><div class="alert">${icon('install', 'i-sm')}<span>Manifest: <a href="/manifest.webmanifest" target="_blank">/manifest.webmanifest</a> · Service worker: <a href="/sw.js" target="_blank">/sw.js</a>. Test with PWABuilder using your public site URL.</span></div>`],
      ['auth', 'Authentication', html`${sw('registration_enabled', 'Allow new registrations')}${sw('email_verification_required', 'Require email verification before using the app', 'Needs working SMTP.')}${sw('auth_2fa_enabled', 'Two-step verification (authenticator, email, recovery codes)')}${sw('auth_passkey_enabled', 'Passkeys (WebAuthn)', 'Requires HTTPS and a correct Site URL (localhost works for testing).')}
        ${sw('auth_google_enabled', 'Google login (OAuth 2.0)')}<div class="form-grid">${inp('google_client_id', 'Google client ID')}${inp('google_client_secret', 'Google client secret', { type: 'password' })}</div>
        ${has('site_url') ? html`<div class="alert" style="margin-bottom:12px">${icon('info', 'i-sm')}<span>Authorised redirect URI: <b class="mono">${(v.site_url || location.origin) + '/api/auth/google/callback'}</b></span></div>` : ''}
        <div class="form-grid">${inp('session_days', 'Session length (days)', { type: 'number' })}${inp('login_max_attempts', 'Failed logins before lockout', { type: 'number' })}${inp('login_lock_minutes', 'Lockout window (minutes)', { type: 'number' })}</div>`],
      ['email', 'Email (SMTP)', html`${sw('mail_enabled', 'Enable transactional email')}<div class="form-grid">${inp('smtp_host', 'SMTP host', { ph: 'smtp.gmail.com' })}${inp('smtp_port', 'SMTP port', { type: 'number' })}${inp('smtp_user', 'SMTP username')}${inp('smtp_pass', 'SMTP password', { type: 'password' })}${inp('mail_from_name', 'Sender name')}${inp('mail_from_email', 'Sender email')}</div>${sw('smtp_secure', 'Use SSL/TLS (usually port 465)')}
        ${has('smtp_host') ? html`<button type="button" class="btn btn-outline btn-sm" data-test-smtp>${icon('refresh', 'i-sm')}Test SMTP connection</button>` : ''}`],
      ['push', 'Push & Firebase', html`${sw('push_enabled', 'Enable push notifications')}${has('vapid_public') ? html`<div class="field"><label>Web Push VAPID public key</label><input class="input mono" value="${v.vapid_public}" readonly><span class="hint">Generated automatically at install. The private key is encrypted and never shown.</span></div><button type="button" class="btn btn-outline btn-sm" data-vapid style="margin-bottom:14px">Regenerate VAPID keys</button>` : ''}
        ${inp('vapid_subject', 'VAPID contact (mailto:)')}${sw('firebase_enabled', 'Firebase Cloud Messaging', 'Optional — in addition to standard Web Push.')}
        <div class="form-grid">${area('firebase_web_config', 'Firebase web config (JSON)', 'From Firebase console → Project settings → Your apps → Config.')}${inp('firebase_vapid_key', 'Firebase Web Push certificate key')}${area('firebase_service_account', 'Service account JSON (server)', 'Encrypted at rest. Used to send via FCM HTTP v1.', 5)}</div>`],
      ['locale', 'Localization', html`<div class="form-grid">${has('default_language') ? html`<div class="field"><label>Default language</label><select class="select" name="default_language">${['en', 'bn', 'hi'].map((l) => html`<option ${v.default_language === l ? 'selected' : ''}>${l}</option>`)}</select></div>` : ''}${inp('languages_enabled', 'Enabled languages', { hint: 'Comma separated: en,bn,hi' })}${inp('default_currency', 'Default currency')}${inp('default_timezone', 'Default timezone')}${area('currencies', 'Currencies & exchange rates (JSON)', 'rate = value of 1 unit in the base currency (BDT). Used to convert totals.', 7)}</div>`],
      ['notify', 'Notifications', html`${sw('notify_welcome', 'Send welcome notification + email to new users')}${sw('notify_security_email', 'Email security alerts (new device sign-in, password, 2FA, passkeys)')}`],
      ['system', 'System', html`<div class="form-grid">${inp('site_url', 'Public site URL', { hint: 'Used for email links, passkeys and OAuth. e.g. https://lifetrack.example.com' })}${inp('upload_max_mb', 'Max upload size (MB)', { type: 'number' })}</div>${sw('maintenance_mode', 'Maintenance mode', 'Only staff can use the app while enabled.')}`],
    ].filter((x) => String(x[2]).includes('name="') || String(x[2]).includes('data-asset'));
    let active = TABS[0][0];
    view.innerHTML = String(html`<div><div class="tabs">${TABS.map(([k, l]) => html`<button data-t="${k}" class="${k === active ? 'active' : ''}">${l}</button>`)}</div>
      <form class="panel panel-b" data-form novalidate style="max-width:880px">${TABS.map(([k, , body]) => html`<div data-pane="${k}" ${k === active ? '' : 'hidden'}>${body}</div>`)}
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;border-top:1px solid var(--line);padding-top:14px"><button class="btn btn-primary" type="submit">${icon('check', 'i-sm')}Save settings</button></div></form></div>`);
    $$('[data-t]', view).forEach((b) => b.onclick = () => { active = b.dataset.t; $$('[data-t]', view).forEach((x) => x.classList.toggle('active', x === b)); $$('[data-pane]', view).forEach((p) => { p.hidden = p.dataset.pane !== active; }); });
    const form = $('[data-form]', view);
    form.onsubmit = (e) => {
      e.preventDefault();
      withBusy(form.querySelector('[type=submit]'), async () => {
        const values = {};
        $$('[name]', form).forEach((i) => {
          if (i.type === 'checkbox') values[i.name] = i.checked ? '1' : '0';
          else if ((i.type === 'password' || i.tagName === 'TEXTAREA') && !i.value && v[i.name] === '__set__') values[i.name] = '__set__';
          else values[i.name] = i.value;
        });
        try { const r = await api.put('/api/admin/settings', { values }); toast(`Saved (${r.changed.length} changed)`); state.config = await api.get('/api/public/config', { force: true }); chrome('settings'); }
        catch (er) { toast(er.message, { type: 'error' }); formErrors(form, er); }
      });
    };
    $$('[data-asset]', view).forEach((i) => i.onchange = async () => { const f = i.files[0]; if (!f) return; try { await api.upload(`/api/admin/branding/${i.dataset.asset}`, f); toast('Uploaded'); VIEWS.settings(view); } catch (e) { toast(e.message, { type: 'error' }); } });
    $$('[data-reset-asset]', view).forEach((b) => b.onclick = async () => { await api.del(`/api/admin/branding/${b.dataset.resetAsset}`); toast('Reset to default'); VIEWS.settings(view); });
    $('[data-test-smtp]', view)?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => { try { await api.post('/api/admin/settings/test-smtp'); toast('SMTP connection OK ✅'); } catch (er) { toast(er.message, { type: 'error', timeout: 8000 }); } }));
    $('[data-vapid]', view)?.addEventListener('click', async () => { if (await confirmDialog({ title: 'Regenerate VAPID keys?', message: 'All existing browser push subscriptions will stop working and users must re-enable push.', danger: true, confirm: 'Regenerate' })) { await api.post('/api/admin/settings/regenerate-vapid'); toast('New keys generated'); VIEWS.settings(view); } });
  },

  async security(view) { await logTable(view, 'security'); },
  async audit(view) { await logTable(view, 'audit'); },

  async system(view) {
    const [s, backups] = await Promise.all([api.get('/api/admin/system', { force: true }), can('backups') ? api.get('/api/admin/backups', { force: true }) : Promise.resolve(null)]);
    const up = `${Math.floor(s.uptime / 86400)}d ${Math.floor((s.uptime % 86400) / 3600)}h ${Math.floor((s.uptime % 3600) / 60)}m`;
    view.innerHTML = String(html`<div><div class="kpis">${kpi('Node.js', s.node, 'server', 'var(--green)', s.env)}${kpi('Database', s.db.split('-')[0], 'database', 'var(--primary)', s.db.includes('Maria') ? 'MariaDB' : 'MySQL')}${kpi('Uptime', up, 'clock', 'var(--teal)', `load ${s.load.join(' / ')}`)}${kpi('Memory', s.memory + ' MB', 'activity', 'var(--orange)', s.platform)}</div>
      <div class="adm-grid g11"><section class="panel"><div class="panel-h"><h3>Services</h3></div><div class="list">
        ${[['Email (SMTP)', s.mail], ['Web Push (VAPID)', s.push.vapid], ['Firebase Cloud Messaging', s.push.firebase], ['Image processing (sharp)', s.sharp]].map(([n, ok]) => html`<div class="li"><span class="tile tile-sm" style="--c:${ok ? 'var(--green)' : 'var(--muted)'}">${icon(ok ? 'check' : 'minus-circle')}</span><span class="li-main"><span class="li-title">${n}</span></span><span class="badge ${ok ? 'green' : ''}">${ok ? 'Active' : 'Not configured'}</span></div>`)}</div>
        <div class="panel-h" style="border-top:1px solid var(--line)"><h3>Migrations</h3></div><div class="panel-b">${s.migrations.map((m) => html`<div class="mono">${m.name} · ${fmtDate(m.applied_at)}</div>`)}</div></section>
        <section class="panel"><div class="panel-h"><h3>Database tables</h3></div><div class="scroll-x" style="max-height:360px;overflow:auto"><table class="tbl"><thead><tr><th>Table</th><th style="text-align:right">Rows</th><th style="text-align:right">Size</th></tr></thead><tbody>${s.tables.map((t) => html`<tr><td class="mono">${t.name}</td><td style="text-align:right">${num(t.rows)}</td><td style="text-align:right">${num(t.kb)} KB</td></tr>`)}</tbody></table></div></section></div>
      ${backups ? html`<section class="panel" style="margin-top:12px"><div class="panel-h"><h3>Database backups</h3><button class="btn btn-primary btn-sm" data-backup>${icon('database', 'i-sm')}Create backup</button></div>
        <div class="scroll-x"><table class="tbl"><thead><tr><th>File</th><th>Size</th><th>Created</th><th></th></tr></thead><tbody>${backups.length ? backups.map((b) => html`<tr><td class="mono">${b.name}</td><td>${num(b.size / 1024)} KB</td><td>${relTime(b.created)}</td><td style="text-align:right;white-space:nowrap"><a class="btn btn-soft btn-sm" href="/api/admin/backups/${b.name}" download>${icon('download', 'i-sm')}</a> <button class="btn btn-danger-soft btn-sm" data-del="${b.name}">${icon('trash', 'i-sm')}</button></td></tr>`) : html`<tr><td colspan="4" class="muted">No backups yet</td></tr>`}</tbody></table></div>
        <div class="panel-b"><p class="hint">Backups are full SQL dumps stored outside the web root (super admin only). Restore with <span class="mono">mysql dbname &lt; file.sql</span>. Schedule automatic backups with cron for production.</p></div></section>` : ''}</div>`);
    $('[data-backup]', view)?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => { const r = await api.post('/api/admin/backups'); toast(`Backup created (${num(r.size / 1024)} KB)`); VIEWS.system(view); }));
    $$('[data-del]', view).forEach((b) => b.onclick = async () => { if (await confirmDialog({ title: 'Delete backup?', message: b.dataset.del, danger: true, confirm: 'Delete' })) { await api.del(`/api/admin/backups/${b.dataset.del}`); VIEWS.system(view); } });
  },
};

async function logTable(view, kind) {
  const f = { q: '', page: 1, severity: '', event: '' };
  view.innerHTML = String(html`<div><div class="toolbar"><div class="input-group" style="flex:1;min-width:200px">${icon('search', 'i-sm')}<input class="input" data-q placeholder="${kind === 'security' ? 'Search email or IP' : 'Search action, admin or target'}" style="width:100%"></div>
    ${kind === 'security' ? html`<select class="select" data-sev><option value="">All severities</option><option>info</option><option>warning</option><option>critical</option></select><select class="select" data-ev><option value="">All events</option></select>` : ''}</div><div class="panel" data-table></div></div>`);
  const load = async () => {
    const d = await api.get(`/api/admin/logs/${kind}?page=${f.page}&q=${encodeURIComponent(f.q)}&severity=${f.severity}&event=${f.event}`, { force: true });
    const box = $('[data-table]', view);
    if (kind === 'security') {
      const ev = $('[data-ev]', view); if (ev.options.length === 1) d.events.forEach((e) => ev.append(new Option(e, e)));
      box.innerHTML = String(html`<div class="scroll-x"><table class="tbl"><thead><tr><th>When</th><th>Event</th><th>User</th><th>IP</th><th>Device</th><th>Details</th></tr></thead><tbody>${d.items.map((x) => html`<tr><td style="white-space:nowrap">${fmtDate(x.created_at)} ${new Date(x.created_at).toLocaleTimeString()}</td><td><span class="badge ${{ critical: 'red', warning: 'orange' }[x.severity] || 'blue'}">${x.event}</span></td><td>${x.email || '—'}</td><td class="mono">${x.ip || ''}</td><td class="ellipsis muted" style="max-width:200px;font-size:11px">${x.user_agent || ''}</td><td class="mono muted" style="max-width:220px;overflow:hidden;text-overflow:ellipsis">${x.meta || ''}</td></tr>`)}</tbody></table></div>`);
    } else {
      box.innerHTML = String(html`<div class="scroll-x"><table class="tbl"><thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th><th>IP</th></tr></thead><tbody>${d.items.map((x) => html`<tr><td style="white-space:nowrap">${fmtDate(x.created_at)} ${new Date(x.created_at).toLocaleTimeString()}</td><td>${x.email || '—'}<br>${x.actor_role ? badgeRole(x.actor_role) : ''}</td><td><span class="badge violet">${x.action}</span></td><td class="mono">${x.target_type || ''} ${x.target_id || ''}</td><td class="mono muted" style="max-width:260px;overflow:hidden;text-overflow:ellipsis">${x.meta || ''}</td><td class="mono">${x.ip || ''}</td></tr>`)}</tbody></table></div>`);
    }
    box.append(pager(d, (p) => { f.page = p; load(); }));
  };
  let deb; $('[data-q]', view).oninput = (e) => { clearTimeout(deb); deb = setTimeout(() => { f.q = e.target.value.trim(); f.page = 1; load(); }, 300); };
  $('[data-sev]', view)?.addEventListener('change', (e) => { f.severity = e.target.value; f.page = 1; load(); });
  $('[data-ev]', view)?.addEventListener('change', (e) => { f.event = e.target.value; f.page = 1; load(); });
  await load();
}

async function userDetail(id, reload) {
  let u; try { u = await api.get(`/api/admin/users/${id}`, { force: true }); } catch (e) { toast(e.message, { type: 'error' }); return; }
  const manage = can('users.manage'); const self = u.email === ME.email;
  const body = el(html`<div>
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px">${av(u)}<div style="flex:1;min-width:0"><b style="font-size:16px">${u.name}</b><div class="muted">${u.email}</div><div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">${badgeRole(u.role)}<span class="badge ${u.status === 'active' ? 'green' : 'red'}">${u.status}</span>${u.email_verified_at ? html`<span class="badge green">verified</span>` : html`<span class="badge orange">unverified</span>`}</div></div></div>
    <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin-bottom:12px">${[['Transactions', u.counts.tx], ['Goals', u.counts.goals], ['Loans', Number(u.counts.lent) + Number(u.counts.borrowed)]].map(([k, n]) => html`<div class="kpi" style="padding:10px"><div class="top">${k}</div><b style="font-size:18px">${num(n)}</b></div>`)}</div>
    <dl class="kv card card-pad" style="margin:0 0 12px"><dt>User ID</dt><dd class="mono">${u.uuid}</dd><dt>Joined</dt><dd>${fmtDate(u.created_at)}</dd><dt>Last login</dt><dd>${u.last_login_at ? relTime(u.last_login_at) + ' · ' + (u.last_login_ip || '') : 'never'}</dd>
      <dt>Sign-in methods</dt><dd>${[u.has_password && 'password', u.google && 'Google', u.passkeys.length && `${u.passkeys.length} passkey(s)`].filter(Boolean).join(', ') || '—'}</dd>
      <dt>Two-step</dt><dd>${u.totp_enabled_at || u.email_enabled_at ? `${[u.totp_enabled_at && 'authenticator', u.email_enabled_at && 'email'].filter(Boolean).join(' + ')} · ${u.counts.recovery} recovery codes` : 'off'}</dd>
      <dt>Preferences</dt><dd>${u.language} · ${u.currency} · ${u.timezone} · ${u.theme}</dd>
      <dt>Notifications</dt><dd>${[u.notify_inapp && 'in-app', u.notify_email && 'email', u.notify_push && 'push'].filter(Boolean).join(', ')} · ${u.pushSubs.length} push device(s)</dd></dl>
    <div class="panel" style="margin-bottom:12px"><div class="panel-h"><h3>Accounts</h3></div><div class="list">${u.accounts.map((a) => html`<div class="li" style="min-height:44px">${payMark(a.type)}<span class="li-main"><span class="li-title">${a.name}</span></span><span class="li-amt">${a.balance === null ? '—' : money(a.balance, a.currency)}</span></div>`)}</div></div>
    <div class="panel" style="margin-bottom:12px"><div class="panel-h"><h3>Active sessions (${u.sessions.length})</h3></div><div class="list">${u.sessions.map((s) => html`<div class="li" style="min-height:44px"><span class="li-main"><span class="li-title">${s.device || 'Unknown'}</span><span class="li-sub">${s.ip} · ${s.auth_method} · ${relTime(s.last_seen_at)}</span></span></div>`)}</div></div>
    <div class="panel"><div class="panel-h"><h3>Security log</h3></div><div class="panel-b"><div class="timeline">${u.securityLogs.map((l) => html`<div class="tl-item" style="--c:${{ critical: 'var(--red)', warning: 'var(--orange)' }[l.severity] || 'var(--primary)'}"><b style="font-size:12.5px">${l.event}</b><div class="muted" style="font-size:11px">${relTime(l.created_at)} · ${l.ip || ''}</div></div>`)}</div></div></div>
    <p class="hint" style="margin-top:10px">Passwords, TOTP secrets, recovery codes and passkey keys are never exposed. Viewing this profile is recorded in the audit log.</p></div>`);
  $$('.li .pm', body).forEach((p) => { p.style.width = '28px'; p.style.height = '28px'; });
  const foot = el(html`<div style="display:flex;flex-wrap:wrap;gap:8px;width:100%">
    ${can('notifications.user') ? html`<button class="btn btn-soft btn-sm" data-a="notify">${icon('send', 'i-sm')}Notify</button>` : ''}
    ${manage && !self ? html`<button class="btn btn-soft btn-sm" data-a="status">${u.status === 'active' ? 'Suspend' : 'Activate'}</button><button class="btn btn-soft btn-sm" data-a="verify">${u.email_verified_at ? 'Unverify' : 'Mark verified'}</button><button class="btn btn-soft btn-sm" data-a="reset">Send password reset</button><button class="btn btn-soft btn-sm" data-a="sessions">Sign out everywhere</button>${u.totp_enabled_at || u.email_enabled_at ? html`<button class="btn btn-danger-soft btn-sm" data-a="2fa">Reset 2FA</button>` : ''}` : ''}
    ${can('roles.manage') && !self ? html`<select class="select" data-role style="height:32px;width:auto;font-size:12.5px">${['user', 'support', 'admin', 'super_admin'].map((r) => html`<option value="${r}" ${u.role === r ? 'selected' : ''}>${r.replace('_', ' ')}</option>`)}</select><button class="btn btn-danger btn-sm" data-a="delete">${icon('trash', 'i-sm')}Delete</button>` : ''}</div>`);
  const s = openSheet({ title: 'User details', body, foot, wide: true });
  const done = (msg) => { toast(msg); s.close(); reload?.(); };
  const act = async (a) => {
    try {
      if (a === 'status') { await api.patch(`/api/admin/users/${u.id}`, { status: u.status === 'active' ? 'suspended' : 'active' }); done('Status updated'); }
      if (a === 'verify') { await api.patch(`/api/admin/users/${u.id}`, { verified: !u.email_verified_at }); done('Updated'); }
      if (a === 'reset') { await api.post(`/api/admin/users/${u.id}/send-reset`); done('Reset email sent'); }
      if (a === 'sessions') { await api.post(`/api/admin/users/${u.id}/revoke-sessions`); done('All sessions revoked'); }
      if (a === '2fa') { const reason = await confirmDialog({ title: 'Reset two-step verification', message: 'Only do this after verifying the user\'s identity out-of-band. The user is notified and all sessions end.', danger: true, confirm: 'Reset 2FA', input: { label: 'Reason (recorded in audit log)' } }); if (reason === false) return; await api.post(`/api/admin/users/${u.id}/reset-2fa`, { reason }); done('2FA reset'); }
      if (a === 'delete') { const c = await confirmDialog({ title: 'Delete user permanently?', message: `All data for ${u.email} will be erased. Type the email to confirm.`, danger: true, confirm: 'Delete', input: { label: 'Email' } }); if (c !== u.email) { if (c !== false) toast('Email did not match', { type: 'error' }); return; } await api.del(`/api/admin/users/${u.id}`); done('User deleted'); }
      if (a === 'notify') {
        const b2 = el(html`<form><div class="field"><label>Title</label><input class="input" name="title"></div><div class="field"><label>Message</label><textarea class="textarea" name="body"></textarea></div><label class="check"><input type="checkbox" name="email"> Also send by email</label></form>`);
        const f2 = el(html`<button class="btn btn-primary btn-block">Send</button>`);
        const s2 = openSheet({ title: `Notify ${u.name}`, body: b2, foot: f2 });
        f2.onclick = () => withBusy(f2, async () => { try { await api.post(`/api/admin/users/${u.id}/notify`, { title: b2.title.value, body: b2.body.value, email: b2.email.checked }); s2.close(); toast('Notification sent'); } catch (e) { toast(e.message, { type: 'error' }); formErrors(b2, e); } });
      }
    } catch (e) { toast(e.message, { type: 'error' }); }
  };
  $$('[data-a]', foot).forEach((b) => b.onclick = () => act(b.dataset.a));
  $('[data-role]', foot)?.addEventListener('change', async (e) => { if (await confirmDialog({ title: 'Change role?', message: `${u.email} → ${e.target.value.replace('_', ' ')}` })) { try { await api.patch(`/api/admin/users/${u.id}`, { role: e.target.value }); done('Role updated'); } catch (er) { toast(er.message, { type: 'error' }); } } else e.target.value = u.role; });
}

/* ---------- boot ---------- */
(async () => {
  state.config = await api.get('/api/public/config').catch(() => ({ currencies: [] }));
  await loadLang('en');
  try {
    const me = await api.get('/api/admin/me', { force: true });
    ME = me.user; PERMS = me.permissions;
    const prof = await api.get('/api/me').catch(() => null); state.profile = prof?.profile || null;
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
      $('#view').innerHTML = String(html`<div class="panel" style="max-width:420px;margin:12vh auto"><div class="empty"><span class="tile tile-lg" style="--c:var(--primary)">${icon('shield')}</span><h4>${e.status === 401 ? 'Sign in required' : 'Admin access only'}</h4><p>${e.status === 401 ? 'Sign in with a staff account to open the admin console.' : 'Your account does not have admin permissions.'}</p><a class="btn btn-primary" href="${e.status === 401 ? '/app/login?next=/admin' : '/app'}">${e.status === 401 ? 'Sign in' : 'Back to app'}</a></div></div>`);
      return;
    }
    throw e;
  }
  render();
})();
export { esc, raw };
