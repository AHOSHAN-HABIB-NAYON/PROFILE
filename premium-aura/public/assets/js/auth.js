/* Auth screens: login, register, forgot/reset password, 2FA challenge. */
import { api, esc, $, formData, withLoading, brandHtml, state, applyTheme } from './core.js';

const root = $('#auth');
const params = new URLSearchParams(location.search);

function alertBox(type, msg) {
  const icon = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' }[type];
  return `<div class="alert ${type}" role="alert"><i class="fa-solid ${icon}"></i><span>${esc(msg)}</span></div>`;
}

function field({ name, type = 'text', label, icon, placeholder = '', autocomplete = '', extra = '' }) {
  const pw = type === 'password';
  return `<div class="field"><label for="f-${name}">${esc(label)}</label><div class="input-group"><i class="fa-solid ${icon}"></i>
    <input class="input" id="f-${name}" name="${name}" type="${type}" placeholder="${esc(placeholder)}" autocomplete="${autocomplete}" ${extra} required>
    ${pw ? '<span class="suffix"><button type="button" class="pw-toggle" data-pw aria-label="Show password"><i class="fa-regular fa-eye"></i></button></span>' : ''}</div></div>`;
}

const views = {
  login() {
    const v = params.get('verified');
    const notice = v === '1' ? alertBox('success', 'Email verified! You can now sign in.') : v === 'invalid' ? alertBox('error', 'That verification link is invalid or expired.') : '';
    return `<h1>Welcome Back</h1><p class="sub">Login to your account</p>${notice}<div data-msg></div>
    <form data-form="login" novalidate>
      ${field({ name: 'email', type: 'email', label: 'Email', icon: 'fa-envelope', placeholder: 'Enter your email', autocomplete: 'username' })}
      ${field({ name: 'password', type: 'password', label: 'Password', icon: 'fa-lock', placeholder: 'Enter your password', autocomplete: 'current-password' })}
      <div class="auth-links"><label class="check"><input type="checkbox" name="remember"> Remember me</label><a href="/forgot-password">Forgot password?</a></div>
      <button class="btn btn-primary btn-block" type="submit">Login</button>
    </form>
    ${state.site.registration_enabled === '1' ? '<p class="auth-foot">Don\'t have an account? <a href="/register">Register</a></p>' : ''}`;
  },
  register() {
    if (state.site.registration_enabled !== '1') return `<h1>Registration closed</h1><p class="sub">New sign-ups are currently disabled.</p><a class="btn btn-primary btn-block" href="/login">Back to login</a>`;
    return `<h1>Create account</h1><p class="sub">Join ${esc(state.site.site_name)} in seconds</p><div data-msg></div>
    <form data-form="register" novalidate>
      ${field({ name: 'name', label: 'Full name', icon: 'fa-user', placeholder: 'Your name', autocomplete: 'name', extra: 'minlength="2" maxlength="120"' })}
      ${field({ name: 'email', type: 'email', label: 'Email', icon: 'fa-envelope', placeholder: 'you@example.com', autocomplete: 'email' })}
      ${field({ name: 'password', type: 'password', label: 'Password', icon: 'fa-lock', placeholder: 'Min. 8 chars, letters & numbers', autocomplete: 'new-password', extra: 'minlength="8"' })}
      ${field({ name: 'password_confirm', type: 'password', label: 'Confirm password', icon: 'fa-lock', placeholder: 'Repeat password', autocomplete: 'new-password' })}
      <button class="btn btn-primary btn-block" type="submit">Create account</button>
    </form><p class="auth-foot">Already have an account? <a href="/login">Login</a></p>`;
  },
  forgot() {
    return `<h1>Forgot password</h1><p class="sub">We'll email you a secure reset link</p><div data-msg></div>
    <form data-form="forgot" novalidate>${field({ name: 'email', type: 'email', label: 'Email', icon: 'fa-envelope', placeholder: 'Enter your email', autocomplete: 'email' })}
    <button class="btn btn-primary btn-block" type="submit">Send reset link</button></form><p class="auth-foot"><a href="/login"><i class="fa-solid fa-arrow-left"></i> Back to login</a></p>`;
  },
  reset() {
    return `<h1>Set a new password</h1><p class="sub">Choose a strong password you don't use elsewhere</p><div data-msg></div>
    <form data-form="reset" novalidate><input type="hidden" name="token" value="${esc(params.get('token') || '')}">
    ${field({ name: 'password', type: 'password', label: 'New password', icon: 'fa-lock', placeholder: 'Min. 8 chars, letters & numbers', autocomplete: 'new-password' })}
    ${field({ name: 'password_confirm', type: 'password', label: 'Confirm password', icon: 'fa-lock', placeholder: 'Repeat password', autocomplete: 'new-password' })}
    <button class="btn btn-primary btn-block" type="submit">Update password</button></form>`;
  },
  twofa() {
    return `<h1>Two-factor verification</h1><p class="sub">Enter the 6-digit code from your authenticator app, or a recovery code.</p><div data-msg></div>
    <form data-form="twofa" novalidate><div class="field"><input class="input otp-input" name="code" inputmode="text" autocomplete="one-time-code" maxlength="11" placeholder="••••••" required autofocus></div>
    <button class="btn btn-primary btn-block" type="submit">Verify</button></form><p class="auth-foot"><a href="/login">Use a different account</a></p>`;
  },
};

function viewFor(path) {
  if (path.startsWith('/register')) return 'register';
  if (path.startsWith('/forgot-password')) return 'forgot';
  if (path.startsWith('/reset-password')) return 'reset';
  if (path.startsWith('/two-factor')) return 'twofa';
  return 'login';
}

function show(name) {
  const titles = { login: 'Sign in', register: 'Register', forgot: 'Forgot password', reset: 'Reset password', twofa: 'Verification' };
  document.title = `${titles[name]} · ${state.site.site_name || 'Premium Aura'}`;
  root.innerHTML = `<a class="brand" href="/login">${brandHtml()}</a>${views[name]()}
    <div class="center" style="margin-top:18px"><div class="theme-toggle"><button data-theme-set="light"><i class="fa-solid fa-sun"></i>Light</button><button data-theme-set="dark"><i class="fa-solid fa-moon"></i>Dark</button></div></div>`;
  applyTheme(document.documentElement.dataset.theme, { persist: false });
  root.querySelector('input:not([type=hidden])')?.focus();
}

function msg(type, text) {
  const el = $('[data-msg]', root);
  if (el) el.innerHTML = alertBox(type, text);
}

const handlers = {
  async login(form) {
    const d = formData(form);
    const r = await api('/auth/login', { method: 'POST', body: { ...d, next: params.get('next') } });
    if (r.twofa) { history.replaceState({}, '', `/two-factor${location.search}`); show('twofa'); return; }
    location.href = r.redirect || '/dashboard';
  },
  async register(form) {
    const d = formData(form);
    if (d.password !== d.password_confirm) throw new Error('Passwords do not match');
    const r = await api('/auth/register', { method: 'POST', body: d });
    if (r.verify_required) { form.reset(); msg('success', r.message); return; }
    location.href = r.redirect || '/dashboard';
  },
  async forgot(form) {
    const r = await api('/auth/forgot', { method: 'POST', body: formData(form) });
    form.reset();
    msg('success', r.message);
  },
  async reset(form) {
    const d = formData(form);
    if (d.password !== d.password_confirm) throw new Error('Passwords do not match');
    const r = await api('/auth/reset', { method: 'POST', body: d });
    root.innerHTML = `<a class="brand" href="/login">${brandHtml()}</a>${alertBox('success', r.message)}<a class="btn btn-primary btn-block" href="/login">Go to login</a>`;
  },
  async twofa(form) {
    const r = await api('/auth/2fa', { method: 'POST', body: formData(form) });
    location.href = r.redirect || '/dashboard';
  },
};

root.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const btn = form.querySelector('[type=submit]');
  await withLoading(btn, async () => {
    try {
      await handlers[form.dataset.form](form);
    } catch (err) {
      if (err.body?.code === 'EMAIL_UNVERIFIED') {
        msg('warning', err.message);
        const email = form.email.value;
        const box = $('[data-msg]', root);
        box.insertAdjacentHTML('beforeend', '<button type="button" class="btn btn-soft btn-sm btn-block" data-resend style="margin:-6px 0 14px">Resend verification email</button>');
        box.querySelector('[data-resend]').addEventListener('click', async (ev) => {
          await withLoading(ev.currentTarget, async () => {
            const r = await api('/auth/resend-verification', { method: 'POST', body: { email } });
            msg('success', r.message);
          });
        });
      } else {
        msg('error', err.message);
      }
    }
  });
});

root.addEventListener('click', (e) => {
  const t = e.target.closest('[data-pw]');
  if (t) {
    const input = t.closest('.input-group').querySelector('input');
    input.type = input.type === 'password' ? 'text' : 'password';
    t.innerHTML = `<i class="fa-regular ${input.type === 'password' ? 'fa-eye' : 'fa-eye-slash'}"></i>`;
  }
  const th = e.target.closest('[data-theme-set]');
  if (th) applyTheme(th.dataset.themeSet, { persist: false });
});

(async () => {
  try {
    const r = await api('/public/site');
    state.site = r.site;
    if (!localStorage.getItem('aura.theme') && r.site.default_theme === 'dark') applyTheme('dark', { persist: false });
    if (r.site.favicon_url) document.querySelector('[data-favicon]')?.setAttribute('href', r.site.favicon_url);
  } catch (err) {
    if (err.status === 503 && err.body?.install) { location.href = '/install'; return; }
    state.site = { site_name: 'Premium Aura', site_subtitle: 'Vip Acess Only', registration_enabled: '1' };
  }
  show(viewFor(location.pathname));
})();
