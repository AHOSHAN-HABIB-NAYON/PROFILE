'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OrderDTO } from '@tradeteam/shared';
import { get } from '@/lib/api';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, Empty, Input, Select, Tabs } from '@/components/ui/primitives';
import { DataTable, Pagination } from '@/components/ui/table';
import { OrderColumns, useCancelOrder } from '@/components/market/open-orders';
import { fmtDateTime } from '@/lib/format';

export default function OrdersPage() {
  const [tab, setTab] = useState<'open' | 'history'>('open');
  const [f, setF] = useState({ symbol: '', side: '', type: '', status: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const cancel = useCancelOrder();
  const q = useQuery({
    queryKey: ['orders', 'all', tab, f, page],
    queryFn: () =>
      get<{ items: OrderDTO[]; total: number; page: number; pageSize: number }>('/orders', {
        open: tab === 'open' ? true : undefined,
        symbol: f.symbol.toUpperCase() || undefined,
        side: f.side || undefined,
        type: f.type || undefined,
        status: tab === 'history' ? f.status || undefined : undefined,
        from: f.from || undefined,
        to: f.to || undefined,
        page,
        pageSize: 25,
      }),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setPage(1);
    setF({ ...f, [k]: e.target.value });
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Orders" />
      <Tabs
        value={tab}
        onChange={(v) => (setTab(v), setPage(1))}
        items={[
          { value: 'open', label: 'Open orders' },
          { value: 'history', label: 'Order history' },
        ]}
      />
      <Card>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Input
            placeholder="Pair e.g. BTCUSDT"
            value={f.symbol}
            onChange={set('symbol')}
            aria-label="Pair"
          />
          <Select value={f.side} onChange={set('side')} aria-label="Side">
            <option value="">All sides</option>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </Select>
          <Select value={f.type} onChange={set('type')} aria-label="Type">
            <option value="">All types</option>
            {['market', 'limit', 'stop_market', 'stop_limit', 'take_profit', 'stop_loss'].map((t) => (
              <option key={t} value={t}>
                {t.replace('_', ' ')}
              </option>
            ))}
          </Select>
          {tab === 'history' ? (
            <Select value={f.status} onChange={set('status')} aria-label="Status">
              <option value="">All statuses</option>
              {['filled', 'partially_filled', 'cancelled', 'rejected', 'expired'].map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </Select>
          ) : (
            <div className="hidden md:block" />
          )}
          <Input type="date" value={f.from} onChange={set('from')} aria-label="From date" />
          <Input type="date" value={f.to} onChange={set('to')} aria-label="To date" />
        </div>
      </Card>
      <Card padded={false}>
        <DataTable
          rows={q.data?.items}
          loading={q.isLoading}
          columns={OrderColumns(
            tab === 'open' ? (o) => cancel.mutate(o) : undefined,
            cancel.isPending ? cancel.variables?.id : null,
          )}
          rowKey={(o) => o.id}
          mobileTitle={(o) => `${o.symbol} · ${fmtDateTime(o.createdAt)}`}
          empty={<Empty icon="orders" title="No orders match your filters" />}
        />
        {q.data && (
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
        )}
      </Card>
    </div>
  );
}
