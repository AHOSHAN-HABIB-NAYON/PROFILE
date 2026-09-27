/* Sign in / register / 2-step / passkey / forgot / reset / verify-email screens. */
import { $, $$, el, html, icon, api, state, t, toast, formErrors, withBusy, shake, segmented, loadLang } from '../core.js';
import { afterLogin, applyTheme } from '../app.js';

const illus = html`<svg class="auth-illus" viewBox="0 0 320 118" aria-hidden="true"><defs><linearGradient id="au1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2F62F0"/><stop offset="1" stop-color="#0EB5A8"/></linearGradient><linearGradient id="au2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F62F0" stop-opacity=".25"/><stop offset="1" stop-color="#2F62F0" stop-opacity="0"/></linearGradient></defs>
  <ellipse cx="160" cy="108" rx="120" ry="8" fill="currentColor" opacity=".05"/>
  <path d="M20 96 L70 70 L110 82 L160 44 L205 60 L250 26 L300 36" fill="none" stroke="url(#au1)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M20 96 L70 70 L110 82 L160 44 L205 60 L250 26 L300 36 L300 104 L20 104Z" fill="url(#au2)"/>
  <g style="animation:float 3s ease-in-out infinite"><rect x="118" y="6" width="84" height="54" rx="12" fill="url(#au1)"/><rect x="128" y="18" width="30" height="5" rx="2.5" fill="#fff" opacity=".7"/><rect x="128" y="30" width="52" height="9" rx="4.5" fill="#fff"/><circle cx="188" cy="20" r="6" fill="#fff" opacity=".3"/></g>
  <g style="animation:float 3.6s .4s ease-in-out infinite"><circle cx="262" cy="70" r="16" fill="#F59E0B"/><text x="262" y="76" text-anchor="middle" font-size="16" font-weight="800" fill="#fff">৳</text></g>
  <g style="animation:float 3.2s .8s ease-in-out infinite"><circle cx="58" cy="40" r="13" fill="#12A150"/><path d="m52 40 4 4 8-8" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;

function brand() {
  const c = state.config || {};
  return html`<div class="auth-brand">${c.logo ? html`<img src="${c.logo}" alt="">` : html`<svg><use href="#logo"/></svg>`}${c.logo && !c.logoShowName ? '' : html`<b>${c.site || 'LifeTrack'}</b>`}</div>`;
}
function langTheme() {
  const langs = state.config?.languages || [];
  return html`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
    <select class="select" data-lang style="width:auto;height:34px;font-size:12.5px" aria-label="${t('set.language')}">${langs.map((l) => html`<option value="${l.code}" ${l.code === state.lang ? 'selected' : ''}>${l.native}</option>`)}</select>
    <button class="icon-btn bordered" data-theme-toggle></button></div>`;
}
function wrap(inner) {
  const page = el(html`<div><div class="auth"><div class="card auth-card">${langTheme()}${inner}</div></div></div>`);
  const sel = page.querySelector('[data-lang]');
  if (sel) sel.onchange = async () => { await loadLang(sel.value); location.reload(); };
  requestAnimationFrame(() => applyTheme(document.documentElement.dataset.theme, { save: false, animate: false }));
  return page;
}
const pwToggle = (page) => $$('[data-pw-toggle]', page).forEach((b) => b.onclick = () => { const i = b.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; b.innerHTML = String(icon(i.type === 'password' ? 'eye' : 'eye-off', 'i-sm')); });
const pwField = (name, label, auto) => html`<div class="field"><label>${label}</label><div class="input-group">${icon('lock', 'i-sm')}<input class="input" type="password" name="${name}" autocomplete="${auto}" required><button type="button" class="icon-btn suffix" data-pw-toggle aria-label="${t('auth.show_password')}" style="width:32px;height:32px">${icon('eye', 'i-sm')}</button></div></div>`;

const ERRMAP = { google_disabled: 'auth.google_disabled', google_state: 'auth.google_failed', google_failed: 'auth.google_failed', google_unverified: 'auth.google_unverified', google_conflict: 'auth.google_conflict', account_suspended: 'err.account_suspended', registration_closed: 'err.registration_closed' };

async function passkeyLogin(btn, next) {
  if (!window.PublicKeyCredential) { toast(t('auth.passkey_unsupported'), { type: 'error' }); return; }
  await withBusy(btn, async () => {
    try {
      const { startAuthentication } = await loadWebAuthn();
      const { challengeId, ...optionsJSON } = await api.post('/api/auth/passkey/options');
      const resp = await startAuthentication({ optionsJSON });
      const out = await api.post('/api/auth/passkey/verify', { response: resp, challengeId });
      if (out.mfa) location.href = '/app/2fa'; else await afterLogin(next);
    } catch (e) { if (e.name === 'NotAllowedError' || e.name === 'AbortError') return; toast(e.name === 'SecurityError' ? t('sec.passkey_https') : e.message, { type: 'error', timeout: 6000 }); }
  });
}
export async function loadWebAuthn() {
  if (!window.SimpleWebAuthnBrowser) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/vendor/simplewebauthn-browser.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  return window.SimpleWebAuthnBrowser;
}

export function login(ctx) {
  const c = state.config || {};
  const page = wrap(html`${brand()}${illus}<h1>${t('auth.welcome_back')}</h1><p class="sub">${t('auth.login_sub')}</p>
    ${ctx.query.error ? html`<div class="alert danger" style="margin-bottom:12px">${icon('alert', 'i-sm')}<span>${t(ERRMAP[ctx.query.error] || 'auth.google_failed')}</span></div>` : ''}
    <div class="auth-alt">
      ${c.google ? html`<a class="btn btn-outline btn-lg btn-block" href="/api/auth/google" data-google>${icon('google')}${t('auth.continue_google')}</a>` : ''}
      ${c.passkeys ? html`<button class="btn btn-outline btn-lg btn-block" data-passkey>${icon('fingerprint')}${t('auth.passkey_login')}</button>` : ''}
    </div>
    ${c.google || c.passkeys ? html`<div class="or">${t('auth.or_email')}</div>` : ''}
    <form novalidate data-form>
      <div class="field"><label>${t('auth.email')}</label><div class="input-group">${icon('mail', 'i-sm')}<input class="input" type="email" name="email" autocomplete="username webauthn" inputmode="email" required></div></div>
      ${pwField('password', t('auth.password'), 'current-password')}
      <div style="display:flex;justify-content:flex-end;margin:-4px 0 12px"><a class="link" href="/app/forgot">${t('auth.forgot')}</a></div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">${t('auth.sign_in')}</button>
    </form>
    ${c.registration !== false ? html`<p class="auth-foot">${t('auth.no_account')} <a class="link" href="/app/register">${t('auth.create_account')}</a></p>` : ''}`);
  pwToggle(page);
  const form = page.querySelector('[data-form]');
  form.onsubmit = (e) => {
    e.preventDefault();
    withBusy(form.querySelector('[type=submit]'), async () => {
      const f = new FormData(form);
      try {
        const out = await api.post('/api/auth/login', { email: f.get('email'), password: f.get('password') }, { noAuthRedirect: true });
        if (out.mfa) { sessionStorage.setItem('lt-mfa', JSON.stringify({ methods: out.methods, emailSent: out.emailSent, next: ctx.query.next })); ctx.navigate('/app/2fa', { replace: true, dir: 'fwd' }); }
        else await afterLogin(ctx.query.next);
      } catch (er) { toast(er.message, { type: 'error' }); formErrors(form, er); }
    });
  };
  page.querySelector('[data-passkey]')?.addEventListener('click', (e) => passkeyLogin(e.currentTarget, ctx.query.next));
  // Conditional UI (passkey autofill) where supported
  (async () => {
    try {
      if (!c.passkeys || !window.PublicKeyCredential?.isConditionalMediationAvailable || !(await PublicKeyCredential.isConditionalMediationAvailable())) return;
      const { startAuthentication } = await loadWebAuthn();
      const { challengeId, ...optionsJSON } = await api.post('/api/auth/passkey/options');
      const resp = await startAuthentication({ optionsJSON, useBrowserAutofill: true });
      const out = await api.post('/api/auth/passkey/verify', { response: resp, challengeId });
      if (out.mfa) ctx.navigate('/app/2fa', { replace: true }); else await afterLogin(ctx.query.next);
    } catch { /* ignored — user may simply type a password */ }
  })();
  return { el: page, title: t('auth.sign_in') };
}

function strength(p) { let s = 0; if (p.length >= 8) s++; if (p.length >= 12) s++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++; return Math.min(4, s); }
function meter(page) {
  const i = page.querySelector('input[name=password]'); const bar = page.querySelector('.pw-meter span');
  if (!i || !bar) return;
  i.addEventListener('input', () => { const s = strength(i.value); bar.style.width = (s * 25) + '%'; bar.style.background = ['var(--red)', 'var(--red)', 'var(--orange)', 'var(--teal)', 'var(--green)'][s]; });
}

export function register(ctx) {
  const c = state.config || {};
  if (c.registration === false) return { el: wrap(html`${brand()}<h1>${t('err.registration_closed')}</h1><p class="auth-foot"><a class="link" href="/app/login">${t('auth.sign_in')}</a></p>`) };
  const page = wrap(html`${brand()}<h1>${t('auth.create_title')}</h1><p class="sub">${t('auth.create_sub')}</p>
    ${c.google ? html`<div class="auth-alt"><a class="btn btn-outline btn-lg btn-block" href="/api/auth/google">${icon('google')}${t('auth.continue_google')}</a></div><div class="or">${t('auth.or_email')}</div>` : ''}
    <form novalidate data-form>
      <div class="field"><label>${t('auth.full_name')}</label><div class="input-group">${icon('user', 'i-sm')}<input class="input" name="name" autocomplete="name" required maxlength="120"></div></div>
      <div class="field"><label>${t('auth.email')}</label><div class="input-group">${icon('mail', 'i-sm')}<input class="input" type="email" name="email" autocomplete="email" inputmode="email" required></div></div>
      ${pwField('password', t('auth.password'), 'new-password')}
      <div class="pw-meter" style="margin:-6px 0 6px"><span></span></div><p class="hint" style="margin-bottom:12px">${t('auth.password_rules')}</p>
      <button class="btn btn-primary btn-lg btn-block" type="submit">${t('auth.create_account')}</button>
      <p class="hint" style="text-align:center;margin-top:10px">${t('auth.terms')}</p>
    </form>
    <p class="auth-foot">${t('auth.have_account')} <a class="link" href="/app/login">${t('auth.sign_in')}</a></p>`);
  pwToggle(page); meter(page);
  const form = page.querySelector('[data-form]');
  form.onsubmit = (e) => {
    e.preventDefault();
    withBusy(form.querySelector('[type=submit]'), async () => {
      const f = new FormData(form);
      try {
        await api.post('/api/auth/register', { name: f.get('name'), email: f.get('email'), password: f.get('password'), language: state.lang, theme: document.documentElement.dataset.theme, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
        toast(t('auth.welcome_toast'));
        await afterLogin('/app');
      } catch (er) { toast(er.message, { type: 'error' }); formErrors(form, er); }
    });
  };
  return { el: page, title: t('auth.create_account') };
}

export function mfa(ctx) {
  let info = {}; try { info = JSON.parse(sessionStorage.getItem('lt-mfa') || '{}'); } catch {}
  const methods = info.methods || ['totp', 'email', 'recovery'];
  let method = methods.includes('totp') ? 'totp' : methods.includes('email') ? 'email' : 'recovery';
  const page = wrap(html`${brand()}<div style="display:grid;place-items:center;margin:8px 0"><span class="tile tile-lg" style="--c:var(--primary)">${icon('shield')}</span></div>
    <h1>${t('mfa.title')}</h1><p class="sub" data-sub></p>
    <div class="seg" data-methods style="display:flex;margin-bottom:12px">${methods.map((m) => html`<button type="button" data-v="${m}" class="${m === method ? 'active' : ''}" style="flex:1">${t('mfa.m.' + m)}</button>`)}</div>
    <form novalidate data-form><div class="field"><input class="input" name="code" autocomplete="one-time-code" inputmode="numeric" maxlength="12" style="text-align:center;font-size:22px;letter-spacing:.3em;font-weight:700;height:52px" required></div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">${t('mfa.verify')}</button></form>
    <div style="display:flex;justify-content:space-between;margin-top:12px"><button class="link" data-resend hidden>${t('mfa.send_email')}</button><a class="link" href="/app/login" data-cancel>${t('common.cancel')}</a></div>`);
  const sub = page.querySelector('[data-sub]'); const input = page.querySelector('[name=code]'); const resend = page.querySelector('[data-resend]');
  const upd = () => {
    sub.textContent = t('mfa.sub.' + method);
    input.inputMode = method === 'recovery' ? 'text' : 'numeric';
    input.placeholder = method === 'recovery' ? 'XXXXX-XXXXX' : '000000';
    input.style.letterSpacing = method === 'recovery' ? '.08em' : '.3em';
    resend.hidden = method !== 'email';
  };
  segmented(page.querySelector('[data-methods]'), (v) => { method = v; input.value = ''; upd(); input.focus(); });
  upd();
  resend.onclick = () => withBusy(resend, async () => { try { await api.post('/api/auth/2fa/email-code'); toast(t('mfa.email_sent')); } catch (e) { toast(e.message, { type: 'error' }); } });
  if (method === 'email' && info.emailSent) toast(t('mfa.email_sent'), { type: 'info' });
  page.querySelector('[data-cancel]').onclick = () => api.post('/api/auth/logout').catch(() => {});
  const form = page.querySelector('[data-form]');
  form.onsubmit = (e) => {
    e.preventDefault();
    withBusy(form.querySelector('[type=submit]'), async () => {
      try { await api.post('/api/auth/2fa/verify', { method, code: input.value }, { noAuthRedirect: true }); sessionStorage.removeItem('lt-mfa'); await afterLogin(info.next); }
      catch (er) { toast(er.message, { type: 'error' }); shake(form); input.select(); if (er.code === 'unauthenticated') ctx.navigate('/app/login', { replace: true }); }
    });
  };
  setTimeout(() => input.focus(), 350);
  return { el: page, title: t('mfa.title') };
}

export function forgot() {
  const page = wrap(html`${brand()}<div style="display:grid;place-items:center;margin:8px 0"><span class="tile tile-lg" style="--c:var(--orange)">${icon('key')}</span></div>
    <h1>${t('forgot.title')}</h1><p class="sub">${t('forgot.sub')}</p>
    <form novalidate data-form><div class="field"><label>${t('auth.email')}</label><div class="input-group">${icon('mail', 'i-sm')}<input class="input" type="email" name="email" autocomplete="email" required></div></div>
    <button class="btn btn-primary btn-lg btn-block" type="submit">${t('forgot.send')}</button></form>
    <p class="auth-foot"><a class="link" href="/app/login">${icon('chevron-left', 'i-xs')}${t('forgot.back')}</a></p>`);
  const form = page.querySelector('[data-form]');
  form.onsubmit = (e) => {
    e.preventDefault();
    withBusy(form.querySelector('[type=submit]'), async () => {
      try { await api.post('/api/auth/forgot', { email: new FormData(form).get('email') }); form.replaceWith(el(html`<div class="alert" style="margin-top:6px">${icon('mail', 'i-sm')}<span>${t('forgot.sent')}</span></div>`)); }
      catch (er) { toast(er.message, { type: 'error' }); formErrors(form, er); }
    });
  };
  return { el: page, title: t('forgot.title') };
}

export function reset(ctx) {
  const token = ctx.query.token || '';
  const page = wrap(html`${brand()}<h1>${t('reset.title')}</h1><p class="sub">${t('reset.sub')}</p>
    <form novalidate data-form>${pwField('password', t('reset.new_password'), 'new-password')}<div class="pw-meter" style="margin:-6px 0 12px"><span></span></div>
    ${pwField('password2', t('reset.confirm_password'), 'new-password')}
    <button class="btn btn-primary btn-lg btn-block" type="submit">${t('reset.save')}</button></form>`);
  pwToggle(page); meter(page);
  const form = page.querySelector('[data-form]');
  form.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(form);
    if (f.get('password') !== f.get('password2')) { formErrors(form, { fields: { password2: 'mismatch' } }); return; }
    withBusy(form.querySelector('[type=submit]'), async () => {
      try { await api.post('/api/auth/reset', { token, password: f.get('password') }); toast(t('reset.done')); ctx.navigate('/app/login', { replace: true }); }
      catch (er) { toast(er.message, { type: 'error' }); formErrors(form, er); }
    });
  };
  return { el: page, title: t('reset.title') };
}

export function verify(ctx) {
  const page = wrap(html`${brand()}<div class="empty" data-box><div class="spinner" style="color:var(--primary)"></div><p>${t('verify.checking')}</p></div>`);
  (async () => {
    const box = page.querySelector('[data-box]');
    try {
      await api.post('/api/auth/verify-email', { token: ctx.query.token || '' });
      box.innerHTML = String(html`<span class="tile tile-lg" style="--c:var(--green)">${icon('check-circle')}</span><h4>${t('verify.done')}</h4><a class="btn btn-primary" href="/app">${t('verify.continue')}</a>`);
      if (state.me) state.me.verified = true;
    } catch (e) { box.innerHTML = String(html`<span class="tile tile-lg" style="--c:var(--red)">${icon('alert')}</span><h4>${t('verify.failed')}</h4><p>${e.message}</p><a class="btn btn-soft" href="/app">${t('verify.continue')}</a>`); }
  })();
  return { el: page, title: t('verify.title') };
}
