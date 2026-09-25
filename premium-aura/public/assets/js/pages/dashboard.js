import { api, esc, $, animateCount, relEl, flag, appIcon, pageHead, state, money, num } from '../core.js';

let chartLib = null;
async function loadChart() {
  if (chartLib) return chartLib;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/chart.js/chart.umd.min.js'; s.onload = resolve; s.onerror = reject;
    document.head.append(s);
  });
  chartLib = window.Chart;
  return chartLib;
}

const ACT_ICON = { event: 'fa-shield-halved', resource: 'fa-hashtag', premium: 'fa-crown', payment: 'fa-credit-card', withdrawal: 'fa-money-bill-transfer', announcement: 'fa-bullhorn' };

export async function mount(el, { live }) {
  const [d, svc] = await Promise.all([api('/dashboard'), api('/services')]);
  const c = d.cards;
  el.innerHTML = `
  ${pageHead('fa-solid fa-house', `Hi, ${state.user.name.split(' ')[0]} 👋`, 'Here is what is happening with your account today')}
  <div class="card hero-card mobile-only" style="margin-bottom:16px">
    <div class="row-flex" style="justify-content:space-between">
      <div class="row-flex"><span class="li-ic" style="background:rgba(255,255,255,.2)"><i class="fa-solid fa-wallet"></i></span>
        <div><div style="font-size:26px;font-weight:800" data-count-money>${esc(money(c.wallet.balance))}</div><div class="muted small">Wallet Balance</div></div></div>
      <a class="btn btn-white btn-sm" href="/withdraw">Withdraw</a>
    </div>
  </div>
  <div class="app-grid mobile-quick mobile-only" style="margin-bottom:16px">
    <a class="app-tile" href="/access"><span class="t-ic"><i class="fa-solid fa-sim-card"></i></span>Access Services</a>
    <a class="app-tile" href="/otp"><span class="t-ic" style="background:linear-gradient(135deg,#6366f1,#8b5cf6)"><i class="fa-solid fa-shield-halved"></i></span>OTP Services</a>
    <a class="app-tile" href="/premium"><span class="t-ic" style="background:linear-gradient(135deg,#a855f7,#ec4899)"><i class="fa-solid fa-crown"></i></span>Premium</a>
    <a class="app-tile" href="/news"><span class="t-ic" style="background:linear-gradient(135deg,#10b981,#059669)"><i class="fa-solid fa-newspaper"></i></span>News</a>
  </div>
  <div class="grid grid-stats" style="margin-bottom:16px">
    <div class="card stat-card desktop-only"><span class="ic"><i class="fa-solid fa-wallet"></i></span><div><div class="label">Wallet Balance</div>
      <div class="value" data-count="${esc(c.wallet.balance)}" data-dec="2" data-prefix="${esc(state.site.currency_symbol || '$')}">${esc(money(c.wallet.balance))}</div>
      <div class="sub"><i class="fa-solid fa-arrow-trend-up"></i> +${esc(money(state.site.event_reward || '0.01'))} / event</div></div></div>
    <div class="card stat-card"><span class="ic cyan"><i class="fa-solid fa-envelope-open-text"></i></span><div><div class="label">OTP Received</div>
      <div class="value" data-count="${c.events.total}">${num(c.events.total)}</div><div class="sub">+${num(c.events.today)} today</div></div></div>
    <div class="card stat-card"><span class="ic purple"><i class="fa-solid fa-calendar-day"></i></span><div><div class="label">Used Today</div>
      <div class="value"><span data-count="${c.limit.day_used}">${num(c.limit.day_used)}</span> <small>/ ${num(c.limit.daily)}</small></div><div class="sub muted" style="color:var(--muted)">Daily limit${c.premium.active ? ' · ⚡ Premium' : ' · Free'}</div></div></div>
    <div class="card stat-card"><span class="ic orange"><i class="fa-solid fa-gauge-high"></i></span><div><div class="label">This Hour</div>
      <div class="value"><span data-count="${c.limit.hour_used}">${num(c.limit.hour_used)}</span> <small>/ ${num(c.limit.hourly)}</small></div><div class="sub muted" style="color:var(--muted)">Hourly limit${c.premium.active ? ' · ⚡ Premium' : ' · Free'}</div></div></div>
    <div class="card stat-card"><span class="ic green"><i class="fa-solid fa-crown"></i></span><div><div class="label">Premium</div>
      <div class="value" style="font-size:18px">${c.premium.active ? 'Active' : 'Free'}</div>
      <div class="sub">${c.premium.active ? `${esc(c.premium.plan)} · until ${esc(new Date(c.premium.expires_at).toISOString().slice(0, 10))}` : '<a href="/premium">Upgrade now</a>'}</div></div></div>
  </div>
  <div class="grid grid-main">
    <div class="card chart-card">
      <div class="card-head"><h2>Your Activity Overview</h2><span class="small" style="margin-left:auto;opacity:.8">Last 7 days</span></div>
      <div class="chart-wrap"><canvas data-chart aria-label="Activity chart" role="img"></canvas></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Recent Activities</h2><a class="link" href="/notifications">View All</a></div>
      <div class="list" data-activity>${d.activity.length ? d.activity.map((a) => `
        <div class="list-item"><span class="li-ic ${esc(a.type)}"><i class="fa-solid ${ACT_ICON[a.type] || 'fa-bell'}"></i></span>
        <div class="li-body"><div class="li-title">${esc(a.title)}</div><div class="li-sub">${esc(a.body || '')} · ${relEl(a.created_at)}</div></div></div>`).join('')
    : '<div class="empty"><i class="fa-solid fa-wave-square"></i><div>No activity yet — get your first number!</div></div>'}</div>
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="card-head"><h2>Today Access Numbers</h2><span class="chip live">Live</span><a class="link" href="/access">See all</a></div>
    <div class="list">${svc.services.slice(0, 6).map((s) => `
      <a class="list-item" href="/access" style="color:var(--text)">${flag(s.flag_code)}<strong class="code-pair">${esc(s.country_code)} ${esc(s.app_code)}</strong>
      ${appIcon(s.app_icon || s.app_code, 'sm')}<div class="li-body"><div class="li-title">${esc(s.country_name)} ${esc(s.app_name)}</div></div>
      ${s.otps_today ? `<span class="hot-badge ${s.hot ? 'is-hot' : ''}">${s.hot ? '🔥' : '<i class="fa-solid fa-bolt"></i>'} ${num(s.otps_today)}</span>` : ''}
      ${s.status === 'active' && s.available ? '<span class="chip success">Available</span>' : '<span class="chip danger">Unavailable</span>'}</a>`).join('') || '<div class="empty">No services yet</div>'}</div>
  </div>`;

  for (const n of el.querySelectorAll('[data-count]')) {
    animateCount(n, Number(n.dataset.count), { decimals: Number(n.dataset.dec || 0), prefix: n.dataset.prefix || '' });
  }

  let chart = null;
  const draw = async () => {
    const Chart = await loadChart();
    const canvas = $('[data-chart]', el);
    if (!canvas) return;
    chart?.destroy();
    const grid = 'rgba(255,255,255,.1)';
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 240);
    grad.addColorStop(0, 'rgba(56,189,248,.45)'); grad.addColorStop(1, 'rgba(56,189,248,0)');
    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: d.chart.labels.map((l) => new Date(`${l}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })),
        datasets: [
          { label: 'Events', data: d.chart.events, borderColor: '#38bdf8', backgroundColor: grad, fill: true, tension: .4, pointRadius: 3, borderWidth: 2.5 },
          { label: 'Resources', data: d.chart.resources, borderColor: '#a78bfa', tension: .4, pointRadius: 3, borderWidth: 2.5 },
          { label: 'Earnings ($)', data: d.chart.earnings, borderColor: '#34d399', tension: .4, pointRadius: 3, borderWidth: 2, borderDash: [6, 4], yAxisID: 'y1' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: '#e0e7ff', usePointStyle: true, boxWidth: 8 } } },
        scales: {
          x: { ticks: { color: '#c7d2fe' }, grid: { color: grid } },
          y: { beginAtZero: true, ticks: { color: '#c7d2fe', precision: 0 }, grid: { color: grid } },
          y1: { beginAtZero: true, position: 'right', ticks: { color: '#86efac' }, grid: { display: false } },
        },
      },
    });
  };
  draw().catch(() => {});

  const off = live.on('wallet:update', (w) => {
    const m = el.querySelector('[data-count-money]');
    if (m) m.textContent = money(w.balance);
  });
  return () => { off(); chart?.destroy(); };
}
