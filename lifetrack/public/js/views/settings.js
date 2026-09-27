/* Settings: profile, security (password, 2FA, recovery codes, passkeys), sessions, notifications, preferences,
   theme, categories, backup, privacy, help, about. Every change is validated server-side. */
import { $, $$, el, html, icon, api, state, t, toast, openSheet, confirmDialog, withBusy, formErrors, segmented, loadLang, relTime, fmtDate, emit, on, clearCache } from '../core.js';
import { avatar, applyTheme, refreshMe, renderChrome } from '../app.js';

const SECTIONS = [['profile', 'user', 'var(--primary)'], ['security', 'shield', 'var(--green)'], ['sessions', 'phone', 'var(--teal)'], ['notifications', 'bell', 'var(--orange)'],
  ['preferences', 'globe', 'var(--teal)'], ['theme', 'palette', 'var(--violet)'], ['categories', 'tag', 'var(--pink)'], ['accounts', 'wallet', 'var(--primary)'],
  ['backup', 'database', 'var(--primary)'], ['privacy', 'lock', 'var(--red)'], ['help', 'help', 'var(--teal)'], ['about', 'info', 'var(--muted)']];

function menu(active) {
  return html`<div class="list set-list">${SECTIONS.map(([k, ic, c]) => html`<a class="li" href="${k === 'accounts' ? '/app/accounts' : '/app/settings/' + k}" ${k === active ? 'style="background:var(--primary-soft)"' : ''}><span class="tile" style="--c:${c}">${icon(ic)}</span><span class="li-main"><span class="li-title">${t('set.' + k)}</span><span class="li-sub">${t('set.' + k + '_sub')}</span></span>${icon('chevron-right', 'i-sm chev')}</a>`)}</div>`;
}

export function index() {
  const page = el(html`<div><header class="ph"><h1>${t('nav.settings')}</h1></header>
    <a class="card profile-card" href="/app/settings/profile" style="color:inherit;margin-bottom:12px">${avatar(state.me)}<div style="flex:1;min-width:0"><b class="ellipsis" style="font-size:15px">${state.me.name}</b><div class="muted ellipsis" style="font-size:12px">${state.me.email}</div></div>${icon('chevron-right', 'muted')}</a>
    ${menu()}</div>`);
  return { el: page, title: t('nav.settings') };
}

const toggleRow = (name, label, sub, checked, ic, c) => html`<label class="li" style="cursor:pointer"><span class="tile" style="--c:${c}">${icon(ic)}</span><span class="li-main"><span class="li-title">${label}</span>${sub ? html`<span class="li-sub" style="white-space:normal">${sub}</span>` : ''}</span><span class="switch"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span></span></span></label>`;
async function saveProfile(patch, msg = true) {
  try { const d = await api.patch('/api/me/profile', patch); state.profile = d.profile; state.me = d.user; if (msg) toast(t('common.saved')); return true; }
  catch (e) { toast(e.message, { type: 'error' }); return false; }
}
const showCodes = (codes) => {
  const body = el(html`<div><div class="alert warn" style="margin-bottom:12px">${icon('alert', 'i-sm')}<span>${t('sec.codes_warning')}</span></div><div class="codes">${codes.map((c) => html`<span>${c}</span>`)}</div></div>`);
  const foot = el(html`<div style="display:flex;gap:10px;width:100%"><button class="btn btn-outline btn-block" data-copy>${icon('copy', 'i-sm')}${t('common.copy')}</button><button class="btn btn-outline btn-block" data-dl>${icon('download', 'i-sm')}${t('common.download')}</button></div>`);
  openSheet({ title: t('sec.recovery_codes'), body, foot });
  foot.querySelector('[data-copy]').onclick = () => navigator.clipboard?.writeText(codes.join('\n')).then(() => toast(t('common.copied')));
  foot.querySelector('[data-dl]').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`${state.config?.site || 'LifeTrack'} recovery codes\n${state.me.email}\n\n${codes.join('\n')}\n`], { type: 'text/plain' })); a.download = 'lifetrack-recovery-codes.txt'; a.click(); };
};
/** Ask for password (or authenticator code) before sensitive actions */
async function stepUp(sec) {
  if (!sec.hasPassword && !sec.twoFactor.totp) return {};
  const v = await confirmDialog({ title: t('sec.confirm_identity'), message: sec.hasPassword ? t('sec.enter_password') : t('sec.enter_code'), input: { label: sec.hasPassword ? t('auth.password') : t('mfa.m.totp'), type: sec.hasPassword ? 'password' : 'text', autocomplete: sec.hasPassword ? 'current-password' : 'one-time-code' }, confirm: t('common.continue') });
  if (v === false) return null;
  return sec.hasPassword ? { password: v } : { code: v };
}

const RENDER = {
  async profile(box) {
    box.innerHTML = String(html`<div class="card card-pad"><div style="display:flex;align-items:center;gap:14px;margin-bottom:14px"><div data-av>${avatar(state.me)}</div><div><label class="btn btn-soft btn-sm" style="cursor:pointer">${icon('upload', 'i-sm')}${t('set.change_photo')}<input type="file" accept="image/*" hidden data-file></label><p class="hint" style="margin-top:4px">${t('set.photo_hint')}</p></div></div>
      <form novalidate data-form><div class="field"><label>${t('auth.full_name')}</label><input class="input" name="name" value="${state.me.name}" maxlength="120"></div>
      <div class="field"><label>${t('auth.email')}</label><input class="input" value="${state.me.email}" disabled><span class="hint">${state.me.verified ? t('set.verified') : t('set.unverified')}</span></div>
      <div class="field"><label>${t('set.phone')}</label><input class="input" name="phone" value="${state.profile?.phone || ''}" inputmode="tel" maxlength="32"></div>
      <button class="btn btn-primary" type="submit">${t('common.save_changes')}</button></form></div>`);
    const form = $('[data-form]', box);
    form.onsubmit = (e) => { e.preventDefault(); withBusy(form.querySelector('[type=submit]'), async () => { const f = new FormData(form); if (await saveProfile({ name: f.get('name'), phone: f.get('phone') || null })) renderChrome(); }); };
    $('[data-file]', box).onchange = async (e) => { const file = e.target.files[0]; if (!file) return; try { const d = await api.upload('/api/me/avatar', file); state.me.avatar = d.avatar; $('[data-av]', box).innerHTML = String(avatar(state.me)); renderChrome(); toast(t('common.saved')); } catch (er) { toast(er.message, { type: 'error' }); } };
  },

  async security(box) {
    let sec;
    try { sec = await api.get('/api/security', { force: true }); } catch (e) { box.innerHTML = `<div class="card">${e.message}</div>`; return; }
    const tf = sec.twoFactor;
    box.innerHTML = String(html`
      <div class="card card-pad" style="display:flex;gap:12px;align-items:center;margin-bottom:12px"><span class="tile tile-lg" style="--c:${tf.totp || tf.email || sec.passkeys.length ? 'var(--green)' : 'var(--orange)'}">${icon('shield')}</span><div><b style="font-size:14px">${tf.totp || tf.email || sec.passkeys.length ? t('sec.status_good') : t('sec.status_improve')}</b><div class="muted" style="font-size:12px">${t('sec.status_sub')}</div></div></div>
      <div class="set-group" style="margin-top:0"><h3>${t('sec.password')}</h3><div class="list set-list"><button class="li" data-pw><span class="tile" style="--c:var(--primary)">${icon('lock')}</span><span class="li-main"><span class="li-title">${sec.hasPassword ? t('sec.change_password') : t('sec.set_password')}</span><span class="li-sub">${sec.passwordChangedAt ? t('sec.changed', { when: relTime(sec.passwordChangedAt) }) : sec.google ? t('sec.google_only') : ''}</span></span>${icon('chevron-right', 'i-sm chev')}</button></div></div>
      ${tf.available ? html`<div class="set-group"><h3>${t('sec.two_step')}</h3><div class="list set-list">
        <div class="li"><span class="tile" style="--c:var(--violet)">${icon('phone')}</span><span class="li-main"><span class="li-title">${t('sec.authenticator')}</span><span class="li-sub">${tf.totp ? t('sec.enabled') : t('sec.authenticator_sub')}</span></span><button class="btn btn-sm ${tf.totp ? 'btn-danger-soft' : 'btn-soft'}" data-totp>${tf.totp ? t('sec.disable') : t('sec.enable')}</button></div>
        <div class="li"><span class="tile" style="--c:var(--orange)">${icon('mail')}</span><span class="li-main"><span class="li-title">${t('sec.email_codes')}</span><span class="li-sub">${tf.email ? t('sec.enabled') : t('sec.email_codes_sub')}</span></span><button class="btn btn-sm ${tf.email ? 'btn-danger-soft' : 'btn-soft'}" data-email2fa>${tf.email ? t('sec.disable') : t('sec.enable')}</button></div>
        ${tf.totp || tf.email ? html`<div class="li"><span class="tile" style="--c:var(--teal)">${icon('key')}</span><span class="li-main"><span class="li-title">${t('sec.recovery_codes')}</span><span class="li-sub">${t('sec.codes_left', { n: tf.recoveryRemaining })}</span></span><button class="btn btn-sm btn-soft" data-codes>${t('sec.regenerate')}</button></div>` : ''}
      </div></div>` : ''}
      ${sec.passkeysEnabled ? html`<div class="set-group"><h3>${t('sec.passkeys')}</h3><div class="list set-list">${sec.passkeys.map((p) => html`<div class="li"><span class="tile" style="--c:var(--primary)">${icon('fingerprint')}</span><span class="li-main"><span class="li-title">${p.name}</span><span class="li-sub">${t('sec.added', { when: fmtDate(p.created_at) })}${p.last_used_at ? ' · ' + t('sec.used', { when: relTime(p.last_used_at) }) : ''}${p.backed_up ? ' · ' + t('sec.synced') : ''}</span></span><button class="icon-btn" data-pk-rename="${p.id}" aria-label="${t('common.rename')}">${icon('edit', 'i-sm')}</button><button class="icon-btn" data-pk-del="${p.id}" aria-label="${t('common.delete')}">${icon('trash', 'i-sm')}</button></div>`)}
        <button class="li" data-pk-add><span class="tile" style="--c:var(--green)">${icon('plus')}</span><span class="li-main"><span class="li-title">${t('sec.add_passkey')}</span><span class="li-sub">${t('sec.passkey_sub')}</span></span></button></div></div>` : ''}
      <div class="set-group"><h3>${t('sec.recent_activity')}</h3><div class="card card-pad"><div class="timeline">${sec.events.map((e) => html`<div class="tl-item" style="--c:${e.severity === 'critical' ? 'var(--red)' : e.severity === 'warning' ? 'var(--orange)' : 'var(--primary)'}"><div style="font-size:12.5px;font-weight:600">${t('secev.' + e.event) === 'secev.' + e.event ? e.event.replace(/_/g, ' ') : t('secev.' + e.event)}</div><div class="muted" style="font-size:11px">${relTime(e.created_at)} · ${e.ip || ''}</div></div>`)}</div></div></div>`);
    const reload = () => RENDER.security(box);
    $('[data-pw]', box).onclick = () => {
      const body = el(html`<form novalidate>${sec.hasPassword ? html`<div class="field"><label>${t('sec.current_password')}</label><input class="input" type="password" name="current" autocomplete="current-password"></div>` : ''}
        <div class="field"><label>${t('reset.new_password')}</label><input class="input" type="password" name="password" autocomplete="new-password"></div><p class="hint">${t('auth.password_rules')}</p><p class="hint" style="margin-top:6px">${t('sec.pw_signout_hint')}</p></form>`);
      const foot = el(html`<button class="btn btn-primary btn-lg btn-block">${t('common.save')}</button>`);
      const s = openSheet({ title: sec.hasPassword ? t('sec.change_password') : t('sec.set_password'), body, foot });
      foot.onclick = () => withBusy(foot, async () => { const f = new FormData(body); try { await api.post('/api/security/password', { current: f.get('current') || undefined, password: f.get('password') }); s.close(); toast(t('sec.password_updated')); reload(); } catch (e) { toast(e.message, { type: 'error' }); formErrors(body, e); } });
    };
    $('[data-totp]', box)?.addEventListener('click', async (ev) => {
      if (tf.totp) { const cred = await stepUp(sec); if (!cred) return; try { await api.post('/api/security/2fa/totp/disable', cred); toast(t('sec.disabled_toast')); reload(); } catch (e) { toast(e.message, { type: 'error' }); } return; }
      let setup; try { setup = await withBusy(ev.currentTarget, () => api.post('/api/security/2fa/totp/setup')); } catch (e) { toast(e.message, { type: 'error' }); return; }
      const body = el(html`<form novalidate><ol style="padding-left:18px;font-size:13px;color:var(--text-2);display:grid;gap:4px;margin:0 0 8px"><li>${t('sec.totp_step1')}</li><li>${t('sec.totp_step2')}</li><li>${t('sec.totp_step3')}</li></ol>
        <img class="qr" src="${setup.qr}" alt="QR code"><p class="hint" style="text-align:center;word-break:break-all">${t('sec.manual_key')}: <b style="font-family:ui-monospace,monospace">${setup.secret.match(/.{1,4}/g).join(' ')}</b></p>
        <div class="field" style="margin-top:10px"><input class="input" name="code" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code" style="text-align:center;font-size:20px;letter-spacing:.3em;font-weight:700"></div></form>`);
      const foot = el(html`<button class="btn btn-primary btn-lg btn-block">${t('sec.verify_enable')}</button>`);
      const s = openSheet({ title: t('sec.authenticator'), body, foot });
      foot.onclick = () => withBusy(foot, async () => { try { const d = await api.post('/api/security/2fa/totp/enable', { code: body.code.value }); s.close(); toast(t('sec.enabled_toast')); if (d.recoveryCodes) setTimeout(() => showCodes(d.recoveryCodes), 300); reload(); } catch (e) { toast(e.message, { type: 'error' }); formErrors(body, e); } });
    });
    $('[data-email2fa]', box)?.addEventListener('click', async () => {
      const cred = await stepUp(sec); if (!cred) return;
      try { const d = await api.post(`/api/security/2fa/email/${tf.email ? 'disable' : 'enable'}`, cred); toast(tf.email ? t('sec.disabled_toast') : t('sec.enabled_toast')); if (d.recoveryCodes) showCodes(d.recoveryCodes); reload(); } catch (e) { toast(e.message, { type: 'error' }); }
    });
    $('[data-codes]', box)?.addEventListener('click', async () => { const cred = await stepUp(sec); if (!cred) return; try { const d = await api.post('/api/security/recovery-codes', cred); showCodes(d.recoveryCodes); reload(); } catch (e) { toast(e.message, { type: 'error' }); } });
    $('[data-pk-add]', box)?.addEventListener('click', async (ev) => {
      if (!window.PublicKeyCredential) { toast(t('auth.passkey_unsupported'), { type: 'error' }); return; }
      const name = await confirmDialog({ title: t('sec.add_passkey'), message: t('sec.passkey_name_prompt'), input: { label: t('sec.passkey_name'), type: 'text' }, confirm: t('common.continue') });
      if (name === false) return;
      await withBusy(ev.currentTarget, async () => {
        try {
          const { loadWebAuthn } = await import('./auth.js'); const { startRegistration } = await loadWebAuthn();
          const opts = await api.post('/api/security/passkeys/options');
          const resp = await startRegistration({ optionsJSON: opts });
          await api.post('/api/security/passkeys/verify', { response: resp, name: name || navigator.platform || 'Passkey' });
          toast(t('sec.passkey_added')); reload();
        } catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') toast(e.message, { type: 'error' }); }
      });
    });
    $$('[data-pk-del]', box).forEach((b) => b.onclick = async () => {
      if (!(await confirmDialog({ title: t('sec.remove_passkey'), message: t('sec.remove_passkey_confirm'), danger: true, confirm: t('common.delete') }))) return;
      const cred = await stepUp(sec); if (!cred) return;
      try { await api.post(`/api/security/passkeys/${b.dataset.pkDel}/delete`, cred); toast(t('common.deleted')); reload(); } catch (e) { toast(e.message, { type: 'error' }); }
    });
    $$('[data-pk-rename]', box).forEach((b) => b.onclick = async () => {
      const name = await confirmDialog({ title: t('common.rename'), message: '', input: { label: t('sec.passkey_name') }, confirm: t('common.save') });
      if (!name) return; try { await api.patch(`/api/security/passkeys/${b.dataset.pkRename}`, { name }); reload(); } catch (e) { toast(e.message, { type: 'error' }); }
    });
  },

  async sessions(box) {
    const sec = await api.get('/api/security', { force: true });
    box.innerHTML = String(html`<div class="list set-list">${sec.sessions.map((s) => html`<div class="li"><span class="tile" style="--c:${s.current ? 'var(--green)' : 'var(--primary)'}">${icon(/Android|iOS/.test(s.device || '') ? 'phone' : 'laptop')}</span><span class="li-main"><span class="li-title">${s.device || t('sec.unknown_device')}${s.current ? html` <span class="badge green">${t('sec.this_device')}</span>` : ''}</span><span class="li-sub">${s.ip || ''} · ${t('sec.via', { method: s.auth_method })} · ${relTime(s.last_seen_at)}</span></span>${s.current ? '' : html`<button class="btn btn-sm btn-danger-soft" data-revoke="${s.id}">${t('sec.sign_out')}</button>`}</div>`)}</div>
      <button class="btn btn-outline btn-block" style="margin-top:12px" data-all>${icon('logout', 'i-sm')}${t('sec.sign_out_others')}</button>`);
    $$('[data-revoke]', box).forEach((b) => b.onclick = async () => { try { await api.post(`/api/security/sessions/${b.dataset.revoke}/revoke`); RENDER.sessions(box); } catch (e) { toast(e.message, { type: 'error' }); } });
    $('[data-all]', box).onclick = async () => { if (await confirmDialog({ title: t('sec.sign_out_others'), message: t('sec.sign_out_others_confirm') })) { await api.post('/api/security/sessions/revoke-others'); toast(t('common.done')); RENDER.sessions(box); } };
  },

  async notifications(box) {
    const p = state.profile; const pushMod = await import('../push.js');
    const perm = pushMod.permission();
    box.innerHTML = String(html`<div class="list set-list" data-toggles>
      ${toggleRow('notify_inapp', t('set.n_inapp'), t('set.n_inapp_sub'), p.notify_inapp, 'bell', 'var(--primary)')}
      ${toggleRow('notify_email', t('set.n_email'), state.config?.mail ? t('set.n_email_sub') : t('set.n_email_off'), p.notify_email, 'mail', 'var(--orange)')}
      ${toggleRow('notify_push', t('set.n_push'), perm === 'unsupported' ? t('push.unsupported') : perm === 'denied' ? t('push.denied') : t('set.n_push_sub'), p.notify_push && perm === 'granted', 'send', 'var(--green)')}
      ${toggleRow('notify_security', t('set.n_security'), t('set.n_security_sub'), p.notify_security, 'shield', 'var(--red)')}</div>
      <button class="btn btn-soft btn-sm" style="margin-top:10px" data-test ${perm === 'granted' ? '' : 'hidden'}>${icon('send', 'i-sm')}${t('push.test')}</button>
      <div class="set-group"><h3>${t('set.reminder_schedule')}</h3><div class="card card-pad"><div class="row"><div class="field"><label>${t('set.days_before')}</label><select class="select" name="reminder_days_before">${[0, 1, 2, 3, 5, 7].map((n) => html`<option value="${n}" ${n === p.reminder_days_before ? 'selected' : ''}>${n === 0 ? t('set.on_due_day') : t('set.n_days', { n })}</option>`)}</select></div>
        <div class="field"><label>${t('set.remind_time')}</label><select class="select" name="reminder_hour">${Array.from({ length: 24 }, (_, h) => html`<option value="${h}" ${h === p.reminder_hour ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`)}</select></div></div><p class="hint">${t('set.reminder_hint')}</p></div></div>`);
    $$('[data-toggles] input', box).forEach((i) => i.onchange = async () => {
      if (i.name === 'notify_push' && i.checked) { try { await pushMod.enable(); $('[data-test]', box).hidden = false; } catch (e) { i.checked = false; toast(e.message, { type: 'error' }); return; } }
      if (i.name === 'notify_push' && !i.checked) await pushMod.disable().catch(() => {});
      await saveProfile({ [i.name]: i.checked });
    });
    $$('select', box).forEach((s) => s.onchange = () => saveProfile({ [s.name]: Number(s.value) }));
    $('[data-test]', box).onclick = () => pushMod.test().catch((e) => toast(e.message, { type: 'error' }));
  },

  async preferences(box) {
    const p = state.profile; const langs = state.config?.languages || []; const cur = state.config?.currencies || [];
    const tzs = (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : ['Asia/Dhaka', 'Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York']);
    box.innerHTML = String(html`<div class="card card-pad"><form data-form>
      <div class="field"><label>${t('set.language')}</label><div class="chips" style="flex-wrap:wrap">${langs.map((l) => html`<button type="button" class="chip ${l.code === p.language ? 'active' : ''}" data-lang="${l.code}"><svg class="i i-sm" viewBox="0 0 24 24"><use href="#globe"/></svg>${l.native}</button>`)}</div></div>
      <div class="field"><label>${t('set.currency')}</label><div class="chips" style="flex-wrap:wrap">${cur.map((c) => html`<button type="button" class="chip ${c.code === p.currency ? 'active' : ''}" data-cur="${c.code}"><b>${c.symbol}</b> ${c.code}</button>`)}</div><span class="hint">${t('set.currency_hint')}</span></div>
      <div class="row"><div class="field"><label>${t('set.date_format')}</label><select class="select" name="date_format">${['DD MMM YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].map((f) => html`<option ${f === p.date_format ? 'selected' : ''}>${f}</option>`)}</select></div>
        <div class="field"><label>${t('set.time_format')}</label><select class="select" name="time_format"><option value="12" ${p.time_format === '12' ? 'selected' : ''}>${t('set.12h')}</option><option value="24" ${p.time_format === '24' ? 'selected' : ''}>${t('set.24h')}</option></select></div></div>
      <div class="field"><label>${t('set.timezone')}</label><select class="select" name="timezone">${tzs.map((z) => html`<option ${z === p.timezone ? 'selected' : ''}>${z}</option>`)}</select></div></form></div>`);
    $$('[data-lang]', box).forEach((b) => b.onclick = async () => { if (await saveProfile({ language: b.dataset.lang }, false)) { await loadLang(b.dataset.lang); clearCache(); location.reload(); } });
    $$('[data-cur]', box).forEach((b) => b.onclick = async () => { if (await saveProfile({ currency: b.dataset.cur })) { $$('[data-cur]', box).forEach((x) => x.classList.toggle('active', x === b)); emit('data:changed'); } });
    $$('select', box).forEach((s) => s.onchange = () => saveProfile({ [s.name]: s.value }));
  },

  async theme(box) {
    const cur = document.documentElement.dataset.theme;
    let rm = false; try { rm = localStorage.getItem('lt-reduce-motion') === '1'; } catch {}
    box.innerHTML = String(html`<div class="card card-pad"><div class="label" style="margin-bottom:8px">${t('set.appearance')}</div>
      <div class="seg" data-theme-seg style="display:flex"><button data-v="light" class="${cur === 'light' ? 'active' : ''}" style="flex:1">${icon('sun', 'i-sm')}${t('theme.light')}</button><button data-v="dark" class="${cur === 'dark' ? 'active' : ''}" style="flex:1">${icon('moon', 'i-sm')}${t('theme.night')}</button></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
        <div style="border-radius:14px;overflow:hidden;border:1px solid #E6EBF2;background:#F4F6FB;padding:10px"><div style="height:34px;border-radius:9px;background:linear-gradient(135deg,#1B45C9,#0D9AA6)"></div><div style="display:flex;gap:6px;margin-top:6px"><div style="flex:1;height:22px;border-radius:7px;background:#fff"></div><div style="flex:1;height:22px;border-radius:7px;background:#fff"></div></div><div style="font-size:11px;margin-top:6px;color:#3E4C63;font-weight:600">${t('theme.light')} · ${t('theme.default')}</div></div>
        <div style="border-radius:14px;overflow:hidden;border:1px solid #1C2842;background:#070C18;padding:10px"><div style="height:34px;border-radius:9px;background:linear-gradient(135deg,#16307F,#0C7C88)"></div><div style="display:flex;gap:6px;margin-top:6px"><div style="flex:1;height:22px;border-radius:7px;background:#0E1628"></div><div style="flex:1;height:22px;border-radius:7px;background:#0E1628"></div></div><div style="font-size:11px;margin-top:6px;color:#B3C0D6;font-weight:600">${t('theme.night')}</div></div></div>
      <p class="hint" style="margin-top:10px">${t('theme.sync_hint')}</p></div>
      <div class="list set-list" style="margin-top:12px">${toggleRow('rm', t('set.reduce_motion'), t('set.reduce_motion_sub'), rm, 'activity', 'var(--teal)')}</div>`);
    segmented($('[data-theme-seg]', box), (v) => applyTheme(v));
    $('[name=rm]', box).onchange = (e) => { try { localStorage.setItem('lt-reduce-motion', e.target.checked ? '1' : '0'); } catch {} document.documentElement.classList.toggle('reduce-motion', e.target.checked); };
  },

  async categories(box) {
    const cats = await api.get('/api/categories', { force: true });
    const ICONS = ['tag', 'utensils', 'car', 'bag', 'bolt', 'house', 'heart', 'book', 'film', 'wifi', 'users', 'plane', 'gift', 'briefcase', 'laptop', 'store', 'percent', 'coin', 'gem', 'vault', 'trend-up', 'graduation', 'bike', 'phone'];
    const COLORS = ['#2F62F0', '#0EA5A0', '#16A34A', '#F59E0B', '#F97316', '#EF4444', '#EC4899', '#8B5CF6', '#64748B', '#0891B2'];
    const kinds = ['expense', 'income', 'investment'];
    box.innerHTML = String(html`${kinds.map((k) => html`<div class="set-group" style="margin-top:0;margin-bottom:12px"><h3>${t('cat.kind.' + k)}</h3><div class="card" style="padding:10px"><div class="cat-pick">${cats.filter((c) => c.kind === k).map((c) => html`<button data-id="${c.id}"><span class="tile" style="--c:${c.color}">${icon(c.icon)}</span>${c.name}</button>`)}<button data-new="${k}"><span class="tile" style="--c:var(--muted)">${icon('plus')}</span>${t('common.add')}</button></div></div></div>`)}`);
    const edit = (c, kind) => {
      let ic = c?.icon || 'tag'; let col = c?.color || COLORS[0];
      const body = el(html`<form novalidate><div class="field"><label>${t('cat.name')}</label><input class="input" name="name" maxlength="60" value="${c?.name || ''}"></div>
        <div class="field"><label>${t('cat.icon')}</label><div class="chips" style="flex-wrap:wrap" data-icons>${ICONS.map((i) => html`<button type="button" class="chip ${i === ic ? 'active' : ''}" data-i="${i}" style="padding:0 9px">${icon(i, 'i-sm')}</button>`)}</div></div>
        <div class="field"><label>${t('cat.color')}</label><div class="chips" style="flex-wrap:wrap" data-colors>${COLORS.map((x) => html`<button type="button" class="chip ${x === col ? 'active' : ''}" data-c="${x}" style="width:32px;padding:0;background:${x};border-color:${x}"></button>`)}</div></div></form>`);
      const foot = el(html`<div style="display:flex;gap:10px;width:100%">${c ? html`<button class="btn btn-danger-soft" data-del>${icon('trash', 'i-sm')}</button>` : ''}<button class="btn btn-primary btn-block" data-save>${t('common.save')}</button></div>`);
      const s = openSheet({ title: c ? t('cat.edit') : t('cat.new'), body, foot });
      $$('[data-i]', body).forEach((b) => b.onclick = () => { ic = b.dataset.i; $$('[data-i]', body).forEach((x) => x.classList.toggle('active', x === b)); });
      $$('[data-c]', body).forEach((b) => b.onclick = () => { col = b.dataset.c; $$('[data-c]', body).forEach((x) => { x.classList.toggle('active', x === b); x.style.boxShadow = x === b ? '0 0 0 3px var(--primary-soft)' : ''; }); });
      foot.querySelector('[data-save]').onclick = (e) => withBusy(e.currentTarget, async () => { try { c ? await api.patch(`/api/categories/${c.id}`, { name: body.name.value, icon: ic, color: col }) : await api.post('/api/categories', { name: body.name.value, kind, icon: ic, color: col }); state.categories = null; s.close(); RENDER.categories(box); } catch (er) { toast(er.message, { type: 'error' }); formErrors(body, er); } });
      foot.querySelector('[data-del]')?.addEventListener('click', async () => { try { await api.del(`/api/categories/${c.id}`); state.categories = null; s.close(); RENDER.categories(box); } catch (er) { toast(er.message, { type: 'error' }); } });
    };
    $$('[data-id]', box).forEach((b) => b.onclick = () => { const c = cats.find((x) => String(x.id) === b.dataset.id); if (c.system) return; edit(c); });
    $$('[data-new]', box).forEach((b) => b.onclick = () => edit(null, b.dataset.new));
  },

  async backup(box) {
    box.innerHTML = String(html`<div class="list set-list">
      <a class="li" href="/api/me/export" download><span class="tile" style="--c:var(--primary)">${icon('database')}</span><span class="li-main"><span class="li-title">${t('set.export_json')}</span><span class="li-sub">${t('set.export_json_sub')}</span></span>${icon('download', 'i-sm chev')}</a>
      <a class="li" href="/api/me/export.csv" download><span class="tile" style="--c:var(--green)">${icon('layers')}</span><span class="li-main"><span class="li-title">${t('set.export_csv')}</span><span class="li-sub">${t('set.export_csv_sub')}</span></span>${icon('download', 'i-sm chev')}</a></div>
      <div class="alert" style="margin-top:12px">${icon('info', 'i-sm')}<span>${t('set.backup_hint')}</span></div>`);
  },

  async privacy(box) {
    box.innerHTML = String(html`<div class="list set-list">${toggleRow('hide_balances', t('set.hide_balances'), t('set.hide_balances_sub'), state.profile.hide_balances, 'eye-off', 'var(--primary)')}</div>
      <div class="set-group"><h3>${t('set.danger_zone')}</h3><div class="card card-pad"><p class="muted" style="font-size:12.5px;margin-bottom:10px">${t('set.delete_account_sub')}</p><button class="btn btn-danger" data-delete>${icon('trash', 'i-sm')}${t('set.delete_account')}</button></div></div>`);
    $('[name=hide_balances]', box).onchange = (e) => saveProfile({ hide_balances: e.target.checked });
    $('[data-delete]', box).onclick = async () => {
      const v = await confirmDialog({ title: t('set.delete_account'), message: t('set.delete_account_confirm'), danger: true, confirm: t('common.delete'), input: state.me.hasPassword ? { label: t('auth.password'), type: 'password', autocomplete: 'current-password' } : { label: t('set.type_delete') } });
      if (v === false) return;
      try { await api.post('/api/me/delete', state.me.hasPassword ? { password: v } : { confirm: v }); location.href = '/'; } catch (e) { toast(e.message, { type: 'error' }); }
    };
  },

  async help(box) {
    const faqs = ['sync', 'offline', 'security', 'reminders', 'currency', 'install'];
    box.innerHTML = String(html`<div class="card">${faqs.map((k) => html`<details style="border-bottom:1px solid var(--line);padding:12px 14px"><summary style="font-weight:600;font-size:13.5px;cursor:pointer">${t('faq.' + k + '.q')}</summary><p class="muted" style="font-size:12.5px;margin-top:6px">${t('faq.' + k + '.a')}</p></details>`)}</div>
      <div class="alert" style="margin-top:12px">${icon('mail', 'i-sm')}<span>${t('set.help_contact')}</span></div>`);
  },

  async about(box) {
    box.innerHTML = String(html`<div class="card card-pad" style="text-align:center"><svg style="width:56px;height:56px;margin:0 auto 10px;border-radius:16px"><use href="#logo"/></svg><b style="font-size:17px">${state.config?.site}</b><p class="muted" style="font-size:12.5px">${state.config?.tagline}</p>
      <dl class="kv" style="margin-top:14px;text-align:left"><dt>${t('about.version')}</dt><dd>1.0.0</dd><dt>${t('about.platform')}</dt><dd>PWA · Node.js</dd><dt>${t('about.languages')}</dt><dd>English · বাংলা · हिन्दी</dd><dt>${t('about.mode')}</dt><dd>${matchMedia('(display-mode: standalone)').matches ? t('about.installed') : t('about.browser')}</dd></dl></div>`);
  },
};

export function section(ctx) {
  const key = ctx.params.section;
  if (!RENDER[key]) { ctx.navigate('/app/settings', { replace: true }); return { el: el('<div></div>') }; }
  const page = el(html`<div><header class="ph"><a class="icon-btn back" href="/app/settings" aria-label="${t('common.back')}">${icon('chevron-left')}</a><h1>${t('set.' + key)}</h1></header>
    <div class="settings-wrap"><aside class="desk-menu" style="display:none">${menu(key)}</aside><div data-box><div class="card card-pad"><div class="sk" style="height:140px"></div></div></div></div></div>`);
  if (matchMedia('(min-width: 1000px)').matches) page.querySelector('.desk-menu').style.display = 'block';
  const box = $('[data-box]', page);
  const run = () => RENDER[key](box).catch((e) => { box.innerHTML = `<div class="card card-pad">${e.message}</div>`; });
  run();
  return { el: page, title: t('set.' + key), refresh: run };
}
