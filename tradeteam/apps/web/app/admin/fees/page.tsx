'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, put, errorMessage } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { AdminTitle } from '@/components/admin/admin-shell';
import { Button, Card, InfoBox, Input, SectionTitle } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';

interface F {
  id: number;
  scope: string;
  market: string | null;
  network: string | null;
  makerRate: string | null;
  takerRate: string | null;
  fixedAmount: string | null;
  percentRate: string | null;
  updatedAt: string;
}

export default function AdminFees() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'fees'], queryFn: () => get<{ items: F[] }>('/admin/fees') });
  const def = q.data?.items.find((f) => f.scope === 'trading' && !f.market);
  const [maker, setMaker] = useState('');
  const [taker, setTaker] = useState('');
  useEffect(() => {
    if (def) {
      setMaker(String(Number(def.makerRate)));
      setTaker(String(Number(def.takerRate)));
    }
  }, [def]);
  const save = useMutation({
    mutationFn: () => put('/admin/fees/default', { makerRate: maker, takerRate: taker }),
    onSuccess: () => (toast('Default fees updated'), qc.invalidateQueries({ queryKey: ['admin', 'fees'] })),
    onError: (e) => toast.error('Update failed', errorMessage(e)),
  });
  return (
    <div className="space-y-4">
      <AdminTitle title="Fees" />
      <Card className="max-w-xl">
        <SectionTitle>Default trading fees</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Maker rate"
            value={maker}
            onChange={(e) => setMaker(e.target.value)}
            hint={`${(Number(maker) * 100).toFixed(3)}%`}
          />
          <Input
            label="Taker rate"
            value={taker}
            onChange={(e) => setTaker(e.target.value)}
            hint={`${(Number(taker) * 100).toFixed(3)}%`}
          />
        </div>
        <Button className="mt-3" loading={save.isPending} onClick={() => save.mutate()}>
          Save defaults
        </Button>
      </Card>
      <InfoBox>
        Per-market trading fees are set on the{' '}
        <Link className="underline font-semibold" href="/admin/markets">
          Markets
        </Link>{' '}
        page; withdrawal fees on the{' '}
        <Link className="underline font-semibold" href="/admin/networks">
          Networks
        </Link>{' '}
        page.
      </InfoBox>
      <Card padded={false}>
        <div className="px-4 pt-4">
          <SectionTitle>Fee schedule</SectionTitle>
        </div>
        <DataTable
          rows={q.data?.items}
          loading={q.isLoading}
          rowKey={(f) => String(f.id)}
          columns={[
            { key: 's', header: 'Scope', render: (f) => f.scope },
            { key: 't', header: 'Target', render: (f) => f.market ?? f.network ?? 'Default (all markets)' },
            {
              key: 'm',
              header: 'Maker / taker',
              align: 'right',
              render: (f) =>
                f.makerRate || f.takerRate
                  ? `${Number(f.makerRate ?? 0) * 100}% / ${Number(f.takerRate ?? 0) * 100}%`
                  : '—',
            },
            {
              key: 'x',
              header: 'Fixed + rate',
              align: 'right',
              render: (f) =>
                f.fixedAmount || f.percentRate
                  ? `${Number(f.fixedAmount ?? 0)} + ${Number(f.percentRate ?? 0) * 100}%`
                  : '—',
            },
            { key: 'u', header: 'Updated', render: (f) => fmtDateTime(f.updatedAt) },
          ]}
        />
      </Card>
    </div>
  );
}
