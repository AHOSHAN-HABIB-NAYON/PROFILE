import { api, esc, $, pageHead, formSheet, toast, toastError, sheet, withLoading } from './kit.js';
import { chip, relEl, num, confirmSheet } from '/assets/js/core.js';

function providerFields(p = {}, types = []) {
  const j = (o) => (o && Object.keys(o).length ? JSON.stringify(o, null, 0) : '');
  return [
    { name: 'name', label: 'Name', value: p.name, required: true },
    { name: 'provider_type', label: 'Provider', type: 'select', value: p.provider_type || 'generic', options: types.map((t) => [t.type, t.label]) },
    { name: 'base_url', label: 'Base URL', value: p.base_url, required: true, placeholder: 'https://api.example.com', full: true },
    { name: 'endpoint', label: 'Endpoint', value: p.endpoint, placeholder: '/api/v1/messages', full: true },
    { name: 'http_method', label: 'HTTP method', type: 'select', value: p.http_method || 'GET', options: [['GET', 'GET'], ['POST', 'POST']] },
    { name: 'auth_type', label: 'Authentication', type: 'select', value: p.auth_type || 'bearer', options: [['bearer', 'Bearer token'], ['api_key', 'API key header'], ['query_token', 'Query token'], ['custom_header', 'Custom header'], ['none', 'None']] },
    { name: 'auth_param_name', label: 'Header / query parameter name', value: p.auth_param_name, placeholder: 'X-API-Key or token' },
    { name: 'credential_env', label: '.env variable for credential', value: p.credential_env, placeholder: 'THIRDWAVE_API_KEY', hint: 'Preferred: keep secrets in .env' },
    { name: 'credential', label: `API key / token ${p.has_credential ? `(set via ${p.credential_source})` : '(not set)'}`, type: 'password', placeholder: p.id ? 'Leave blank to keep current' : 'Stored encrypted (AES-256-GCM)', full: true, attrs: 'autocomplete="new-password"', hint: 'Write-only — never sent back to the browser.' },
    ...(p.credential_source === 'encrypted' ? [{ name: 'clear_credential', label: 'Remove stored encrypted credential', type: 'switch', value: false }] : []),
    { name: 'headers_json', label: 'Extra headers (JSON)', type: 'textarea', rows: 2, value: j(p.headers_json), placeholder: '{"Accept-Language":"en"}', full: true },
    { name: 'query_json', label: 'Query parameters (JSON)', type: 'textarea', rows: 2, value: j(p.query_json), placeholder: '{"limit":100,"from":"{{window_start}}","to":"{{now}}"}', full: true, hint: 'Templates: {{now}} {{window_start}} {{today_start}} {{today_end}} {{unix}}' },
    { name: 'body_json', label: 'POST body (JSON)', type: 'textarea', rows: 2, value: j(p.body_json), full: true },
    { name: 'records_path', label: 'Records path in response', value: p.records_path, placeholder: 'data or data.items' },
    { name: 'polling_interval_sec', label: 'Polling interval (seconds)', type: 'number', value: p.polling_interval_sec ?? 5 },
    { name: 'timeout_ms', label: 'Timeout (ms)', type: 'number', value: p.timeout_ms ?? 8000 },
    { name: 'enabled', label: 'Enabled (poll automatically)', type: 'switch', value: !!p.enabled },
  ];
}

const joinUrl = (p) => (p.endpoint ? `${String(p.base_url).replace(/\/+$/, '')}/${String(p.endpoint).replace(/^\/+/, '')}` : p.base_url);

export async function mount(el) {
  async function render() {
    const r = await api('/admin/providers');
    el.innerHTML = `${pageHead('fa-solid fa-plug', 'API Management', 'Providers, credentials, field mapping, deduplication & health', '<button class="btn btn-primary btn-sm" data-new><i class="fa-solid fa-plus"></i>Add provider</button>')}
    <div class="alert info"><i class="fa-solid fa-lock"></i><span>Only events whose resource matches an admin-uploaded <strong>authorized resource</strong> are accepted. Message bodies are discarded after the code is extracted. API keys never reach the browser.</span></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))">${r.items.map((p) => `
      <div class="card" data-id="${p.id}">
        <div class="card-head"><span class="li-ic system"><i class="fa-solid fa-plug"></i></span><div><h3 style="margin:0">${esc(p.name)}</h3><div class="small muted">${esc(p.provider_type)} · every ${p.polling_interval_sec}s</div></div>
          <label class="switch" style="margin-left:auto" title="Enabled"><input type="checkbox" data-toggle ${p.enabled ? 'checked' : ''}><span class="track"></span></label></div>
        <div class="small mono truncate" style="max-width:100%" title="${esc(joinUrl(p))}">${esc(joinUrl(p))}</div>
        <div class="row-flex" style="margin:10px 0">${chip(p.health_status)}${p.has_credential ? chip('success', `key: ${p.credential_source}`) : chip('warning', 'no credential')}<span class="chip">${esc(p.auth_type)}</span></div>
        <div class="small muted">${p.last_checked_at ? `Last checked ${relEl(new Date(p.last_checked_at).toISOString())}` : 'Never checked'} · ${num(p.total_fetched)} events</div>
        ${p.last_error ? `<div class="small" style="color:var(--danger);margin-top:4px">${esc(p.last_error)}</div>` : ''}
        <div class="row-flex" style="margin-top:12px"><button class="btn btn-soft btn-xs" data-act="test"><i class="fa-solid fa-stethoscope"></i>Health</button>
          <button class="btn btn-soft btn-xs" data-act="poll"><i class="fa-solid fa-rotate"></i>Poll now</button>
          <button class="btn btn-ghost btn-xs" data-act="edit"><i class="fa-solid fa-pen"></i>Edit</button>
          <button class="btn btn-ghost btn-xs" data-act="map"><i class="fa-solid fa-diagram-project"></i>Mapping</button>
          <button class="btn btn-ghost btn-xs" data-act="logs"><i class="fa-solid fa-list"></i>Logs</button>
          <button class="btn btn-danger btn-xs" data-act="delete"><i class="fa-solid fa-trash"></i></button></div>
      </div>`).join('')}</div>`;
    return r;
  }
  let data = await render();

  async function mapping(id) {
    const r = await api(`/admin/providers/${id}`);
    const cur = Object.fromEntries(r.mappings.map((m) => [m.system_field, m.provider_field]));
    const s = sheet({
      title: `Field mapping · ${r.item.name}`, icon: 'fa-solid fa-diagram-project', wide: true,
      body: `<p class="muted small">Map provider JSON paths (e.g. <code>message.code</code>, <code>data.phone</code>) to system fields. Unmapped fields use smart defaults; the code is auto-extracted from the message text if needed.</p>
        <form data-map><div class="form-grid two">${r.system_fields.map((f) => `<div class="field"><label>${esc(f)}</label><input class="input" name="${esc(f)}" value="${esc(cur[f] || '')}" placeholder="provider field path"></div>`).join('')}</div>
        <button class="btn btn-primary" type="submit">Save mapping</button></form>
        <div class="divider"></div><h3>Test with sample JSON</h3>
        <textarea class="input" data-sample rows="6" placeholder='{"data":[{"id":"abc","number":"923001234567","message":"Your Telegram code is 27288","created_at":"2026-09-24T10:00:00Z"}]}'></textarea>
        <button class="btn btn-soft btn-sm" data-preview style="margin-top:8px">Preview normalization</button><pre class="address-box" data-out style="margin-top:8px;display:none;text-align:left;white-space:pre-wrap"></pre>`,
    });
    $('[data-map]', s.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const mappings = r.system_fields.map((f) => ({ system_field: f, provider_field: e.target[f].value.trim() })).filter((m) => m.provider_field);
      await withLoading(e.submitter, async () => { try { toast((await api(`/admin/providers/${id}/mappings`, { method: 'PUT', body: { mappings } })).message); } catch (err) { toastError(err); } });
    });
    $('[data-preview]', s.el).addEventListener('click', async (e) => {
      await withLoading(e.currentTarget, async () => {
        try {
          const out = await api(`/admin/providers/${id}/preview`, { method: 'POST', body: { sample: $('[data-sample]', s.el).value } });
          const pre = $('[data-out]', s.el);
          pre.style.display = 'block';
          pre.textContent = JSON.stringify(out.normalized, null, 2);
        } catch (err) { toastError(err); }
      });
    });
  }

  async function logs(id) {
    const r = await api(`/admin/providers/${id}`);
    sheet({
      title: `Logs · ${r.item.name}`, icon: 'fa-solid fa-list', wide: true,
      body: r.logs.length ? `<div class="list">${r.logs.map((l) => `<div class="list-item"><span class="chip ${l.level === 'error' ? 'error' : 'success'}">${esc(l.level)}</span>
        <div class="li-body"><div class="li-title" style="white-space:normal">${esc(l.message || '')}</div><div class="li-sub">${l.http_status ? `HTTP ${l.http_status} · ` : ''}${l.duration_ms ?? '–'}ms · ${relEl(new Date(l.created_at).toISOString())}</div></div></div>`).join('')}</div>`
        : '<div class="empty">No logs yet</div>',
    });
  }

  el.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-toggle]')) return;
    const id = e.target.closest('[data-id]').dataset.id;
    try { toast((await api(`/admin/providers/${id}/toggle`, { method: 'POST', body: { enabled: e.target.checked } })).message); } catch (err) { toastError(err); e.target.checked = !e.target.checked; }
  });
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-new]')) {
      return formSheet({ title: 'Add provider', icon: 'fa-solid fa-plug', wide: true, fields: providerFields({}, data.types),
        onSubmit: async (d) => { const r = await api('/admin/providers', { method: 'POST', body: d }); data = await render(); return r; } });
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = Number(b.closest('[data-id]').dataset.id);
    const p = data.items.find((x) => x.id === id);
    await withLoading(b, async () => {
      try {
        if (b.dataset.act === 'test') { const r = await api(`/admin/providers/${id}/test`, { method: 'POST' }); toast(`${r.health.status}: ${r.health.message}`, r.health.status === 'online' ? 'success' : 'error', 5000); data = await render(); }
        if (b.dataset.act === 'poll') { const r = await api(`/admin/providers/${id}/poll`, { method: 'POST' }); toast(r.result?.error ? `Error: ${r.result.error}` : `Fetched ${r.result.fetched}, new ${r.result.inserted}, duplicates ${r.result.duplicates}, not in system ${r.result.unlisted || 0}, unauthorized ${r.result.unauthorized}`, r.result?.error ? 'error' : 'success', 5000); data = await render(); }
        if (b.dataset.act === 'edit') formSheet({ title: `Edit ${p.name}`, icon: 'fa-solid fa-plug', wide: true, fields: providerFields(p, data.types), onSubmit: async (d) => { const r = await api(`/admin/providers/${id}`, { method: 'PUT', body: d }); data = await render(); return r; } });
        if (b.dataset.act === 'map') await mapping(id);
        if (b.dataset.act === 'logs') await logs(id);
        if (b.dataset.act === 'delete' && await confirmSheet({ title: `Delete ${p.name}?`, message: 'Existing events are kept.', confirm: 'Delete', danger: true })) {
          toast((await api(`/admin/providers/${id}`, { method: 'DELETE' })).message); data = await render();
        }
      } catch (err) { toastError(err); }
    });
  });
}
