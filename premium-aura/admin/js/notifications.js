import { api, esc, $, pageHead, listPage, toast, toastError, withLoading, formData, fieldsHtml } from './kit.js';
import { chip, relEl } from '/assets/js/core.js';

export async function mount(el) {
  el.innerHTML = `${pageHead('fa-solid fa-bullhorn', 'Notifications', 'Broadcast to everyone or message a single user')}
    <div class="grid grid-main"><div data-list></div>
    <div class="card"><div class="card-head"><h2>Send notification</h2></div><form data-send><div class="form-grid">
      ${fieldsHtml([
    { name: 'type', label: 'Type', type: 'select', options: [['system', 'System'], ['service', 'New service'], ['resource', 'New number/resource'], ['post', 'New post'], ['payment', 'Payment'], ['premium', 'Premium'], ['withdrawal', 'Withdrawal']] },
    { name: 'title', label: 'Title', required: true },
    { name: 'body', label: 'Message', type: 'textarea', rows: 3 },
    { name: 'link', label: 'Link (in-app path)', placeholder: '/premium' },
    { name: 'user_email', label: 'Only this user (email)', type: 'email', placeholder: 'Leave blank to broadcast to all' },
  ])}</div><button class="btn btn-primary btn-block" type="submit"><i class="fa-solid fa-paper-plane"></i>Send</button></form></div></div>`;
  const list = listPage($('[data-list]', el), {
    endpoint: '/admin/notifications',
    columns: [
      { label: 'User', render: (n) => esc(n.email) },
      { label: 'Type', render: (n) => chip('info', n.type) },
      { label: 'Title', render: (n) => `<strong>${esc(n.title)}</strong><div class="small muted truncate">${esc(n.body || '')}</div>` },
      { label: 'Read', render: (n) => (n.is_read ? chip('success', 'read') : chip('warning', 'unread')) },
      { label: 'Sent', render: (n) => relEl(new Date(n.created_at).toISOString()) },
    ],
  });
  $('[data-send]', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    await withLoading(e.submitter, async () => {
      try { toast((await api('/admin/notifications', { method: 'POST', body: formData(e.target) })).message); e.target.reset(); list.reload(); } catch (err) { toastError(err); }
    });
  });
}
