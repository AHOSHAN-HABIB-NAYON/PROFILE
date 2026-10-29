// Nirapod Admin (Phase 8): a small dependency-free single-page app over /api/v1/admin.
// No page ever shows a user's location, route or places: the API does not expose them.
'use strict';

const API = '/api/v1';
const store = {
  get token() { try { return sessionStorage.getItem('nrpd_admin') || ''; } catch { return ''; } },
  set token(v) { try { v ? sessionStorage.setItem('nrpd_admin', v) : sessionStorage.removeItem('nrpd_admin'); } catch { /* private mode */ } },
};
let me = null;
const app = document.getElementById('app');

// ---------- helpers ----------
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : '—');
const fmtDay = (s) => (s ? new Date(s).toLocaleDateString() : '—');
const pill = (text, color = '') => h('span', { class: `pill ${color}` }, text);

async function api(path, { method = 'GET', body, raw = false, form } = {}) {
  const headers = {};
  if (store.token) headers.authorization = `Bearer ${store.token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(API + path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  if (raw) return res;
  if (res.status === 204) return null;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(j?.error?.message || `Error ${res.status}`);
    err.status = res.status;
    err.details = j?.error?.details;
    if (res.status === 401 && path !== '/admin/auth/login') { store.token = ''; me = null; route(); }
    throw err;
  }
  return j;
}

function toast(msg, err = false) {
  const t = h('div', { class: `toast${err ? ' err' : ''}`, role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}
const guard = (fn) => async (...a) => {
  try { await fn(...a); } catch (e) { toast(e.message, true); }
};

function modal(title, body, actions) {
  const wrap = h('div', { class: 'modal-wrap', onclick: (e) => { if (e.target === wrap) wrap.remove(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-label': title }, h('h2', {}, title), body, h('div', { class: 'form-actions' }, actions(() => wrap.remove()))));
  document.body.append(wrap);
  return wrap;
}
function confirmBox(text, danger = true) {
  return new Promise((ok) => {
    modal('Please confirm', h('p', {}, text), (close) => [
      h('button', { class: 'sec', onclick: () => { close(); ok(false); } }, 'Cancel'),
      h('button', { class: danger ? 'danger' : '', onclick: () => { close(); ok(true); } }, 'Confirm'),
    ]);
  });
}
function drawer(content) {
  const o = h('div', { class: 'overlay', onclick: (e) => { if (e.target === o) o.remove(); } }, h('div', { class: 'drawer' }, content));
  document.body.append(o);
  return o;
}

function table(cols, rows, onRow) {
  if (!rows.length) return h('div', { class: 'tbl-wrap' }, h('div', { class: 'empty' }, 'Nothing here yet.'));
  return h('div', { class: 'tbl-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, cols.map((c) => h('th', {}, c[0])))),
    h('tbody', {}, rows.map((r) => h('tr', { class: onRow ? 'click' : '', onclick: onRow ? () => onRow(r) : null }, cols.map((c) => h('td', {}, c[1](r))))))));
}

// A form from field specs: {name, label, type: text|number|textarea|select|checkbox|json|password, options, hint}
function form(fields, values, onSubmit, submitLabel = 'Save') {
  const els = {};
  const f = h('form', { onsubmit: guard(async (e) => {
    e.preventDefault();
    const out = {};
    for (const fd of fields) {
      const el = els[fd.name];
      let v;
      if (fd.type === 'checkbox') v = el.checked;
      else if (fd.type === 'number') v = el.value === '' ? null : Number(el.value);
      else if (fd.type === 'json') { v = el.value.trim() ? JSON.parse(el.value) : null; }
      else if (fd.type === 'list') v = el.value.split(',').map((s) => s.trim()).filter(Boolean);
      else v = el.value;
      if (fd.optional && (v === '' || v == null)) continue;
      out[fd.name] = v;
    }
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try { await onSubmit(out); } finally { btn.disabled = false; }
  }) });
  for (const fd of fields) {
    const v = values?.[fd.name];
    let el;
    if (fd.type === 'textarea' || fd.type === 'json') el = h('textarea', { id: `f_${fd.name}`, rows: fd.rows || 4 }, fd.type === 'json' ? (v == null ? '' : JSON.stringify(v, null, 2)) : (v ?? ''));
    else if (fd.type === 'select') el = h('select', { id: `f_${fd.name}` }, fd.options.map((o) => h('option', { value: o, selected: String(v) === String(o) }, o)));
    else if (fd.type === 'checkbox') el = h('input', { id: `f_${fd.name}`, type: 'checkbox', checked: !!v });
    else el = h('input', { id: `f_${fd.name}`, type: fd.type === 'number' ? 'number' : fd.type === 'password' ? 'password' : 'text', value: fd.type === 'list' ? (v || []).join(', ') : (v ?? ''), placeholder: fd.placeholder || '', step: fd.step || null, autocomplete: fd.type === 'password' ? 'new-password' : 'off' });
    els[fd.name] = el;
    f.append(fd.type === 'checkbox'
      ? h('div', { class: 'field' }, h('label', { class: 'check', for: `f_${fd.name}` }, el, fd.label), fd.hint && h('div', { class: 'hint' }, fd.hint))
      : h('div', { class: 'field' }, h('label', { for: `f_${fd.name}` }, fd.label), el, fd.hint && h('div', { class: 'hint' }, fd.hint)));
  }
  f.append(h('div', { class: 'form-actions' }, h('button', { type: 'submit' }, submitLabel)));
  return f;
}

// ---------- sound + browser notification for new chats ----------
let audioCtx = null;
function ding(urgent) {
  try {
    audioCtx ??= new AudioContext();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = urgent ? 880 : 660;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (urgent ? 0.9 : 0.4));
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 1);
  } catch { /* no audio */ }
}
let seenChats = null;
async function pollChats() {
  if (!me || !['super_admin', 'support'].includes(me.role)) return;
  try {
    const list = await api('/admin/chats?filter=active');
    const waiting = list.filter((c) => c.status === 'needs_human' || c.urgent || c.unread > 0);
    const badge = document.getElementById('chat-badge');
    if (badge) { badge.textContent = String(waiting.length); badge.hidden = waiting.length === 0; }
    const key = (c) => `${c.id}:${c.status}:${c.urgent}:${c.unread}`;
    const now = new Set(list.map(key));
    if (seenChats) {
      const fresh = list.filter((c) => !seenChats.has(key(c)) && (c.status === 'needs_human' || c.urgent || c.unread > 0));
      if (fresh.length) {
        const urgent = fresh.some((c) => c.urgent);
        ding(urgent);
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(urgent ? 'URGENT support chat' : 'Support chat needs you', { body: fresh[0].user?.name || fresh[0].user?.email || 'New message', icon: '/shared/web/brand/logo-app.svg' });
        }
        if (location.hash.startsWith('#/chats')) renderInboxList?.();
      }
    }
    seenChats = now;
  } catch { /* offline */ }
}
setInterval(pollChats, 8000);

// ---------- pages ----------
const NAV = [
  ['Overview', [['dashboard', 'Dashboard'], ['chats', 'Live chat', 'chat-badge'], ['users', 'Users']]],
  ['Business', [['plans', 'Plans and limits'], ['codes', 'Redeem codes'], ['grants', 'Grants'], ['campaigns', 'Campaigns']]],
  ['Content', [['kb', 'Knowledge base'], ['canned', 'Canned replies'], ['changelog', 'Changelog'], ['emergency', 'Emergency numbers']]],
  ['Settings', [['appconfig', 'App settings'], ['keys', 'API keys'], ['ai', 'AI assistant']]],
  ['Safety', [['tickets', 'Tickets'], ['abuse', 'Abuse reports'], ['datareq', 'Data requests']]],
  ['System', [['admins', 'Admins and roles'], ['audit', 'Audit log'], ['health', 'System health'], ['profile', 'My profile']]],
];
const ROLE_PAGES = {
  support: ['dashboard', 'chats', 'users', 'grants', 'kb', 'canned', 'changelog', 'emergency', 'ai', 'tickets', 'abuse', 'datareq', 'campaigns', 'profile'],
  finance: ['dashboard', 'users', 'plans', 'codes', 'grants', 'profile'],
};
const allowed = (p) => me?.role === 'super_admin' || (ROLE_PAGES[me?.role] || []).includes(p);

function shell(page, title, content, actions = []) {
  const side = h('aside', { class: 'side' },
    h('div', { class: 'brand' }, h('img', { src: '/shared/web/brand/logo-app.svg', width: 34, height: 34, alt: '' }), h('div', {}, 'Nirapod', h('small', {}, 'Admin panel'))),
    NAV.map(([group, items]) => {
      const vis = items.filter(([id]) => allowed(id));
      if (!vis.length) return null;
      return [h('div', { class: 'nav-group' }, group), h('nav', { class: 'nav' }, vis.map(([id, label, badge]) =>
        h('a', { href: `#/${id}`, class: id === page ? 'on' : '' }, label, badge ? h('span', { class: 'badge', id: badge, hidden: true }, '0') : null)))];
    }),
    h('div', { class: 'me' }, `${me.name || me.email} · ${me.role.replace('_', ' ')}`,
      h('button', { class: 'sec sm', onclick: guard(async () => { await api('/admin/auth/logout', { method: 'POST' }).catch(() => {}); store.token = ''; me = null; route(); }) }, 'Sign out')));
  const menu = h('button', { class: 'sec sm menu-btn', onclick: () => side.classList.toggle('open') }, 'Menu');
  const main = h('main', { class: 'main' },
    !me.two_factor && page !== 'profile' ? h('div', { class: 'notice warn' }, 'Two-factor sign-in is off. ', h('a', { href: '#/profile' }, 'Turn it on'), ' to make changes.') : null,
    h('div', { class: 'top' }, h('div', { class: 'row' }, menu, h('h1', {}, title)), h('div', { class: 'actions' }, actions)),
    content);
  app.className = 'layout';
  app.replaceChildren(side, main);
  pollChats();
}

async function pageDashboard() {
  const d = await api('/admin/dashboard');
  const stat = (k, v, s) => h('div', { class: 'card stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), s && h('div', { class: 's' }, s));
  const bars = (rows) => {
    const max = Math.max(1, ...rows.map((r) => r.n));
    return h('div', { class: 'bars' }, rows.length ? rows.map((r) => h('div', { class: 'bar' }, h('span', {}, r.key || '—'), h('span', { class: 't' }, (() => { const i = h('i'); i.style.width = `${(r.n / max) * 100}%`; return i; })()), h('b', {}, r.n))) : h('div', { class: 'muted' }, 'No data yet.'));
  };
  shell('dashboard', 'Dashboard', h('div', { class: 'grid' },
    h('div', { class: 'grid g4' },
      stat('Users', d.users, `+${d.new_users_7d} in 7 days · ${d.children} child phones`),
      stat('Families', d.families, `${d.active_families_7d} active in 7 days`),
      stat('Premium', d.premium, `${d.trials} on trial`),
      stat('Revenue (est.)', `$${d.revenue_estimate_usd_month.toFixed(2)}`, 'per month, Play list prices')),
    h('div', { class: 'grid g3' },
      stat('Open chats', d.open_chats, `${d.waiting_chats} waiting for a person`),
      stat('Abuse reports', d.open_abuse, 'open'),
      h('div', { class: 'card' }, h('h3', {}, 'Location privacy'), h('p', { class: 'muted' }, 'Admins and support never see live locations, routes or places. The admin database user has no access to them.'))),
    h('div', { class: 'grid g2' },
      h('div', { class: 'card' }, h('h2', {}, 'Users by country'), bars(d.by_country)),
      h('div', { class: 'card' }, h('h2', {}, 'App versions'), bars(d.by_app_version)))));
}

async function pageUsers() {
  const q = h('input', { type: 'search', placeholder: 'Search by email, name or id', value: sessionStorage.getItem('uq') || '' });
  const out = h('div');
  const load = guard(async () => {
    sessionStorage.setItem('uq', q.value);
    const rows = await api(`/admin/users?q=${encodeURIComponent(q.value)}`);
    out.replaceChildren(table([
      ['Name', (u) => u.name || '—'], ['Email', (u) => u.email || h('span', { class: 'muted' }, 'child phone')],
      ['Status', (u) => pill(u.status, u.status === 'active' ? 'green' : 'red')], ['Country', (u) => u.country || '—'],
      ['Joined', (u) => fmtDay(u.created_at)], ['Last login', (u) => fmtDate(u.last_login_at)],
    ], rows, (u) => userDrawer(u.id)));
  });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
  shell('users', 'Users', h('div', {}, h('div', { class: 'row', style: null }, q, h('button', { onclick: load }, 'Search')), h('div', { class: 'sep' }), out));
  load();
}

async function userDrawer(id) {
  const u = await api(`/admin/users/${id}`);
  const act = (label, fn, cls = 'sec') => h('button', { class: `${cls} sm`, onclick: guard(fn) }, label);
  const fam = u.family;
  const d = drawer(h('div', {},
    h('div', { class: 'row' }, h('h2', {}, u.name || u.email || 'User'), pill(u.status, u.status === 'active' ? 'green' : 'red')),
    h('dl', { class: 'kv' },
      h('dt', {}, 'Email'), h('dd', {}, u.email || '—', u.email_verified ? ' ' : '', u.email_verified ? pill('verified', 'green') : ''),
      h('dt', {}, 'Sign-in'), h('dd', {}, u.auth_provider), h('dt', {}, 'Language'), h('dd', {}, u.language),
      h('dt', {}, 'Country / zone'), h('dd', {}, `${u.country || '—'} · ${u.timezone || '—'}`),
      h('dt', {}, 'Joined'), h('dd', {}, fmtDate(u.created_at)), h('dt', {}, 'User id'), h('dd', { class: 'mono' }, u.id)),
    h('div', { class: 'row' },
      u.email ? act('Resend verification', async () => { await api(`/admin/users/${id}/email`, { method: 'POST', body: { kind: 'verify_email' } }); toast('Email sent'); }) : null,
      u.email ? act('Send password reset', async () => { await api(`/admin/users/${id}/email`, { method: 'POST', body: { kind: 'reset_password' } }); toast('Email sent'); }) : null,
      act(u.status === 'suspended' ? 'Unsuspend' : 'Suspend', async () => {
        if (!(await confirmBox(u.status === 'suspended' ? 'Allow this account again?' : 'Suspend this account? All devices are signed out.'))) return;
        await api(`/admin/users/${id}/suspend`, { method: 'POST', body: { suspend: u.status !== 'suspended' } }); d.remove(); userDrawer(id);
      }),
      act('Delete account', async () => {
        if (!(await confirmBox('Delete this account and its data? If they are the only adult, the family and children are deleted too. This cannot be undone.'))) return;
        await api(`/admin/users/${id}/delete`, { method: 'POST' }); toast('Account deleted'); d.remove(); pageUsers();
      }, 'danger')),
    h('div', { class: 'sep' }),
    fam ? h('div', {},
      h('h3', {}, `Family: ${fam.name || 'Family'} `, pill(fam.plan || 'free', fam.plan === 'free' ? '' : 'violet'), fam.owner ? ' ' : '', fam.owner ? pill('owner', 'blue') : ''),
      h('p', { class: 'muted' }, `Limits: ${fam.limits ? `${fam.limits.max_children ?? '∞'} children · ${fam.limits.max_members ?? '∞'} members · ${fam.limits.max_places ?? '∞'} places · ${fam.limits.history_days} days history` : '—'}`),
      table([['Member', (m) => m.name || '—'], ['Role', (m) => m.role], ['Sharing', (m) => pill(m.sharing, m.sharing === 'active' ? 'green' : 'amber')]], fam.members),
      h('h3', { class: 'sep-top' }, 'Child phones (diagnostics only)'),
      table([['Child', (x) => x.child], ['Phone', (x) => `${x.model} · Android ${x.android || '?'}`], ['App', (x) => x.app || '—'],
        ['Location', (x) => pill(x.location_state || '—', x.location_state === 'ok' ? 'green' : 'red')], ['Last sync', (x) => fmtDate(x.last_seen_at)],
        ['', (x) => h('button', { class: 'ghost sm', onclick: guard(async (e) => {
          e.stopPropagation();
          const note = prompt('Remove this child phone. Note the parent\'s consent (required):');
          if (!note) return;
          await api(`/admin/devices/${x.id}/revoke`, { method: 'POST', body: { consent_note: note } }); toast('Phone removed'); d.remove(); userDrawer(id);
        }) }, 'Remove')]], fam.devices),
      h('h3', {}, 'Subscriptions'),
      table([['Plan', (s) => s.plan], ['Status', (s) => s.status], ['Source', (s) => s.source], ['Expires', (s) => fmtDay(s.expires_at)]], fam.subscriptions),
      h('div', { class: 'sep' }),
      h('h3', {}, 'Grant a package'),
      form([
        { name: 'plan_code', label: 'Plan', type: 'select', options: ['premium', 'family_plus'] },
        { name: 'days', label: 'Days', type: 'number', placeholder: '30' },
        { name: 'payment_reference', label: 'Payment reference (bKash/Nagad)', optional: true },
        { name: 'gift_from_name', label: 'Gift from (optional)', optional: true },
        { name: 'gift_message', label: 'Gift message (optional)', optional: true },
        { name: 'note', label: 'Internal note', optional: true },
      ], { days: 30 }, async (v) => { await api(`/admin/families/${fam.id}/grant`, { method: 'POST', body: v }); toast('Package granted'); d.remove(); userDrawer(id); }, 'Grant'),
      h('h3', {}, 'Adjust free limits for this family'),
      form([
        { name: 'max_children', label: 'Max children', type: 'number', optional: true }, { name: 'max_members', label: 'Max members', type: 'number', optional: true },
        { name: 'max_places', label: 'Max places', type: 'number', optional: true }, { name: 'history_days', label: 'History days', type: 'number', optional: true },
      ], {}, async (v) => { await api(`/admin/families/${fam.id}/limits`, { method: 'PUT', body: { limits: Object.keys(v).length ? v : null } }); toast('Limits saved'); }, 'Save limits'),
    ) : h('p', { class: 'muted' }, 'Not in a family.'),
    h('div', { class: 'sep' }),
    h('h3', {}, 'Signed-in devices'),
    table([['Device', (s) => s.device_model || '—'], ['Android', (s) => s.os_version || '—'], ['App', (s) => s.app_version || '—'], ['Last used', (s) => fmtDate(s.last_used_at)]], u.sessions)));
}

// ---------- live chat inbox ----------
let inboxFilter = 'active';
let openChat = null;
let renderInboxList = null;
let chatTimer = null;
async function pageChats() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  const list = h('div', { class: 'list' });
  const thread = h('div', { class: 'thread' }, h('div', { class: 'empty' }, 'Choose a conversation.'));
  const ctx = h('div', { class: 'ctx' });
  const filters = [['active', 'All open'], ['needs_human', 'Needs a person'], ['urgent', 'Urgent'], ['ai', 'AI handling'], ['human', 'With agent'], ['suspicious', 'Suspicious'], ['closed', 'Closed']];
  renderInboxList = guard(async () => {
    const rows = await api(`/admin/chats?filter=${inboxFilter}`);
    list.replaceChildren(h('div', { class: 'filters' }, filters.map(([k, l]) => h('button', { class: k === inboxFilter ? 'sm' : 'sec sm', onclick: () => { inboxFilter = k; renderInboxList(); } }, l))),
      ...(rows.length ? rows.map((c) => h('div', { class: `conv${openChat === c.id ? ' on' : ''}`, onclick: () => { openChat = c.id; renderInboxList(); renderThread(); } },
        h('div', { class: 'l1' }, h('span', {}, c.user.name || c.user.email || 'User'), h('span', {}, c.unread ? pill(String(c.unread), 'red') : '')),
        h('div', { class: 'row' }, statusPill(c), c.urgent ? pill('URGENT', 'red') : '', c.priority ? pill('premium', 'violet') : '', c.suspicious ? pill('suspicious', 'amber') : ''),
        h('div', { class: 'l2' }, c.last_message ? `${c.last_message.sender}: ${c.last_message.body}` : '—'),
        h('div', { class: 'l2' }, fmtDate(c.last_message_at)))) : [h('div', { class: 'empty' }, 'No conversations.')]));
  });
  const statusPill = (c) => pill({ ai: 'AI', needs_human: 'needs a person', human: `agent ${c.agent || ''}`, closed: 'closed' }[c.status] || c.status, { ai: 'blue', needs_human: 'amber', human: 'green' }[c.status] || '');
  const canned = await api('/admin/canned').catch(() => []);

  async function renderThread() {
    if (!openChat) return;
    const c = await api(`/admin/chats/${openChat}`);
    const box = h('div', { class: 'msgs' }, c.messages.map((m) => h('div', { class: `m ${m.internal ? 'note' : m.sender}` },
      h('span', { class: 'who' }, m.internal ? 'Internal note' : m.sender === 'agent' ? (m.agent?.name || 'Agent') : m.sender === 'ai' ? 'Nirapod Assistant (AI)' : m.sender === 'user' ? (c.user.name || 'User') : 'System', ' · ', new Date(m.created_at).toLocaleTimeString()),
      m.body || '',
      m.image ? (() => { const img = h('img', { alt: 'Image from the user' }); api(m.image.url.replace(API, ''), { raw: true }).then((r) => r.blob()).then((b) => { img.src = URL.createObjectURL(b); }).catch(() => {}); return img; })() : null,
      m.image_expired ? h('em', {}, ' (image deleted after 7 days)') : null)));
    const text = h('textarea', { placeholder: c.status === 'closed' ? 'This chat is closed.' : 'Write a reply (the user sees it) or an internal note', disabled: c.status === 'closed' });
    const note = h('input', { type: 'checkbox', id: 'asnote' });
    const send = guard(async () => {
      if (!text.value.trim()) return;
      await api(`/admin/chats/${c.id}/messages`, { method: 'POST', body: { body: text.value.trim(), internal: note.checked } });
      text.value = '';
      renderThread(); renderInboxList();
    });
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); });
    const lang = c.user.language || 'en';
    const cannedSel = h('select', { onchange: (e) => { const r = canned.find((x) => String(x.id) === e.target.value); if (r) text.value = r.body; e.target.value = ''; } },
      h('option', { value: '' }, 'Canned reply…'), canned.filter((x) => x.language === lang || x.language === 'en').map((x) => h('option', { value: x.id }, `[${x.language}] ${x.title}`)));
    const act = (label, path, cls = 'sec') => h('button', { class: `${cls} sm`, onclick: guard(async () => { await api(`/admin/chats/${c.id}/${path}`, { method: 'POST' }); renderThread(); renderInboxList(); }) }, label);
    const flag = (k, on) => h('button', { class: 'sec sm', onclick: guard(async () => { await api(`/admin/chats/${c.id}/flags`, { method: 'POST', body: { [k]: !on } }); renderThread(); renderInboxList(); }) }, `${on ? 'Remove' : 'Mark'} ${k.replace('_', ' ')}`);
    thread.replaceChildren(
      h('div', { class: 'head' }, h('div', {}, h('b', {}, c.user.name || c.user.email), ' ', statusPill({ status: c.status, agent: '' }), c.urgent ? ' ' : '', c.urgent ? pill('URGENT', 'red') : ''),
        h('div', { class: 'row' }, c.status !== 'closed' && c.status !== 'human' ? act('Join chat', 'join', '') : null, c.status === 'human' ? act('Hand back to AI', 'hand-back') : null,
          c.status !== 'closed' ? act('Close', 'close', 'danger') : null)),
      box,
      h('div', { class: 'composer' }, text, h('div', { class: 'row' }, cannedSel, h('label', { class: 'check', for: 'asnote' }, note, 'Internal note'), h('button', { onclick: send, disabled: c.status === 'closed' }, 'Send'))));
    box.scrollTop = box.scrollHeight;
    const ctxv = c.context || {};
    ctx.replaceChildren(h('h3', {}, 'Customer'), h('dl', {},
      h('dt', {}, 'Email'), h('dd', {}, c.user.email || '—'), h('dt', {}, 'Language'), h('dd', {}, c.user.language), h('dt', {}, 'Country'), h('dd', {}, c.user.country || '—'),
      h('dt', {}, 'Time zone'), h('dd', {}, c.user.timezone || '—'), h('dt', {}, 'Plan'), h('dd', {}, `${ctxv.plan || 'free'}${ctxv.plan_expires ? ` until ${ctxv.plan_expires}` : ''}`),
      h('dt', {}, 'Family'), h('dd', {}, `${ctxv.members ?? 0} members, ${ctxv.children ?? 0} children`), h('dt', {}, 'App'), h('dd', {}, ctxv.app_version || '—'), h('dt', {}, 'Android'), h('dd', {}, ctxv.android || '—')),
      h('h3', {}, 'Child phones'), (ctxv.child_devices || []).length ? h('div', {}, ctxv.child_devices.map((d) => h('p', {}, pill(d.location || '?', d.location === 'ok' ? 'green' : 'red'), ` last sync ${fmtDate(d.last_sync)}`, d.battery_optimized ? ' · battery saver on' : ''))) : h('p', { class: 'muted' }, 'None'),
      h('p', { class: 'muted' }, 'No location data is shown here, by design.'),
      h('h3', {}, 'Flags'), h('div', { class: 'row' }, flag('urgent', c.urgent), flag('suspicious', c.suspicious), flag('legal_hold', c.legal_hold)),
      h('p', {}, h('a', { href: '#/users', onclick: () => { sessionStorage.setItem('uq', c.user.id); } }, 'Open user')));
  }
  shell('chats', 'Live chat', h('div', { class: 'inbox' }, list, thread, ctx));
  await renderInboxList();
  if (openChat) renderThread();
  clearInterval(chatTimer);
  chatTimer = setInterval(() => { if (!location.hash.startsWith('#/chats')) return clearInterval(chatTimer); renderInboxList(); if (openChat) renderThread(); }, 6000);
}

async function pagePlans() {
  const d = await api('/admin/plans');
  const blocks = d.plans.map((p) => h('div', { class: 'card' },
    h('div', { class: 'row' }, h('h2', {}, p.name, ' ', pill(p.code)), p.popular ? pill('popular', 'violet') : ''),
    form([
      { name: 'name', label: 'Name' }, { name: 'trial_days', label: 'Trial days', type: 'number' },
      { name: 'max_children', label: 'Max children (empty = unlimited)', type: 'number' }, { name: 'max_members', label: 'Max members', type: 'number' },
      { name: 'max_places', label: 'Max places', type: 'number' }, { name: 'history_days', label: 'History days', type: 'number' },
      { name: 'is_popular', label: 'Show "Popular" badge', type: 'checkbox' }, { name: 'is_active', label: 'Plan is on sale', type: 'checkbox' },
      { name: 'priority_support', label: 'Priority support', type: 'checkbox' }, { name: 'email_reports', label: 'Email reports', type: 'checkbox' },
    ], { ...p, is_popular: p.popular, is_active: p.is_active }, async (v) => { await api(`/admin/plans/${p.code}`, { method: 'PATCH', body: v }); toast('Plan saved'); }),
    p.is_free ? null : h('div', {}, h('h3', {}, 'Prices'),
      form([{ name: 'prices', label: 'Prices (JSON list)', type: 'json', rows: 8, hint: 'Each: {"period":"monthly|yearly","months":1,"currency":"BDT","country":"BD" or null,"amount_minor":29900,"play_product_id":"nirapod_premium","play_base_plan_id":"monthly"}' }],
        { prices: p.prices.map(({ id, ...x }) => x) }, async (v) => { await api(`/admin/plans/${p.code}/prices`, { method: 'PUT', body: { prices: v.prices || [] } }); toast('Prices saved'); }))));
  shell('plans', 'Plans and limits', h('div', { class: 'grid' },
    h('div', { class: 'card' }, h('h2', {}, 'Free plan'),
      form([
        { name: 'free_plan_enabled', label: 'Free plan available (off = families must start a trial or buy)', type: 'checkbox' },
        { name: 'max_children', label: 'Free: max children', type: 'number' }, { name: 'max_members', label: 'Free: max members', type: 'number' },
        { name: 'max_places', label: 'Free: max places', type: 'number' }, { name: 'history_days', label: 'Free: history days', type: 'number' },
      ], { free_plan_enabled: d.free_plan_enabled, ...(d.free_limits || {}) }, async (v) => {
        const { free_plan_enabled, ...limits } = v;
        await api('/admin/settings', { method: 'PUT', body: { free_plan_enabled, free_limits: limits } }); toast('Saved');
      })),
    h('div', { class: 'grid g2' }, blocks)));
}

async function pageCodes() {
  const out = h('div');
  const load = guard(async () => {
    const rows = await api('/admin/codes');
    out.replaceChildren(table([
      ['Code', (c) => h('span', { class: 'mono' }, `••••${c.code_last4}`)], ['Plan', (c) => c.plan], ['Days', (c) => c.duration_days], ['Batch', (c) => c.batch_name || '—'],
      ['Gift from', (c) => c.gift_from_name || '—'], ['Status', (c) => pill(c.status, c.status === 'active' ? 'green' : c.status === 'redeemed' ? 'blue' : 'red')], ['Created', (c) => fmtDay(c.created_at)],
      ['', (c) => (c.status === 'active' ? h('button', { class: 'ghost sm', onclick: guard(async () => { if (await confirmBox('Revoke this code?')) { await api(`/admin/codes/${c.id}/revoke`, { method: 'POST' }); load(); } }) }, 'Revoke') : '')],
    ], rows));
  });
  const create = () => modal('Create redeem codes', form([
    { name: 'plan_code', label: 'Plan', type: 'select', options: ['premium', 'family_plus'] }, { name: 'days', label: 'Days of premium', type: 'number' },
    { name: 'count', label: 'How many codes', type: 'number' }, { name: 'batch_name', label: 'Batch name (for CSV export)', optional: true },
    { name: 'gift_from_name', label: 'Gift from (shown to the family)', optional: true }, { name: 'gift_message', label: 'Gift message', optional: true },
  ], { days: 30, count: 1 }, async (v) => {
    const r = await api('/admin/codes', { method: 'POST', body: v });
    document.querySelector('.modal-wrap')?.remove();
    modal('Codes created', h('div', {}, h('p', { class: 'muted' }, 'Copy them now. Later you can export the batch as CSV.'), h('textarea', { rows: Math.min(12, r.codes.length + 1), readonly: true }, r.codes.join('\n'))), (close) => [h('button', { onclick: close }, 'Done')]);
    load();
  }, 'Create'), () => []);
  const exportCsv = guard(async () => {
    const batch = prompt('Batch name to export:');
    if (!batch) return;
    const r = await api(`/admin/codes/export?batch=${encodeURIComponent(batch)}`, { raw: true });
    if (!r.ok) throw new Error('Export failed');
    const a = h('a', { href: URL.createObjectURL(await r.blob()), download: `codes-${batch}.csv` });
    a.click();
  });
  shell('codes', 'Redeem codes', out, [h('button', { class: 'sec', onclick: exportCsv }, 'Export CSV'), h('button', { onclick: create }, 'Create codes')]);
  load();
}

async function pageGrants() {
  const rows = await api('/admin/grants');
  shell('grants', 'Grants', h('div', {}, h('p', { class: 'muted' }, 'Grant a package from a user\'s page (Users → open a user → Grant a package).'),
    table([['Owner email', (g) => g.target_user_email], ['Plan', (g) => g.plan], ['Days', (g) => g.duration_days], ['Payment ref', (g) => g.payment_reference || '—'], ['Gift from', (g) => g.gift_from_name || '—'], ['By', (g) => g.by || '—'], ['Date', (g) => fmtDate(g.created_at)]], rows)));
}

function crudPage({ id, title, path, cols, fields, defaults = {}, intro }) {
  return async () => {
    const out = h('div');
    const edit = (row) => modal(row ? `Edit` : `Add`, form(fields, row || defaults, async (v) => {
      await api(row ? `/admin/${path}/${row.id}` : `/admin/${path}`, { method: row ? 'PATCH' : 'POST', body: v });
      document.querySelector('.modal-wrap')?.remove(); toast('Saved'); load();
    }), (close) => [row ? h('button', { class: 'danger', onclick: guard(async () => { if (await confirmBox('Delete this?')) { await api(`/admin/${path}/${row.id}`, { method: 'DELETE' }); close(); load(); } }) }, 'Delete') : null, h('button', { class: 'sec', onclick: close }, 'Cancel')]);
    const load = guard(async () => out.replaceChildren(table(cols, await api(`/admin/${path}`), edit)));
    shell(id, title, h('div', {}, intro ? h('p', { class: 'muted' }, intro) : null, out), [h('button', { onclick: () => edit(null) }, 'Add')]);
    load();
  };
}
const LANGS = ['en', 'bn', 'hi', 'ur', 'ar', 'es', 'id', 'ms'];
const pageKb = crudPage({
  id: 'kb', title: 'Knowledge base', path: 'kb', intro: 'Help articles in the app and the only source the AI assistant answers from.',
  cols: [['Title', (a) => a.title], ['Language', (a) => a.language], ['Category', (a) => a.category || '—'], ['Published', (a) => (a.is_published ? pill('yes', 'green') : pill('draft'))]],
  fields: [{ name: 'title', label: 'Title' }, { name: 'slug', label: 'Slug (a-z, 0-9, -)' }, { name: 'language', label: 'Language', type: 'select', options: LANGS },
    { name: 'category', label: 'Category', type: 'select', options: ['start', 'location', 'safety', 'family', 'billing', 'privacy', 'devices', 'troubleshooting'] },
    { name: 'body', label: 'Body', type: 'textarea', rows: 10 }, { name: 'is_published', label: 'Published', type: 'checkbox' }],
  defaults: { language: 'en', is_published: true, category: 'start' },
});
const pageCanned = crudPage({
  id: 'canned', title: 'Canned replies', path: 'canned', intro: 'Approved replies for agents, per language (legal requests, missing child, payments...).',
  cols: [['Title', (a) => a.title], ['Language', (a) => a.language], ['Reply', (a) => a.body.slice(0, 90)]],
  fields: [{ name: 'title', label: 'Title' }, { name: 'language', label: 'Language', type: 'select', options: LANGS }, { name: 'body', label: 'Reply', type: 'textarea', rows: 6 }],
  defaults: { language: 'en' },
});
const pageChangelog = crudPage({
  id: 'changelog', title: 'Changelog', path: 'changelog', intro: 'Shown on the landing page ("What\'s new").',
  cols: [['Version', (a) => a.version], ['Title', (a) => a.title], ['Language', (a) => a.language], ['Published', (a) => (a.is_published ? pill('yes', 'green') : pill('draft'))]],
  fields: [{ name: 'version', label: 'Version' }, { name: 'title', label: 'Title' }, { name: 'language', label: 'Language', type: 'select', options: LANGS }, { name: 'body', label: 'What changed', type: 'textarea' }, { name: 'is_published', label: 'Published', type: 'checkbox' }],
  defaults: { language: 'en' },
});
const pageEmergency = crudPage({
  id: 'emergency', title: 'Emergency numbers', path: 'emergency-numbers', intro: 'Shown in SOS screens and urgent chat replies by country.',
  cols: [['Country', (a) => a.country_iso2], ['Service', (a) => a.service], ['Number', (a) => h('b', {}, a.number)], ['Note', (a) => a.note || '—']],
  fields: [{ name: 'country_iso2', label: 'Country code (BD, MY, SA...)' }, { name: 'service', label: 'Service', type: 'select', options: ['general', 'police', 'ambulance', 'fire'] }, { name: 'number', label: 'Number' }, { name: 'note', label: 'Note', optional: true }],
  defaults: { service: 'general' },
});

async function pageAppConfig() {
  const s = { nearby_places_enabled: true, trial_days: 7, live_chat_human_for: 'all', chat_inactivity_warn_minutes: 5, chat_autoclose_minutes: 5, ...Object.fromEntries(Object.entries(await api('/admin/settings')).filter(([, v]) => v != null)) };
  const save = async (v) => { await api('/admin/settings', { method: 'PUT', body: v }); toast('Saved'); };
  shell('appconfig', 'App settings', h('div', { class: 'grid g2' },
    h('div', { class: 'card' }, h('h2', {}, 'App updates'), form([
      { name: 'min_version', label: 'Minimum version (older apps are blocked)', placeholder: '1.0.0' }, { name: 'latest_version', label: 'Latest version (older apps see an update prompt)', placeholder: '1.0.0' },
      { name: 'play_store_url', label: 'Play Store link' }, { name: 'update_message', label: 'Update message per language (JSON)', type: 'json', hint: '{"en":"Please update...","bn":"..."}' },
    ], s, save)),
    h('div', { class: 'card' }, h('h2', {}, 'Local payment banner'), form([
      { name: 'payment_banner_enabled', label: 'Show the WhatsApp payment banner', type: 'checkbox' }, { name: 'payment_banner_show_logos', label: 'Show bKash / Nagad logos', type: 'checkbox' },
      { name: 'whatsapp_number', label: 'WhatsApp number', placeholder: '+8801...' }, { name: 'payment_banner_countries', label: 'Countries (comma separated)', type: 'list', placeholder: 'BD' },
      { name: 'payment_banner_text', label: 'Banner text per language (JSON)', type: 'json' },
    ], s, save)),
    h('div', { class: 'card' }, h('h2', {}, 'Features'), form([
      { name: 'nearby_places_enabled', label: 'Nearby places on the map', type: 'checkbox' }, { name: 'nearby_places_daily_cap', label: 'Nearby places: daily request cap (all users)', type: 'number' },
      { name: 'nearby_places_per_user_daily', label: 'Nearby places: daily requests per user', type: 'number' },
      { name: 'trial_days', label: 'Trial days', type: 'number' }, { name: 'live_chat_human_for', label: 'People answer chats for', type: 'select', options: ['all', 'premium'] },
      { name: 'languages_enabled', label: 'Languages on/off (JSON)', type: 'json', hint: '{"en":true,"bn":true,"hi":true,"ur":true,"ar":true,"es":true,"id":true,"ms":true}' },
    ], s, save)),
    h('div', { class: 'card' }, h('h2', {}, 'Support and legal'), form([
      { name: 'support_emails', label: 'Support emails for new chats (comma separated)', type: 'list' }, { name: 'legal_request_email', label: 'Legal-request email' },
      { name: 'chat_inactivity_warn_minutes', label: 'Chat: warn after (minutes)', type: 'number' }, { name: 'chat_autoclose_minutes', label: 'Chat: close after a further (minutes)', type: 'number' },
    ], s, save)),
    h('div', { class: 'card' }, h('h2', {}, 'Per-country free limits'), form([
      { name: 'country_overrides', label: 'Country overrides (JSON)', type: 'json', rows: 6, hint: '{"BD":{"free_limits":{"max_children":2}}}' },
    ], s, save))));
}

async function pageKeys() {
  const sec = await api('/admin/secrets');
  const set = await api('/admin/settings');
  const secretForm = (key, label, hint, textarea = false) => h('div', { class: 'card' },
    h('div', { class: 'row' }, h('h3', {}, label), sec[key] ? pill(`set: ${sec[key]}`, 'green') : pill('not set', 'amber')),
    h('p', { class: 'muted' }, hint),
    form([{ name: 'value', label: 'New value', type: textarea ? 'textarea' : 'password', rows: 6 }], {}, async (v) => { await api(`/admin/secrets/${key}`, { method: 'PUT', body: v }); toast('Saved (encrypted)'); pageKeys(); }));
  shell('keys', 'API keys', h('div', {},
    h('div', { class: 'notice' }, 'Keys are encrypted on the server with the master key, never sent to the app, and shown here only masked.'),
    h('div', { class: 'grid g2' },
      secretForm('fcm_service_account', 'Firebase push: service account JSON', 'Firebase console → Project settings → Service accounts → Generate new private key. Paste the whole file.', true),
      h('div', { class: 'card' }, h('h3', {}, 'Firebase Android app (public ids)'), h('p', { class: 'muted' }, 'From google-services.json: api_key (current_key), mobilesdk_app_id, project_id, project_number.'),
        form([{ name: 'api_key', label: 'API key' }, { name: 'app_id', label: 'App id (1:...:android:...)' }, { name: 'project_id', label: 'Project id' }, { name: 'sender_id', label: 'Sender id (project number)' }],
          set.firebase_android || {}, async (v) => { await api('/admin/settings', { method: 'PUT', body: { firebase_android: v } }); toast('Saved'); })),
      secretForm('play_service_account', 'Google Play: service account JSON', 'Play Console → Setup → API access. The account verifies purchases. Paste the whole file.', true),
      secretForm('play_rtdn_token', 'Google Play RTDN token', 'Any long random text. Use it in the Pub/Sub push URL: /api/v1/billing/play/rtdn?token=<this>.'),
      secretForm('google_places_api_key', 'Google Places API key (nearby places)', 'Google Cloud → APIs & Services → Credentials. Restrict it to the Places API.'),
      h('div', { class: 'card' }, h('h3', {}, 'OpenAI key'), h('p', { class: 'muted' }, 'Set it on the AI assistant page.'), h('a', { href: '#/ai' }, 'Open AI assistant settings')),
      h('div', { class: 'card' }, h('h3', {}, 'Google Maps key (Android)'), h('p', { class: 'muted' }, 'The Maps SDK reads its key when the app is built, so it cannot be changed here. Add it as the MAPS_API_KEY secret in GitHub (Settings → Secrets → Actions) and rebuild.')))));
}

async function pageAi() {
  const a = await api('/admin/ai');
  const usage = await api('/admin/ai/usage').catch(() => []);
  shell('ai', 'AI assistant', h('div', { class: 'grid g2' },
    h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', {}, 'Settings'), a.enabled ? pill('on', 'green') : pill('off', 'amber'), a.api_key ? pill(`key ${a.api_key}`, 'blue') : pill('no key', 'red')),
      form([
        { name: 'enabled', label: 'AI answers chats first', type: 'checkbox' }, { name: 'api_key', label: 'OpenAI API key (leave empty to keep)', type: 'password', optional: true },
        { name: 'model', label: 'Model', placeholder: 'gpt-4o-mini' }, { name: 'temperature', label: 'Temperature', type: 'number', step: '0.1' }, { name: 'max_tokens', label: 'Max tokens per answer', type: 'number' },
        { name: 'daily_message_limit_per_user', label: 'Daily AI answers per user', type: 'number' }, { name: 'global_daily_cost_cap_usd', label: 'Daily cost cap (USD)', type: 'number', step: '0.5' },
        { name: 'system_prompt', label: 'Extra guidance (added after the fixed safety rules)', type: 'textarea', rows: 6 },
      ], a, async (v) => { await api('/admin/ai', { method: 'PUT', body: v }); toast('Saved'); pageAi(); }),
      h('button', { class: 'sec', onclick: guard(async () => { const r = await api('/admin/ai/test', { method: 'POST' }); toast(r.ok ? `Connected: ${r.reply}` : `Failed (${r.status ?? 'no answer'})`, !r.ok); }) }, 'Test connection')),
    h('div', { class: 'card' }, h('h2', {}, 'Usage'), h('p', { class: 'muted' }, `Today: ${a.today.messages} answers · $${a.today.cost_usd.toFixed(3)}`),
      table([['Date', (u) => u.date], ['Model', (u) => u.model], ['Answers', (u) => u.messages], ['Tokens', (u) => u.prompt_tokens + u.completion_tokens], ['Cost', (u) => `$${u.cost_usd.toFixed(3)}`]], usage),
      h('div', { class: 'sep' }), h('h3', {}, 'Fixed rules'), h('p', { class: 'muted' }, 'The AI answers only from the knowledge base and a safe account summary, never shares codes, passwords or any location, and hands over to a person when asked, for payments, refunds, deletion, abuse, or when unsure twice.'))));
}

async function pageCampaigns() {
  const rows = await api('/admin/campaigns');
  shell('campaigns', 'Campaigns', h('div', { class: 'grid g2' },
    h('div', { class: 'card' }, h('h2', {}, 'Send an announcement'), h('p', { class: 'muted' }, 'Respects each user\'s push and email settings. Never includes location.'),
      form([
        { name: 'channel', label: 'Channel', type: 'select', options: ['push', 'email', 'both'] }, { name: 'audience', label: 'Audience', placeholder: 'all | free | premium | country:BD' },
        { name: 'title', label: 'Title' }, { name: 'body', label: 'Message', type: 'textarea' },
      ], { channel: 'push', audience: 'all' }, async (v) => {
        if (!(await confirmBox(`Send to "${v.audience}" now?`, false))) return;
        const r = await api('/admin/campaigns', { method: 'POST', body: v }); toast(`Sent to ${r.sent}`); pageCampaigns();
      }, 'Send')),
    h('div', {}, table([['Title', (c) => c.title], ['Channel', (c) => c.channel], ['Audience', (c) => c.audience], ['Sent', (c) => c.sent_count], ['Date', (c) => fmtDate(c.sent_at)]], rows))));
}

async function pageTickets() {
  const rows = await api('/admin/tickets');
  shell('tickets', 'Support tickets', table([
    ['Subject', (t) => t.subject], ['User', (t) => t.user.email], ['Premium', (t) => (t.premium ? pill('premium', 'violet') : '')], ['Status', (t) => pill(t.status)], ['Date', (t) => fmtDate(t.created_at)],
    ['', (t) => h('select', { onchange: guard(async (e) => { await api(`/admin/tickets/${t.id}`, { method: 'PATCH', body: { status: e.target.value } }); toast('Updated'); }) }, ['open', 'pending', 'resolved', 'closed'].map((s) => h('option', { value: s, selected: s === t.status }, s)))],
  ], rows));
}
async function pageAbuse() {
  const rows = await api('/admin/abuse');
  shell('abuse', 'Abuse reports', h('div', {}, h('p', { class: 'muted' }, 'Covert tracking and harassment reports. Suspend an account from its user page.'), table([
    ['Category', (r) => pill(r.category.replace('_', ' '), 'amber')], ['Details', (r) => r.details || '—'], ['Reporter', (r) => r.reporter || '—'], ['Reported', (r) => r.reported || '—'], ['Date', (r) => fmtDate(r.created_at)],
    ['Status', (r) => h('select', { onchange: guard(async (e) => { await api(`/admin/abuse/${r.id}`, { method: 'PATCH', body: { status: e.target.value } }); toast('Updated'); }) }, ['open', 'investigating', 'resolved', 'dismissed'].map((s) => h('option', { value: s, selected: s === r.status }, s)))],
  ], rows)));
}
async function pageDataReq() {
  const rows = await api('/admin/data-requests');
  shell('datareq', 'Data requests', table([['Type', (r) => pill(r.type, r.type === 'delete' ? 'red' : 'blue')], ['Email', (r) => r.email || '—'], ['Source', (r) => r.source], ['Status', (r) => pill(r.status)], ['Created', (r) => fmtDate(r.created_at)], ['Completed', (r) => fmtDate(r.completed_at)]], rows));
}

async function pageAdmins() {
  const rows = await api('/admin/admins');
  const add = () => modal('Add an admin', form([
    { name: 'name', label: 'Name (shown to users as the agent name)' }, { name: 'email', label: 'Email' }, { name: 'role', label: 'Role', type: 'select', options: ['support', 'finance', 'super_admin'] },
    { name: 'password', label: 'Temporary password (10+ characters)', type: 'password' },
  ], { role: 'support' }, async (v) => { await api('/admin/admins', { method: 'POST', body: v }); document.querySelector('.modal-wrap')?.remove(); toast('Admin added'); pageAdmins(); }), () => []);
  shell('admins', 'Admins and roles', h('div', {},
    h('p', { class: 'muted' }, 'Super admin: everything. Support: chats, users, content. Finance: plans, codes, grants.'),
    table([['Name', (a) => a.name || '—'], ['Email', (a) => a.email], ['Role', (a) => pill(a.role.replace('_', ' '), 'blue')], ['2FA', (a) => (a.two_factor ? pill('on', 'green') : pill('off', 'red'))], ['Active', (a) => (a.active ? 'yes' : 'no')], ['Last login', (a) => fmtDate(a.last_login_at)],
      ['', (a) => (String(a.id) === me.id ? '' : h('button', { class: 'ghost sm', onclick: guard(async () => { await api(`/admin/admins/${a.id}`, { method: 'PATCH', body: { active: !a.active } }); pageAdmins(); }) }, a.active ? 'Disable' : 'Enable'))]], rows)), [h('button', { onclick: add }, 'Add admin')]);
}
async function pageAudit() {
  const rows = await api('/admin/audit?limit=200');
  shell('audit', 'Audit log', table([['When', (r) => fmtDate(r.created_at)], ['Who', (r) => `${r.actor_type}${r.actor ? `: ${r.actor}` : ''}`], ['Action', (r) => h('span', { class: 'mono' }, r.action)], ['Target', (r) => r.target || '—'], ['Details', (r) => (r.metadata ? h('span', { class: 'mono' }, JSON.stringify(r.metadata).slice(0, 120)) : '')]], rows));
}
async function pageHealth() {
  const d = await api('/admin/health');
  const stat = (k, v, color) => h('div', { class: 'card stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), color && pill(color[0], color[1]));
  shell('health', 'System health', h('div', { class: 'grid' },
    h('div', { class: 'grid g4' },
      stat('Push', d.push_enabled ? 'On' : 'Off', d.push_enabled ? null : ['add the FCM key', 'amber']), stat('AI assistant', d.ai_enabled ? 'On' : 'Off'),
      stat('Phones with location off', d.devices_location_off), stat('Not seen for 24 h', d.devices_not_seen_24h)),
    h('div', { class: 'card' }, h('h2', {}, 'Email (last 24 h)'), h('p', {}, Object.entries(d.emails_24h).map(([k, v]) => [pill(`${k}: ${v}`, k === 'failed' ? 'red' : 'green'), ' ']))),
    h('div', {}, h('h2', {}, 'Scheduled jobs'), table([['Job', (j) => h('span', { class: 'mono' }, j.job)], ['Status', (j) => pill(j.status, j.status === 'ok' ? 'green' : j.status === 'failed' ? 'red' : 'amber')], ['Affected', (j) => j.affected ?? '—'], ['Last run', (j) => fmtDate(j.started_at)], ['Error', (j) => j.error || '']], d.jobs))));
}

async function pageProfile() {
  const qrBox = h('div');
  const agents = await api('/admin/agents').catch(() => []);
  const mine = agents.find((a) => a.admin_id === me.id);
  const fileIn = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
  shell('profile', 'My profile', h('div', { class: 'grid g2' },
    h('div', { class: 'card' }, h('h2', {}, 'Two-factor sign-in'),
      me.two_factor ? h('p', {}, pill('On', 'green'), ' Your account asks for a 6-digit code at sign-in.') : h('div', {},
        h('p', { class: 'muted' }, 'Required before you can change anything. Use Google Authenticator, Microsoft Authenticator or Authy.'),
        h('button', { onclick: guard(async () => {
          const r = await api('/admin/2fa/setup', { method: 'POST' });
          const code = h('input', { inputmode: 'numeric', maxlength: 6, placeholder: '123456' });
          qrBox.replaceChildren(h('p', {}, '1. In the app, add an account with this key (or open the link on your phone):'), h('div', { class: 'secret' }, r.secret), h('p', {}, h('a', { href: r.otpauth_url }, 'Open in authenticator app')),
            h('p', {}, '2. Enter the 6-digit code it shows:'), h('div', { class: 'row' }, code, h('button', { onclick: guard(async () => { await api('/admin/2fa/enable', { method: 'POST', body: { code: code.value } }); me.two_factor = true; toast('Two-factor sign-in is on'); pageProfile(); }) }, 'Turn on')));
        }) }, 'Set up two-factor sign-in'), qrBox)),
    h('div', { class: 'card' }, h('h2', {}, 'Agent profile in chats'),
      h('p', { class: 'muted' }, 'Users see "Connected, Agent: name" with this photo.'),
      mine?.photo_url ? h('img', { src: mine.photo_url, width: 64, height: 64, alt: '', class: 'avatar' }) : null,
      mine ? form([{ name: 'name', label: 'Agent name' }], { name: mine.name }, async (v) => { await api(`/admin/agents/${mine.id}`, { method: 'PATCH', body: v }); toast('Saved'); }) : h('p', { class: 'muted' }, 'Your agent profile is created when you first join a chat.'),
      h('div', { class: 'field' }, h('label', {}, 'Photo'), fileIn),
      h('button', { class: 'sec', onclick: guard(async () => {
        const f = fileIn.files?.[0];
        if (!f) return toast('Choose a photo first', true);
        const fd = new FormData();
        fd.append('photo', f);
        await api('/admin/agents/me/photo', { method: 'POST', form: fd }); toast('Photo saved'); pageProfile();
      }) }, 'Upload photo')),
    h('div', { class: 'card' }, h('h2', {}, 'Change password'), form([{ name: 'current', label: 'Current password', type: 'password' }, { name: 'new_password', label: 'New password (10+ characters)', type: 'password' }],
      {}, async (v) => { await api('/admin/me/password', { method: 'POST', body: v }); toast('Password changed'); }))));
}

// ---------- sign-in and setup ----------
function authCard(...content) {
  app.className = 'auth';
  app.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'logo' }, h('img', { src: '/shared/web/brand/logo-app.svg', width: 44, height: 44, alt: '' }), h('div', {}, h('b', {}, 'Nirapod Admin'), h('span', {}, 'Live Family Locator'))), ...content));
}
async function pageLogin() {
  const st = await api('/admin/setup').catch(() => ({ needs_setup: false }));
  if (st.needs_setup) {
    const err = h('div', { class: 'notice err', hidden: true });
    authCard(h('h2', {}, 'Create the first admin'),
      st.setup_enabled ? null : h('div', { class: 'notice warn' }, 'Add ADMIN_SETUP_KEY to the server settings (environment variables), restart, then come back.'),
      err, form([
        { name: 'setup_key', label: 'Setup key (ADMIN_SETUP_KEY)', type: 'password' }, { name: 'name', label: 'Your name' }, { name: 'email', label: 'Email' },
        { name: 'password', label: 'Password (10+ characters)', type: 'password' },
      ], {}, async (v) => {
        try { await api('/admin/setup', { method: 'POST', body: v }); toast('Admin created. Please sign in.'); pageLogin(); } catch (e) { err.hidden = false; err.textContent = e.message; }
      }, 'Create admin'));
    return;
  }
  const email = h('input', { type: 'email', id: 'email', autocomplete: 'username', required: true });
  const pass = h('input', { type: 'password', id: 'pass', autocomplete: 'current-password', required: true });
  const code = h('input', { inputmode: 'numeric', id: 'code', autocomplete: 'one-time-code', maxlength: 6, placeholder: '123456' });
  const codeField = h('div', { class: 'field', hidden: true }, h('label', { for: 'code' }, 'Code from your authenticator app'), code);
  const err = h('div', { class: 'notice err', hidden: true });
  const f = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    err.hidden = true;
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      const r = await api('/admin/auth/login', { method: 'POST', body: { email: email.value, password: pass.value, code: code.value || undefined } });
      store.token = r.token;
      me = r.admin;
      location.hash = r.needs_2fa_setup ? '#/profile' : '#/dashboard';
      route();
    } catch (ex) {
      if (ex.details?.two_factor === 'required') { codeField.hidden = false; code.focus(); } else { err.hidden = false; err.textContent = ex.message; }
    } finally { btn.disabled = false; }
  } },
  h('div', { class: 'field' }, h('label', { for: 'email' }, 'Email'), email),
  h('div', { class: 'field' }, h('label', { for: 'pass' }, 'Password'), pass),
  codeField, err, h('button', { type: 'submit' }, 'Sign in'));
  authCard(h('h2', {}, 'Sign in'), f, h('p', { class: 'muted' }, 'Admins never see any user\'s location.'));
  email.focus();
}

// ---------- router ----------
const PAGES = {
  dashboard: pageDashboard, users: pageUsers, chats: pageChats, plans: pagePlans, codes: pageCodes, grants: pageGrants, campaigns: pageCampaigns,
  kb: pageKb, canned: pageCanned, changelog: pageChangelog, emergency: pageEmergency, appconfig: pageAppConfig, keys: pageKeys, ai: pageAi,
  tickets: pageTickets, abuse: pageAbuse, datareq: pageDataReq, admins: pageAdmins, audit: pageAudit, health: pageHealth, profile: pageProfile,
};
async function route() {
  document.querySelectorAll('.overlay,.modal-wrap').forEach((x) => x.remove());
  if (!store.token) return pageLogin();
  if (!me) {
    try { me = await api('/admin/me'); } catch { store.token = ''; return pageLogin(); }
  }
  let page = (location.hash.replace(/^#\//, '') || 'dashboard').split('?')[0];
  if (!PAGES[page] || !allowed(page)) page = allowed('dashboard') ? 'dashboard' : 'profile';
  try {
    await PAGES[page]();
  } catch (e) {
    shell(page, 'Something went wrong', h('div', { class: 'notice err' }, e.message));
  }
}
window.addEventListener('hashchange', route);
route();
