import { api, esc, $, $$, pageHead, listPage, formSheet, sheet, toast, toastError, withLoading, formData } from './kit.js';
import { chip, flag, appIcon, num, relEl, APP_LIST, confirmSheet } from '/assets/js/core.js';

const ICONS = [['', 'Auto (from app code)'], ...APP_LIST.map((a) => [a.name.toLowerCase().replace(/[^a-z]/g, ''), a.name])];

function serviceFields(s = {}) {
  return [
    { name: 'country_name', label: 'Country', value: s.country_name, required: true, placeholder: 'Pakistan' },
    { name: 'country_code', label: 'Country short name', value: s.country_code, required: true, placeholder: 'PK' },
    { name: 'flag_code', label: 'Flag (ISO code)', value: s.flag_code, required: true, placeholder: 'pk' },
    { name: 'app_name', label: 'Application', value: s.app_name, required: true, placeholder: 'Telegram' },
    { name: 'app_code', label: 'App short code', value: s.app_code, required: true, placeholder: 'TG' },
    { name: 'app_icon', label: 'App icon', type: 'select', value: s.app_icon || '', options: ICONS },
    { name: 'status', label: 'Status', type: 'select', value: s.status || 'active', options: [['active', 'Active'], ['inactive', 'Inactive'], ['maintenance', 'Maintenance']] },
    { name: 'manual_available', label: 'Available count (override)', type: 'number', value: s.manual_available ?? '', hint: 'Blank = live count of available resources' },
    { name: 'sort_order', label: 'Sort order', type: 'number', value: s.sort_order ?? 0 },
    { name: 'description', label: 'Description', value: s.description, full: true },
    ...(s.id ? [] : [{ name: 'notify', label: 'Notify all users about this new service', type: 'switch', value: true }]),
  ];
}

/** Upload a file that replaces all old numbers of one service. */
function replaceSheet(s, c) {
  const sh = sheet({
    title: `Replace numbers · ${s.country_code} ${s.app_code}`, icon: 'fa-solid fa-arrows-rotate',
    body: `<p class="small muted">Old numbers are deleted and the numbers in your file are added. If the file has no valid numbers, nothing is deleted.</p>
      <form data-rep><label class="dropzone"><input type="file" name="file" accept=".csv,.txt,.xlsx" hidden required>
        <i class="fa-solid fa-file-arrow-up" style="font-size:24px;color:var(--primary)"></i><div><strong>Choose TXT, CSV or XLSX</strong></div><div class="small" data-fn></div></label>
      <button class="btn btn-primary btn-block" type="submit" style="margin-top:12px"><i class="fa-solid fa-arrows-rotate"></i>Replace numbers</button></form><div data-out style="margin-top:10px"></div>`,
  });
  const f = $('[name=file]', sh.el);
  f.addEventListener('change', () => { $('[data-fn]', sh.el).textContent = f.files[0]?.name || ''; });
  $('[data-rep]', sh.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.files[0]) return toast('Choose a file first', 'warning');
    const fd = new FormData();
    fd.append('file', f.files[0]); fd.append('service_id', String(s.id)); fd.append('replace', '1');
    await withLoading(e.submitter, async () => {
      try {
        const r = await api('/admin/resources/import', { method: 'POST', form: fd });
        toast(r.message); c.reload();
        const rep = r.report;
        $('[data-out]', sh.el).innerHTML = `<div class="alert ${rep.inserted ? 'success' : 'warning'}"><i class="fa-solid fa-circle-info"></i><div>${esc(r.message)} · ${num(rep.invalid)} invalid
          ${rep.errors.length ? `<ul class="small">${rep.errors.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div></div>`;
      } catch (err) { toastError(err); }
    });
  });
}

const TABS = [['services', 'Services'], ['resources', 'Resources'], ['import', 'Import TXT / CSV / XLSX'], ['limits', 'Rate limits'], ['assignments', 'Assignments']];

export async function mount(el) {
  el.innerHTML = `${pageHead('fa-solid fa-sim-card', 'Access Management', 'Services, authorized resources, imports & limits')}
    <div class="tabs" style="margin-bottom:14px">${TABS.map(([k, l], i) => `<button class="tab ${i ? '' : 'active'}" data-tab="${k}">${l}</button>`).join('')}</div><div data-pane></div>`;
  let pane = $('[data-pane]', el);
  let services = [];
  const loadServices = async () => { services = (await api('/admin/services')).items; return services; };

  const tabs = {
    async services() {
      await loadServices();
      const ctx = listPage(pane, {
        head: '<div class="row-flex" style="margin-bottom:14px"><button class="btn btn-primary btn-sm" data-new-svc><i class="fa-solid fa-plus"></i>New service</button></div>',
        endpoint: '/admin/services',
        empty: 'No services yet — create one to start adding numbers',
        row: (s) => `<div class="svc-card">
          <div class="svc-top">${flag(s.flag_code)}${appIcon(s.app_icon || s.app_code, 'sm')}
            <div class="svc-name"><strong>${esc(s.country_code)} ${esc(s.app_code)}</strong><span>${esc(s.country_name)} ${esc(s.app_name)}</span></div>${chip(s.status)}</div>
          <div class="svc-stats">
            <div><b>${num(s.available)}</b><span>${s.manual_available !== null ? 'Manual count' : 'Available'}</span></div>
            <div><b>${num(s.stats.assigned)}</b><span>In use</span></div>
            <div><b>${num(s.stats.total)}</b><span>Total</span></div>
          </div>
          <div class="svc-actions">
            <button class="btn btn-ghost btn-xs" data-a="edit"><i class="fa-solid fa-pen"></i>Edit</button>
            <button class="btn btn-ghost btn-xs" data-a="add"><i class="fa-solid fa-plus"></i>Add</button>
            <button class="btn btn-soft btn-xs" data-a="replace"><i class="fa-solid fa-arrows-rotate"></i>Replace</button>
            <button class="btn btn-ghost btn-xs" data-a="clear"><i class="fa-solid fa-broom"></i>Clear</button>
            <button class="btn btn-ghost btn-xs svc-del" data-a="delete" aria-label="Delete service"><i class="fa-solid fa-trash"></i></button>
          </div></div>`,
        async onAction(a, s, c) {
          const name = `${s.country_code} ${s.app_code}`;
          if (a === 'edit') return formSheet({ title: `Edit ${name}`, fields: serviceFields(s), onSubmit: async (d) => { const r = await api(`/admin/services/${s.id}`, { method: 'PUT', body: d }); c.reload(); return r; } });
          if (a === 'add') {
            return formSheet({
              title: `Add numbers · ${name}`, icon: 'fa-solid fa-plus', two: false,
              fields: [{ name: 'resources', label: 'Numbers (one per line)', type: 'textarea', rows: 8, required: true, placeholder: '9647812345678\n9647812345679' }],
              onSubmit: async (d) => { const r = await api('/admin/resources', { method: 'POST', body: { ...d, service_id: s.id } }); c.reload(); return r; },
            });
          }
          if (a === 'replace') return replaceSheet(s, c);
          if (a === 'clear') {
            if (!(await confirmSheet({ title: `Delete all numbers of ${name}?`, message: 'The service stays. Numbers someone is using right now keep working until they finish, then disappear.', confirm: 'Delete numbers', danger: true }))) return;
            toast((await api(`/admin/services/${s.id}/clear`, { method: 'POST' })).message); c.reload();
          }
          if (a === 'delete') {
            if (!(await confirmSheet({ title: `Delete ${name}?`, message: 'This removes the service and all its numbers and assignments.', confirm: 'Delete', danger: true }))) return;
            toast((await api(`/admin/services/${s.id}`, { method: 'DELETE' })).message); c.reload();
          }
        },
      });
      $('[data-new-svc]', pane).addEventListener('click', () => formSheet({
        title: 'New service', icon: 'fa-solid fa-plus', fields: serviceFields(),
        onSubmit: async (d) => { const r = await api('/admin/services', { method: 'POST', body: d }); ctx.reload(); return r; },
      }));
    },

    async resources() {
      await loadServices();
      listPage(pane, {
        endpoint: '/admin/resources',
        filters: [
          { name: 'q', type: 'search', label: 'Search resource or serial…' },
          { name: 'service_id', type: 'select', options: [['', 'All services'], ...services.map((s) => [s.id, `${s.country_code} ${s.app_code}`])] },
          { name: 'status', type: 'select', options: [['', 'All status'], ['available', 'Available'], ['assigned', 'Assigned'], ['disabled', 'Disabled'], ['retired', 'Retired']] },
        ],
        bulk: [{ action: 'available', label: 'Make available' }, { action: 'disabled', label: 'Disable' }, { action: 'release', label: 'Release' }, { action: 'delete', label: 'Delete', danger: true }],
        async onBulk(action, ids, c) {
          if (action === 'delete' && !(await confirmSheet({ title: `Delete ${ids.length} resource(s)?`, confirm: 'Delete', danger: true }))) return;
          toast((await api('/admin/resources/bulk', { method: 'POST', body: { action, ids } })).message); c.reload();
        },
        columns: [
          { label: 'ID', render: (r) => `<span class="mono">#${r.id}</span>` },
          { label: 'Resource', render: (r) => `<strong class="mono">${esc(r.resource_value)}</strong>` },
          { label: 'Service', render: (r) => `<span class="row-flex" style="gap:6px">${flag(r.flag_code)}${esc(r.country_code)} ${esc(r.app_code)}</span>` },
          { label: 'Status', render: (r) => chip(r.status) },
          { label: 'Assigned to', render: (r) => esc(r.assigned_email || '—') },
          { label: 'Batch', render: (r) => `<span class="small muted">${esc(r.import_batch || '')}</span>` },
        ],
      });
    },

    async import() {
      await loadServices();
      pane.innerHTML = `<div class="grid grid-main"><div class="card"><div class="card-head"><h2>Import authorized resources</h2></div>
        <form data-import>
          <label class="dropzone" data-drop><input type="file" name="file" accept=".csv,.txt,.xlsx,.pdf" hidden required>
            <i class="fa-solid fa-file-arrow-up" style="font-size:26px;color:var(--primary)"></i><div><strong>Choose TXT, CSV or XLSX</strong></div>
            <div class="small muted">PDF is accepted for archive/viewing only · max 20 MB</div><div data-fname class="small" style="margin-top:6px"></div></label>
          <div class="field" style="margin-top:12px"><label>Import into</label><select class="input" name="service_id"><option value="">Use country + service columns</option>
            ${services.map((s) => `<option value="${s.id}">${esc(s.country_code)} ${esc(s.app_code)} · ${esc(s.country_name)} ${esc(s.app_name)}</option>`).join('')}</select></div>
          <label class="switch" style="margin-bottom:10px"><input type="checkbox" name="replace"><span class="track"></span><span>Replace: delete this service's old numbers first</span></label><br>
          <label class="switch" style="margin-bottom:10px"><input type="checkbox" name="create_missing"><span class="track"></span><span>Create missing services automatically</span></label><br>
          <label class="switch" style="margin-bottom:14px"><input type="checkbox" name="notify"><span class="track"></span><span>Notify users about new numbers</span></label>
          <button class="btn btn-primary btn-block" type="submit"><i class="fa-solid fa-upload"></i>Import</button></form>
        <div data-report style="margin-top:14px"></div></div>
        <div class="card"><div class="card-head"><h2>Format</h2></div><p class="muted small">First row must be a header. Columns: <code>country, service, resource, status</code>.</p>
        <pre class="address-box" style="text-align:left">country,service,resource,status
PK,TG,TEST-100001,available
PK,TG,TEST-100002,available
IQ,WS,TEST-200001,available</pre>
        <p class="small muted"><strong>Only numbers?</strong> Upload a <strong>.txt</strong> (or .csv) with one number per line and pick the service in <em>Import into</em>.</p>
        <p class="small muted">Also accepted: <code>;</code> or tab separators and headers like <code>number</code> / <code>phone</code>. Duplicates are skipped. Status may be <code>available</code>, <code>disabled</code> or <code>retired</code>.</p>
        <a class="btn btn-ghost btn-sm" href="data:text/csv;charset=utf-8,country%2Cservice%2Cresource%2Cstatus%0APK%2CTG%2CTEST-100001%2Cavailable%0APK%2CTG%2CTEST-100002%2Cavailable%0AIQ%2CWS%2CTEST-200001%2Cavailable%0A" download="resources-sample.csv"><i class="fa-solid fa-download"></i>Sample CSV</a></div></div>`;
      const file = $('[name=file]', pane);
      file.addEventListener('change', () => { $('[data-fname]', pane).textContent = file.files[0]?.name || ''; });
      $('[data-import]', pane).addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!file.files[0]) return toast('Choose a file first', 'warning');
        const fd = new FormData(e.target);
        fd.set('create_missing', e.target.create_missing.checked ? '1' : '0');
        fd.set('notify', e.target.notify.checked ? '1' : '0');
        fd.set('replace', e.target.replace.checked ? '1' : '0');
        if (e.target.replace.checked && !e.target.service_id.value) return toast('Choose the service in "Import into" to replace its numbers', 'warning');
        await withLoading(e.submitter, async () => {
          try {
            const r = await api('/admin/resources/import', { method: 'POST', form: fd });
            toast(r.message);
            const rep = r.report;
            $('[data-report]', pane).innerHTML = rep ? `<div class="alert success"><i class="fa-solid fa-circle-check"></i><div>
              <strong>${num(rep.inserted)}</strong> imported · ${num(rep.duplicates)} duplicates · ${num(rep.invalid)} invalid · ${num(rep.created_services)} services created (batch ${esc(rep.batch)})
              ${rep.errors.length ? `<ul class="small">${rep.errors.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div></div>` : `<div class="alert info">${esc(r.message)}</div>`;
          } catch (err) { toastError(err); }
        });
      });
    },

    async limits() {
      const [{ limits: l }, st] = await Promise.all([api('/admin/rate-limits'), api('/admin/settings')]);
      pane.innerHTML = `<div class="card" style="max-width:640px"><div class="card-head"><h2>Resource request limits</h2><span class="chip info">server-side</span></div>
        <form data-limits><div class="form-grid two">
          <div class="field"><label>Request interval (seconds)</label><input class="input" type="number" name="interval_seconds" min="0" max="3600" value="${l.interval_seconds}"><span class="hint">Default 1 request / 1 second</span></div>
          <div class="field"><label>Free users: per hour</label><input class="input" type="number" name="hourly_limit" list="hourly-presets" min="1" value="${l.hourly_limit}">
            <datalist id="hourly-presets"><option value="10"><option value="25"><option value="50"><option value="100"><option value="200"></datalist></div>
          <div class="field"><label>Free users: per day</label><input class="input" type="number" name="daily_limit" min="1" value="${l.daily_limit}"><span class="hint">Premium plans have their own speed (Premium Plans → Edit)</span></div>
          <div class="field" style="grid-column:1/-1"><label class="switch"><input type="checkbox" name="enabled" ${l.enabled ? 'checked' : ''}><span class="track"></span><span>Enforce interval / hourly / daily limits</span></label></div>
        </div><div class="row-flex">${[10, 25, 50, 100, 200].map((n) => `<button type="button" class="btn btn-ghost btn-xs" data-preset="${n}">${n}/hour</button>`).join('')}</div>
        <button class="btn btn-primary" type="submit" style="margin-top:14px">Save limits</button></form></div>`;
      pane.addEventListener('click', (e) => { const p = e.target.closest('[data-preset]'); if (p) $('[name=hourly_limit]', pane).value = p.dataset.preset; });
      $('[data-limits]', pane).addEventListener('submit', async (e) => {
        e.preventDefault();
        await withLoading(e.submitter, async () => { try { toast((await api('/admin/rate-limits', { method: 'PUT', body: formData(e.target) })).message); } catch (err) { toastError(err); } });
      });
    },

    async assignments() {
      listPage(pane, {
        endpoint: '/admin/assignments',
        columns: [
          { label: 'ID', render: (a) => `#${a.id}` },
          { label: 'User', render: (a) => esc(a.email) },
          { label: 'Resource', render: (a) => `<span class="mono">${esc(a.resource_value)}</span>` },
          { label: 'Service', render: (a) => `${esc(a.country_code)} ${esc(a.app_code)}` },
          { label: 'Last OTP', render: (a) => `<span class="mono">${esc(a.last_code || '—')}</span>` },
          { label: 'Status', render: (a) => chip(a.status) },
          { label: 'Assigned', render: (a) => relEl(new Date(a.assigned_at).toISOString()) },
        ],
      });
    },
  };

  const open = async (k) => {
    $$('[data-tab]', el).forEach((b) => b.classList.toggle('active', b.dataset.tab === k));
    const fresh = pane.cloneNode(false); // drop listeners from the previous tab
    pane.replaceWith(fresh);
    pane = fresh;
    try { await tabs[k](); } catch (err) { toastError(err); }
  };
  el.addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) open(t.dataset.tab); });
  await open('services');
}
