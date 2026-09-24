/* Installation wizard (10 steps). Talks to /install/api/*; cookie-bound installer key. */
const $ = (s, r = document) => r.querySelector(s);
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

async function call(path, { method = 'GET', body, form } = {}) {
  const headers = { Accept: 'application/json', 'X-Installer': '1' };
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(`/install/api/${path}`, { method, headers, body: form || (body ? JSON.stringify(body) : undefined), credentials: 'same-origin' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}

const data = { site_name: 'Premium Aura', site_subtitle: 'Vip Acess Only' };
const field = (name, label, { type = 'text', value = '', placeholder = '', hint = '' } = {}) => `<div class="field"><label for="i-${name}">${label}</label>
  <input class="input" id="i-${name}" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off">${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;

const STEPS = [
  {
    title: 'System requirements', icon: 'fa-list-check',
    async render() {
      const r = await call('requirements');
      this.ok = r.passed;
      return r.checks.map((c) => `<div class="req"><div>${esc(c.name)}${c.value ? `<div class="v">${esc(c.value)}</div>` : ''}</div>
        <i class="fa-solid ${c.ok ? 'fa-circle-check ok' : c.optional ? 'fa-circle-minus opt' : 'fa-circle-xmark bad'}"></i></div>`).join('')
        + (r.passed ? '' : '<div class="alert error" style="margin-top:12px">Fix the failed requirements and reload.</div>');
    },
    async submit() { if (!this.ok) throw new Error('Requirements not met'); },
  },
  {
    title: 'MySQL database', icon: 'fa-database',
    render: () => `<p class="muted small">MySQL 8+ credentials. The database is created if it does not exist. Credentials are saved to <code>.env</code> (not the database).</p>
      <div class="form-grid two">${field('host', 'Host', { value: '127.0.0.1' })}${field('port', 'Port', { type: 'number', value: '3306' })}</div>
      ${field('database', 'Database name', { value: 'premium_aura' })}${field('user', 'Username', { value: '' })}${field('password', 'Password', { type: 'password' })}`,
    async submit(f) { const r = await call('database', { method: 'POST', body: f }); return r.message; },
  },
  {
    title: 'Create tables', icon: 'fa-table',
    render: () => '<p class="muted">Creates all tables (users, wallets, events, providers, news, …) with keys and indexes, then inserts defaults: plans, sample services, API provider templates and settings.</p>',
    async submit() { const r = await call('tables', { method: 'POST' }); return r.message; },
    cta: 'Create tables',
  },
  {
    title: 'Administrator account', icon: 'fa-user-shield',
    render: () => `${field('name', 'Name', { value: 'Admin' })}${field('email', 'Email', { type: 'email', placeholder: 'admin@example.com' })}
      ${field('password', 'Password', { type: 'password', hint: 'At least 8 characters with letters and numbers' })}`,
    async submit(f) { const r = await call('admin', { method: 'POST', body: f }); return r.message; },
  },
  {
    title: 'Site name', icon: 'fa-signature',
    render: () => `${field('site_name', 'Site name', { value: data.site_name })}${field('app_url', 'Public URL', { value: location.origin, hint: 'Used in emails and SEO links' })}
      <div class="form-grid two">${field('primary_color', 'Primary color', { type: 'color', value: '#2563eb' })}${field('accent_color', 'Accent color', { type: 'color', value: '#7c3aed' })}</div>`,
    async submit(f) { data.site_name = f.site_name; await call('site', { method: 'POST', body: f }); },
  },
  {
    title: 'Site subtitle', icon: 'fa-heading',
    render: () => `${field('site_subtitle', 'Subtitle', { value: data.site_subtitle })}${field('default_timezone', 'Default timezone', { value: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' })}`,
    async submit(f) { await call('site', { method: 'POST', body: f }); },
  },
  {
    title: 'Logo', icon: 'fa-image', optional: true,
    render: () => `<p class="muted small">Upload a square logo (JPG, PNG or WEBP, max 5 MB). It is also used as the PWA app icon. You can skip and change it later.</p>
      <input class="input" type="file" name="logo" accept="image/jpeg,image/png,image/webp"><div data-prev style="margin-top:10px"></div>`,
    async submit(f, el) {
      const file = $('[name=logo]', el).files[0];
      if (!file) return 'Skipped';
      const fd = new FormData(); fd.append('logo', file);
      const r = await call('logo', { method: 'POST', form: fd });
      return r.message;
    },
  },
  {
    title: 'SMTP (email)', icon: 'fa-envelope', optional: true,
    render: () => `<p class="muted small">Used for verification, password reset and alerts. Skip to write emails to <code>logs/mail.log</code> instead.</p>
      <div class="form-grid two">${field('host', 'SMTP host', { placeholder: 'smtp.example.com' })}${field('port', 'Port', { type: 'number', value: '587' })}</div>
      <div class="form-grid two">${field('username', 'Username')}${field('password', 'Password', { type: 'password' })}</div>
      <div class="field"><label>Encryption</label><select class="input" name="encryption"><option value="tls">STARTTLS</option><option value="ssl">SSL/TLS</option><option value="none">None</option></select></div>
      <div class="form-grid two">${field('from_name', 'From name', { value: data.site_name })}${field('from_email', 'From email', { type: 'email' })}</div>`,
    async submit(f) { const r = await call('smtp', { method: 'POST', body: f.host ? f : { skip: true } }); return r.message; },
  },
  {
    title: 'PWA settings', icon: 'fa-mobile-screen-button',
    render: () => `${field('pwa_name', 'App name', { value: data.site_name })}${field('pwa_short_name', 'Short name', { value: 'Aura' })}
      <div class="form-grid two">${field('pwa_theme_color', 'Theme color', { type: 'color', value: '#2563eb' })}${field('pwa_background_color', 'Background color', { type: 'color', value: '#ffffff' })}</div>`,
    async submit(f) { const r = await call('pwa', { method: 'POST', body: f }); return r.message; },
  },
  {
    title: 'Finish', icon: 'fa-flag-checkered',
    render: () => '<p>Everything is ready. Finishing creates <code>install/installed.lock</code>, disables this wizard and takes you to the login page.</p>',
    async submit() { const r = await call('finish', { method: 'POST' }); setTimeout(() => { location.href = r.redirect || '/login'; }, 700); return r.message; },
    cta: 'Finish installation',
  },
];

let idx = 0;

async function show(i) {
  idx = i;
  const s = STEPS[i];
  $('#steps').innerHTML = STEPS.map((_, n) => `<li class="${n < i ? 'done' : n === i ? 'current' : ''}"></li>`).join('');
  const el = $('#step');
  el.innerHTML = '<div class="skeleton sk-block" style="height:160px"></div>';
  let body;
  try { body = await s.render(); } catch (err) { body = `<div class="alert error">${esc(err.message)}</div>`; }
  el.innerHTML = `<div class="step-label">Step ${i + 1} of ${STEPS.length}</div><h1><i class="fa-solid ${s.icon}"></i> ${esc(s.title)}</h1>
    <div data-msg></div><form data-f novalidate>${body}
    <div class="wizard-foot">${i > 3 ? '<button type="button" class="btn btn-ghost" data-back>Back</button>' : ''}
    <button class="btn btn-primary" type="submit">${esc(s.cta || (s.optional ? 'Save & continue' : 'Continue'))}</button></div></form>`;
  el.querySelector('input')?.focus();
}

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type=submit]');
  const fields = Object.fromEntries([...form.elements].filter((x) => x.name && x.type !== 'file').map((x) => [x.name, x.value]));
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const msg = await STEPS[idx].submit.call(STEPS[idx], fields, form);
    if (msg) $('[data-msg]').innerHTML = `<div class="alert success">${esc(msg)}</div>`;
    if (idx < STEPS.length - 1) setTimeout(() => show(idx + 1), msg ? 500 : 0);
  } catch (err) {
    $('[data-msg]').innerHTML = `<div class="alert error"><i class="fa-solid fa-circle-exclamation"></i> ${esc(err.message)}</div>`;
  } finally { btn.classList.remove('loading'); btn.disabled = false; }
});
document.addEventListener('click', (e) => { if (e.target.closest('[data-back]')) show(idx - 1); });
show(0);
