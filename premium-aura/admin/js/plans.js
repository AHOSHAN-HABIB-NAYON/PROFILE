import { api, esc, pageHead, listPage, formSheet, btn, toast } from './kit.js';
import { chip, money, num, confirmSheet } from '/assets/js/core.js';

const fields = (p = {}) => [
  { name: 'name', label: 'Name', value: p.name, required: true, placeholder: '30 Days' },
  { name: 'price', label: 'Price (USD)', value: p.price, required: true, placeholder: '5.00' },
  { name: 'duration_days', label: 'Duration (days)', type: 'number', value: p.duration_days, required: true },
  { name: 'resource_limit', label: 'Resource limit (quota)', type: 'number', value: p.resource_limit ?? '', placeholder: 'blank = unlimited' },
  { name: 'hourly_limit', label: 'Speed: numbers per hour', type: 'number', value: p.hourly_limit ?? '', placeholder: 'blank = same as free users' },
  { name: 'daily_limit', label: 'Speed: numbers per day', type: 'number', value: p.daily_limit ?? '', placeholder: 'blank = same as free users' },
  { name: 'status', label: 'Status', type: 'select', value: p.status || 'active', options: [['active', 'Active'], ['inactive', 'Inactive']] },
  { name: 'sort_order', label: 'Sort order', type: 'number', value: p.sort_order ?? 0 },
  { name: 'description', label: 'Description', value: p.description, full: true },
  { name: 'is_featured', label: 'Featured ("Best value")', type: 'switch', value: !!p.is_featured },
];

export async function mount(el) {
  const list = listPage(el, {
    head: pageHead('fa-solid fa-gem', 'Premium Plans', 'Price, duration and resource limits', '<button class="btn btn-primary btn-sm" data-new><i class="fa-solid fa-plus"></i>New plan</button>'),
    endpoint: '/admin/plans',
    columns: [
      { label: 'Plan', render: (p) => `<strong>${esc(p.name)}</strong>${p.is_featured ? ' <span class="chip info">featured</span>' : ''}<div class="small muted">${esc(p.description || '')}</div>` },
      { label: 'Price', render: (p) => `<strong>${esc(money(p.price))}</strong>` },
      { label: 'Duration', render: (p) => `${num(p.duration_days)} days` },
      { label: 'Quota', render: (p) => (p.resource_limit === null ? 'Unlimited' : num(p.resource_limit)) },
      { label: 'Speed', render: (p) => `${p.hourly_limit ? num(p.hourly_limit) : 'default'}/h · ${p.daily_limit ? num(p.daily_limit) : 'default'}/day` },
      { label: 'Members', render: (p) => num(p.active_members) },
      { label: 'Status', render: (p) => chip(p.status) },
    ],
    actions: () => `${btn('edit', 'fa-solid fa-pen', 'Edit')}${btn('delete', 'fa-solid fa-trash', 'Delete', 'btn-danger')}`,
    async onAction(a, p, ctx) {
      if (a === 'edit') return formSheet({ title: `Edit ${p.name}`, icon: 'fa-solid fa-gem', fields: fields(p), onSubmit: async (d) => { const r = await api(`/admin/plans/${p.id}`, { method: 'PUT', body: d }); ctx.reload(); return r; } });
      if (a === 'delete' && await confirmSheet({ title: `Delete ${p.name}?`, message: 'Active members keep their current period.', confirm: 'Delete', danger: true })) {
        toast((await api(`/admin/plans/${p.id}`, { method: 'DELETE' })).message); ctx.reload();
      }
    },
  });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-new]')) formSheet({ title: 'New plan', icon: 'fa-solid fa-gem', fields: fields(), onSubmit: async (d) => { const r = await api('/admin/plans', { method: 'POST', body: d }); list.reload(); return r; } });
  });
}
