'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { post, patch, errorMessage } from '@/lib/api';
import { fmtCompact } from '@/lib/format';
import { AdminTitle, useCan } from '@/components/admin/admin-shell';
import { AdminList } from '@/components/admin/list';
import { SimpleForm, normalize, type FieldDef } from '@/components/admin/form';
import { Badge, Button, Input, Select, StatusBadge } from '@/components/ui/primitives';
import { CoinIcon } from '@/components/ui/coin';
import { Sheet } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';

interface A {
  id: number;
  symbol: string;
  name: string | null;
  logoUrl: string | null;
  precision: number;
  marketCap: string | null;
  status: string;
  source: string;
  depositEnabled: number;
  withdrawEnabled: number;
  networks: number;
}
const FIELDS: FieldDef[] = [
  { name: 'name', label: 'Name' },
  { name: 'logoUrl', label: 'Logo URL (https)' },
  { name: 'precision', label: 'Display precision', type: 'number' },
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    options: ['active', 'disabled', 'delisted'].map((s) => ({ value: s, label: s })),
  },
  { name: 'depositEnabled', label: 'Deposits enabled', type: 'bool' },
  { name: 'withdrawEnabled', label: 'Withdrawals enabled', type: 'bool' },
];

export default function AdminAssets() {
  const qc = useQueryClient();
  const canManage = useCan('markets.manage');
  const [f, setF] = useState({ q: '', status: '' });
  const [edit, setEdit] = useState<A | null>(null);
  const [create, setCreate] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', '/admin/assets'] });
  const save = useMutation({
    mutationFn: (b: Record<string, unknown>) => patch(`/admin/assets/${edit!.id}`, b),
    onSuccess: () => (toast('Asset updated'), setEdit(null), refresh()),
    onError: (e) => toast.error('Update failed', errorMessage(e)),
  });
  const add = useMutation({
    mutationFn: (b: Record<string, unknown>) => post('/admin/assets', b),
    onSuccess: () => (toast('Asset created'), setCreate(false), refresh()),
    onError: (e) => toast.error('Create failed', errorMessage(e)),
  });
  return (
    <div>
      <AdminTitle
        title="Assets"
        subtitle="Coins synced from the market-data provider plus manually added assets."
        actions={
          canManage && (
            <Button icon="plus" onClick={() => setCreate(true)}>
              Add asset
            </Button>
          )
        }
      />
      <AdminList<A>
        path="/admin/assets"
        filters={{ q: f.q || undefined, status: f.status || undefined }}
        rowKey={(a) => String(a.id)}
        onRowClick={canManage ? setEdit : undefined}
        mobileTitle={(a) => a.symbol}
        toolbar={
          <div className="grid sm:grid-cols-2 gap-2">
            <Input
              icon="search"
              placeholder="Symbol or name"
              value={f.q}
              onChange={(e) => setF({ ...f, q: e.target.value })}
            />
            <Select
              value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value })}
              aria-label="Status"
            >
              <option value="">All</option>
              {['active', 'disabled', 'delisted'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </div>
        }
        columns={[
          {
            key: 'a',
            header: 'Asset',
            render: (a) => (
              <span className="flex items-center gap-2">
                <CoinIcon symbol={a.symbol} url={a.logoUrl} size={24} />
                <span className="font-semibold">{a.symbol}</span>
                <span className="text-muted">{a.name}</span>
              </span>
            ),
          },
          { key: 's', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
          {
            key: 'src',
            header: 'Source',
            render: (a) => <Badge tone={a.source === 'manual' ? 'accent' : 'neutral'}>{a.source}</Badge>,
          },
          {
            key: 'mc',
            header: 'Market cap',
            align: 'right',
            render: (a) => (a.marketCap ? `$${fmtCompact(a.marketCap)}` : '—'),
          },
          { key: 'n', header: 'Networks', align: 'right', render: (a) => a.networks },
          {
            key: 'dw',
            header: 'Deposit / Withdraw',
            render: (a) => `${a.depositEnabled ? 'on' : 'off'} / ${a.withdrawEnabled ? 'on' : 'off'}`,
          },
        ]}
      />
      <Sheet open={edit !== null} onClose={() => setEdit(null)} title={`Edit ${edit?.symbol}`}>
        {edit && (
          <SimpleForm
            fields={FIELDS}
            initial={{
              ...edit,
              depositEnabled: Boolean(edit.depositEnabled),
              withdrawEnabled: Boolean(edit.withdrawEnabled),
              name: edit.name ?? '',
              logoUrl: edit.logoUrl ?? '',
            }}
            busy={save.isPending}
            onSubmit={(v) => save.mutate(normalize(FIELDS, v))}
          />
        )}
      </Sheet>
      <Sheet open={create} onClose={() => setCreate(false)} title="Add asset">
        <SimpleForm
          fields={[{ name: 'symbol', label: 'Symbol', required: true }, ...FIELDS]}
          initial={{ precision: 8, status: 'active', depositEnabled: true, withdrawEnabled: true }}
          busy={add.isPending}
          submitLabel="Create"
          onSubmit={(v) =>
            add.mutate(
              normalize([{ name: 'symbol', label: '' }, ...FIELDS], {
                ...v,
                symbol: String(v.symbol ?? '').toUpperCase(),
              }),
            )
          }
        />
      </Sheet>
    </div>
  );
}
