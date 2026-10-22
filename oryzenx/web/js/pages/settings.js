import { api } from '../api.js';
import {
  html, mount, icon, $, formValues, busy, toast, passwordField, modal, raw,
} from '../ui.js';
import { state, setTheme, logout, refreshMe } from '../app.js';
import { privacyNotice } from './auth.js';
import {
  getLock, setPin, removeLock, updateLock, biometryAvailable, enrollBiometric, lockNow,
} from '../lock.js';
import { isNative, setupPush } from '../native.js';

const TIMEOUTS = [[0, 'Immediately'], [30, 'After 30 seconds'], [60, 'After 1 minute'], [300, 'After 5 minutes'], [900, 'After 15 minutes']];

export async function render({ el }) {
  const theme = document.documentElement.dataset.theme;
  const lock = getLock();
  const bioOk = await biometryAvailable();
  const me = state.me;

  mount(el, html`<div class="stack" style="max-width:760px">
    <div class="item-card"><div class="card-head"><h3>${icon('sun')} Theme</h3></div>
      <div class="grid g2 keep">
        ${['light', 'dark'].map((t) => html`<button class="theme-pick ${theme === t ? 'active' : ''}" data-theme-pick="${t}">
          <span class="theme-prev ${t}"><i></i><i></i><i></i></span><span class="row">${icon(t === 'light' ? 'sun' : 'moon')}<b>${t === 'light' ? 'Light mode' : 'Dark mode'}</b></span></button>`)}
      </div></div>

    <div class="item-card"><div class="card-head"><h3>${icon('shield')} App Lock</h3><span class="chip ${lock ? 'up' : ''}">${lock ? 'On' : 'Off'}</span></div>
      <p class="faint" style="margin:0;font-size:13.5px">Ask for a PIN${bioOk ? ' or your fingerprint' : ''} when you open the app. Applies to this device only.</p>
      ${lock ? html`
        <label class="switch-row"><span>Unlock with fingerprint / face${bioOk ? '' : html` <span class="faint">(not available on this device)</span>`}</span>
          <input type="checkbox" class="switch" id="lk-bio" ${lock.bio ? 'checked' : ''} ${bioOk ? '' : raw('disabled')}></label>
        <div class="field"><label for="lk-time">Auto-lock</label><select class="input" id="lk-time">${TIMEOUTS.map(([v, l]) => html`<option value="${v}" ${Number(lock.timeout) === v ? 'selected' : ''}>${l} in background</option>`)}</select>
          <span class="hint">The app also locks after a few minutes without use.</span></div>
        <div class="row wrap"><button class="btn ghost" id="lk-change">Change PIN</button><button class="btn ghost" id="lk-test">Lock now</button><button class="btn ghost-danger btn" id="lk-off">Turn off</button></div>`
    : html`<div><button class="btn" id="lk-on">${icon('shield')} Set up App Lock</button></div>`}
    </div>

    <div class="item-card"><div class="card-head"><h3>${icon('shield')} 2-step login</h3><span class="chip ${me.totp_enabled ? 'up' : ''}">${me.totp_enabled ? 'On' : 'Off'}</span></div>
      <p class="faint" style="margin:0;font-size:13.5px">After your password, also ask for a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy).</p>
      <div>${me.totp_enabled ? html`<button class="btn ghost-danger btn" id="tf-off">Turn off 2-step login</button>` : html`<button class="btn" id="tf-on">Turn on 2-step login</button>`}</div>
    </div>

    ${isNative() ? html`<div class="item-card"><div class="card-head"><h3>${icon('bell')} Push notifications</h3></div>
      <p class="faint" style="margin:0;font-size:13.5px">Get payment dates, payments, reminders and alerts on your phone.</p>
      <div><button class="btn ghost" id="push">Turn on notifications</button></div></div>` : ''}

    <div class="item-card"><div class="card-head"><h3>${icon('edit')} Change password</h3></div>
      <form class="form" id="pw">
        ${me.has_password ? passwordField('current_password', 'Current password', 'current-password') : html`<p class="muted" style="margin:0">You sign in with Google. You can also set a password here.</p>`}
        ${passwordField('new_password', 'New password', 'new-password')}
        <div class="form-error hidden" id="pwerr"></div>
        <div><button class="btn" type="submit">Change password</button></div>
      </form>
      <p class="faint" style="font-size:12.5px;margin:0">Changing your password signs you out on other devices and asks for a quick face check.</p>
    </div>

    <div class="item-card"><div class="card-head"><h3>${icon('shield')} Privacy Notice & Disclaimer</h3></div>${privacyNotice}</div>

    <div class="item-card"><div class="row between"><div><b>OryzenX BD</b><div class="faint" style="font-size:13px">Version 1.3 · ${isNative() ? 'Android app' : 'Web'} · Built for friends</div></div>
      <button class="btn ghost" id="out">${icon('logout')} Log out</button></div>
      <div><button class="btn ghost sm" id="credits">Open-source licences</button></div></div>
  </div>`);

  const again = () => render({ el });
  el.querySelectorAll('[data-theme-pick]').forEach((b) => { b.onclick = () => { setTheme(b.dataset.themePick); window.dispatchEvent(new Event('ox:theme')); again(); }; });
  $('#pw', el).onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      await api.post('/auth/change-password', formValues(e.target));
      e.target.reset(); toast('Password changed');
      await refreshMe();
      if (state.stage !== 'ready') location.reload();
    }, $('#pwerr', el));
  };
  $('#out', el).onclick = logout;
  $('#credits', el).onclick = () => modal({
    title: 'Open-source licences',
    body: html`<p class="muted" style="margin-top:0">Charts: <b>TradingView Lightweight Charts™</b>, Copyright © TradingView, Inc. (<a href="https://www.tradingview.com/" target="_blank" rel="noopener">tradingview.com</a>), Apache License 2.0.</p>
      <p class="muted">Face analysis: face-api by Vladimir Mandic and TensorFlow.js, MIT / Apache 2.0.</p>
      <p class="muted">Coin logos: web3icons, MIT. Logos are trademarks of their projects.</p>
      <p class="muted">Market data: Binance public API.</p>`,
  });

  // ----- App lock -----
  const pinDialog = (title, done) => {
    const m = modal({
      title,
      body: html`<form class="form" id="pinf">
        <div class="field"><label for="p1">New 6-digit PIN</label><input class="input code-input" id="p1" inputmode="numeric" maxlength="6" autocomplete="off" type="password" required></div>
        <div class="field"><label for="p2">Repeat PIN</label><input class="input code-input" id="p2" inputmode="numeric" maxlength="6" autocomplete="off" type="password" required></div>
        <div class="form-error hidden" id="perr"></div></form>`,
      foot: html`<button class="btn ghost" data-close>Cancel</button><button class="btn" id="psave">Save PIN</button>`,
    });
    $('#psave', m.el).onclick = (e) => busy(e.currentTarget, async () => {
      const a = $('#p1', m.el).value; const b = $('#p2', m.el).value;
      if (!/^\d{6}$/.test(a)) throw new Error('The PIN must be exactly 6 digits');
      if (a !== b) throw new Error('The two PINs do not match');
      if (/^(\d)\1{5}$|123456|654321/.test(a)) throw new Error('Choose a less obvious PIN');
      await setPin(a, { timeout: getLock()?.timeout ?? 60 });
      m.close(); done();
    }, $('#perr', m.el));
  };
  $('#lk-on', el)?.addEventListener('click', () => pinDialog('Set up App Lock', async () => {
    toast('App Lock is on');
    if (bioOk) { try { if (await enrollBiometric(me)) updateLock({ bio: true }); } catch { /* user cancelled */ } }
    again();
  }));
  $('#lk-change', el)?.addEventListener('click', () => pinDialog('Change PIN', () => { toast('PIN changed'); again(); }));
  $('#lk-off', el)?.addEventListener('click', () => { removeLock(); toast('App Lock is off'); again(); });
  $('#lk-test', el)?.addEventListener('click', () => lockNow());
  $('#lk-time', el)?.addEventListener('change', (e) => { updateLock({ timeout: Number(e.target.value) }); toast('Saved'); });
  $('#lk-bio', el)?.addEventListener('change', async (e) => {
    if (!e.target.checked) { updateLock({ bio: false }); return; }
    try { if (await enrollBiometric(me)) { updateLock({ bio: true }); toast('Fingerprint unlock is on'); } else e.target.checked = false; } catch { e.target.checked = false; toast('Fingerprint setup was cancelled', 'err'); }
  });

  // ----- 2-step login -----
  $('#tf-on', el)?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const s = await api.post('/auth/2fa/setup');
    const m = modal({
      title: 'Turn on 2-step login',
      body: html`<ol class="steps-list">
        <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator or Authy).</li>
        <li>Scan this QR code, or tap the key to copy it into the app.</li></ol>
        <div class="qr-box"><img src="${s.qr}" width="200" height="200" alt="QR code for your authenticator app"></div>
        <button class="secret mono" id="sec" title="Copy">${s.secret.replace(/(.{4})/g, '$1 ').trim()}</button>
        ${isNative() ? html`<a class="btn ghost block mt-s" href="${s.otpauth}">Open in authenticator app</a>` : ''}
        <div class="field mt"><label for="tfc">3. Enter the 6-digit code from the app</label><input class="input code-input" id="tfc" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div>
        <div class="form-error hidden" id="tferr"></div>`,
      foot: html`<button class="btn ghost" data-close>Cancel</button><button class="btn" id="tfok">Turn on</button>`,
    });
    $('#sec', m.el).onclick = () => navigator.clipboard?.writeText(s.secret).then(() => toast('Key copied'));
    $('#tfok', m.el).onclick = (ev) => busy(ev.currentTarget, async () => {
      const r = await api.post('/auth/2fa/enable', { code: $('#tfc', m.el).value });
      m.close();
      await refreshMe();
      const b = modal({
        title: 'Save your backup codes',
        body: html`<p class="muted" style="margin-top:0">If you lose your phone, each code below lets you log in once. Save them somewhere safe (not in a screenshot shared with anyone).</p>
          <div class="backup-codes mono">${r.backup_codes.map((c) => html`<span>${c}</span>`)}</div>`,
        foot: html`<button class="btn ghost" id="cp">Copy codes</button><button class="btn" data-close>I saved them</button>`,
      });
      $('#cp', b.el).onclick = () => navigator.clipboard?.writeText(r.backup_codes.join('\n')).then(() => toast('Codes copied'));
      toast('2-step login is on');
      again();
    }, $('#tferr', m.el));
  }));
  $('#tf-off', el)?.addEventListener('click', () => {
    const m = modal({
      title: 'Turn off 2-step login',
      body: html`<div class="field"><label for="tfd">Current 6-digit code</label><input class="input code-input" id="tfd" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div><div class="form-error hidden" id="tfderr"></div>`,
      foot: html`<button class="btn ghost" data-close>Cancel</button><button class="btn danger" id="tfdok">Turn off</button>`,
    });
    $('#tfdok', m.el).onclick = (ev) => busy(ev.currentTarget, async () => {
      await api.post('/auth/2fa/disable', { code: $('#tfd', m.el).value });
      m.close(); await refreshMe(); toast('2-step login is off'); again();
    }, $('#tfderr', m.el));
  });

  // ----- Push -----
  $('#push', el)?.addEventListener('click', async (e) => {
    const r = await setupPush((token) => api.post('/me/push-token', { token, platform: 'android' }).catch(() => {}));
    toast(r === 'granted' ? 'Notifications are on' : r === 'denied' ? 'Notifications are blocked. Allow them in phone settings.' : 'Notifications are already set up', r === 'denied' ? 'err' : 'ok');
    e.target.disabled = r === 'granted';
  });
}
