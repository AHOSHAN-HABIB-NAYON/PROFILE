import { api } from '../api.js';
import {
  html, mount, usd, avatar, date, skeleton, $, icon, modal, formValues, busy, toast, compressImage,
} from '../ui.js';
import { state, refreshMe } from '../app.js';
import { paymentHistory } from './members.js';

export const METHOD_NAMES = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', bank: 'Bank', crypto: 'Crypto wallet' };
const METHOD_COLORS = { bkash: '#e2136e', nagad: '#ec1c24', rocket: '#8c3494', bank: '#1f5eff', crypto: '#26a17b' };
const NETWORKS = ['TRC20', 'BEP20', 'ERC20', 'SOL', 'Polygon', 'Arbitrum', 'Base', 'TON'];

export function methodLogo(type, logos) {
  return logos[type]
    ? html`<img class="method-logo" src="${logos[type]}" alt="${METHOD_NAMES[type]}" loading="lazy">`
    : html`<span class="method-fallback" style="background:${METHOD_COLORS[type]}">${METHOD_NAMES[type].slice(0, 2)}</span>`;
}

export async function render({ el }) {
  mount(el, skeleton(140, 3));
  const [p, logosRes, hist] = await Promise.all([api.get('/me', { fresh: true }), api.get('/method-logos'), api.get('/payments/history', { fresh: true })]);
  const u = p.user;
  const logos = logosRes.logos;
  const byType = Object.fromEntries(p.payment_methods.map((m) => [m.type, m]));

  mount(el, html`<div class="stack">
    <div class="card"><div class="profile-head">
      <label class="avatar-edit" title="Change photo">${avatar(u, 'lg')}<span class="cam">${icon('camera')}</span>
        <input type="file" accept="image/*" id="photo" class="hidden"></label>
      <div class="grow"><h1>${u.name}</h1><div class="muted">${u.email} ${u.email_verified ? html`<span class="chip up">${icon('check')} Verified</span>` : html`<span class="chip warn">Not verified</span>`}</div>
        <div class="faint" style="margin-top:4px">Member since ${date(u.member_since)} · ${u.role === 'user' ? 'Member' : u.role.replace('_', ' ')}</div></div>
    </div></div>

    <div class="grid g4">
      <div class="card stat"><div class="label">Deposit amount</div><div class="value num">${usd(u.deposit_amount)}</div><div class="sub">${u.deposit_received_at ? html`<span class="up">Received ${date(u.deposit_received_at)}</span>` : html`<span class="muted">Due ${date(u.deposit_date)}</span>`}</div></div>
      <div class="card stat"><div class="label">Monthly salary</div><div class="value num">${usd(u.salary)}</div><div class="sub faint">Set by admin</div></div>
      <div class="card stat"><div class="label">Total payments received</div><div class="value num up">${usd(p.total_paid)}</div><div class="sub faint">${p.payments_count} payments</div></div>
      <div class="card stat"><div class="label">Deposit date</div><div class="value" style="font-size:18px">${date(u.deposit_date)}</div></div>
    </div>

    <div class="grid g2">
      <div class="card"><div class="card-head"><h2>Personal details</h2><span class="chip">${icon('shield')} Only you and admins</span></div>
        <form class="form" id="pf">
          <div class="field"><label for="p-name">Full name</label><input class="input" id="p-name" name="name" value="${u.name}" required></div>
          <div class="field"><label for="p-phone">Phone</label><input class="input" id="p-phone" name="phone" type="tel" value="${u.phone || ''}" placeholder="+8801…"></div>
          <div class="field"><label for="p-addr">Address</label><textarea class="input" id="p-addr" name="address" rows="2">${u.address || ''}</textarea></div>
          <label class="check"><input type="checkbox" name="reminder_emails" ${u.reminder_emails ? 'checked' : ''}><span>Send me reminder emails<br><span class="faint" style="font-size:12px">Payment confirmations and important emails are always sent.</span></span></label>
          <div class="form-error hidden" id="perr"></div>
          <div><button class="btn" type="submit">Save changes</button></div>
        </form></div>

      <div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h2>Payment methods</h2><span class="chip">${icon('shield')} Private</span></div>
        <p class="faint" style="margin:0 16px 6px;font-size:13px">Where admins send your monthly payment.</p>
        ${Object.keys(METHOD_NAMES).map((t) => html`<div class="list-item">${methodLogo(t, logos)}<div class="grow"><div class="t">${METHOD_NAMES[t]} ${byType[t]?.is_default ? html`<span class="chip brand">Default</span>` : ''}</div>
          <div class="s">${byType[t] ? `${byType[t].account}${byType[t].network ? ` · ${byType[t].network}` : ''}` : 'Not added'}</div></div>
          <button class="btn ghost sm" data-method="${t}">${byType[t] ? 'Edit' : 'Add'}</button></div>`)}
      </div>
    </div>

    <div class="card"><div class="card-head"><h2>My payment history</h2></div>${paymentHistory(hist)}</div>
  </div>`);

  $('#pf', el).onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      await api.put('/me', formValues(e.target));
      await refreshMe();
      toast('Profile saved');
    }, $('#perr', el));
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

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-method]'); if (!b) return;
    const t = b.dataset.method; const m = byType[t] || {};
    const dlg = modal({
      title: `${METHOD_NAMES[t]} details`,
      body: html`<form class="form" id="mf">
        ${t === 'crypto' ? html`
          <div class="field"><label for="m-acc">Wallet address</label><input class="input" id="m-acc" name="account" value="${m.account || ''}" required autocomplete="off" spellcheck="false"></div>
          <div class="field"><label for="m-net">Network</label><select class="input" id="m-net" name="network">${NETWORKS.map((n) => html`<option ${m.network === n ? 'selected' : ''}>${n}</option>`)}</select><span class="hint">Double-check the network. Sending on the wrong network loses funds.</span></div>`
    : html`
          <div class="field"><label for="m-acc">${t === 'bank' ? 'Account number' : `${METHOD_NAMES[t]} number`}</label><input class="input" id="m-acc" name="account" value="${m.account || ''}" required inputmode="${t === 'bank' ? 'text' : 'tel'}"></div>
          <div class="field"><label for="m-holder">Account holder name</label><input class="input" id="m-holder" name="holder" value="${m.holder || ''}"></div>
          ${t === 'bank' ? html`<div class="field"><label for="m-net">Bank and branch</label><input class="input" id="m-net" name="network" value="${m.network || ''}"></div>` : ''}`}
        <label class="check"><input type="checkbox" name="is_default" ${m.is_default ? 'checked' : ''}><span>Use as my default payment method</span></label>
        <div class="form-error hidden" id="merr"></div>
      </form>`,
      foot: html`${m.account ? html`<button class="btn danger" id="mdel">Remove</button><span class="grow"></span>` : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn" id="msave">Save</button>`,
    });
    $('#msave', dlg.el).onclick = (ev) => busy(ev.currentTarget, async () => {
      await api.put(`/me/payment-methods/${t}`, formValues($('#mf', dlg.el)));
      dlg.close(); toast(`${METHOD_NAMES[t]} saved`); render({ el });
    }, $('#merr', dlg.el));
    const del = $('#mdel', dlg.el);
    if (del) del.onclick = (ev) => busy(ev.currentTarget, async () => { await api.del(`/me/payment-methods/${t}`); dlg.close(); render({ el }); });
  });
  state.me = { ...state.me, ...u };
}
