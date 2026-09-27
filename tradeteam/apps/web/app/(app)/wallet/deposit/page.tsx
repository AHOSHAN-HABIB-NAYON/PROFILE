'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { post, get, errorMessage } from '@/lib/api';
import { fmtDateTime, fmtNum } from '@/lib/format';
import { PageHeader } from '@/components/layout/app-shell';
import {
  Card,
  CopyButton,
  Empty,
  ErrorBox,
  InfoBox,
  Row,
  Select,
  Skeleton,
  StatusBadge,
} from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/table';
import { AssetPicker, useNetworks, type AssetOption } from '@/components/market/asset-picker';

interface Address {
  address: string;
  memo: string | null;
  network: string;
  confirmations: number;
  minDeposit: string;
}
interface Dep {
  id: string;
  asset: string;
  network: string;
  amount: string;
  txid: string;
  confirmations: number;
  requiredConfirmations: number;
  status: string;
  createdAt: string;
}

export default function DepositPage() {
  const [asset, setAsset] = useState<AssetOption | null>({ symbol: 'USDT', name: 'Tether', logoUrl: null });
  const [network, setNetwork] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const nets = useNetworks(asset?.symbol);
  const usable = nets.data?.items.filter((n) => n.depositEnabled) ?? [];
  useEffect(() => {
    setNetwork(usable[0]?.code ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nets.data]);
  const addr = useMutation({
    mutationFn: () => post<Address>('/deposits', { asset: asset!.symbol, network }),
  });
  useEffect(() => {
    if (asset && network) addr.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.symbol, network]);
  useEffect(() => {
    if (!addr.data) return setQr(null);
    const css = getComputedStyle(document.documentElement);
    QRCode.toDataURL(addr.data.address, {
      margin: 1,
      width: 220,
      color: { dark: css.getPropertyValue('--fg').trim() || '#0f172a', light: '#00000000' },
    }).then(setQr);
  }, [addr.data]);
  const history = useQuery({
    queryKey: ['deposits'],
    queryFn: () => get<{ items: Dep[] }>('/deposits', { pageSize: 20 }),
    refetchInterval: 30_000,
  });
  const net = usable.find((n) => n.code === network);
  return (
    <div className="space-y-4 lg:space-y-6 max-w-3xl">
      <PageHeader title="Deposit" back="/wallet" />
      <Card className="space-y-4">
        <AssetPicker value={asset} onChange={(a) => (setAsset(a), addr.reset())} />
        {nets.isLoading ? (
          <Skeleton className="h-12" />
        ) : !usable.length ? (
          <InfoBox tone="warn">Deposits for {asset?.symbol} are not available right now.</InfoBox>
        ) : (
          <Select label="Network" value={network} onChange={(e) => setNetwork(e.target.value)}>
            {usable.map((n) => (
              <option key={n.code} value={n.code}>
                {n.name} ({n.code})
              </option>
            ))}
          </Select>
        )}
        {addr.isError && <ErrorBox message={errorMessage(addr.error)} onRetry={() => addr.mutate()} />}
        {addr.isPending && <Skeleton className="h-64" />}
        {addr.data && (
          <div className="rounded-2xl bg-card-2 p-4 flex flex-col sm:flex-row gap-5 items-center">
            <div className="bg-white rounded-2xl p-3 shrink-0">
              {qr ? (
                <img src={qr} alt="Deposit address QR code" width={180} height={180} />
              ) : (
                <Skeleton className="w-[180px] h-[180px]" />
              )}
            </div>
            <div className="min-w-0 flex-1 w-full">
              <p className="text-[12px] text-muted">
                {asset?.symbol} deposit address ({addr.data.network})
              </p>
              <p className="font-mono text-[14px] break-all mt-1">{addr.data.address}</p>
              <div className="mt-2">
                <CopyButton value={addr.data.address} label="Copy address" />
              </div>
              {addr.data.memo && (
                <div className="mt-3 rounded-xl bg-warn-soft p-3">
                  <p className="text-[12px] text-warn font-semibold">Memo / Tag (required)</p>
                  <p className="font-mono text-[15px] font-bold mt-0.5">{addr.data.memo}</p>
                  <div className="mt-1">
                    <CopyButton value={addr.data.memo} label="Copy memo" />
                  </div>
                </div>
              )}
              <div className="mt-3">
                <Row label="Minimum deposit" value={`${fmtNum(addr.data.minDeposit, 8)} ${asset?.symbol}`} />
                <Row label="Confirmations required" value={addr.data.confirmations} />
              </div>
            </div>
          </div>
        )}
        {net && (
          <InfoBox tone="warn">
            Send only {asset?.symbol} on the {net.name} network
            {addr.data?.memo ? ' and always include the memo' : ''}. Other assets or networks may be lost
            permanently.
          </InfoBox>
        )}
      </Card>
      <Card padded={false}>
        <div className="px-4 pt-4 font-semibold">Deposit history</div>
        <DataTable
          rows={history.data?.items}
          loading={history.isLoading}
          rowKey={(d) => d.id}
          mobileTitle={(d) => `${d.asset} · ${fmtDateTime(d.createdAt)}`}
          empty={<Empty icon="deposit" title="No deposits yet" />}
          columns={[
            { key: 'time', header: 'Time', hideOnMobile: true, render: (d) => fmtDateTime(d.createdAt) },
            { key: 'asset', header: 'Asset', hideOnMobile: true, render: (d) => `${d.asset} · ${d.network}` },
            { key: 'amount', header: 'Amount', align: 'right', render: (d) => fmtNum(d.amount, 8) },
            {
              key: 'conf',
              header: 'Confirmations',
              align: 'right',
              render: (d) => `${d.confirmations}/${d.requiredConfirmations}`,
            },
            {
              key: 'tx',
              header: 'Tx',
              render: (d) => <span className="font-mono text-[12px]">{d.txid.slice(0, 10)}…</span>,
            },
            { key: 'status', header: 'Status', render: (d) => <StatusBadge status={d.status} /> },
          ]}
        />
      </Card>
    </div>
  );
}
