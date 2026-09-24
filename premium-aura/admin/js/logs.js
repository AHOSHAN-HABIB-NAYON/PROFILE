import { esc, pageHead, listPage, sheet } from './kit.js';
import { chip, relEl } from '/assets/js/core.js';

export async function mount(el) {
  listPage(el, {
    head: pageHead('fa-solid fa-clipboard-list', 'Security Logs', 'Audit trail of admin, auth and security events'),
    endpoint: '/admin/logs',
    filters: [{ name: 'q', type: 'search', label: 'Search action, email or IP…' },
      { name: 'category', type: 'select', options: [['', 'All categories'], ['admin', 'Admin'], ['security', 'Security'], ['auth', 'Auth'], ['system', 'System']] }],
    columns: [
      { label: 'When', render: (l) => `<span class="nowrap">${relEl(new Date(l.created_at).toISOString())}</span>` },
      { label: 'Category', render: (l) => chip(l.category === 'security' ? 'warning' : 'info', l.category) },
      { label: 'Action', render: (l) => `<strong class="mono">${esc(l.action)}</strong>` },
      { label: 'Actor', render: (l) => esc(l.email || 'system') },
      { label: 'Target', render: (l) => esc(l.target_type ? `${l.target_type} #${l.target_id ?? ''}` : '—') },
      { label: 'IP', render: (l) => `<span class="mono small">${esc(l.ip || '')}</span>` },
    ],
    actions: (l) => (l.details ? '<button class="btn btn-ghost btn-xs" data-a="details">Details</button>' : ''),
    async onAction(a, l) {
      sheet({ title: l.action, icon: 'fa-solid fa-clipboard-list', body: `<pre class="address-box" style="text-align:left;white-space:pre-wrap">${esc(JSON.stringify(typeof l.details === 'string' ? JSON.parse(l.details) : l.details, null, 2))}</pre><p class="small muted">${esc(l.user_agent || '')}</p>` });
    },
  });
}
