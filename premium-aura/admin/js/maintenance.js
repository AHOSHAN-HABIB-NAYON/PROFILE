import { api, $, pageHead, toast, toastError, withLoading, formData, fieldsHtml } from './kit.js';
import { chip } from '/assets/js/core.js';

function localInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export async function mount(el, ctx) {
  const { maintenance: m } = await api('/admin/maintenance');
  el.innerHTML = `${pageHead('fa-solid fa-screwdriver-wrench', 'Maintenance', 'Temporarily close the site for users — admins keep full access')}
  <div class="card" style="max-width:720px"><div class="card-head"><h2>Maintenance mode</h2>${m.is_active ? chip('danger', 'ACTIVE') : chip('success', 'off')}</div>
    <form data-m><div class="form-grid two">${fieldsHtml([
    { name: 'is_active', label: 'Activate maintenance mode', type: 'switch', value: !!m.is_active },
    { name: 'title', label: 'Title', value: m.title, required: true, full: true },
    { name: 'message', label: 'Message', type: 'textarea', rows: 3, value: m.message, full: true },
    { name: 'contact', label: 'Contact', value: m.contact, placeholder: 'support@example.com / @telegram' },
    { name: 'estimated_end', label: 'Estimated time back', type: 'datetime-local', value: localInput(m.estimated_end) },
  ])}</div><button class="btn btn-primary" type="submit">Save</button></form></div>`;
  $('[data-m]', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    d.estimated_end = d.estimated_end ? new Date(d.estimated_end).toISOString() : '';
    await withLoading(e.submitter, async () => {
      try { toast((await api('/admin/maintenance', { method: 'PUT', body: d })).message); ctx.navigate('/admin/maintenance', { replace: true, scroll: false }); } catch (err) { toastError(err); }
    });
  });
}
