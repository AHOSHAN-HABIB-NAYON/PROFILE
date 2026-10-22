import { api } from '../api.js';
import {
  html, mount, skeleton, empty, ago, icon,
} from '../ui.js';
import { setUnreadZero } from '../app.js';

export async function render({ el }) {
  mount(el, skeleton(64, 5));
  const d = await api.get('/notifications', { fresh: true });
  mount(el, html`<div class="card pad-0" style="max-width:720px">${d.rows.length ? d.rows.map((n) => html`<div class="list-item">
    <span class="avatar sm" style="${n.id > d.last_read_id ? '' : 'opacity:.5'}">${icon('bell')}</span>
    <div class="grow"><div class="t">${n.title} ${n.id > d.last_read_id ? html`<span class="chip brand">New</span>` : ''}</div><div class="muted" style="font-size:13px;white-space:normal">${n.body}</div></div>
    <span class="faint" style="font-size:12px">${ago(n.created_at)}</span></div>`) : empty('No notifications yet', 'bell')}</div>`);
  if (d.unread) { await api.post('/notifications/read'); setUnreadZero(); }
}
