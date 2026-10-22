import { api } from '../api.js';
import {
  html, mount, icon, $, formValues, busy, toast, passwordField, modal,
} from '../ui.js';
import { state, setTheme, logout } from '../app.js';
import { privacyNotice } from './auth.js';

export async function render({ el }) {
  const theme = document.documentElement.dataset.theme;
  mount(el, html`<div class="stack" style="max-width:720px">
    <div class="card"><div class="card-head"><h2>Theme</h2></div>
      <div class="grid g2 keep">
        ${['light', 'dark'].map((t) => html`<button class="card ${theme === t ? 'active' : ''}" data-theme-pick="${t}" style="cursor:pointer;text-align:left;font:inherit;color:inherit;${theme === t ? 'border-color:var(--brand)' : ''}">
          <div style="height:70px;border-radius:10px;margin-bottom:10px;background:${t === 'light' ? 'linear-gradient(135deg,#fff,#e8eefc)' : 'linear-gradient(135deg,#181c23,#0b0e11)'};border:1px solid var(--line)"></div>
          <div class="row">${icon(t === 'light' ? 'sun' : 'moon')}<b>${t === 'light' ? 'Light mode' : 'Dark mode'}</b></div></button>`)}
      </div></div>

    <div class="card"><div class="card-head"><h2>Security</h2></div>
      <form class="form" id="pw">
        ${state.me.has_password ? passwordField('current_password', 'Current password', 'current-password') : html`<p class="muted" style="margin:0">You sign in with Google. You can also set a password here.</p>`}
        ${passwordField('new_password', 'New password', 'new-password')}
        <div class="form-error hidden" id="pwerr"></div>
        <div><button class="btn" type="submit">Change password</button></div>
      </form>
      <p class="faint" style="font-size:13px;margin:14px 0 0">Changing your password signs you out on all other devices. App lock, fingerprint unlock and two-step verification arrive in a later update.</p>
    </div>

    <div class="card"><div class="card-head"><h2>Privacy Notice & Disclaimer</h2></div>${privacyNotice}</div>

    <div class="card"><div class="row between"><div><b>OryzenX BD</b><div class="faint" style="font-size:13px">Version 1.0 · Built for friends</div></div>
      <button class="btn ghost" id="out">${icon('logout')} Log out</button></div>
      <button class="btn ghost sm mt" id="credits">Open-source licences</button></div>
  </div>`);

  el.querySelectorAll('[data-theme-pick]').forEach((b) => { b.onclick = () => { setTheme(b.dataset.themePick); window.dispatchEvent(new Event('ox:theme')); render({ el }); }; });
  $('#pw', el).onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      await api.post('/auth/change-password', formValues(e.target));
      e.target.reset(); toast('Password changed');
    }, $('#pwerr', el));
  };
  $('#out', el).onclick = logout;
  $('#credits', el).onclick = () => modal({
    title: 'Open-source licences',
    body: html`<p class="muted" style="margin-top:0">Charts: <b>TradingView Lightweight Charts™</b> — Copyright © 2024 TradingView, Inc. (<a href="https://www.tradingview.com/" target="_blank" rel="noopener">tradingview.com</a>). Apache License 2.0.</p>
      <p class="muted">Market data: Binance public API.</p>`,
  });
}
