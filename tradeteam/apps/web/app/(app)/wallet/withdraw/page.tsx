'use client';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { D } from '@tradeteam/shared';
import { post, get, del, errorMessage } from '@/lib/api';
import { useWallets } from '@/lib/hooks';
import { fmtDateTime, fmtNum } from '@/lib/format';
import { PageHeader } from '@/components/layout/app-shell';
import {
  Button,
  Card,
  Empty,
  ErrorBox,
  InfoBox,
  Input,
  Row,
  Select,
  StatusBadge,
} from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/table';
import { Sheet } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import { AssetPicker, useNetworks, type AssetOption } from '@/components/market/asset-picker';
import { useStepUp } from '@/components/auth/step-up';

interface Wd {
  id: string;
  asset: string;
  network: string;
  address: string;
  amount: string;
  fee: string;
  status: string;
  txid: string | null;
  createdAt: string;
  rejectReason: string | null;
}

export default function WithdrawPage() {
  const qc = useQueryClient();
  const wallets = useWallets();
  const options = useMemo(
    () =>
      (wallets.data?.items ?? [])
        .filter((b) => Number(b.available) > 0)
        .map((b) => ({ symbol: b.asset, name: b.name, logoUrl: b.logoUrl, extra: fmtNum(b.available, 8) })),
    [wallets.data],
  );
  const [asset, setAsset] = useState<AssetOption | null>(null);
  const [network, setNetwork] = useState('');
  const [address, setAddress] = useState('');
  const [memo, setMemo] = useState('');
  const [amount, setAmount] = useState('');
  const [confirm, setConfirm] = useState(false);
  const { guard, dialog } = useStepUp();
  useEffect(() => {
    if (!asset && options[0]) setAsset(options[0]);
  }, [options, asset]);
  const nets = useNetworks(asset?.symbol);
  const usable = nets.data?.items.filter((n) => n.withdrawEnabled) ?? [];
  useEffect(() => setNetwork(usable[0]?.code ?? ''), [nets.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const net = usable.find((n) => n.code === network);
  const available = wallets.data?.items.find((b) => b.asset === asset?.symbol)?.available ?? '0';
  const fee = useMemo(() => {
    if (!net) return new D(0);
    try {
      return new D(net.withdrawFee).plus(new D(amount || '0').times(net.withdrawFeePercent));
    } catch {
      return new D(0);
    }
  }, [net, amount]);
  const total = (() => {
    try {
      return new D(amount || '0').plus(fee);
    } catch {
      return new D(0);
    }
  })();
  const history = useQuery({
    queryKey: ['withdrawals'],
    queryFn: () => get<{ items: Wd[] }>('/withdrawals', { pageSize: 20 }),
  });
  const submit = useMutation({
    mutationFn: () =>
      guard(() =>
        post<{ id: string; status: string }>('/withdrawals', {
          asset: asset!.symbol,
          network,
          address: address.trim(),
          memo: memo.trim() || undefined,
          amount,
        }),
      ),
    onSuccess: (r) => {
      setConfirm(false);
      toast('Withdrawal requested', { body: `Status: ${r.status.replace('_', ' ')}` });
      setAmount('');
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      qc.invalidateQueries({ queryKey: ['wallets'] });
    },
    onError: (e) => {
      setConfirm(false);
      if ((e as { code?: string }).code !== 'cancelled') toast.error('Withdrawal failed', errorMessage(e));
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => del(`/withdrawals/${id}`),
    onSuccess: () => (toast('Withdrawal cancelled'), qc.invalidateQueries({ queryKey: ['withdrawals'] })),
  });
  const insufficient = total.gt(available);
  const belowMin = net && amount ? new D(amount || '0').lt(net.minWithdraw) : false;
  return (
    <div className="space-y-4 lg:space-y-6 max-w-3xl">
      <PageHeader title="Withdraw" back="/wallet" />
      {dialog}
      <Card className="space-y-4">
        {!options.length && !wallets.isLoading ? (
          <Empty icon="wallet" title="Nothing to withdraw" description="You have no available balance." />
        ) : (
          <>
            <AssetPicker value={asset} onChange={setAsset} options={options} />
            {asset && !usable.length && !nets.isLoading && (
              <InfoBox tone="warn">Withdrawals for {asset.symbol} are currently unavailable.</InfoBox>
            )}
            {!!usable.length && (
              <Select label="Network" value={network} onChange={(e) => setNetwork(e.target.value)}>
                {usable.map((n) => (
                  <option key={n.code} value={n.code}>
                    {n.name} ({n.code})
                  </option>
                ))}
              </Select>
            )}
            <Input
              label="Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Recipient address"
              autoComplete="off"
              spellCheck={false}
            />
            {net?.memoRequired && (
              <Input
                label="Memo / Tag"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                hint="Required by this network. Missing memos can cause loss of funds."
              />
            )}
            <Input
              label="Amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setAmount(e.target.value)}
              error={
                insufficient
                  ? 'Insufficient balance (including fee)'
                  : belowMin
                    ? `Minimum is ${net?.minWithdraw}`
                    : null
              }
              hint={`Available: ${fmtNum(available, 8)} ${asset?.symbol ?? ''}`}
              suffix={
                <button
                  type="button"
                  className="text-accent text-[13px] font-semibold"
                  onClick={() =>
                    net &&
                    setAmount(
                      D.max(
                        0,
                        new D(available).minus(net.withdrawFee).div(new D(1).plus(net.withdrawFeePercent)),
                      )
                        .toDecimalPlaces(8, 1)
                        .toFixed(),
                    )
                  }
                >
                  MAX
                </button>
              }
            />
            <div className="rounded-xl bg-card-2 px-4 py-2">
              <Row label="Network fee" value={`${fmtNum(fee.toFixed(), 8)} ${asset?.symbol ?? ''}`} />
              <Row label="Total deducted" value={`${fmtNum(total.toFixed(), 8)} ${asset?.symbol ?? ''}`} />
              <Row label="Recipient receives" value={`${fmtNum(amount || '0', 8)} ${asset?.symbol ?? ''}`} />
            </div>
            <Button
              block
              size="lg"
              disabled={
                !net ||
                !address ||
                !Number(amount) ||
                insufficient ||
                Boolean(belowMin) ||
                (net.memoRequired && !memo)
              }
              onClick={() => setConfirm(true)}
            >
              Withdraw
            </Button>
            <p className="text-[12px] text-muted">
              Withdrawals require 2FA or passkey verification and may be reviewed before processing.
            </p>
          </>
        )}
      </Card>
      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Confirm withdrawal"
        footer={
          <Button block size="lg" loading={submit.isPending} onClick={() => submit.mutate()}>
            Confirm & verify
          </Button>
        }
      >
        <Row label="Coin" value={asset?.symbol} />
        <Row label="Network" value={net?.name} />
        <Row label="Address" value={<span className="font-mono text-[12px] break-all">{address}</span>} />
        {memo && <Row label="Memo" value={memo} />}
        <Row label="Amount" value={`${amount} ${asset?.symbol}`} />
        <Row label="Fee" value={`${fmtNum(fee.toFixed(), 8)} ${asset?.symbol}`} />
        <Row label="Total" value={`${fmtNum(total.toFixed(), 8)} ${asset?.symbol}`} />
        <div className="mt-3">
          <InfoBox tone="warn">
            Double-check the address and network. Blockchain transfers cannot be reversed.
          </InfoBox>
        </div>
      </Sheet>
      <Card padded={false}>
        <div className="px-4 pt-4 font-semibold">Withdrawal history</div>
        {history.isError && (
          <div className="p-4">
            <ErrorBox message="Could not load withdrawals" />
          </div>
        )}
        <DataTable
          rows={history.data?.items}
          loading={history.isLoading}
          rowKey={(w) => w.id}
          mobileTitle={(w) => `${w.asset} · ${fmtDateTime(w.createdAt)}`}
          empty={<Empty icon="withdraw" title="No withdrawals yet" />}
          columns={[
            { key: 'time', header: 'Time', hideOnMobile: true, render: (w) => fmtDateTime(w.createdAt) },
            { key: 'asset', header: 'Asset', hideOnMobile: true, render: (w) => `${w.asset} · ${w.network}` },
            { key: 'amount', header: 'Amount', align: 'right', render: (w) => fmtNum(w.amount, 8) },
            {
              key: 'addr',
              header: 'Address',
              render: (w) => (
                <span className="font-mono text-[12px]">
                  {w.address.slice(0, 8)}…{w.address.slice(-6)}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (w) => (
                <span title={w.rejectReason ?? undefined}>
                  <StatusBadge status={w.status} />
                </span>
              ),
            },
            {
              key: 'act',
              header: '',
              align: 'right',
              render: (w) =>
                ['pending', 'manual_review'].includes(w.status) ? (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={cancel.isPending && cancel.variables === w.id}
                    onClick={() => cancel.mutate(w.id)}
                  >
                    Cancel
                  </Button>
                ) : w.txid ? (
                  <span className="font-mono text-[12px]">{w.txid.slice(0, 10)}…</span>
                ) : null,
            },
          ]}
        />
      </Card>
    </div>
  );
}
