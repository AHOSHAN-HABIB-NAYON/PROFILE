import { api, esc, $, toast, toastError, pageHead, applyTheme, withLoading, state } from '../core.js';
import { canInstall, promptInstall } from '../app.js';
import { pushSupported, currentSubscription, enablePush, disablePush } from '../push.js';

const ZONES = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return ['UTC', 'Asia/Dhaka', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Baghdad', 'Europe/London', 'America/New_York']; } })();

export async function mount(el, ctx) {
  const p = await api('/profile');
  const u = p.user;
  let sound = 'on';
  try { sound = localStorage.getItem('aura.sound') || 'on'; } catch { /* ignore */ }
  const standalone = matchMedia('(display-mode: standalone)').matches;
  const n = u.notify || { inapp: true, email: true, push: true, security: true };
  const prefRow = (key, icon, tone, title, sub, on) => `<label class="pref-row"><span class="pref-ic ${tone}"><i class="${icon}"></i></span>
    <span class="pref-text"><strong>${title}</strong><small>${sub}</small></span>
    <span class="switch"><input type="checkbox" data-pref="${key}" ${on ? 'checked' : ''}><span class="track"></span></span></label>`;
  el.innerHTML = `${pageHead('fa-solid fa-gear', 'Settings', 'Personalize your app')}
  <div class="grid grid-2">
    <div class="card"><div class="card-head"><h2>Appearance</h2></div>
      <div class="theme-toggle"><button data-theme-set="light"><i class="fa-solid fa-sun"></i>Light</button><button data-theme-set="dark"><i class="fa-solid fa-moon"></i>Dark</button></div>
      <p class="small muted" style="margin-top:10px">Saved to this device and your profile. Switches instantly — no reload.</p></div>
    <div class="card"><div class="card-head"><h2>Notifications</h2></div>
      <div class="pref-list">
        ${prefRow('inapp', 'fa-regular fa-bell', 'blue', 'In-app notifications', 'Show alerts inside Premium Aura', n.inapp)}
        ${prefRow('email', 'fa-regular fa-envelope', 'orange', 'Email notifications', 'News and updates by email', n.email)}
        ${prefRow('push', 'fa-regular fa-paper-plane', 'green', 'Push notifications', 'OTPs and alerts on this device even when the app is closed', false)}
        ${prefRow('security', 'fa-solid fa-shield-halved', 'red', 'Security alerts', 'Password and 2FA changes', n.security)}
        ${prefRow('sound', 'fa-solid fa-volume-high', 'purple', 'Sound', 'Play a sound for new OTPs & notifications', sound !== 'off')}
      </div>
      <p class="small muted" data-push-hint style="margin:8px 0 0"></p></div>
    <div class="card"><div class="card-head"><h2>Timezone</h2></div>
      <form data-tz><div class="field"><label>Display times in</label><select class="input" name="timezone">
        <option value="auto" ${u.timezone === 'auto' ? 'selected' : ''}>Local timezone (${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)})</option>
        ${ZONES.map((z) => `<option ${z === u.timezone ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select>
        <span class="hint">All times are stored in UTC and converted for display.</span></div>
        <button class="btn btn-primary" type="submit">Save</button></form></div>
    <div class="card"><div class="card-head"><h2>Install App</h2></div>
      <p class="muted">${standalone ? 'You are using the installed app. 🎉' : 'Add Premium Aura to your home screen for a full-screen, app-like experience.'}</p>
      ${standalone ? '' : `<button class="btn btn-primary" data-install ${canInstall() ? '' : 'disabled'}><i class="fa-solid fa-mobile-screen-button"></i>Add to Home Screen</button>
      <p class="small muted" style="margin-top:8px">On iPhone: tap <i class="fa-solid fa-arrow-up-from-bracket"></i> Share → “Add to Home Screen”.</p>`}</div>
  </div>`;
  applyTheme(document.documentElement.dataset.theme, { persist: false });

  // Push: the switch shows whether THIS device is subscribed.
  const pushBox = $('[data-pref=push]', el);
  const hint = (t) => { $('[data-push-hint]', el).textContent = t; };
  if (!pushSupported()) { pushBox.disabled = true; hint('Push is not supported in this browser. On iPhone, add the app to the Home Screen first.'); }
  else {
    currentSubscription().then((sub) => { pushBox.checked = !!sub && n.push; }).catch(() => {});
    if (Notification.permission === 'denied') hint('Notifications are blocked for this site — allow them in your browser settings.');
  }
  el.addEventListener('change', async (e) => {
    const box = e.target.closest('[data-pref]');
    if (!box) return;
    const key = box.dataset.pref;
    if (key === 'sound') { try { localStorage.setItem('aura.sound', box.checked ? 'on' : 'off'); } catch { /* ignore */ } toast(box.checked ? 'Sound on' : 'Sound off'); return; }
    box.disabled = true;
    try {
      if (key === 'push') {
        if (box.checked) { await enablePush(); await api('/profile/notifications', { method: 'PUT', body: { push: true } }); toast('Push notifications enabled on this device'); hint(''); }
        else { await disablePush(); toast('Push notifications turned off on this device'); }
      } else {
        await api('/profile/notifications', { method: 'PUT', body: { [key]: box.checked } });
        if (state.user.notify) state.user.notify[key] = box.checked;
        toast('Saved');
      }
    } catch (err) { box.checked = !box.checked; toastError(err); } finally { box.disabled = false; }
  });
  $('[data-tz]', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    await withLoading(e.submitter, async () => {
      try {
        await api('/profile', { method: 'PUT', body: { name: u.name, address: u.address, binance_uid: u.binance_uid, timezone: e.target.timezone.value } });
        state.user.timezone = e.target.timezone.value;
        toast('Timezone saved');
      } catch (err) { toastError(err); }
    });
  });
  $('[data-install]', el)?.addEventListener('click', async () => { if (await promptInstall()) toast('Installed!'); });
  return ctx.live.on('pwa:installable', () => { const b = $('[data-install]', el); if (b) b.disabled = false; });
}
