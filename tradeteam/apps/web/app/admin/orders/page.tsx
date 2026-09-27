'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderDTO } from '@tradeteam/shared';
import { get, post, errorMessage } from '@/lib/api';
import { fmtDateTime, fmtNum } from '@/lib/format';
import { AdminTitle, useCan } from '@/components/admin/admin-shell';
import { AdminList } from '@/components/admin/list';
import { Button, Input, Row, Select, Skeleton, StatusBadge, cx } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/table';
import { Sheet } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';

type O = OrderDTO & {
  userId: string;
  email: string;
  uid: string;
  engine: string;
  externalId: string | null;
  lockedRemaining: string;
};

function OrderDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const canManage = useCan('orders.manage');
  const q = useQuery({
    queryKey: ['admin', 'order', id],
    queryFn: () =>
      get<{ order: O; fills: Record<string, string>[]; ledger: Record<string, string>[] }>(
        `/admin/orders/${id}`,
      ),
  });
  const cancel = useMutation({
    mutationFn: () => post(`/admin/orders/${id}/cancel`),
    onSuccess: () => (toast('Order cancelled'), qc.invalidateQueries({ queryKey: ['admin'] }), onClose()),
    onError: (e) => toast.error('Cancel failed', errorMessage(e)),
  });
  if (!q.data) return <Skeleton className="h-60" />;
  const o = q.data.order;
  return (
    <div className="space-y-4">
      <div>
        <Row label="Order ID" value={o.id} />
        <Row label="User" value={`${o.userId}`} />
        <Row label="Market" value={o.symbol} />
        <Row label="Side / type" value={`${o.side} · ${o.type} · ${o.timeInForce}`} />
        <Row label="Status" value={<StatusBadge status={o.status} />} />
        <Row label="Price / trigger" value={`${o.price ?? 'market'} / ${o.stopPrice ?? '—'}`} />
        <Row label="Quantity / quote" value={`${o.quantity ?? '—'} / ${o.quoteQuantity ?? '—'}`} />
        <Row label="Filled" value={`${o.filledQty} (avg ${o.avgPrice ?? '—'})`} />
        <Row label="Fees" value={`${o.fee} ${o.feeAsset ?? ''}`} />
        <Row label="Locked remaining" value={o.lockedRemaining} />
        <Row label="Engine" value={`${o.engine}${o.externalId ? ` · ext ${o.externalId}` : ''}`} />
        <Row label="Reject reason" value={o.rejectReason ?? '—'} />
        <Row label="Created" value={fmtDateTime(o.createdAt)} />
      </div>
      <p className="font-semibold text-sm">Fills</p>
      <DataTable
        rows={q.data.fills}
        rowKey={(f) => f.id!}
        columns={['role', 'price', 'qty', 'fee', 'feeAsset'].map((k) => ({
          key: k,
          header: k,
          render: (f: Record<string, string>) => f[k],
        }))}
      />
      <p className="font-semibold text-sm">Ledger (locks/unlocks)</p>
      <DataTable
        rows={q.data.ledger}
        rowKey={(f) => f.id!}
        columns={['type', 'asset', 'availableDelta', 'lockedDelta'].map((k) => ({
          key: k,
          header: k,
          render: (f: Record<string, string>) => f[k],
        }))}
      />
      {canManage && ['open', 'partially_filled', 'pending'].includes(o.status) && (
        <Button variant="danger" block loading={cancel.isPending} onClick={() => cancel.mutate()}>
          Cancel order
        </Button>
      )}
    </div>
  );
}

export default function AdminOrders() {
  const [f, setF] = useState({ id: '', symbol: '', status: '', side: '', type: '', user: '' });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <AdminTitle title="Orders" />
      <AdminList<O>
        path="/admin/orders"
        filters={Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v || undefined]))}
        rowKey={(o) => o.id}
        onRowClick={(o) => setOpen(o.id)}
        mobileTitle={(o) => `#${o.id} ${o.symbol}`}
        toolbar={
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <Input
              placeholder="Order ID"
              value={f.id}
              onChange={(e) => setF({ ...f, id: e.target.value.replace(/\D/g, '') })}
            />
            <Input
              placeholder="Symbol"
              value={f.symbol}
              onChange={(e) => setF({ ...f, symbol: e.target.value })}
            />
            <Input
              placeholder="User email / UID"
              value={f.user}
              onChange={(e) => setF({ ...f, user: e.target.value })}
            />
            <Select
              value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value })}
              aria-label="Status"
            >
              <option value="">All statuses</option>
              <option value="open">Open (any)</option>
              {['pending', 'partially_filled', 'filled', 'cancelled', 'rejected', 'expired'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
            <Select value={f.side} onChange={(e) => setF({ ...f, side: e.target.value })} aria-label="Side">
              <option value="">Both sides</option>
              <option>buy</option>
              <option>sell</option>
            </Select>
            <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label="Type">
              <option value="">All types</option>
              {['market', 'limit', 'stop_market', 'stop_limit', 'take_profit', 'stop_loss'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </div>
        }
        columns={[
          { key: 'id', header: 'ID', render: (o) => `#${o.id}` },
          { key: 't', header: 'Time', render: (o) => fmtDateTime(o.createdAt) },
          { key: 'u', header: 'User', render: (o) => <span className="text-[12px]">{o.email}</span> },
          { key: 'm', header: 'Market', render: (o) => <span className="font-semibold">{o.symbol}</span> },
          {
            key: 's',
            header: 'Side',
            render: (o) => (
              <span className={cx('font-semibold', o.side === 'buy' ? 'text-up' : 'text-down')}>
                {o.side} · {o.type}
              </span>
            ),
          },
          {
            key: 'p',
            header: 'Price',
            align: 'right',
            render: (o) => (o.price ? fmtNum(o.price, 8) : 'mkt'),
          },
          {
            key: 'q',
            header: 'Qty / filled',
            align: 'right',
            render: (o) => `${fmtNum(o.quantity ?? o.quoteQuantity ?? '0', 8)} / ${fmtNum(o.filledQty, 8)}`,
          },
          { key: 'st', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
          { key: 'e', header: 'Engine', render: (o) => o.engine },
        ]}
      />
      <Sheet open={open !== null} onClose={() => setOpen(null)} title={`Order #${open}`} size="lg">
        {open && <OrderDetail id={open} onClose={() => setOpen(null)} />}
      </Sheet>
    </div>
  );
}
