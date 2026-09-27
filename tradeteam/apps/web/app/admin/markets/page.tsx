'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { post, patch, errorMessage } from '@/lib/api';
import { fmtDateTime, fmtNum } from '@/lib/format';
import { AdminTitle, useCan } from '@/components/admin/admin-shell';
import { AdminList } from '@/components/admin/list';
import { SimpleForm, normalize, type FieldDef } from '@/components/admin/form';
import { Badge, Button, Input, Select, StatusBadge } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';

interface M {
  id: number;
  symbol: string;
  base: string;
  quote: string;
  type: string;
  engine: string;
  provider: string;
  status: string;
  enabled: number;
  tickSize: string;
  stepSize: string;
  minQty: string;
  maxQty: string | null;
  minNotional: string;
  maxNotional: string | null;
  makerFee: string | null;
  takerFee: string | null;
  syncLocked: number;
  lastSyncedAt: string | null;
}

const EDIT: FieldDef[] = [
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    options: ['trading', 'halted', 'delisted'].map((s) => ({ value: s, label: s })),
  },
  {
    name: 'enabled',
    label: 'Visible & enabled',
    type: 'bool',
    hint: 'Disabled markets are hidden from users (the provider sync never re-enables them).',
  },
  {
    name: 'type',
    label: 'Type',
    type: 'select',
    options: [
      { value: 'spot', label: 'Spot' },
      { value: 'futures', label: 'Futures' },
    ],
  },
  {
    name: 'engine',
    label: 'Execution',
    type: 'select',
    options: [
      { value: 'external', label: 'External exchange' },
      { value: 'internal', label: 'Internal matching engine' },
    ],
  },
  { name: 'tickSize', label: 'Tick size (price precision)', type: 'decimal' },
  { name: 'stepSize', label: 'Step size (quantity precision)', type: 'decimal' },
  { name: 'minQty', label: 'Minimum order quantity', type: 'decimal' },
  { name: 'maxQty', label: 'Maximum order quantity', type: 'decimal', hint: 'Empty = no limit' },
  { name: 'minNotional', label: 'Minimum order value', type: 'decimal' },
  { name: 'maxNotional', label: 'Maximum order value', type: 'decimal', hint: 'Empty = no limit' },
  {
    name: 'makerFee',
    label: 'Maker fee rate (e.g. 0.001 = 0.1%)',
    type: 'decimal',
    hint: 'Empty = platform default',
  },
  { name: 'takerFee', label: 'Taker fee rate', type: 'decimal', hint: 'Empty = platform default' },
];
const CREATE: FieldDef[] = [
  { name: 'base', label: 'Base asset symbol', required: true },
  { name: 'quote', label: 'Quote asset symbol', required: true },
  ...EDIT.filter((f) => f.name !== 'engine'),
];

export default function AdminMarkets() {
  const qc = useQueryClient();
  const canManage = useCan('markets.manage');
  const [f, setF] = useState({ q: '', status: '', engine: '', quote: '' });
  const [edit, setEdit] = useState<M | null>(null);
  const [create, setCreate] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', '/admin/markets'] });
  const save = useMutation({
    mutationFn: (b: Record<string, unknown>) => patch(`/admin/markets/${edit!.id}`, b),
    onSuccess: () => (toast('Market updated'), setEdit(null), refresh()),
    onError: (e) => toast.error('Update failed', errorMessage(e)),
  });
  const add = useMutation({
    mutationFn: (b: Record<string, unknown>) => post('/admin/markets', { ...b, engine: 'internal' }),
    onSuccess: () => (toast('Market created'), setCreate(false), refresh()),
    onError: (e) => toast.error('Create failed', errorMessage(e)),
  });
  const sync = useMutation({
    mutationFn: () =>
      post<{ total?: number; added?: string[]; delisted?: string[]; skipped?: string }>(
        '/admin/markets/sync',
      ),
    onSuccess: (r) => (
      toast(r.skipped ?? `Synced ${r.total} markets`, {
        body: r.skipped ? undefined : `${r.added?.length ?? 0} new · ${r.delisted?.length ?? 0} delisted`,
      }),
      refresh()
    ),
    onError: (e) => toast.error('Sync failed', errorMessage(e)),
  });
  return (
    <div>
      <AdminTitle
        title="Markets"
        subtitle="All trading pairs. Provider markets sync automatically; internal markets are created here."
        actions={
          canManage && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                icon="refresh"
                loading={sync.isPending}
                onClick={() => sync.mutate()}
              >
                Sync now
              </Button>
              <Button icon="plus" onClick={() => setCreate(true)}>
                Internal market
              </Button>
            </div>
          )
        }
      />
      <AdminList<M>
        path="/admin/markets"
        filters={{
          q: f.q || undefined,
          status: f.status || undefined,
          engine: f.engine || undefined,
          quote: f.quote || undefined,
        }}
        rowKey={(m) => String(m.id)}
        onRowClick={canManage ? setEdit : undefined}
        mobileTitle={(m) => m.symbol}
        toolbar={
          <div className="grid sm:grid-cols-4 gap-2">
            <Input
              icon="search"
              placeholder="Symbol"
              value={f.q}
              onChange={(e) => setF({ ...f, q: e.target.value })}
            />
            <Input
              placeholder="Quote (USDT…)"
              value={f.quote}
              onChange={(e) => setF({ ...f, quote: e.target.value })}
            />
            <Select
              value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value })}
              aria-label="Status"
            >
              <option value="">All statuses</option>
              {['trading', 'halted', 'delisted'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
            <Select
              value={f.engine}
              onChange={(e) => setF({ ...f, engine: e.target.value })}
              aria-label="Engine"
            >
              <option value="">All engines</option>
              <option value="internal">Internal</option>
              <option value="external">External</option>
            </Select>
          </div>
        }
        columns={[
          {
            key: 'sym',
            header: 'Market',
            render: (m) => (
              <span className="font-semibold">
                {m.base}/{m.quote}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            render: (m) => (
              <span className="flex gap-1">
                <StatusBadge status={m.status} />
                {!m.enabled && <Badge tone="down">disabled</Badge>}
              </span>
            ),
          },
          { key: 'engine', header: 'Engine / source', render: (m) => `${m.engine} · ${m.provider}` },
          {
            key: 'tick',
            header: 'Tick / step',
            align: 'right',
            render: (m) => `${fmtNum(m.tickSize, 12)} / ${fmtNum(m.stepSize, 12)}`,
          },
          {
            key: 'min',
            header: 'Min qty / value',
            align: 'right',
            render: (m) => `${fmtNum(m.minQty, 12)} / ${fmtNum(m.minNotional, 8)}`,
          },
          {
            key: 'fee',
            header: 'Fees',
            align: 'right',
            render: (m) =>
              m.makerFee || m.takerFee ? `${m.makerFee ?? '—'} / ${m.takerFee ?? '—'}` : 'default',
          },
          {
            key: 'sync',
            header: 'Last sync',
            render: (m) => (m.syncLocked ? <Badge tone="accent">manual</Badge> : fmtDateTime(m.lastSyncedAt)),
          },
        ]}
      />
      <Sheet open={edit !== null} onClose={() => setEdit(null)} title={`Edit ${edit?.symbol}`} size="lg">
        {edit && (
          <SimpleForm
            fields={EDIT}
            initial={{
              ...edit,
              enabled: Boolean(edit.enabled),
              maxQty: edit.maxQty ?? '',
              maxNotional: edit.maxNotional ?? '',
              makerFee: edit.makerFee ?? '',
              takerFee: edit.takerFee ?? '',
            }}
            busy={save.isPending}
            onSubmit={(v) =>
              save.mutate(
                normalize(EDIT, v, { nullEmpty: ['maxQty', 'maxNotional', 'makerFee', 'takerFee'] }),
              )
            }
          />
        )}
      </Sheet>
      <Sheet open={create} onClose={() => setCreate(false)} title="Create internal market" size="lg">
        <SimpleForm
          fields={CREATE}
          initial={{
            status: 'trading',
            enabled: true,
            type: 'spot',
            tickSize: '0.01',
            stepSize: '0.0001',
            minQty: '0.0001',
            minNotional: '1',
          }}
          busy={add.isPending}
          submitLabel="Create market"
          onSubmit={(v) =>
            add.mutate(
              normalize(CREATE, {
                ...v,
                base: String(v.base ?? '').toUpperCase(),
                quote: String(v.quote ?? '').toUpperCase(),
              }),
            )
          }
        />
      </Sheet>
    </div>
  );
}
