import { api, esc, $, pageHead, listPage, toast, toastError, withLoading, formData, fieldsHtml, notifyPanelHtml, bindNotifyPanel, notifyValues } from './kit.js';
import { chip, relEl } from '/assets/js/core.js';

export async function mount(el) {
  el.innerHTML = `${pageHead('fa-solid fa-bullhorn', 'Notifications', 'Broadcast to everyone or message a single user')}
    <div class="stack">
    <div class="card"><div class="card-head"><h2>Send notification</h2><span class="link small muted">In-app messages auto-remove after 24h</span></div><form data-send>
      <div class="form-grid two">${fieldsHtml([
    { name: 'type', label: 'Type', type: 'select', options: [['system', 'System'], ['service', 'New service'], ['resource', 'New number/resource'], ['post', 'New post'], ['payment', 'Payment'], ['premium', 'Premium'], ['withdrawal', 'Withdrawal']] },
    { name: 'link', label: 'Link (in-app path)', placeholder: '/access' },
  ])}</div>
      ${notifyPanelHtml({ title: '', body: '' })}
      <button class="btn btn-primary btn-block" type="submit"><i class="fa-solid fa-paper-plane"></i>Send</button></form></div>
    <div data-list></div></div>`;
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
  bindNotifyPanel($('[data-send]', el));
  $('[data-send]', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    await withLoading(e.submitter, async () => {
      try {
        const d = formData(e.target);
        const body = { type: d.type, link: d.link, ...notifyValues(e.target), title: e.target.notify_title.value, body: e.target.notify_body.value };
        toast((await api('/admin/notifications', { method: 'POST', body })).message, 'success', 5000);
        e.target.reset(); e.target.querySelector('[data-notify-panel]').reset?.(); list.reload();
      } catch (err) { toastError(err); }
    });
  });
}
