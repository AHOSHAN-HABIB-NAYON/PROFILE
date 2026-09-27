'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { fmtDateTime, fmtNum } from '@/lib/format';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, Empty, Pills, StatusBadge, Tabs } from '@/components/ui/primitives';
import { DataTable, Pagination } from '@/components/ui/table';

interface Tx {
  id: string;
  type: string;
  asset: string;
  amount: string;
  fee: string;
  status: string;
  description: string | null;
  createdAt: string;
}
interface Ledger {
  id: string;
  asset: string;
  type: string;
  availableDelta: string;
  lockedDelta: string;
  availableAfter: string;
  lockedAfter: string;
  refType: string;
  refId: string;
  createdAt: string;
}

export default function TransactionsPage() {
  const [view, setView] = useState<'tx' | 'ledger'>('tx');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const tx = useQuery({
    queryKey: ['transactions', type, page],
    queryFn: () =>
      get<{ items: Tx[]; total: number; page: number; pageSize: number }>('/transactions', {
        type: type || undefined,
        page,
        pageSize: 25,
      }),
    enabled: view === 'tx',
  });
  const ledger = useQuery({
    queryKey: ['ledger', page],
    queryFn: () => get<{ items: Ledger[]; page: number }>('/ledger', { page, pageSize: 50 }),
    enabled: view === 'ledger',
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Transactions" />
      <Tabs
        value={view}
        onChange={(v) => (setView(v), setPage(1))}
        items={[
          { value: 'tx', label: 'Transactions' },
          { value: 'ledger', label: 'Balance ledger' },
        ]}
      />
      {view === 'tx' && (
        <Pills
          value={type}
          onChange={(v) => (setType(v), setPage(1))}
          items={[
            { value: '', label: 'All' },
            { value: 'deposit', label: 'Deposits' },
            { value: 'withdrawal', label: 'Withdrawals' },
            { value: 'transfer_in', label: 'Received' },
            { value: 'transfer_out', label: 'Sent' },
            { value: 'adjustment', label: 'Adjustments' },
          ]}
        />
      )}
      <Card padded={false}>
        {view === 'tx' ? (
          <>
            <DataTable
              rows={tx.data?.items}
              loading={tx.isLoading}
              rowKey={(t) => t.id}
              mobileTitle={(t) => (
                <span className="capitalize">
                  {t.type.replace('_', ' ')} · {t.asset}
                </span>
              )}
              empty={<Empty icon="history" title="No transactions" />}
              columns={[
                { key: 'time', header: 'Time', render: (t) => fmtDateTime(t.createdAt) },
                {
                  key: 'type',
                  header: 'Type',
                  hideOnMobile: true,
                  render: (t) => <span className="capitalize">{t.type.replace('_', ' ')}</span>,
                },
                { key: 'asset', header: 'Asset', hideOnMobile: true, render: (t) => t.asset },
                {
                  key: 'amount',
                  header: 'Amount',
                  align: 'right',
                  render: (t) => (
                    <span className={['deposit', 'transfer_in'].includes(t.type) ? 'text-up' : ''}>
                      {['deposit', 'transfer_in'].includes(t.type) ? '+' : t.type === 'adjustment' ? '' : '-'}
                      {fmtNum(t.amount, 8)}
                    </span>
                  ),
                },
                { key: 'fee', header: 'Fee', align: 'right', render: (t) => fmtNum(t.fee, 8) },
                {
                  key: 'desc',
                  header: 'Details',
                  hideOnMobile: true,
                  render: (t) => <span className="text-muted">{t.description}</span>,
                },
                { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
              ]}
            />
            {tx.data && (
              <Pagination
                page={tx.data.page}
                pageSize={tx.data.pageSize}
                total={tx.data.total}
                onPage={setPage}
              />
            )}
          </>
        ) : (
          <DataTable
            rows={ledger.data?.items}
            loading={ledger.isLoading}
            rowKey={(l) => l.id}
            mobileTitle={(l) => `${l.asset} · ${l.type.replace(/_/g, ' ')}`}
            empty={<Empty icon="audit" title="No ledger entries" />}
            columns={[
              { key: 'time', header: 'Time', render: (l) => fmtDateTime(l.createdAt) },
              { key: 'asset', header: 'Asset', hideOnMobile: true, render: (l) => l.asset },
              { key: 'type', header: 'Entry', hideOnMobile: true, render: (l) => l.type.replace(/_/g, ' ') },
              {
                key: 'avail',
                header: 'Available Δ',
                align: 'right',
                render: (l) => (
                  <span
                    className={
                      Number(l.availableDelta) > 0
                        ? 'text-up'
                        : Number(l.availableDelta) < 0
                          ? 'text-down'
                          : 'text-muted'
                    }
                  >
                    {fmtNum(l.availableDelta, 8)}
                  </span>
                ),
              },
              { key: 'locked', header: 'Locked Δ', align: 'right', render: (l) => fmtNum(l.lockedDelta, 8) },
              {
                key: 'after',
                header: 'Balance after',
                align: 'right',
                render: (l) => fmtNum(l.availableAfter, 8),
              },
              {
                key: 'ref',
                header: 'Reference',
                render: (l) => (
                  <span className="text-muted">
                    {l.refType} #{l.refId}
                  </span>
                ),
              },
            ]}
          />
        )}
        {view === 'ledger' && (
          <div className="flex justify-end gap-2 p-3 border-t border-line">
            <button
              className="text-sm text-accent font-semibold disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Newer
            </button>
            <button
              className="text-sm text-accent font-semibold disabled:opacity-40"
              disabled={(ledger.data?.items.length ?? 0) < 50}
              onClick={() => setPage(page + 1)}
            >
              Older
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
