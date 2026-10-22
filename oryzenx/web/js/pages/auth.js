// Sign-in and onboarding screens (follow the OryzenX mockup):
// Welcome -> Login / Sign Up -> Verify email (6-digit code) -> KYC -> Privacy Notice -> Choose Theme -> Home.
import { api } from '../api.js';
import {
  html, mount, icon, $, $$, formValues, busy, toast, price, pct, cls,
} from '../ui.js';
import * as market from '../market.js';
import {
  state, go, afterAuth, logout, setTheme, markThemeChosen,
} from '../app.js';

export const privacyNotice = html`<div class="notice-box">
  <b>Privacy Notice</b>
  <ul>
    <li>This is a private friends' project for our group only.</li>
    <li>All members can see project numbers: balances, profit, loss, deposits, payments, trades, investments and loans.</li>
    <li>Your phone, address, email, payout accounts, ID card and face data are visible only to you and the admins.</li>
    <li>Do not share project data, screenshots or the app outside the group.</li>
  </ul>
  <b>Disclaimer</b>
  <ul>
    <li>Crypto trading involves risk. Profits are not guaranteed.</li>
    <li>Only admins can change data. Every change is recorded.</li>
  </ul></div>`;

const TICKER = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
const seenWelcome = () => { try { localStorage.setItem('ox-seen-welcome', '1'); } catch { /* ignore */ } };

// Phone: a single centered column. Desktop: brand panel on the left, form on the right.
function frame(el, body, { back = null, art = true } = {}) {
  mount(el, html`<div class="auth">
    ${art ? html`<section class="auth-art">
      <a class="brand light" href="#/welcome"><img src="/icons/logo.svg" width="42" height="42" alt=""><span>OryzenX <b>BD</b></span></a>
      <div><img src="/icons/onboard.svg" alt="" class="art-img">
        <h1>Invest. Trade. Grow together.</h1>
        <p>Private investment, trading and loan monitor for our group. Live market data, transparent numbers.</p></div>
      <div class="ticker" id="auth-ticker">${TICKER.map((c) => html`<span class="chip" data-t="${c}">${c} —</span>`)}</div>
    </section>` : ''}
    <section class="auth-panel"><div class="auth-card">
      ${back ? html`<button class="m-back" id="a-back" aria-label="Back">${icon('back')}</button>` : ''}
      ${body}</div></section>
  </div>`);
  if (back) $('#a-back', el).onclick = back;
  if (!art) return () => {};
  market.watch(TICKER.concat(state.watchlist));
  return market.subscribe(() => {
    for (const c of TICKER) {
      const t = market.getTicker(c);
      const chip = el.querySelector(`[data-t="${c}"]`);
      if (t && chip) mount(chip, html`${c} ${price(t.price)} <span class="${cls(t.change)}">${pct(t.change)}</span>`);
    }
  });
}

const head = (title, sub) => html`<div class="head"><h1>${title}</h1>${sub ? html`<p>${sub}</p>` : ''}</div>`;

// ---------- Welcome / onboarding ----------
export async function welcome({ el }) {
  mount(el, html`<div class="welcome">
    <div class="welcome-top"><img src="/icons/logo.svg" width="54" height="54" alt=""><div class="wordmark">OryzenX <b>BD</b></div>
      <p>Your Private Investment<br>&amp; Trading Monitor</p></div>
    <img class="welcome-art" src="/icons/onboard.svg" alt="">
    <div class="welcome-pills"><span>${icon('chart')} Live market</span><span>${icon('shield')} Secure &amp; private</span><span>${icon('users')} Friends only</span></div>
    <div class="welcome-actions">
      <a class="btn block lg" href="#/signup" id="w-start">Get Started</a>
      <a class="btn ghost block lg" href="#/login" id="w-in">Sign In</a>
      <a class="skip" href="#/login" id="w-skip">Skip</a>
    </div></div>`);
  el.querySelectorAll('a').forEach((a) => a.addEventListener('click', seenWelcome));
}

// ---------- Google sign-in ----------
async function setupGoogle(el, invite) {
  const box = $('#google-box', el);
  let cfg;
  try { cfg = await api.get('/auth/config'); } catch { return; }
  if (!cfg.googleClientId) { box.innerHTML = '<p class="faint center small">Google sign-in is not set up yet. Use email for now.</p>'; return; }
  await new Promise((resolve, reject) => {
    if (window.google?.accounts) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve; s.onerror = reject;
    document.head.append(s);
  }).catch(() => {});
  if (!window.google?.accounts) return;
  window.google.accounts.id.initialize({
    client_id: cfg.googleClientId,
    callback: async ({ credential }) => {
      try {
        const r = await api.post('/auth/google', { credential, invite });
        if (r.need_2fa) twoFactor(el, r.ticket); else await afterAuth();
      } catch (err) { toast(err.message, 'err'); }
    },
  });
  box.innerHTML = '<div id="google-btn"></div>';
  window.google.accounts.id.renderButton($('#google-btn', el), {
    theme: document.documentElement.dataset.theme === 'light' ? 'outline' : 'filled_black',
    size: 'large', width: Math.min(380, box.offsetWidth || 340), text: 'continue_with', shape: 'pill',
  });
}

// Email | Google tabs, as in the mockup.
function methodTabs(el, invite) {
  $$('.tabs2 button', el).forEach((b) => {
    b.onclick = () => {
      $$('.tabs2 button', el).forEach((x) => x.classList.toggle('active', x === b));
      $('#email-pane', el).classList.toggle('hidden', b.dataset.t !== 'email');
      $('#google-box', el).classList.toggle('hidden', b.dataset.t !== 'google');
      if (b.dataset.t === 'google' && !el._g) { el._g = true; setupGoogle(el, invite); }
    };
  });
}
const tabs = html`<div class="tabs2"><button class="active" data-t="email" type="button">${icon('mail')} Email</button><button data-t="google" type="button">${icon('google')} Google</button></div>`;

export async function login({ el }) {
  seenWelcome();
  const off = frame(el, html`${head('Welcome Back', 'Sign in to your account')}${tabs}
    <div id="google-box" class="hidden google-box"><div class="spin dark"></div></div>
    <form class="form" id="email-pane" novalidate>
      <div class="field"><label for="f-email">Email address</label><input class="input" id="f-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></div>
      <div class="field"><label for="f-password">Password</label><div class="pw-wrap"><input class="input" id="f-password" name="password" type="password" autocomplete="current-password" required>
        <button type="button" aria-label="Show password" data-toggle-pw>${icon('eye')}</button></div></div>
      <div class="right"><a href="#/forgot" class="small">Forgot password?</a></div>
      <div class="form-error hidden" id="err"></div>
      <button class="btn block lg" type="submit">Login</button>
    </form>
    <p class="muted center mt">Don't have an account? <a href="#/signup"><b>Sign Up</b></a></p>`, { back: () => go('welcome') });
  methodTabs(el);
  $('#email-pane', el).onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      const v = formValues(e.target);
      if (!v.email || !v.password) throw new Error('Enter your email and password');
      const r = await api.post('/auth/login', v);
      if (r.need_2fa) twoFactor(el, r.ticket); else await afterAuth();
    }, $('#err', el));
  };
  return off;
}

// Second login step: code from the authenticator app (or a backup code).
function twoFactor(el, ticket) {
  mount($('.auth-card', el), html`<div class="hero-ic">${icon('shield')}</div>${head('2-step verification', 'Enter the 6-digit code from your authenticator app.')}
    <form class="form" id="tf">
      <input class="input code-input" id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="9" placeholder="123456" aria-label="6-digit code" required>
      <div class="form-error hidden" id="err"></div>
      <button class="btn block lg" type="submit">Verify and log in</button>
      <p class="faint center small">Lost your phone? Enter one of your backup codes (like <span class="mono">ab12-cd34</span>).</p>
      <p class="center"><a href="#/login" id="back">Back to login</a></p>
    </form>`);
  $('#code', el).focus();
  $('#back', el).onclick = (e) => { e.preventDefault(); login({ el }); };
  $('#tf', el).onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      await api.post('/auth/2fa/verify', { ticket, code: $('#code', el).value.trim() });
      await afterAuth();
    }, $('#err', el));
  };
}

export async function signup({ el, query }) {
  seenWelcome();
  const invite = query.get('invite') || '';
  const off = frame(el, html`${head('Create Account', 'Join with your friends')}${tabs}
    <div id="google-box" class="hidden google-box"><div class="spin dark"></div></div>
    <form class="form" id="email-pane" novalidate>
      <div class="field"><label for="f-name">Full Name</label><input class="input" id="f-name" name="name" autocomplete="name" required></div>
      <div class="field"><label for="f-email">Email address</label><input class="input" id="f-email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="f-password">Password</label><div class="pw-wrap"><input class="input" id="f-password" name="password" type="password" autocomplete="new-password" required minlength="8">
        <button type="button" aria-label="Show password" data-toggle-pw>${icon('eye')}</button></div><span class="hint">At least 8 characters with a letter and a number.</span></div>
      <div class="field"><label for="f-password2">Confirm password</label><input class="input" id="f-password2" name="password2" type="password" autocomplete="new-password" required></div>
      <details class="invite" ${invite ? 'open' : ''}><summary>Have an invite code?</summary>
        <div class="field mt-s"><input class="input" id="f-invite" name="invite" value="${invite}" autocomplete="off" placeholder="Invite code" style="text-transform:uppercase"></div></details>
      <div class="form-error hidden" id="err"></div>
      <button class="btn block lg" type="submit">Sign Up</button>
    </form>
    <p class="muted center mt">Already have an account? <a href="#/login"><b>Login</b></a></p>`, { back: () => go('welcome') });
  methodTabs(el, invite);
  $('#email-pane', el).onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      const v = formValues(e.target);
      if (v.password.length < 8) throw new Error('Password must be at least 8 characters');
      if (v.password !== v.password2) throw new Error('Passwords do not match');
      await api.post('/auth/signup', { name: v.name, email: v.email, password: v.password, invite: v.invite || undefined });
      await afterAuth();
    }, $('#err', el));
  };
  return off;
}

export async function forgot({ el }) {
  const off = frame(el, html`${head('Forgot password', "We'll email you a link to choose a new password.")}
    <form class="form" id="f">
      <div class="field"><label for="f-email">Email address</label><input class="input" id="f-email" name="email" type="email" autocomplete="email" required></div>
      <div class="form-error hidden" id="err"></div>
      <button class="btn block lg" type="submit">Send reset link</button>
      <p class="center"><a href="#/login">Back to login</a></p>
    </form>`, { back: () => go('login') });
  $('#f', el).onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      await api.post('/auth/forgot-password', formValues(e.target));
      mount($('.auth-card', el), html`<div class="hero-ic">${icon('mail')}</div>${head('Check your email', 'If an account exists for that email, a reset link is on its way. It expires in 1 hour.')}
        <a class="btn ghost block lg mt" href="#/login">Back to login</a>`);
    }, $('#err', el));
  };
  return off;
}

export async function resetPassword({ el, query }) {
  const off = frame(el, html`${head('Choose a new password', 'At least 8 characters with a letter and a number.')}
    <form class="form" id="f">
      <div class="field"><label for="f-password">New password</label><input class="input" id="f-password" name="password" type="password" autocomplete="new-password" required></div>
      <div class="field"><label for="f-p2">Confirm password</label><input class="input" id="f-p2" name="password2" type="password" autocomplete="new-password" required></div>
      <div class="form-error hidden" id="err"></div>
      <button class="btn block lg" type="submit">Save new password</button>
    </form>`);
  $('#f', el).onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      const v = formValues(e.target);
      if (v.password !== v.password2) throw new Error('Passwords do not match');
      await api.post('/auth/reset-password', { token: query.get('token'), password: v.password });
      state.me = null;
      toast('Password changed. Please log in.');
      go('login');
    }, $('#err', el));
  };
  return off;
}

// Link from the email (fallback to the code).
export async function verifyEmail({ el, query }) {
  frame(el, html`<div id="box" class="center"><div class="hero-ic">${icon('mail')}</div><h1>Verifying your email…</h1></div>`, { art: false });
  try {
    await api.post('/auth/verify-email', { token: query.get('token') });
    mount($('#box', el), html`<div class="hero-ic ok">${icon('check')}</div>${head('Email verified', 'Thanks! Your email address is confirmed.')}<a class="btn block lg mt" href="#/home" id="cont">Continue</a>`);
    $('#cont', el).onclick = async (e) => { e.preventDefault(); if (state.me) await afterAuth(); else go('login'); };
  } catch (err) {
    mount($('#box', el), html`<div class="hero-ic bad">${icon('x')}</div>${head('Link not valid', err.message)}<a class="btn block lg mt" href="#/login">Go to app</a>`);
  }
}

function gate(el, body) {
  frame(el, html`${body}<button class="btn ghost block mt-s" id="out">${icon('logout')} Log out</button>`, { art: false });
  $('#out', el).onclick = logout;
}

// Mockup: "Verify Your Email" with 6 code boxes and a resend timer.
export async function checkEmail({ el }) {
  gate(el, html`<div class="center"><div class="hero-ic">${icon('mail')}</div></div>
    ${head('Verify Your Email', '')}
    <p class="muted center">We've sent a 6-digit code to<br><b class="brand-text">${state.me.email}</b></p>
    <div class="otp" id="otp">${[0, 1, 2, 3, 4, 5].map((i) => html`<input inputmode="numeric" maxlength="1" aria-label="Digit ${i + 1}" autocomplete="${i === 0 ? 'one-time-code' : 'off'}">`)}</div>
    <div class="form-error hidden" id="err"></div>
    <button class="btn block lg" id="verify">Verify</button>
    <p class="center muted small mt-s" id="resend-line">Resend code in <b id="timer">01:59</b></p>`);
  const boxes = [...el.querySelectorAll('#otp input')];
  const code = () => boxes.map((b) => b.value).join('');
  const submit = () => busy($('#verify', el), async () => {
    if (code().length !== 6) throw new Error('Enter the 6-digit code from the email');
    await api.post('/auth/verify-code', { code: code() });
    await afterAuth();
  }, $('#err', el));
  boxes.forEach((b, i) => {
    b.oninput = () => {
      const digits = b.value.replace(/\D/g, '');
      if (digits.length > 1) { digits.split('').slice(0, 6 - i).forEach((d, j) => { boxes[i + j].value = d; }); boxes[Math.min(5, i + digits.length - 1)].focus(); } else { b.value = digits; if (digits && i < 5) boxes[i + 1].focus(); }
      if (code().length === 6) submit();
    };
    b.onkeydown = (e) => { if (e.key === 'Backspace' && !b.value && i > 0) boxes[i - 1].focus(); };
  });
  boxes[0].focus();
  $('#verify', el).onclick = submit;
  let left = 119;
  const tick = () => {
    const t = $('#timer', el);
    if (!t) return;
    if (left <= 0) {
      mount($('#resend-line', el), html`Didn't get it? <a href="#" id="resend"><b>Resend code</b></a>`);
      $('#resend', el).onclick = (e) => { e.preventDefault(); busy(null, async () => { await api.post('/auth/resend-verification'); toast('A new code was sent'); left = 119; mount($('#resend-line', el), html`Resend code in <b id="timer">01:59</b>`); }); };
      return;
    }
    t.textContent = `0${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    left -= 1;
  };
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
}

export async function pending({ el }) {
  gate(el, html`<div class="center"><div class="hero-ic">${icon('clock')}</div></div>${head('Waiting for approval', 'An admin needs to approve your account. You will get an email when it is approved.')}
    <button class="btn block lg mt" id="again">Check again</button>`);
  $('#again', el).onclick = (e) => busy(e.currentTarget, async () => {
    await afterAuth();
    if (state.stage === 'pending_approval') toast('Still waiting for an admin', 'err');
  });
  const t = setInterval(() => { if (!document.hidden) afterAuth().catch(() => {}); }, 30000);
  return () => clearInterval(t);
}

// Mockup: shield, "Privacy Notice & Disclaimer", text, "I agree to the terms", Continue.
export async function privacy({ el }) {
  gate(el, html`<div class="center"><div class="hero-ic shield">${icon('shield')}</div></div>${head('Privacy Notice & Disclaimer', '')}
    ${privacyNotice}
    <label class="check mt"><input type="checkbox" id="agree"><span>I agree to the terms</span></label>
    <button class="btn block lg mt" id="cont" disabled>Continue</button>`);
  $('#agree', el).onchange = (e) => { $('#cont', el).disabled = !e.target.checked; };
  $('#cont', el).onclick = (e) => busy(e.currentTarget, async () => {
    await api.post('/auth/accept-privacy', { accept: true });
    await afterAuth();
  });
}

// Mockup: "Choose Theme" with light and dark previews.
export async function chooseTheme({ el }) {
  let pick = document.documentElement.dataset.theme || 'light';
  const draw = () => {
    frame(el, html`${head('Choose Theme', 'You can change it later in Settings.')}
      <div class="theme-choose">${['light', 'dark'].map((t) => html`<button class="theme-card ${pick === t ? 'active' : ''}" data-t="${t}">
        <span class="phone-prev ${t}"><i class="bar"></i><i class="card"></i><i class="row"></i><i class="row short"></i><i class="nav"></i></span>
        <span class="tc-label"><span class="radio"></span>${t === 'light' ? 'Light Mode' : 'Dark Mode'}</span></button>`)}</div>
      <button class="btn block lg mt" id="cont">Continue</button>`, { art: false });
    el.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { pick = b.dataset.t; setTheme(pick); window.dispatchEvent(new Event('ox:theme')); draw(); }; });
    $('#cont', el).onclick = () => { setTheme(pick); markThemeChosen(); afterAuth(); };
  };
  draw();
}

export async function disabled({ el }) {
  gate(el, html`<div class="center"><div class="hero-ic bad">${icon('x')}</div></div>${head('Account disabled', 'This account has been disabled. Please contact an admin.')}`);
}
