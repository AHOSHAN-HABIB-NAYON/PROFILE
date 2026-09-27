'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, patch, errorMessage } from '@/lib/api';
import { fmtNum } from '@/lib/format';
import { AdminTitle, useCan } from '@/components/admin/admin-shell';
import { SimpleForm, normalize, type FieldDef } from '@/components/admin/form';
import { Badge, Button, Card, InfoBox, Input, StatusBadge } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/table';
import { Sheet } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';

interface N {
  id: number;
  asset: string;
  code: string;
  name: string;
  chainFamily: string;
  depositMode: string;
  hasXpub: number;
  staticAddress: string | null;
  contractAddress: string | null;
  memoRequired: number;
  addressRegex: string | null;
  explorerTxUrl: string | null;
  confirmations: number;
  minDeposit: string;
  minWithdraw: string;
  depositEnabled: number;
  withdrawEnabled: number;
  status: string;
  withdrawFee: string | null;
  withdrawFeePercent: string | null;
}

const FIELDS: FieldDef[] = [
  { name: 'name', label: 'Display name', required: true },
  {
    name: 'chainFamily',
    label: 'Chain family',
    type: 'select',
    options: ['evm', 'bitcoin', 'tron', 'solana', 'other'].map((v) => ({ value: v, label: v })),
  },
  {
    name: 'depositMode',
    label: 'Deposit address mode',
    type: 'select',
    options: [
      { value: 'static', label: 'Static address + per-user memo' },
      { value: 'xpub', label: 'HD xpub derivation (EVM)' },
    ],
  },
  {
    name: 'xpub',
    label: 'Extended public key (xpub) — stored encrypted, never a private key',
    hint: 'Leave empty to keep the current key',
  },
  { name: 'staticAddress', label: 'Static deposit address' },
  { name: 'memoRequired', label: 'Memo / tag required', type: 'bool' },
  { name: 'contractAddress', label: 'Token contract address' },
  { name: 'addressRegex', label: 'Withdrawal address regex', placeholder: '^0x[a-fA-F0-9]{40}$' },
  { name: 'explorerTxUrl', label: 'Explorer tx URL template', placeholder: 'https://etherscan.io/tx/{txid}' },
  { name: 'confirmations', label: 'Required confirmations', type: 'number' },
  { name: 'minDeposit', label: 'Minimum deposit', type: 'decimal' },
  { name: 'minWithdraw', label: 'Minimum withdrawal', type: 'decimal' },
  { name: 'withdrawFee', label: 'Withdrawal fee (fixed)', type: 'decimal' },
  { name: 'withdrawFeePercent', label: 'Withdrawal fee (rate, 0.001 = 0.1%)', type: 'decimal' },
  { name: 'depositEnabled', label: 'Deposits enabled', type: 'bool' },
  { name: 'withdrawEnabled', label: 'Withdrawals enabled', type: 'bool' },
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'active', label: 'active' },
      { value: 'disabled', label: 'disabled' },
    ],
  },
];

export default function AdminNetworks() {
  const qc = useQueryClient();
  const canManage = useCan('markets.manage');
  const [asset, setAsset] = useState('');
  const [edit, setEdit] = useState<N | null>(null);
  const [create, setCreate] = useState(false);
  const q = useQuery({
    queryKey: ['admin', 'networks', asset],
    queryFn: () => get<{ items: N[] }>('/admin/networks', { asset: asset.toUpperCase() || undefined }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'networks'] });
  const save = useMutation({
    mutationFn: (b: Record<string, unknown>) => patch(`/admin/networks/${edit!.id}`, b),
    onSuccess: () => (toast('Network updated'), setEdit(null), refresh()),
    onError: (e) => toast.error('Update failed', errorMessage(e)),
  });
  const add = useMutation({
    mutationFn: (b: Record<string, unknown>) => post('/admin/networks', b),
    onSuccess: () => (toast('Network created'), setCreate(false), refresh()),
    onError: (e) => toast.error('Create failed', errorMessage(e)),
  });
  return (
    <div className="space-y-4">
      <AdminTitle
        title="Networks"
        subtitle="Deposit/withdrawal networks per asset, confirmations and fees."
        actions={
          canManage && (
            <Button icon="plus" onClick={() => setCreate(true)}>
              Add network
            </Button>
          )
        }
      />
      <InfoBox>
        Private keys are never stored on this server. Deposits are derived from an extended public key or a
        static address with memos; withdrawals are signed and broadcast by your custody process, then
        completed here with the transaction hash.
      </InfoBox>
      <Card padded={false}>
        <div className="p-3 border-b border-line max-w-xs">
          <Input
            icon="search"
            placeholder="Filter by asset"
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
          />
        </div>
        <DataTable
          rows={q.data?.items}
          loading={q.isLoading}
          rowKey={(n) => String(n.id)}
          onRowClick={canManage ? setEdit : undefined}
          mobileTitle={(n) => `${n.asset} · ${n.code}`}
          columns={[
            { key: 'a', header: 'Asset', render: (n) => <span className="font-semibold">{n.asset}</span> },
            { key: 'c', header: 'Network', render: (n) => `${n.name} (${n.code})` },
            {
              key: 'm',
              header: 'Deposit mode',
              render: (n) => (
                <span className="flex gap-1">
                  <Badge>{n.depositMode}</Badge>
                  {n.memoRequired ? <Badge tone="warn">memo</Badge> : null}
                  {n.depositMode === 'xpub' && !n.hasXpub && <Badge tone="down">no xpub</Badge>}
                </span>
              ),
            },
            { key: 'conf', header: 'Confirmations', align: 'right', render: (n) => n.confirmations },
            {
              key: 'min',
              header: 'Min dep / wd',
              align: 'right',
              render: (n) => `${fmtNum(n.minDeposit, 8)} / ${fmtNum(n.minWithdraw, 8)}`,
            },
            {
              key: 'fee',
              header: 'Withdraw fee',
              align: 'right',
              render: (n) =>
                `${fmtNum(n.withdrawFee ?? '0', 8)}${Number(n.withdrawFeePercent ?? 0) ? ` + ${Number(n.withdrawFeePercent) * 100}%` : ''}`,
            },
            {
              key: 's',
              header: 'Status',
              render: (n) => (
                <span className="flex gap-1">
                  <StatusBadge status={n.status} />
                  {!n.depositEnabled && <Badge tone="down">dep off</Badge>}
                  {!n.withdrawEnabled && <Badge tone="down">wd off</Badge>}
                </span>
              ),
            },
          ]}
        />
      </Card>
      <Sheet
        open={edit !== null}
        onClose={() => setEdit(null)}
        title={`${edit?.asset} · ${edit?.code}`}
        size="lg"
      >
        {edit && (
          <SimpleForm
            fields={FIELDS}
            initial={{
              ...edit,
              xpub: '',
              memoRequired: Boolean(edit.memoRequired),
              depositEnabled: Boolean(edit.depositEnabled),
              withdrawEnabled: Boolean(edit.withdrawEnabled),
              staticAddress: edit.staticAddress ?? '',
              contractAddress: edit.contractAddress ?? '',
              addressRegex: edit.addressRegex ?? '',
              explorerTxUrl: edit.explorerTxUrl ?? '',
              withdrawFee: edit.withdrawFee ?? '0',
              withdrawFeePercent: edit.withdrawFeePercent ?? '0',
            }}
            busy={save.isPending}
            onSubmit={(v) =>
              save.mutate(
                normalize(FIELDS, v, {
                  nullEmpty: ['staticAddress', 'contractAddress', 'addressRegex', 'explorerTxUrl'],
                }),
              )
            }
          />
        )}
      </Sheet>
      <Sheet open={create} onClose={() => setCreate(false)} title="Add network" size="lg">
        <SimpleForm
          fields={[
            { name: 'asset', label: 'Asset symbol', required: true },
            { name: 'code', label: 'Network code (e.g. ERC20, TRC20, BEP20)', required: true },
            ...FIELDS,
          ]}
          initial={{
            chainFamily: 'evm',
            depositMode: 'static',
            confirmations: '12',
            minDeposit: '0',
            minWithdraw: '0',
            withdrawFee: '0',
            withdrawFeePercent: '0',
            depositEnabled: true,
            withdrawEnabled: true,
            status: 'active',
          }}
          busy={add.isPending}
          submitLabel="Create"
          onSubmit={(v) =>
            add.mutate(
              normalize([{ name: 'asset', label: '' }, { name: 'code', label: '' }, ...FIELDS], {
                ...v,
                asset: String(v.asset ?? '').toUpperCase(),
                code: String(v.code ?? '').toUpperCase(),
              }),
            )
          }
        />
      </Sheet>
    </div>
  );
}
