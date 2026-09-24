import { api, $, pageHead, pagination, toastError } from '../core.js';
import { notifItem } from '../app.js';

export async function mount(el, { live, setUnread }) {
  let page = 1;
  el.innerHTML = `${pageHead('fa-solid fa-bell', 'Notifications', 'Services, resources, payments, premium & system updates',
    '<button class="btn btn-soft btn-sm" data-all><i class="fa-solid fa-check-double"></i>Mark all read</button>')}
    <div class="card"><div data-list></div><div data-pages></div></div>`;
  async function load(p = page) {
    page = p;
    const r = await api('/notifications', { query: { page } });
    setUnread(r.unread);
    $('[data-list]', el).innerHTML = r.items.length ? r.items.map(notifItem).join('') : '<div class="empty"><i class="fa-regular fa-bell"></i><div>You are all caught up</div></div>';
    $('[data-pages]', el).innerHTML = pagination(r.pagination, load);
  }
  $('[data-all]', el).addEventListener('click', async () => {
    try { await api('/notifications/read-all', { method: 'POST' }); load(); } catch (err) { toastError(err); }
  });
  await load(1);
  return live.on('notification:new', () => { if (page === 1) load(1).catch(() => {}); });
}
