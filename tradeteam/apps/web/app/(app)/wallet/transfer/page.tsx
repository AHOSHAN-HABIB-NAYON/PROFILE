'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { post, errorMessage } from '@/lib/api';
import { useWallets, useMe } from '@/lib/hooks';
import { fmtNum } from '@/lib/format';
import { PageHeader } from '@/components/layout/app-shell';
import { Button, Card, CopyButton, InfoBox, Input } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { AssetPicker, type AssetOption } from '@/components/market/asset-picker';
import { useStepUp } from '@/components/auth/step-up';

export default function TransferPage() {
  const me = useMe().data;
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
  const [toUid, setToUid] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const { guard, dialog } = useStepUp();
  const available = wallets.data?.items.find((b) => b.asset === asset?.symbol)?.available ?? '0';
  const m = useMutation({
    mutationFn: () =>
      guard(() =>
        post('/transfers', { toUid: toUid.trim(), asset: asset!.symbol, amount, note: note || undefined }),
      ),
    onSuccess: () => {
      toast('Transfer sent', { body: `${amount} ${asset?.symbol} to UID ${toUid}` });
      setAmount('');
      qc.invalidateQueries({ queryKey: ['wallets'] });
    },
    onError: (e) =>
      (e as { code?: string }).code !== 'cancelled' && toast.error('Transfer failed', errorMessage(e)),
  });
  return (
    <div className="space-y-4 max-w-xl">
      <PageHeader
        title="Transfer"
        back="/wallet"
        subtitle="Instant, free transfers to other members by UID."
      />
      {dialog}
      <Card className="space-y-4">
        {me && (
          <div className="flex items-center justify-between rounded-xl bg-card-2 px-4 py-3 text-sm">
            <span className="text-muted">Your UID</span>
            <span className="flex items-center gap-3 font-semibold num">
              {me.uid} <CopyButton value={me.uid} />
            </span>
          </div>
        )}
        <Input
          label="Recipient UID"
          inputMode="numeric"
          value={toUid}
          onChange={(e) => setToUid(e.target.value.replace(/\D/g, ''))}
          placeholder="e.g. 482915730"
        />
        <AssetPicker value={asset} onChange={setAsset} options={options} />
        <Input
          label="Amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setAmount(e.target.value)}
          hint={`Available: ${fmtNum(available, 8)} ${asset?.symbol ?? ''}`}
          suffix={
            <button
              type="button"
              className="text-accent text-[13px] font-semibold"
              onClick={() => setAmount(available)}
            >
              MAX
            </button>
          }
        />
        <Input
          label="Note (optional)"
          value={note}
          maxLength={100}
          onChange={(e) => setNote(e.target.value)}
        />
        <InfoBox>Transfers are final. Confirm the recipient UID before sending.</InfoBox>
        <Button
          block
          size="lg"
          loading={m.isPending}
          disabled={!asset || toUid.length < 6 || !Number(amount) || Number(amount) > Number(available)}
          onClick={() => m.mutate()}
        >
          Send transfer
        </Button>
      </Card>
    </div>
  );
}
