'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { post, errorMessage } from '@/lib/api';
import { fmtDateTime, fmtNum } from '@/lib/format';
import { AdminTitle, useCan } from '@/components/admin/admin-shell';
import { AdminList } from '@/components/admin/list';
import { SimpleForm, normalize, type FieldDef } from '@/components/admin/form';
import { Button, Input, Pills, StatusBadge } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';

interface D {
  id: number;
  email: string;
  uid: string;
  asset: string;
  network: string;
  address: string;
  memo: string | null;
  amount: string;
  txid: string;
  confirmations: number;
  requiredConfirmations: number;
  status: string;
  source: string;
  note: string | null;
  createdAt: string;
}
const MANUAL: FieldDef[] = [
  { name: 'asset', label: 'Asset', required: true },
  { name: 'network', label: 'Network code', required: true },
  { name: 'address', label: "User's deposit address", required: true },
  { name: 'memo', label: 'Memo (if any)' },
  { name: 'txid', label: 'Transaction hash', required: true },
  { name: 'outputIndex', label: 'Output / log index', type: 'number' },
  { name: 'amount', label: 'Amount', type: 'decimal', required: true },
  { name: 'confirmations', label: 'Confirmations', type: 'number' },
];

export default function AdminDeposits() {
  const qc = useQueryClient();
  const canManage = useCan('deposits.manage');
  const [status, setStatus] = useState('manual_review');
  const [user, setUser] = useState('');
  const [manual, setManual] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', '/admin/deposits'] });
  const act = useMutation({
    mutationFn: (a: { id: number; action: string; note?: string }) =>
      post(`/admin/deposits/${a.id}/${a.action}`, { note: a.note }),
    onSuccess: () => (toast('Deposit updated'), refresh()),
    onError: (e) => toast.error('Action failed', errorMessage(e)),
  });
  const add = useMutation({
    mutationFn: (b: Record<string, unknown>) => post('/admin/deposits', b),
    onSuccess: (r) => (
      toast(`Deposit recorded (${(r as { status: string }).status})`),
      setManual(false),
      refresh()
    ),
    onError: (e) => toast.error('Could not record deposit', errorMessage(e)),
  });
  return (
    <div className="space-y-4">
      <AdminTitle
        title="Deposits"
        subtitle="Deposits arrive from the signed chain-watcher webhook or are recorded manually after verification."
        actions={
          canManage && (
            <Button icon="plus" onClick={() => setManual(true)}>
              Record deposit
            </Button>
          )
        }
      />
      <Pills
        value={status}
        onChange={setStatus}
        items={[
          { value: '', label: 'All' },
          ...['manual_review', 'pending', 'confirming', 'credited', 'failed'].map((s) => ({
            value: s,
            label: s.replace('_', ' '),
          })),
        ]}
      />
      <AdminList<D>
        path="/admin/deposits"
        filters={{ status: status || undefined, user: user || undefined }}
        rowKey={(d) => String(d.id)}
        mobileTitle={(d) => `${d.asset} · ${d.email}`}
        toolbar={
          <div className="max-w-sm">
            <Input placeholder="User email / UID" value={user} onChange={(e) => setUser(e.target.value)} />
          </div>
        }
        columns={[
          { key: 't', header: 'Time', render: (d) => fmtDateTime(d.createdAt) },
          { key: 'u', header: 'User', render: (d) => <span className="text-[12px]">{d.email}</span> },
          { key: 'a', header: 'Asset', render: (d) => `${d.asset} · ${d.network}` },
          { key: 'amt', header: 'Amount', align: 'right', render: (d) => fmtNum(d.amount, 8) },
          {
            key: 'c',
            header: 'Conf.',
            align: 'right',
            render: (d) => `${d.confirmations}/${d.requiredConfirmations}`,
          },
          {
            key: 'tx',
            header: 'Tx',
            render: (d) => (
              <span className="font-mono text-[12px]" title={d.txid}>
                {d.txid.slice(0, 12)}…
              </span>
            ),
          },
          {
            key: 's',
            header: 'Status',
            render: (d) => (
              <span title={d.note ?? undefined}>
                <StatusBadge status={d.status} />
              </span>
            ),
          },
          ...(canManage
            ? [
                {
                  key: 'act',
                  header: '',
                  align: 'right' as const,
                  render: (d: D) =>
                    d.status !== 'credited' && d.status !== 'failed' ? (
                      <span className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="buy"
                          onClick={() =>
                            window.confirm(`Credit ${d.amount} ${d.asset} to ${d.email}?`) &&
                            act.mutate({ id: d.id, action: 'credit' })
                          }
                        >
                          Credit
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            const note = window.prompt('Reason?');
                            if (note) act.mutate({ id: d.id, action: 'reject', note });
                          }}
                        >
                          Reject
                        </Button>
                      </span>
                    ) : null,
                },
              ]
            : []),
        ]}
      />
      <Sheet open={manual} onClose={() => setManual(false)} title="Record on-chain deposit" size="lg">
        <p className="text-[13px] text-muted mb-3">
          Use only after verifying the transaction on the blockchain explorer. Crediting happens automatically
          once confirmations reach the network requirement.
        </p>
        <SimpleForm
          fields={MANUAL}
          initial={{ outputIndex: '0', confirmations: '0' }}
          busy={add.isPending}
          submitLabel="Record deposit"
          onSubmit={(v) =>
            add.mutate(
              normalize(MANUAL, {
                ...v,
                asset: String(v.asset ?? '').toUpperCase(),
                network: String(v.network ?? '').toUpperCase(),
              }),
            )
          }
        />
      </Sheet>
    </div>
  );
}
