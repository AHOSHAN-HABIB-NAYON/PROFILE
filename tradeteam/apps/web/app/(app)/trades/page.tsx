'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, Empty, Input, Select, cx } from '@/components/ui/primitives';
import { DataTable, Pagination } from '@/components/ui/table';
import { fmtDateTime, fmtNum, signClass } from '@/lib/format';

interface Fill {
  id: string;
  orderId: string;
  symbol: string;
  side: string;
  role: string;
  price: string;
  qty: string;
  quoteQty: string;
  fee: string;
  feeAsset: string;
  realizedPnl: string | null;
  createdAt: string;
}

export default function TradeHistoryPage() {
  const [f, setF] = useState({ symbol: '', side: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['my-trades', f, page],
    queryFn: () =>
      get<{ items: Fill[]; total: number; page: number; pageSize: number }>('/trades', {
        symbol: f.symbol.toUpperCase() || undefined,
        side: f.side || undefined,
        from: f.from || undefined,
        to: f.to || undefined,
        page,
        pageSize: 25,
      }),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => (
    setPage(1),
    setF({ ...f, [k]: e.target.value })
  );
  return (
    <div className="space-y-4">
      <PageHeader title="Trade history" />
      <Card>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Input placeholder="Pair" value={f.symbol} onChange={set('symbol')} aria-label="Pair" />
          <Select value={f.side} onChange={set('side')} aria-label="Side">
            <option value="">All sides</option>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </Select>
          <Input type="date" value={f.from} onChange={set('from')} aria-label="From" />
          <Input type="date" value={f.to} onChange={set('to')} aria-label="To" />
        </div>
      </Card>
      <Card padded={false}>
        <DataTable
          rows={q.data?.items}
          loading={q.isLoading}
          rowKey={(t) => t.id}
          mobileTitle={(t) => `${t.symbol} · ${fmtDateTime(t.createdAt)}`}
          empty={<Empty icon="chart" title="No trades yet" />}
          columns={[
            {
              key: 'time',
              header: 'Time',
              hideOnMobile: true,
              render: (t) => <span className="text-muted">{fmtDateTime(t.createdAt)}</span>,
            },
            {
              key: 'pair',
              header: 'Pair',
              hideOnMobile: true,
              render: (t) => <span className="font-semibold">{t.symbol}</span>,
            },
            {
              key: 'side',
              header: 'Side',
              render: (t) => (
                <span className={cx('font-semibold', t.side === 'buy' ? 'text-up' : 'text-down')}>
                  {t.side.toUpperCase()} <span className="text-muted font-normal text-[11px]">{t.role}</span>
                </span>
              ),
            },
            { key: 'price', header: 'Price', align: 'right', render: (t) => fmtNum(t.price, 8) },
            { key: 'qty', header: 'Amount', align: 'right', render: (t) => fmtNum(t.qty, 8) },
            { key: 'total', header: 'Total', align: 'right', render: (t) => fmtNum(t.quoteQty, 8) },
            { key: 'fee', header: 'Fee', align: 'right', render: (t) => `${fmtNum(t.fee, 8)} ${t.feeAsset}` },
            {
              key: 'pnl',
              header: 'Realized P&L',
              align: 'right',
              render: (t) => (
                <span className={signClass(t.realizedPnl)}>
                  {t.realizedPnl ? fmtNum(t.realizedPnl, 2) : '—'}
                </span>
              ),
            },
          ]}
        />
        {q.data && (
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
        )}
      </Card>
    </div>
  );
}
