'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { OrderDTO } from '@tradeteam/shared';
import { get, del, post, errorMessage } from '@/lib/api';
import { fmtDateTime, fmtNum } from '@/lib/format';
import { Button, Empty, StatusBadge, Tabs, cx } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';

const typeLabel = (t: string) => t.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function OrderColumns(
  onCancel?: (o: OrderDTO) => void,
  cancelling?: string | null,
): Column<OrderDTO>[] {
  return [
    {
      key: 'time',
      header: 'Time',
      render: (o) => <span className="text-muted">{fmtDateTime(o.createdAt)}</span>,
      hideOnMobile: true,
    },
    {
      key: 'pair',
      header: 'Pair',
      render: (o) => <span className="font-semibold">{o.symbol}</span>,
      hideOnMobile: true,
    },
    {
      key: 'type',
      header: 'Type',
      render: (o) => (
        <span>
          <span className={cx('font-semibold', o.side === 'buy' ? 'text-up' : 'text-down')}>
            {o.side.toUpperCase()}
          </span>{' '}
          · {typeLabel(o.type)}
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      render: (o) => (o.price ? fmtNum(o.price, 8) : o.stopPrice ? `@${fmtNum(o.stopPrice, 8)}` : 'Market'),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (o) => fmtNum(o.quantity ?? o.quoteQuantity ?? '0', 8),
    },
    { key: 'filled', header: 'Filled', align: 'right', render: (o) => fmtNum(o.filledQty, 8) },
    {
      key: 'avg',
      header: 'Avg price',
      align: 'right',
      render: (o) => (o.avgPrice ? fmtNum(o.avgPrice, 8) : '—'),
      hideOnMobile: true,
    },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
    ...(onCancel
      ? [
          {
            key: 'cancel',
            header: '',
            align: 'right' as const,
            render: (o: OrderDTO) =>
              ['open', 'partially_filled', 'pending'].includes(o.status) ? (
                <Button
                  size="sm"
                  variant="danger"
                  loading={cancelling === o.id}
                  onClick={(e) => (e.stopPropagation(), onCancel(o))}
                >
                  Cancel
                </Button>
              ) : null,
          },
        ]
      : []),
  ];
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (o: OrderDTO) => del<{ order: OrderDTO }>(`/orders/${o.id}`),
    onSuccess: () => {
      toast('Order cancelled');
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e) => toast.error('Cancel failed', errorMessage(e)),
  });
}

/** Open orders + order history for one market (trading terminal bottom panel). */
export function MarketOrders({ symbol }: { symbol: string }) {
  const [tab, setTab] = useState<'open' | 'history'>('open');
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['orders', symbol, tab],
    queryFn: () =>
      get<{ items: OrderDTO[] }>(
        '/orders',
        tab === 'open' ? { symbol, open: true, pageSize: 50 } : { symbol, pageSize: 50 },
      ),
  });
  const cancel = useCancelOrder();
  const cancelAll = useMutation({
    mutationFn: () => post<{ cancelled: number }>('/orders/cancel-all', { symbol }),
    onSuccess: (r) => {
      toast(`${r.cancelled} orders cancelled`);
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
  const rows =
    tab === 'history'
      ? q.data?.items.filter((o) => !['open', 'partially_filled', 'pending'].includes(o.status))
      : q.data?.items;
  return (
    <div className="bg-card rounded-2xl border border-line shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-line gap-2">
        <Tabs
          size="sm"
          value={tab}
          onChange={setTab}
          items={[
            {
              value: 'open',
              label: `Open orders${q.data && tab === 'open' ? ` (${q.data.items.length})` : ''}`,
            },
            { value: 'history', label: 'Order history' },
          ]}
        />
        {tab === 'open' && !!q.data?.items.length && (
          <Button size="sm" variant="ghost" loading={cancelAll.isPending} onClick={() => cancelAll.mutate()}>
            Cancel all
          </Button>
        )}
      </div>
      <DataTable
        rows={rows}
        loading={q.isLoading}
        columns={OrderColumns(
          tab === 'open' ? (o) => cancel.mutate(o) : undefined,
          cancel.isPending ? cancel.variables?.id : null,
        )}
        rowKey={(o) => o.id}
        mobileTitle={(o) => `${o.symbol} · ${fmtDateTime(o.createdAt)}`}
        empty={<Empty icon="orders" title={tab === 'open' ? 'No open orders' : 'No order history'} />}
      />
    </div>
  );
}
