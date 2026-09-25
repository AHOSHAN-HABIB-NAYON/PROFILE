import { api, esc, $, toast, toastError, pageHead, fmtDate, money, num, withLoading, formData, sheet, state } from '../core.js';

export async function mount(el, ctx) {
  const r = await api('/profile');
  const u = r.user;
  const l = r.limits;
  el.innerHTML = `${pageHead('fa-solid fa-user', 'Profile', 'Manage your account')}
  <div class="grid grid-main">
    <div class="stack">
      <div class="card"><div class="row-flex"><span class="avatar lg">${esc(u.initial)}</span>
        <div style="min-width:0"><h2 style="margin:0">${esc(u.name)}</h2><div class="muted small">${esc(u.email)}</div>
        <div class="row-flex" style="gap:6px;margin-top:6px"><span class="chip online">Online</span>${u.email_verified ? '<span class="chip success">Verified</span>' : '<span class="chip warning">Unverified</span>'}
        ${r.twofa ? '<span class="chip info"><i class="fa-solid fa-shield"></i> 2FA</span>' : ''}${u.role === 'admin' ? '<span class="chip admin">Admin</span>' : ''}</div></div></div>
        <div class="divider"></div>
        <dl class="kv"><dt>Address</dt><dd>${esc(u.address || '—')}</dd><dt>Account date</dt><dd>${esc(fmtDate(u.created_at))}</dd>
          <dt>Premium</dt><dd>${l.premium ? `${esc(l.premium.plan)} · until ${esc(fmtDate(l.premium.expires_at))}` : 'Free'}</dd>
          <dt>Wallet</dt><dd>${esc(money(r.wallet.display))}</dd>
          <dt>Limits</dt><dd>${num(l.hourly_limit)}/hour · ${num(l.daily_limit)}/day</dd>
          <dt>Timezone</dt><dd>${esc(u.timezone === 'auto' ? `Local (${Intl.DateTimeFormat().resolvedOptions().timeZone})` : u.timezone)}</dd></dl>
      </div>
      <div class="card"><div class="list">
        ${[['edit', 'fa-user-pen', 'Personal Information', 'Edit your details'], ['password', 'fa-key', 'Change Password', 'Update your password'],
    ['/security', 'fa-shield-halved', 'Security (2-Step)', r.twofa ? '2FA is enabled' : 'Enable 2FA with QR'], ['/withdraw', 'fa-money-bill-transfer', 'Withdraw', `Minimum ${money(state.site.min_withdrawal || '50')} (Binance)`],
    ['/settings', 'fa-gear', 'Settings', 'Theme, timezone & sounds']]
    .map(([k, i, t, s]) => `<${k.startsWith('/') ? `a href="${k}"` : `button type="button" data-act="${k}"`} class="list-item" style="width:100%;background:none;border-left:0;border-right:0;border-top:0;cursor:pointer;text-align:left;color:var(--text)">
      <span class="li-ic system"><i class="fa-solid ${i}"></i></span><span class="li-body"><span class="li-title" style="display:block">${t}</span><span class="li-sub" style="display:block">${esc(s)}</span></span>
      <i class="fa-solid fa-chevron-right muted"></i></${k.startsWith('/') ? 'a' : 'button'}>`).join('')}
      </div></div>
    </div>
    <div class="card"><div class="card-head"><h2>Usage</h2></div>
      <div class="field"><label>Hourly (${num(l.hour_used)} / ${num(l.hourly_limit)})</label><div class="progress"><span style="width:${Math.min(100, (l.hour_used / l.hourly_limit) * 100)}%"></span></div></div>
      <div class="field"><label>Daily (${num(l.day_used)} / ${num(l.daily_limit)})</label><div class="progress"><span style="width:${Math.min(100, (l.day_used / l.daily_limit) * 100)}%"></span></div></div>
      <a class="btn btn-primary btn-block" href="/premium"><i class="fa-solid fa-crown"></i>Upgrade</a>
    </div>
  </div>`;

  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'edit') editSheet(u, ctx);
    if (a.dataset.act === 'password') passwordSheet();
  });
}

function editSheet(u, ctx) {
  const s = sheet({
    title: 'Personal Information', icon: 'fa-solid fa-user-pen',
    body: `<form data-f><div class="field"><label>Name</label><input class="input" name="name" value="${esc(u.name)}" required maxlength="120"></div>
      <div class="field"><label>Address</label><input class="input" name="address" value="${esc(u.address)}" maxlength="255"></div>
      <div class="field"><label>Binance UID</label><input class="input" name="binance_uid" inputmode="numeric" value="${esc(u.binance_uid)}" maxlength="20"></div>
      <input type="hidden" name="timezone" value="${esc(u.timezone)}"><button class="btn btn-primary btn-block" type="submit">Save</button></form>`,
  });
  $('[data-f]', s.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    await withLoading(e.submitter, async () => {
      try { const r = await api('/profile', { method: 'PUT', body: formData(e.target) }); toast(r.message); s.close(); ctx.navigate('/profile', { replace: true }); } catch (err) { toastError(err); }
    });
  });
}

export function passwordSheet() {
  const s = sheet({
    title: 'Change Password', icon: 'fa-solid fa-key',
    body: `<form data-f><div class="field"><label>Current password</label><input class="input" type="password" name="current_password" autocomplete="current-password" required></div>
      <div class="field"><label>New password</label><input class="input" type="password" name="new_password" autocomplete="new-password" minlength="8" required><span class="hint">At least 8 characters with letters and numbers.</span></div>
      <div class="field"><label>Confirm new password</label><input class="input" type="password" name="new_password_confirm" autocomplete="new-password" required></div>
      <button class="btn btn-primary btn-block" type="submit">Update password</button></form>`,
  });
  $('[data-f]', s.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    await withLoading(e.submitter, async () => {
      try { const r = await api('/profile/password', { method: 'POST', body: formData(e.target) }); toast(r.message); s.close(); } catch (err) { toastError(err); }
    });
  });
}
