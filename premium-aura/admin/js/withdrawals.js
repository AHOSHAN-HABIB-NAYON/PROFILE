import { api, esc, pageHead, listPage, formSheet, tbtn } from './kit.js';
import { chip, money, relEl, copyText } from '/assets/js/core.js';

export async function mount(el, { live }) {
  const list = listPage(el, {
    head: pageHead('fa-solid fa-money-bill-wave', 'Withdrawals', 'Approve, reject (auto-refund) and mark as paid'),
    endpoint: '/admin/withdrawals',
    filters: [
      { name: 'q', type: 'search', label: 'Search email or Binance UID…' },
      { name: 'status', type: 'select', options: [['', 'All status'], ['waiting_admin', 'Waiting for admin'], ['pending', 'Pending'], ['approved', 'Approved'], ['paid', 'Paid'], ['rejected', 'Rejected']] },
    ],
    columns: [
      { label: 'ID', render: (w) => `#${w.id}` },
      { label: 'User', render: (w) => `<strong>${esc(w.name)}</strong><div class="small muted">${esc(w.email)}</div>` },
      { label: 'Amount', render: (w) => `<strong>${esc(money(w.amount))}</strong>` },
      { label: 'Binance UID', render: (w) => `<span class="mono">${esc(w.binance_uid)}</span> <button class="btn btn-ghost btn-xs" data-a="copy"><i class="fa-regular fa-copy"></i></button>` },
      { label: 'Status', render: (w) => chip(w.status, w.status.replace('_', ' ')) },
      { label: 'Note', render: (w) => esc(w.admin_note || '') },
      { label: 'Requested', render: (w) => relEl(new Date(w.created_at).toISOString()) },
    ],
    actions: (w) => [
      ['pending', 'waiting_admin'].includes(w.status) ? tbtn('approve', 'Approve', 'btn-success') : '',
      ['approved', 'waiting_admin', 'pending'].includes(w.status) ? tbtn('paid', 'Mark paid', 'btn-primary') : '',
      ['pending', 'waiting_admin', 'approved'].includes(w.status) ? tbtn('reject', 'Reject', 'btn-danger') : '',
    ].join(''),
    async onAction(a, w, ctx, b) {
      if (a === 'copy') return copyText(w.binance_uid, b);
      return formSheet({
        title: `${a === 'paid' ? 'Mark paid' : a[0].toUpperCase() + a.slice(1)} · withdrawal #${w.id}`, two: false,
        fields: [{ name: 'note', label: 'Note (optional, shown to user)', placeholder: a === 'reject' ? 'Reason — funds are refunded to the wallet' : 'Binance TX / reference' }],
        onSubmit: async (d) => { const r = await api(`/admin/withdrawals/${w.id}/review`, { method: 'POST', body: { ...d, action: a } }); ctx.reload(); return r; },
      });
    },
  });
  return live.on('admin:withdrawal', () => list.reload());
}
