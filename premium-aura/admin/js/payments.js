import { api, esc, pageHead, listPage, formSheet, tbtn, sheet } from './kit.js';
import { chip, money, relEl } from '/assets/js/core.js';

export async function mount(el, { live }) {
  const list = listPage(el, {
    head: pageHead('fa-solid fa-credit-card', 'Payments', 'Review TRC20 / Binance Pay submissions'),
    endpoint: '/admin/payments',
    filters: [
      { name: 'q', type: 'search', label: 'Search email or transaction…' },
      { name: 'status', type: 'select', options: [['', 'All status'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']] },
      { name: 'method', type: 'select', options: [['', 'All methods'], ['trc20', 'TRC20'], ['binance', 'Binance'], ['wallet', 'Wallet']] },
    ],
    columns: [
      { label: 'ID', render: (p) => `#${p.id}` },
      { label: 'User', render: (p) => `<strong>${esc(p.name)}</strong><div class="small muted">${esc(p.email)}</div>` },
      { label: 'Plan', render: (p) => esc(p.plan_name || '—') },
      { label: 'Amount', render: (p) => `<strong>${esc(money(p.amount))}</strong>` },
      { label: 'Method', render: (p) => `<span class="chip">${esc(p.method)}</span>` },
      { label: 'Reference', render: (p) => `<span class="mono small truncate" style="display:inline-block">${esc(p.transaction_ref || '—')}</span>` },
      { label: 'Status', render: (p) => chip(p.status) },
      { label: 'Date', render: (p) => relEl(new Date(p.created_at).toISOString()) },
    ],
    actions: (p) => `${p.screenshot_url ? tbtn('shot', 'Screenshot') : ''}${p.status === 'pending' ? `${tbtn('approve', 'Approve', 'btn-success')}${tbtn('reject', 'Reject', 'btn-danger')}` : ''}`,
    async onAction(a, p, ctx) {
      if (a === 'shot') return sheet({ title: `Payment #${p.id} screenshot`, wide: true, body: `<img src="${esc(p.screenshot_url)}" alt="Payment screenshot" style="border-radius:14px;margin:auto">` });
      return formSheet({
        title: `${a === 'approve' ? 'Approve' : 'Reject'} payment #${p.id}`, icon: a === 'approve' ? 'fa-solid fa-check' : 'fa-solid fa-xmark', two: false,
        fields: [{ name: 'note', label: 'Note (optional, shown to user)', placeholder: a === 'approve' ? 'Thanks!' : 'Transaction not found' }],
        submitLabel: a === 'approve' ? 'Approve & activate plan' : 'Reject',
        onSubmit: async (d) => { const r = await api(`/admin/payments/${p.id}/review`, { method: 'POST', body: { ...d, action: a } }); ctx.reload(); return r; },
      });
    },
  });
  return live.on('admin:payment', () => list.reload());
}
