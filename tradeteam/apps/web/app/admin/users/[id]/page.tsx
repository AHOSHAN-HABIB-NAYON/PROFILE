'use client';
import { use, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderDTO } from '@tradeteam/shared';
import { get, post, errorMessage } from '@/lib/api';
import { fmtDateTime, fmtNum } from '@/lib/format';
import { AdminTitle, useCan } from '@/components/admin/admin-shell';
import {
  Button,
  Card,
  Input,
  Row,
  SectionTitle,
  Skeleton,
  StatusBadge,
  Tabs,
} from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/table';
import { Sheet } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import { OrderColumns } from '@/components/market/open-orders';

type R = Record<string, string | number | null>;
interface Detail {
  user: R;
  balances: R[];
  orders: OrderDTO[];
  trades: R[];
  deposits: R[];
  withdrawals: R[];
  transactions: R[];
  sessions: R[];
  logins: R[];
  security: R[];
}

const cols = (keys: string[]) =>
  keys.map((k) => ({
    key: k,
    header: k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
    render: (r: R) =>
      k.endsWith('At') ? (
        fmtDateTime(r[k] as string)
      ) : ['amount', 'available', 'locked', 'price', 'qty', 'fee'].includes(k) ? (
        fmtNum(String(r[k] ?? '0'), 8)
      ) : k === 'status' ? (
        <StatusBadge status={String(r[k])} />
      ) : (
        String(r[k] ?? '—')
      ),
  }));

export default function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const canManage = useCan('users.manage');
  const canAdjust = useCan('balances.adjust');
  const [tab, setTab] = useState('balances');
  const [adj, setAdj] = useState<{ open: boolean; asset: string; amount: string; reason: string }>({
    open: false,
    asset: 'USDT',
    amount: '',
    reason: '',
  });
  const q = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => get<Detail>(`/admin/users/${id}`) });
  const act = useMutation({
    mutationFn: (b: { path: string; body: Record<string, unknown> }) =>
      post(`/admin/users/${id}/${b.path}`, b.body),
    onSuccess: () => (toast('Done'), qc.invalidateQueries({ queryKey: ['admin', 'user', id] })),
    onError: (e) => toast.error('Action failed', errorMessage(e)),
  });
  const adjust = useMutation({
    mutationFn: () =>
      post(`/admin/users/${id}/adjust`, {
        asset: adj.asset.toUpperCase(),
        amount: adj.amount,
        reason: adj.reason,
      }),
    onSuccess: () => (
      toast('Balance adjusted'),
      setAdj({ ...adj, open: false }),
      qc.invalidateQueries({ queryKey: ['admin', 'user', id] })
    ),
    onError: (e) => toast.error('Adjustment failed', errorMessage(e)),
  });
  if (!q.data) return <Skeleton className="h-96" />;
  const u = q.data.user;
  const confirmDo = (msg: string, path: string, body: Record<string, unknown>) =>
    window.confirm(msg) && act.mutate({ path, body });
  return (
    <div className="space-y-4">
      <AdminTitle
        title={String(u.name)}
        subtitle={`${u.email} · UID ${u.uid}`}
        actions={<StatusBadge status={String(u.status)} />}
      />
      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <SectionTitle>Account</SectionTitle>
          <Row label="User ID" value={String(u.id)} />
          <Row
            label="Email verified"
            value={u.emailVerifiedAt ? fmtDateTime(String(u.emailVerifiedAt)) : 'No'}
          />
          <Row label="Google linked" value={u.googleLinked ? 'Yes' : 'No'} />
          <Row label="Joined" value={fmtDateTime(String(u.createdAt))} />
          <Row label="Last login" value={fmtDateTime(u.lastLoginAt as string)} />
          <Row label="Failed logins" value={String(u.failedLogins)} />
          <Row label="Locked until" value={fmtDateTime(u.lockedUntil as string)} />
        </Card>
        {canManage && (
          <Card className="lg:col-span-2">
            <SectionTitle>Actions</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {u.status === 'active' ? (
                <Button
                  variant="danger"
                  onClick={() => {
                    const reason = window.prompt('Reason for suspension?') ?? '';
                    if (reason) act.mutate({ path: 'status', body: { status: 'suspended', reason } });
                  }}
                >
                  Suspend
                </Button>
              ) : (
                <Button
                  variant="buy"
                  onClick={() => act.mutate({ path: 'status', body: { status: 'active' } })}
                >
                  Activate
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => confirmDo('Sign out all sessions?', 'security', { action: 'revoke_sessions' })}
              >
                Revoke sessions
              </Button>
              <Button
                variant="secondary"
                onClick={() => confirmDo('Reset 2FA for this user?', 'security', { action: 'reset_2fa' })}
              >
                Reset 2FA
              </Button>
              <Button
                variant="secondary"
                onClick={() => confirmDo('Remove all passkeys?', 'security', { action: 'remove_passkeys' })}
              >
                Remove passkeys
              </Button>
              <Button
                variant="secondary"
                onClick={() => act.mutate({ path: 'security', body: { action: 'unlock' } })}
              >
                Unlock login
              </Button>
              {!u.emailVerifiedAt && (
                <Button
                  variant="secondary"
                  onClick={() => act.mutate({ path: 'security', body: { action: 'verify_email' } })}
                >
                  Mark email verified
                </Button>
              )}
              {canAdjust && (
                <Button variant="outline" onClick={() => setAdj({ ...adj, open: true })}>
                  Adjust balance
                </Button>
              )}
              <Button
                variant="danger"
                onClick={() => confirmDo('Close this account permanently?', 'status', { status: 'closed' })}
              >
                Close account
              </Button>
            </div>
            <p className="text-[12px] text-muted mt-3">Every action is recorded in the audit log.</p>
          </Card>
        )}
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          'balances',
          'orders',
          'trades',
          'deposits',
          'withdrawals',
          'transactions',
          'sessions',
          'logins',
          'security',
        ].map((t) => ({ value: t, label: t[0]!.toUpperCase() + t.slice(1) }))}
      />
      <Card padded={false}>
        {tab === 'orders' ? (
          <DataTable rows={q.data.orders} columns={OrderColumns()} rowKey={(o) => o.id} />
        ) : (
          <DataTable
            rows={q.data[tab as keyof Omit<Detail, 'user' | 'orders'>] as R[]}
            rowKey={(r) => String(r.id ?? r.asset)}
            columns={cols(
              {
                balances: ['asset', 'available', 'locked'],
                trades: ['createdAt', 'symbol', 'side', 'role', 'price', 'qty', 'fee', 'feeAsset'],
                deposits: ['createdAt', 'asset', 'amount', 'status', 'txid'],
                withdrawals: ['createdAt', 'asset', 'amount', 'fee', 'address', 'status', 'txid'],
                transactions: ['createdAt', 'type', 'asset', 'amount', 'status', 'description'],
                sessions: ['createdAt', 'lastSeenAt', 'ip', 'method', 'userAgent'],
                logins: ['createdAt', 'ip', 'method', 'success', 'reason'],
                security: ['createdAt', 'type', 'ip'],
              }[tab] ?? [],
            )}
          />
        )}
      </Card>
      <Sheet
        open={adj.open}
        onClose={() => setAdj({ ...adj, open: false })}
        title="Manual balance adjustment"
      >
        <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), adjust.mutate())}>
          <Input
            label="Asset"
            value={adj.asset}
            onChange={(e) => setAdj({ ...adj, asset: e.target.value })}
          />
          <Input
            label="Amount (negative to debit)"
            value={adj.amount}
            onChange={(e) => setAdj({ ...adj, amount: e.target.value })}
          />
          <Input
            label="Reason (required, audited)"
            value={adj.reason}
            onChange={(e) => setAdj({ ...adj, reason: e.target.value })}
          />
          <Button
            type="submit"
            block
            loading={adjust.isPending}
            disabled={!adj.amount || adj.reason.length < 5}
          >
            Apply adjustment
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
