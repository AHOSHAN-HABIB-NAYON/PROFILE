'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { post, errorMessage } from '@/lib/api';
import { fmtDateTime, fmtNum } from '@/lib/format';
import { AdminTitle, useCan } from '@/components/admin/admin-shell';
import { AdminList } from '@/components/admin/list';
import { Button, Input, Pills, StatusBadge } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';

interface W {
  id: number;
  email: string;
  asset: string;
  network: string;
  address: string;
  memo: string | null;
  amount: string;
  fee: string;
  total: string;
  status: string;
  txid: string | null;
  verification: string;
  ip: string | null;
  createdAt: string;
}

export default function AdminWithdrawals() {
  const qc = useQueryClient();
  const canManage = useCan('withdrawals.manage');
  const [status, setStatus] = useState('manual_review');
  const [user, setUser] = useState('');
  const [complete, setComplete] = useState<W | null>(null);
  const [txid, setTxid] = useState('');
  const act = useMutation({
    mutationFn: (a: { id: number; action: string; reason?: string; txid?: string }) =>
      post(`/admin/withdrawals/${a.id}/${a.action}`, { reason: a.reason, txid: a.txid }),
    onSuccess: () => (
      toast('Withdrawal updated'),
      setComplete(null),
      setTxid(''),
      qc.invalidateQueries({ queryKey: ['admin', '/admin/withdrawals'] })
    ),
    onError: (e) => toast.error('Action failed', errorMessage(e)),
  });
  const actions = (w: W) => {
    if (!canManage) return null;
    return (
      <span className="flex gap-1 justify-end">
        {['pending', 'manual_review'].includes(w.status) && (
          <Button
            size="sm"
            variant="buy"
            onClick={() =>
              window.confirm(`Approve ${w.amount} ${w.asset} to ${w.address}?`) &&
              act.mutate({ id: w.id, action: 'approve' })
            }
          >
            Approve
          </Button>
        )}
        {w.status === 'approved' && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => act.mutate({ id: w.id, action: 'processing' })}
          >
            Mark processing
          </Button>
        )}
        {['approved', 'processing'].includes(w.status) && (
          <Button size="sm" variant="primary" onClick={() => setComplete(w)}>
            Complete
          </Button>
        )}
        {['pending', 'manual_review', 'approved'].includes(w.status) && (
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              const reason = window.prompt('Rejection reason (sent to user)');
              if (reason) act.mutate({ id: w.id, action: 'reject', reason });
            }}
          >
            Reject
          </Button>
        )}
      </span>
    );
  };
  return (
    <div className="space-y-4">
      <AdminTitle
        title="Withdrawals"
        subtitle="Review → approve → broadcast from custody → complete with the transaction hash. Rejections refund the user."
      />
      <Pills
        value={status}
        onChange={setStatus}
        items={[
          { value: '', label: 'All' },
          ...['manual_review', 'pending', 'approved', 'processing', 'completed', 'rejected', 'cancelled'].map(
            (s) => ({ value: s, label: s.replace('_', ' ') }),
          ),
        ]}
      />
      <AdminList<W>
        path="/admin/withdrawals"
        filters={{ status: status || undefined, user: user || undefined }}
        rowKey={(w) => String(w.id)}
        mobileTitle={(w) => `${w.asset} · ${w.email}`}
        toolbar={
          <div className="max-w-sm">
            <Input placeholder="User email / UID" value={user} onChange={(e) => setUser(e.target.value)} />
          </div>
        }
        columns={[
          { key: 't', header: 'Time', render: (w) => fmtDateTime(w.createdAt) },
          { key: 'u', header: 'User', render: (w) => <span className="text-[12px]">{w.email}</span> },
          { key: 'a', header: 'Asset', render: (w) => `${w.asset} · ${w.network}` },
          {
            key: 'amt',
            header: 'Amount (fee)',
            align: 'right',
            render: (w) => `${fmtNum(w.amount, 8)} (${fmtNum(w.fee, 8)})`,
          },
          {
            key: 'addr',
            header: 'Address',
            render: (w) => (
              <span className="font-mono text-[12px]" title={w.address}>
                {w.address.slice(0, 10)}…{w.memo ? ` · ${w.memo}` : ''}
              </span>
            ),
          },
          { key: 'v', header: 'Verified via', render: (w) => w.verification },
          { key: 's', header: 'Status', render: (w) => <StatusBadge status={w.status} /> },
          { key: 'act', header: '', align: 'right', render: actions },
        ]}
      />
      <Sheet open={complete !== null} onClose={() => setComplete(null)} title="Complete withdrawal">
        <p className="text-[13px] text-muted mb-3">
          Enter the on-chain transaction hash after broadcasting {complete?.amount} {complete?.asset} to{' '}
          {complete?.address}.
        </p>
        <Input label="Transaction hash" value={txid} onChange={(e) => setTxid(e.target.value.trim())} />
        <Button
          className="mt-3"
          block
          loading={act.isPending}
          disabled={txid.length < 4}
          onClick={() => complete && act.mutate({ id: complete.id, action: 'complete', txid })}
        >
          Mark completed
        </Button>
      </Sheet>
    </div>
  );
}
