import { api, esc, $, $$, pageHead, toast, toastError, withLoading, formData, fieldsHtml } from './kit.js';

const ZONES = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return ['UTC']; } })();

const UPLOADS = [
  ['logo', 'logo_url', 'Logo', 'Shown next to the site name everywhere'],
  ['favicon', 'favicon_url', 'Favicon', '64×64 square'],
  ['pwa_icon', 'pwa_icon_url', 'PWA app icon', '512×512 square — used for “Add to Home Screen”'],
  ['login_background', 'login_background_url', 'Login background', 'Wide image behind the login card'],
  ['binance_qr', 'binance_qr_url', 'Binance Pay QR', 'Optional — otherwise generated from the UID/link'],
];

export async function mount(el, ctx) {
  const reload = () => ctx.navigate('/admin/settings', { replace: true, scroll: false });
  const { settings: s, has_sharp: sharp } = await api('/admin/settings');
  const sections = {
    branding: fieldsHtml([
      { name: 'site_name', label: 'Site name', value: s.site_name, required: true },
      { name: 'site_subtitle', label: 'Subtitle', value: s.site_subtitle },
      { name: 'primary_color', label: 'Primary color', type: 'color', value: s.primary_color },
      { name: 'accent_color', label: 'Accent color', type: 'color', value: s.accent_color },
      { name: 'default_theme', label: 'Default theme', type: 'select', value: s.default_theme, options: [['light', 'Light'], ['dark', 'Dark']] },
      { name: 'default_timezone', label: 'Default timezone', type: 'select', value: s.default_timezone, options: ZONES.map((z) => [z, z]) },
      { name: 'footer_text', label: 'Footer', value: s.footer_text, full: true },
    ]),
    accounts: fieldsHtml([
      { name: 'registration_enabled', label: 'Allow new registrations', type: 'switch', value: s.registration_enabled === '1' },
      { name: 'require_email_verification', label: 'Require email verification', type: 'switch', value: s.require_email_verification === '1' },
      { name: 'news_demo_engagement_enabled', label: 'Show admin demo engagement on news (labelled DEMO)', type: 'switch', value: s.news_demo_engagement_enabled === '1' },
      { name: 'live_activity_show_code', label: 'Live Activity: show OTP codes', type: 'switch', value: s.live_activity_show_code === '1', hint: 'Off = "OTP received" only. Numbers always stay masked.' },
    ]),
    wallet: fieldsHtml([
      { name: 'event_reward', label: 'Reward per valid event ($)', value: s.event_reward },
      { name: 'min_withdrawal', label: 'Minimum withdrawal ($)', value: s.min_withdrawal },
      { name: 'currency_symbol', label: 'Currency symbol', value: s.currency_symbol },
      { name: 'assignment_timeout_minutes', label: 'Return unused number after (minutes)', type: 'number', value: s.assignment_timeout_minutes },
      { name: 'notification_ttl_hours', label: 'Remove notifications after (hours)', type: 'number', value: s.notification_ttl_hours },
      { name: 'feed_page_size', label: 'Records per page (feeds)', type: 'number', value: s.feed_page_size },
      { name: 'api_polling_default', label: 'Default API polling (seconds)', type: 'number', value: s.api_polling_default },
    ]),
    payments: fieldsHtml([
      { name: 'trc20_address', label: 'TRC20 (USDT) wallet address', value: s.trc20_address, full: true, placeholder: 'T…' },
      { name: 'trc20_network_note', label: 'TRC20 note', value: s.trc20_network_note, full: true },
      { name: 'binance_uid', label: 'Binance Pay UID', value: s.binance_uid },
      { name: 'binance_name', label: 'Binance account name', value: s.binance_name },
      { name: 'binance_pay_link', label: 'Binance Pay direct link', value: s.binance_pay_link, full: true, placeholder: 'https://app.binance.com/…' },
      { name: 'upload_max_mb', label: 'Max screenshot size (MB)', type: 'number', value: s.upload_max_mb },
      { type: 'html', html: `<div class="field" style="grid-column:1/-1"><label>Binance Pay QR code</label>
        <div class="row-flex">${s.binance_qr_url ? `<img src="${esc(s.binance_qr_url)}" alt="Binance QR" style="width:84px;height:84px;border-radius:12px;background:#fff;padding:4px;object-fit:contain">` : '<span class="small muted">No QR uploaded — one is generated from the UID/link.</span>'}
        <label class="btn btn-soft btn-sm">Upload QR<input type="file" hidden accept="image/jpeg,image/png,image/webp" data-upload="binance_qr"></label>
        ${s.binance_qr_url ? '<button type="button" class="btn btn-ghost btn-sm" data-clear="binance_qr_url">Remove</button>' : ''}</div></div>` },
    ]),
    pwa: fieldsHtml([
      { name: 'pwa_name', label: 'App name', value: s.pwa_name },
      { name: 'pwa_short_name', label: 'Short name', value: s.pwa_short_name },
      { name: 'pwa_theme_color', label: 'Theme color', type: 'color', value: s.pwa_theme_color },
      { name: 'pwa_background_color', label: 'Background color', type: 'color', value: s.pwa_background_color },
    ]),
  };
  const titles = { branding: 'Branding', accounts: 'Accounts', wallet: 'Wallet & limits', payments: 'Payment methods', pwa: 'PWA' };
  el.innerHTML = `${pageHead('fa-solid fa-sliders', 'System Settings', 'Branding, payments, wallet, PWA and more')}
  <div class="grid grid-2">
    ${Object.entries(sections).map(([k, html]) => `<div class="card"><div class="card-head"><h2>${titles[k]}</h2></div><form data-section="${k}"><div class="form-grid two">${html}</div>
      <button class="btn btn-primary" type="submit">Save ${titles[k]}</button></form></div>`).join('')}
    <div class="card"><div class="card-head"><h2>Images</h2>${sharp ? '<span class="chip success">auto-compress</span>' : ''}</div>
      <div class="list">${UPLOADS.map(([t, key, label, hint]) => `<div class="list-item">
        ${s[key] ? `<img src="${esc(s[key])}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:12px">` : '<span class="li-ic system"><i class="fa-solid fa-image"></i></span>'}
        <div class="li-body"><div class="li-title">${label}</div><div class="li-sub">${hint}</div></div>
        <label class="btn btn-soft btn-xs">Upload<input type="file" hidden accept="image/jpeg,image/png,image/webp" data-upload="${t}"></label>
        ${s[key] ? `<button class="btn btn-ghost btn-xs" data-clear="${key}" title="Remove"><i class="fa-solid fa-xmark"></i></button>` : ''}</div>`).join('')}</div>
      <p class="small muted">JPG, PNG or WEBP. Files are validated by content and re-encoded server-side.</p></div>
  </div>`;

  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    for (const [k, v] of Object.entries(d)) if (typeof v === 'boolean') d[k] = v ? '1' : '0';
    await withLoading(e.submitter, async () => { try { toast((await api('/admin/settings', { method: 'PUT', body: d })).message); } catch (err) { toastError(err); } });
  });
  el.addEventListener('change', async (e) => {
    const f = e.target.closest('[data-upload]');
    if (!f || !f.files[0]) return;
    const fd = new FormData();
    fd.append('file', f.files[0]);
    try { toast((await api(`/admin/settings/upload/${f.dataset.upload}`, { method: 'POST', form: fd })).message); reload(); } catch (err) { toastError(err); }
  });
  el.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-clear]');
    if (!c) return;
    try { await api('/admin/settings', { method: 'PUT', body: { [c.dataset.clear]: '' } }); toast('Removed'); reload(); } catch (err) { toastError(err); }
  });
}
