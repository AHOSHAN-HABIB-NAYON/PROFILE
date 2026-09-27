/* First-run installer UI */
const $ = (s) => document.querySelector(s);
const form = $('#f');
const cookie = (n) => document.cookie.split('; ').find((c) => c.startsWith(n + '='))?.split('=')[1] || '';
async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': cookie('lt_csrf') }, body: JSON.stringify(body), credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) { const e = new Error(j.error?.message || 'Request failed'); e.fields = j.error?.fields; throw e; }
  return j.data;
}
const data = () => { const o = Object.fromEntries(new FormData(form)); o.smtp_secure = !!form.smtp_secure.checked; o.db_port = Number(o.db_port) || 3306; o.smtp_port = Number(o.smtp_port) || 587; Object.keys(o).forEach((k) => { if (o[k] === '') delete o[k]; }); return o; };
function show(n) {
  document.querySelectorAll('[data-step]').forEach((s) => { s.hidden = s.dataset.step !== String(n); });
  document.querySelectorAll('.ins-steps li').forEach((l) => { l.classList.toggle('active', Number(l.dataset.s) === n); l.classList.toggle('done', Number(l.dataset.s) < n); });
}
function fieldErrors(e) {
  document.querySelectorAll('.field.error').forEach((f) => { f.classList.remove('error'); f.querySelector('.err')?.remove(); });
  for (const [k, v] of Object.entries(e.fields || {})) { const i = form.querySelector(`[name="${k}"]`); const f = i?.closest('.field'); if (f) { f.classList.add('error'); const s = document.createElement('span'); s.className = 'err'; s.textContent = v.replace(/_/g, ' '); f.append(s); } }
}
function busy(btn, on) { btn.disabled = on; btn.dataset.label = btn.dataset.label || btn.textContent; btn.textContent = on ? 'Please wait…' : btn.dataset.label; }
(async () => {
  await fetch('/api/install/status').then((r) => r.json()).then((j) => {
    const d = j.data || {};
    if (d.installed) location.href = '/';
    if (d.tokenRequired) $('[data-token]').hidden = false;
    const df = d.defaults || {}; for (const k of ['db_host', 'db_port', 'db_user', 'db_name']) if (df[k]) form[k].value = df[k];
  }).catch(() => {});
  form.site_url.value = location.origin;
  try { form.timezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Dhaka'; } catch {}
})();
document.querySelector('[data-next="1"]').onclick = async (e) => {
  const m = $('[data-msg1]'); busy(e.target, true); m.className = 'ins-msg'; m.textContent = '';
  try { const d = await post('/api/install/check-db', data()); m.className = 'ins-msg ok'; m.textContent = `Connected to ${d.version}`; setTimeout(() => show(2), 500); }
  catch (er) { m.className = 'ins-msg err'; m.textContent = er.message; fieldErrors(er); } finally { busy(e.target, false); }
};
document.querySelector('[data-next="2"]').onclick = () => {
  const d = data(); const miss = ['site_name', 'admin_name', 'admin_email', 'admin_password'].filter((k) => !d[k]);
  if (miss.length) { fieldErrors({ fields: Object.fromEntries(miss.map((k) => [k, 'required'])) }); return; }
  if ((d.admin_password || '').length < 8) { fieldErrors({ fields: { admin_password: 'at least 8 characters' } }); return; }
  fieldErrors({}); show(3);
};
document.querySelectorAll('[data-prev]').forEach((b) => b.onclick = () => show(Number(b.dataset.prev) - 1));
document.querySelector('[data-install]').onclick = async (e) => {
  const m = $('[data-msg3]'); busy(e.target, true); m.className = 'ins-msg'; m.textContent = 'Creating tables and your admin account…';
  try { await post('/api/install/run', data()); show(4); }
  catch (er) { m.className = 'ins-msg err'; m.textContent = er.message; fieldErrors(er); if (er.fields && Object.keys(er.fields).some((k) => k.startsWith('admin') || k.startsWith('site'))) show(2); if (er.fields && Object.keys(er.fields).some((k) => k.startsWith('db'))) show(1); }
  finally { busy(e.target, false); }
};
