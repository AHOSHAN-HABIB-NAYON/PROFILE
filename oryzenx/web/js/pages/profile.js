import { api } from '../api.js';
import {
  html, mount, usd, avatar, date, skeleton, $, icon, modal, formValues, busy, toast, compressImage,
} from '../ui.js';
import { state, refreshMe, isAdmin, logout } from '../app.js';
import { paymentHistory } from './members.js';

export const METHOD_NAMES = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', bank: 'Bank', crypto: 'USDT / Crypto' };
const METHOD_COLORS = { bkash: '#e2136e', nagad: '#ec1c24', rocket: '#8c3494', bank: '#1f5eff', crypto: '#26a17b' };
const NETWORKS = ['TRC20', 'BEP20', 'ERC20', 'SOL', 'Polygon', 'Arbitrum', 'Base', 'TON'];

export function methodLogo(type, logos = {}) {
  return logos[type]
    ? html`<img class="method-logo" src="${logos[type]}" alt="${METHOD_NAMES[type]}" loading="lazy">`
    : html`<span class="method-fallback" style="background:${METHOD_COLORS[type]}">${type === 'crypto' ? '₮' : METHOD_NAMES[type].slice(0, 2)}</span>`;
}

export async function render({ el }) {
  mount(el, skeleton(140, 3));
  const [p, logosRes, hist] = await Promise.all([api.get('/me', { fresh: true }), api.get('/method-logos'), api.get('/payments/history', { fresh: true })]);
  const u = p.user;
  const logos = logosRes.logos;
  const byType = Object.fromEntries(p.payment_methods.map((m) => [m.type, m]));
  const verified = u.kyc_status === 'approved' || u.role !== 'user';
  const menu = (href, ic, label, tone = '') => html`<a class="menu-row" href="${href}"><span class="mr-ic ${tone}">${icon(ic)}</span><span class="grow"><b>${label}</b></span>${icon('back', 'flip faint')}</a>`;

  mount(el, html`<div class="profile-grid">
    <aside class="stack">
      <div class="card profile-card">
        <label class="avatar-edit" title="Change photo">${avatar(u, 'xl')}<span class="cam">${icon('camera')}</span><input type="file" accept="image/*" id="photo" class="hidden"></label>
        <h2>${u.name}</h2><p class="muted">${u.email}</p>
        ${verified ? html`<span class="verified-badge">${icon('check')} Verified</span>` : html`<span class="chip warn">Not verified</span>`}
        <div class="pc-stats"><div><span>Member since</span><b>${date(u.member_since)}</b></div><div><span>Role</span><b>${u.role === 'user' ? 'Member' : u.role === 'super_admin' ? 'Super Admin' : 'Admin'}</b></div></div>
      </div>
      <div class="card pad-0 menu-list">
        ${menu('#/invest', 'invest', 'Investment')}
        ${menu('#/trading', 'chart', 'Trading')}
        ${menu('#/history', 'history', 'Trade History')}
        ${menu('#/loans', 'loan', 'Loan Monitor')}
        ${menu('#/members', 'users', 'Members & Payments')}
        ${menu('#/notifications', 'bell', 'Notifications')}
        ${menu('#/settings', 'settings', 'Settings')}
        ${isAdmin() ? menu('#/admin', 'admin', 'Admin Panel', 'brand') : ''}
        <button class="menu-row" id="out"><span class="mr-ic bad">${icon('logout')}</span><span class="grow"><b>Log out</b></span></button>
      </div>
    </aside>

    <section class="stack">
      <div class="card">
        <div class="card-head"><h2>Profile Information</h2><button class="btn ghost sm" id="edit">${icon('edit')} Edit</button></div>
        <div class="info-grid">
          <div><span>Name</span><b>${u.name}</b></div>
          <div><span>Email</span><b>${u.email}</b></div>
          <div><span>Phone</span><b>${u.phone || '—'}</b></div>
          <div><span>Address</span><b>${u.address || '—'}</b></div>
          <div><span>Member Since</span><b>${date(u.member_since)}</b></div>
          <div><span>Deposit Amount</span><b class="num">${usd(u.deposit_amount)}</b></div>
          <div><span>Deposit date</span><b>${u.deposit_received_at ? html`<span class="up">Received ${date(u.deposit_received_at)}</span>` : date(u.deposit_date)}</b></div>
          <div><span>Monthly salary</span><b class="num">${usd(u.salary)}</b></div>
          <div><span>Total Payments</span><b class="num up">${usd(p.total_paid)}</b></div>
        </div>
        <p class="faint small" style="margin:12px 0 0">${icon('shield')} Phone, address, email and payout details are visible only to you and the admins.</p>
      </div>

      <div class="card">
        <div class="card-head"><h2>Payment Methods</h2><span class="faint small">Where admins send your payment</span></div>
        <div class="methods">${Object.keys(METHOD_NAMES).map((t) => html`<button class="method ${byType[t] ? 'set' : ''}" data-method="${t}">
          ${methodLogo(t, logos)}<span class="grow"><b>${METHOD_NAMES[t]} ${byType[t]?.is_default ? html`<em class="chip brand">Default</em>` : ''}</b>
          <small>${byType[t] ? `${byType[t].account}${byType[t].network ? ` · ${byType[t].network}` : ''}` : 'Not added'}</small></span>
          <span class="m-edit">${byType[t] ? 'Edit' : 'Add'}</span></button>`)}</div>
      </div>

      <div class="card"><div class="card-head"><h2>Payment History</h2></div>${paymentHistory(hist)}</div>
    </section>
  </div>`);

  $('#out', el).onclick = logout;
  $('#edit', el).onclick = () => {
    const m = modal({
      title: 'Edit profile',
      body: html`<form class="form" id="pf">
        <div class="field"><label for="p-name">Full name</label><input class="input" id="p-name" name="name" value="${u.name}" required></div>
        <div class="field"><label for="p-phone">Phone</label><input class="input" id="p-phone" name="phone" type="tel" value="${u.phone || ''}" placeholder="+8801…"></div>
        <div class="field"><label for="p-addr">Address</label><textarea class="input" id="p-addr" name="address" rows="2">${u.address || ''}</textarea></div>
        <label class="check"><input type="checkbox" name="reminder_emails" ${u.reminder_emails ? 'checked' : ''}><span>Send me reminder emails<br><small class="faint">Payment emails are always sent.</small></span></label>
        <div class="form-error hidden" id="perr"></div></form>`,
      foot: html`<button class="btn ghost" data-close>Cancel</button><button class="btn" id="psave">Save</button>`,
    });
    $('#psave', m.el).onclick = () => busy($('#psave', m.el), async () => {
      await api.put('/me', formValues($('#pf', m.el)));
      await refreshMe(); m.close(); toast('Profile saved'); render({ el });
    }, $('#perr', m.el));
  };

  $('#photo', el).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const image = await compressImage(f, 384);
      await api.post('/me/avatar', { image });
      await refreshMe();
      toast('Photo updated');
      render({ el });
    } catch (err) { toast(err.message, 'err'); }
  };

  el.querySelectorAll('[data-method]').forEach((b) => { b.onclick = () => editMethod(b.dataset.method); });
  function editMethod(t) {
    const m = byType[t] || {};
    const dlg = modal({
      title: `${METHOD_NAMES[t]} details`,
      body: html`<form class="form" id="mf">
        <div class="row" style="gap:12px">${methodLogo(t, logos)}<b>${METHOD_NAMES[t]}</b></div>
        ${t === 'crypto' ? html`
          <div class="field"><label for="m-acc">Wallet address</label><input class="input mono" id="m-acc" name="account" value="${m.account || ''}" required autocomplete="off" spellcheck="false"></div>
          <div class="field"><label for="m-net">Network</label><select class="input" id="m-net" name="network">${NETWORKS.map((n) => html`<option ${m.network === n ? 'selected' : ''}>${n}</option>`)}</select><span class="hint">Double-check the network. Sending on the wrong network loses funds.</span></div>`
    : html`
          <div class="field"><label for="m-acc">${t === 'bank' ? 'Account number' : `${METHOD_NAMES[t]} number`}</label><input class="input" id="m-acc" name="account" value="${m.account || ''}" required inputmode="${t === 'bank' ? 'text' : 'tel'}"></div>
          <div class="field"><label for="m-holder">Account holder name</label><input class="input" id="m-holder" name="holder" value="${m.holder || ''}"></div>
          ${t === 'bank' ? html`<div class="field"><label for="m-net">Bank and branch</label><input class="input" id="m-net" name="network" value="${m.network || ''}"></div>` : ''}`}
        <label class="check"><input type="checkbox" name="is_default" ${m.is_default ? 'checked' : ''}><span>Use as my default payment method</span></label>
        <div class="form-error hidden" id="merr"></div>
      </form>`,
      foot: html`${m.account ? html`<button class="btn ghost-danger" id="mdel">Remove</button><span class="grow"></span>` : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn" id="msave">Save</button>`,
    });
    $('#msave', dlg.el).onclick = () => busy($('#msave', dlg.el), async () => {
      await api.put(`/me/payment-methods/${t}`, formValues($('#mf', dlg.el)));
      dlg.close(); toast(`${METHOD_NAMES[t]} saved`); await refreshMe(); render({ el });
    }, $('#merr', dlg.el));
    const del = $('#mdel', dlg.el);
    if (del) del.onclick = () => busy(del, async () => { await api.del(`/me/payment-methods/${t}`); dlg.close(); render({ el }); });
  }
  state.me = { ...state.me, ...u };
}
