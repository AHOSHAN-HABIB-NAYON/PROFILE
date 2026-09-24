import { api, esc, pageHead } from './kit.js';
import { chip, relEl, num, animateCount } from '/assets/js/core.js';

export async function mount(el, { live }) {
  const render = async () => {
    const s = await api('/admin/stats');
    const card = (icon, cls, label, value, sub = '', href = '') => `<${href ? `a href="${href}"` : 'div'} class="card stat-card" style="color:var(--text)"><span class="ic ${cls}"><i class="${icon}"></i></span>
      <div><div class="label">${esc(label)}</div><div class="value" data-count="${esc(value)}">${esc(value)}</div>${sub ? `<div class="sub muted" style="color:var(--muted)">${sub}</div>` : ''}</div></${href ? 'a' : 'div'}>`;
    el.innerHTML = `${pageHead('fa-solid fa-gauge-high', 'Admin Dashboard', 'Everything at a glance')}
    <div class="grid grid-stats">
      ${card('fa-solid fa-users', '', 'Users', s.users.total, `${num(s.users.new_today)} new today · ${num(s.users.suspended)} suspended`, '/admin/users')}
      ${card('fa-solid fa-signal', 'green', 'Online Users', s.users.online, `${num(s.users.sockets)} live connections`)}
      ${card('fa-solid fa-sim-card', 'purple', 'Resources', s.resources.total, `${num(s.resources.available)} available · ${num(s.resources.assigned)} assigned`, '/admin/access')}
      ${card('fa-solid fa-bolt', 'cyan', 'Events', s.events.total, `${num(s.events.today)} today · ${num(s.events.demo_live)} demo ${s.events.demo_running ? '<span class="chip demo">running</span>' : ''}`, '/admin/events')}
      ${card('fa-solid fa-credit-card', 'orange', 'Pending Payments', s.payments.pending, `Revenue $${esc(s.payments.revenue)}`, '/admin/payments')}
      ${card('fa-solid fa-money-bill-wave', 'green', 'Pending Withdrawals', s.withdrawals.pending, `Paid $${esc(s.withdrawals.paid)} · wallets $${esc(s.wallets.liabilities)}`, '/admin/withdrawals')}
      ${card('fa-solid fa-crown', 'orange', 'Premium Members', s.premium.active, '', '/admin/plans')}
      ${card('fa-solid fa-newspaper', 'purple', 'News', s.news.published, `${num(s.notifications.unread)} unread notifications`, '/admin/news')}
    </div>
    <div class="grid grid-main" style="margin-top:16px">
      <div class="card"><div class="card-head"><h2>API Providers</h2><a class="link" href="/admin/api">Manage</a></div>
        <div class="list">${s.providers.map((p) => `<div class="list-item"><span class="li-ic system"><i class="fa-solid fa-plug"></i></span>
          <div class="li-body"><div class="li-title">${esc(p.name)} ${p.enabled ? '' : '<span class="chip">disabled</span>'}</div>
          <div class="li-sub">${p.last_checked_at ? `Last checked ${relEl(new Date(p.last_checked_at).toISOString())}` : 'Never checked'}${p.last_error ? ` · ${esc(p.last_error)}` : ''}</div></div>
          ${chip(p.health_status)}</div>`).join('')}</div></div>
      <div class="card"><div class="card-head"><h2>Signups (14 days)</h2></div>
        ${s.signups.length ? `<div class="list">${s.signups.slice(-7).reverse().map((d) => `<div class="list-item"><div class="li-body">${esc(d.d)}</div><strong>${num(d.n)}</strong></div>`).join('')}</div>` : '<div class="empty">No signups yet</div>'}
      </div>
    </div>`;
    for (const n of el.querySelectorAll('[data-count]')) if (/^\d+$/.test(n.dataset.count)) animateCount(n, Number(n.dataset.count));
  };
  await render();
  const t = setInterval(() => { if (!document.hidden) render().catch(() => {}); }, 30000);
  const offs = ['admin:payment', 'admin:withdrawal', 'provider:health'].map((e) => live.on(e, () => render().catch(() => {})));
  return () => { clearInterval(t); offs.forEach((f) => f()); };
}
