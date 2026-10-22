import { api } from '../api.js';
import {
  html, mount, icon, $, formValues, busy, passwordField, toast, price, pct, cls,
} from '../ui.js';
import * as market from '../market.js';
import {
  state, go, afterAuth, logout,
} from '../app.js';

export const privacyNotice = html`<div class="notice-box">
  <b style="color:var(--text)">Privacy Notice</b>
  <ul>
    <li>This is a private project for our group of friends only.</li>
    <li>All members can see project numbers: balances, profit, loss, deposits, payments, trades, investments and loans.</li>
    <li>Your phone, address, email and payout account details are visible only to you and the admins.</li>
    <li>Do not share any project data, screenshots or the app outside the group.</li>
  </ul>
  <b style="color:var(--text);display:block;margin-top:12px">Disclaimer</b>
  <ul>
    <li>Crypto trading involves high risk. You can lose money.</li>
    <li>Profits are not guaranteed. Past results do not predict future results.</li>
    <li>Only admins can change data. Everything is recorded in an activity log.</li>
  </ul></div>`;

const TICKER = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];

function authLayout(el, card) {
  mount(el, html`<div class="auth">
    <section class="auth-art">
      <a class="brand" href="#/login" style="color:#fff;padding:0"><img src="/icons/logo.svg" width="40" height="40" alt="">OryzenX <b>BD</b></a>
      <div>
        <h1>Invest. Trade. Grow together.</h1>
        <p>Our private investment, trading and loan monitor. Live market data, transparent numbers, built for friends.</p>
        <div class="feats">
          <div class="feat">${icon('chart')} Live Binance prices and candlestick charts</div>
          <div class="feat">${icon('shield')} Private and secure, only for approved members</div>
          <div class="feat">${icon('calendar')} Monthly payment date and payment status</div>
        </div>
      </div>
      <div class="ticker" id="auth-ticker">${TICKER.map((c) => html`<span class="chip" data-t="${c}">${c} —</span>`)}</div>
    </section>
    <section class="auth-panel"><div class="auth-card">${card}</div></section>
  </div>`);
  market.watch(TICKER.concat(state.watchlist));
  return market.subscribe(() => {
    for (const c of TICKER) {
      const t = market.getTicker(c);
      const chip = el.querySelector(`[data-t="${c}"]`);
      if (t && chip) mount(chip, html`${c} ${price(t.price)} <span class="${cls(t.change)}">${pct(t.change)}</span>`);
    }
  });
}

async function setupGoogle(el, invite) {
  const box = $('#google-box', el);
  let cfg;
  try { cfg = await api.get('/auth/config'); } catch { return; }
  if (!cfg.googleClientId) return;
  box.classList.remove('hidden');
  await new Promise((resolve, reject) => {
    if (window.google?.accounts) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve; s.onerror = reject;
    document.head.append(s);
  }).catch(() => box.classList.add('hidden'));
  if (!window.google?.accounts) return;
  window.google.accounts.id.initialize({
    client_id: cfg.googleClientId,
    callback: async ({ credential }) => {
      try {
        await api.post('/auth/google', { credential, invite });
        await afterAuth();
      } catch (err) { toast(err.message, 'err'); }
    },
  });
  window.google.accounts.id.renderButton($('#google-btn', el), {
    theme: document.documentElement.dataset.theme === 'light' ? 'outline' : 'filled_black',
    size: 'large', width: Math.min(400, $('#google-btn', el).offsetWidth || 360), text: 'continue_with', shape: 'rectangular',
  });
}

const googleBlock = html`<div id="google-box" class="hidden"><div id="google-btn" style="min-height:44px"></div><div class="divider mt">or</div></div>`;

export async function login({ el }) {
  const off = authLayout(el, html`
    <div class="head"><h1>Welcome back</h1><p>Sign in to your account</p></div>
    ${googleBlock}
    <form class="form" id="f" novalidate>
      <div class="field"><label for="f-email">Email</label><input class="input" id="f-email" name="email" type="email" autocomplete="email" required></div>
      ${passwordField('password', 'Password', 'current-password')}
      <div style="text-align:right;margin-top:-6px"><a href="#/forgot">Forgot password?</a></div>
      <div class="form-error hidden" id="err"></div>
      <button class="btn block" type="submit">Log in</button>
      <p class="muted" style="text-align:center;margin:4px 0 0">Don't have an account? <a href="#/signup">Sign up</a></p>
    </form>`);
  setupGoogle(el);
  $('#f', el).onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      const v = formValues(e.target);
      if (!v.email || !v.password) throw new Error('Enter your email and password');
      await api.post('/auth/login', v);
      await afterAuth();
    }, $('#err', el));
  };
  return off;
}

export async function signup({ el, query }) {
  const invite = query.get('invite') || '';
  const off = authLayout(el, html`
    <div class="head"><h1>Create account</h1><p>Join the group. An admin approves new members.</p></div>
    ${googleBlock}
    <form class="form" id="f" novalidate>
      <div class="field"><label for="f-name">Full name</label><input class="input" id="f-name" name="name" autocomplete="name" required></div>
      <div class="field"><label for="f-email">Email</label><input class="input" id="f-email" name="email" type="email" autocomplete="email" required></div>
      ${passwordField('password', 'Password', 'new-password')}
      <div class="field"><label for="f-password2">Confirm password</label><input class="input" id="f-password2" name="password2" type="password" autocomplete="new-password" required></div>
      <div class="field"><label for="f-invite">Invite code <span class="faint">(optional)</span></label><input class="input" id="f-invite" name="invite" value="${invite}" autocomplete="off" style="text-transform:uppercase">
        <span class="hint">With a valid invite code your account is approved automatically.</span></div>
      <div class="form-error hidden" id="err"></div>
      <button class="btn block" type="submit">Sign up</button>
      <p class="muted" style="text-align:center;margin:4px 0 0">Already have an account? <a href="#/login">Log in</a></p>
    </form>`);
  setupGoogle(el, invite);
  $('#f', el).onsubmit = (e) => {
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
  const off = authLayout(el, html`
    <div class="head"><h1>Forgot password</h1><p>We'll email you a link to choose a new password.</p></div>
    <form class="form" id="f">
      <div class="field"><label for="f-email">Email</label><input class="input" id="f-email" name="email" type="email" autocomplete="email" required></div>
      <div class="form-error hidden" id="err"></div>
      <button class="btn block" type="submit">Send reset link</button>
      <p style="text-align:center;margin:4px 0 0"><a href="#/login">Back to login</a></p>
    </form>`);
  $('#f', el).onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      await api.post('/auth/forgot-password', formValues(e.target));
      mount($('.auth-card', el), html`<div style="text-align:center"><div class="state-icon">${icon('mail')}</div>
        <h1>Check your email</h1><p class="muted">If an account exists for that email, a reset link is on its way. It expires in 1 hour.</p>
        <a class="btn ghost block mt" href="#/login">Back to login</a></div>`);
    }, $('#err', el));
  };
  return off;
}

export async function resetPassword({ el, query }) {
  const off = authLayout(el, html`
    <div class="head"><h1>Choose a new password</h1><p>At least 8 characters with a letter and a number.</p></div>
    <form class="form" id="f">
      ${passwordField('password', 'New password', 'new-password')}
      <div class="field"><label for="f-p2">Confirm password</label><input class="input" id="f-p2" name="password2" type="password" autocomplete="new-password" required></div>
      <div class="form-error hidden" id="err"></div>
      <button class="btn block" type="submit">Save new password</button>
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

export async function verifyEmail({ el, query }) {
  mount(el, html`<div class="center-screen"><div class="auth-card" style="text-align:center" id="box">
    <div class="state-icon">${icon('mail')}</div><h1>Verifying your email…</h1></div></div>`);
  try {
    await api.post('/auth/verify-email', { token: query.get('token') });
    mount($('#box', el), html`<div class="state-icon ok">${icon('check')}</div><h1>Email verified</h1>
      <p class="muted">Thanks! Your email address is confirmed.</p><a class="btn block mt" href="#/home" id="cont">Continue</a>`);
    $('#cont', el).onclick = async (e) => { e.preventDefault(); if (state.me) await afterAuth(); else go('login'); };
  } catch (err) {
    mount($('#box', el), html`<div class="state-icon" style="background:var(--down-soft);color:var(--down)">${icon('x')}</div>
      <h1>Link not valid</h1><p class="muted">${err.message}</p><a class="btn block mt" href="#/login">Go to app</a>`);
  }
}

function gateScreen(el, body) {
  mount(el, html`<div class="center-screen"><div class="auth-card" style="text-align:center">
    <img src="/icons/logo.svg" width="44" height="44" alt="" style="margin-bottom:18px">${body}
    <button class="btn ghost block mt" id="out">${icon('logout')} Log out</button></div></div>`);
  $('#out', el).onclick = logout;
}

export async function checkEmail({ el }) {
  gateScreen(el, html`<div class="state-icon">${icon('mail')}</div><h1>Verify your email</h1>
    <p class="muted">We sent a verification link to<br><b style="color:var(--text)">${state.me.email}</b></p>
    <button class="btn block mt" id="again">I've verified, continue</button>
    <button class="btn ghost block mt-s" id="resend">Resend email</button>`);
  $('#again', el).onclick = (e) => busy(e.currentTarget, async () => {
    await afterAuth();
    if (state.stage === 'verify_email') toast('Not verified yet. Open the link in your email.', 'err');
  });
  $('#resend', el).onclick = (e) => busy(e.currentTarget, async () => {
    await api.post('/auth/resend-verification');
    toast('Verification email sent');
  });
}

export async function pending({ el }) {
  gateScreen(el, html`<div class="state-icon">${icon('clock')}</div><h1>Waiting for approval</h1>
    <p class="muted">Your email is verified. An admin needs to approve your account before you can open the dashboard. You'll get an email when it's approved.</p>
    <button class="btn block mt" id="again">Check again</button>`);
  $('#again', el).onclick = (e) => busy(e.currentTarget, async () => {
    await afterAuth();
    if (state.stage === 'pending_approval') toast('Still waiting for an admin', 'err');
  });
  // Check quietly every 30 seconds while this screen is open.
  const t = setInterval(() => { if (!document.hidden) afterAuth().catch(() => {}); }, 30000);
  return () => clearInterval(t);
}

export async function privacy({ el }) {
  gateScreen(el, html`<div class="state-icon">${icon('shield')}</div><h1>Privacy Notice & Disclaimer</h1>
    <div style="text-align:left;margin-top:16px">${privacyNotice}</div>
    <label class="check mt" style="text-align:left"><input type="checkbox" id="agree"><span>I have read and agree to the privacy notice and disclaimer.</span></label>
    <button class="btn block mt" id="cont" disabled>Continue</button>`);
  $('#agree', el).onchange = (e) => { $('#cont', el).disabled = !e.target.checked; };
  $('#cont', el).onclick = (e) => busy(e.currentTarget, async () => {
    await api.post('/auth/accept-privacy', { accept: true });
    await afterAuth();
  });
}

export async function disabled({ el }) {
  gateScreen(el, html`<div class="state-icon" style="background:var(--down-soft);color:var(--down)">${icon('x')}</div>
    <h1>Account disabled</h1><p class="muted">This account has been disabled. Please contact an admin.</p>`);
}
