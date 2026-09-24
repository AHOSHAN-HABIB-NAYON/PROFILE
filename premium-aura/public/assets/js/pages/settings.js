import { api, esc, $, toast, toastError, pageHead, applyTheme, withLoading, state } from '../core.js';
import { canInstall, promptInstall } from '../app.js';

const ZONES = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return ['UTC', 'Asia/Dhaka', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Baghdad', 'Europe/London', 'America/New_York']; } })();

export async function mount(el, ctx) {
  const p = await api('/profile');
  const u = p.user;
  let sound = 'on';
  try { sound = localStorage.getItem('aura.sound') || 'on'; } catch { /* ignore */ }
  const standalone = matchMedia('(display-mode: standalone)').matches;
  el.innerHTML = `${pageHead('fa-solid fa-gear', 'Settings', 'Personalize your app')}
  <div class="grid grid-2">
    <div class="card"><div class="card-head"><h2>Appearance</h2></div>
      <div class="theme-toggle"><button data-theme-set="light"><i class="fa-solid fa-sun"></i>Light</button><button data-theme-set="dark"><i class="fa-solid fa-moon"></i>Dark</button></div>
      <p class="small muted" style="margin-top:10px">Saved to this device and your profile. Switches instantly — no reload.</p></div>
    <div class="card"><div class="card-head"><h2>Notifications</h2></div>
      <label class="switch"><input type="checkbox" data-sound ${sound !== 'off' ? 'checked' : ''}><span class="track"></span><span>Play sound for new OTPs & notifications</span></label></div>
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

  $('[data-sound]', el).addEventListener('change', (e) => { try { localStorage.setItem('aura.sound', e.target.checked ? 'on' : 'off'); } catch { /* ignore */ } });
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
