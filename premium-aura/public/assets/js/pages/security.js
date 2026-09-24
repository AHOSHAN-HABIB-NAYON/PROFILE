import { api, esc, $, toast, toastError, pageHead, relEl, withLoading, formData, sheet, copyText } from '../core.js';
import { passwordSheet } from './profile.js';

function codesHtml(codes) {
  return `<div class="alert warning"><i class="fa-solid fa-triangle-exclamation"></i><span>Save these recovery codes somewhere safe. Each can be used once if you lose your device. They will not be shown again.</span></div>
    <div class="code-list">${codes.map((c) => `<code>${esc(c)}</code>`).join('')}</div>
    <button class="btn btn-ghost btn-block" data-copy-codes="${esc(codes.join('\n'))}" style="margin-top:12px"><i class="fa-regular fa-copy"></i>Copy all</button>`;
}

function uaLabel(ua = '') {
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `${b}${os ? ` · ${os}` : ''}`;
}

function passwordPrompt(title, extra = '') {
  return new Promise((resolve) => {
    const s = sheet({
      title, icon: 'fa-solid fa-lock',
      body: `<form data-f><p class="muted small">For your security, confirm your current password.</p>
        <div class="field"><label>Current password</label><input class="input" type="password" name="password" autocomplete="current-password" required></div>${extra}
        <button class="btn btn-primary btn-block" type="submit">Continue</button></form>`,
    });
    $('[data-f]', s.el).addEventListener('submit', (e) => { e.preventDefault(); resolve({ data: formData(e.target), sheet: s, btn: e.submitter }); });
  });
}

export async function mount(el, ctx) {
  const r = await api('/security');
  const tf = r.twofa;
  el.innerHTML = `${pageHead('fa-solid fa-lock', 'Security', 'Password, two-factor authentication & sessions')}
  <div class="grid grid-2">
    <div class="card"><div class="card-head"><h2>Two-Factor Authentication (TOTP)</h2>${tf.enabled ? '<span class="chip success">Enabled</span>' : '<span class="chip warning">Off</span>'}</div>
      <p class="muted">Protect your account with a 6-digit code from Google Authenticator, Authy, 1Password or any TOTP app.</p>
      ${tf.enabled ? `<p class="small muted">${tf.recovery_remaining} recovery code(s) remaining.</p>
        <div class="row-flex"><button class="btn btn-soft btn-sm" data-act="recovery"><i class="fa-solid fa-key"></i>New recovery codes</button>
        <button class="btn btn-danger btn-sm" data-act="disable"><i class="fa-solid fa-power-off"></i>Disable 2FA</button></div>`
    : '<button class="btn btn-primary" data-act="enable"><i class="fa-solid fa-qrcode"></i>Enable 2FA</button>'}
    </div>
    <div class="card"><div class="card-head"><h2>Password</h2></div><p class="muted">Changing your password signs you out on all other devices.</p>
      <button class="btn btn-primary" data-act="password"><i class="fa-solid fa-key"></i>Change Password</button></div>
  </div>
  <div class="grid grid-2" style="margin-top:16px">
    <div class="card"><div class="card-head"><h2>Active Sessions</h2><button class="btn btn-ghost btn-xs" data-act="revoke" style="margin-left:auto">Sign out others</button></div>
      <div class="list">${r.sessions.map((s) => `<div class="list-item"><span class="li-ic system"><i class="fa-solid ${/Mobile|Android|iPhone/.test(s.user_agent || '') ? 'fa-mobile-screen' : 'fa-desktop'}"></i></span>
        <div class="li-body"><div class="li-title">${esc(uaLabel(s.user_agent))} ${s.current ? '<span class="chip success">This device</span>' : ''}</div><div class="li-sub">${esc(s.ip || '')} · ${relEl(s.last_active)}</div></div></div>`).join('')}</div></div>
    <div class="card"><div class="card-head"><h2>Recent Security Activity</h2></div>
      <div class="list">${r.activity.length ? r.activity.map((a) => `<div class="list-item"><span class="li-ic ${/fail/.test(a.action) ? 'payment' : 'resource'}"><i class="fa-solid ${/fail/.test(a.action) ? 'fa-triangle-exclamation' : 'fa-check'}"></i></span>
        <div class="li-body"><div class="li-title">${esc(a.action.replace(/[._]/g, ' '))}</div><div class="li-sub">${esc(a.ip || '')} · ${relEl(a.created_at)}</div></div></div>`).join('') : '<div class="empty">No activity</div>'}</div></div>
  </div>`;

  const reload = () => ctx.navigate('/security', { replace: true, scroll: false });

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'password') return passwordSheet();
    if (act === 'enable') {
      const { data, sheet: s, btn } = await passwordPrompt('Enable 2FA');
      await withLoading(btn, async () => {
        try {
          const setup = await api('/security/2fa/setup', { method: 'POST', body: data });
          s.body.innerHTML = `<div class="center"><p class="muted small">1. Scan this QR code with your authenticator app</p>
            <img src="${esc(setup.qr)}" alt="2FA QR code" class="qr" style="margin:0 auto 12px;width:200px;height:200px">
            <p class="muted small">Or enter this secret manually:</p><div class="address-box" style="margin-bottom:10px">${esc(setup.secret)}</div>
            <button class="btn btn-ghost btn-xs" data-copy-codes="${esc(setup.secret)}"><i class="fa-regular fa-copy"></i>Copy secret</button></div>
            <form data-confirm style="margin-top:14px"><div class="field"><label>2. Enter the 6-digit verification code</label>
            <input class="input otp-input" name="code" inputmode="numeric" maxlength="6" pattern="\\d{6}" autocomplete="one-time-code" required></div>
            <button class="btn btn-primary btn-block" type="submit">Verify & Enable</button></form>`;
          $('[data-confirm]', s.el).addEventListener('submit', async (ev) => {
            ev.preventDefault();
            await withLoading(ev.submitter, async () => {
              try {
                const c = await api('/security/2fa/confirm', { method: 'POST', body: formData(ev.target) });
                toast(c.message);
                s.body.innerHTML = codesHtml(c.recovery_codes) + '<button class="btn btn-primary btn-block" data-close style="margin-top:10px">Done</button>';
                s.el.addEventListener('click', (x) => { if (x.target.closest('[data-close]')) reload(); });
              } catch (err) { toastError(err); }
            });
          });
        } catch (err) { toastError(err); }
      });
    }
    if (act === 'disable') {
      const { data, sheet: s, btn } = await passwordPrompt('Disable 2FA', '<div class="field"><label>Authenticator or recovery code</label><input class="input" name="code" required maxlength="11"></div>');
      await withLoading(btn, async () => {
        try { const x = await api('/security/2fa/disable', { method: 'POST', body: data }); toast(x.message); s.close(); reload(); } catch (err) { toastError(err); }
      });
    }
    if (act === 'recovery') {
      const { data, sheet: s, btn } = await passwordPrompt('New recovery codes');
      await withLoading(btn, async () => {
        try { const x = await api('/security/2fa/recovery', { method: 'POST', body: data }); s.body.innerHTML = codesHtml(x.recovery_codes); } catch (err) { toastError(err); }
      });
    }
    if (act === 'revoke') {
      const { data, sheet: s, btn } = await passwordPrompt('Sign out other sessions');
      await withLoading(btn, async () => {
        try { const x = await api('/security/sessions/revoke', { method: 'POST', body: data }); toast(x.message); s.close(); reload(); } catch (err) { toastError(err); }
      });
    }
  });
  document.addEventListener('click', onCopy);
  return () => document.removeEventListener('click', onCopy);
}

function onCopy(e) {
  const c = e.target.closest('[data-copy-codes]');
  if (c) copyText(c.dataset.copyCodes, c);
}
