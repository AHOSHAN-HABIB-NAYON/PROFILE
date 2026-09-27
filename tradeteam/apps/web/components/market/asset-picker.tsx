'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { Sheet } from '@/components/ui/sheet';
import { CoinIcon } from '@/components/ui/coin';
import { Icon } from '@/components/ui/icons';
import { Empty, Skeleton } from '@/components/ui/primitives';

export interface AssetOption {
  symbol: string;
  name: string | null;
  logoUrl: string | null;
  extra?: string;
}

/** Searchable asset selector (bottom sheet). Server-side search over all assets. */
export function AssetPicker({
  value,
  onChange,
  options,
  label = 'Coin',
}: {
  value: AssetOption | null;
  onChange: (a: AssetOption) => void;
  options?: AssetOption[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const remote = useQuery({
    queryKey: ['assets', q],
    queryFn: () => get<{ items: AssetOption[] }>('/assets', { q, pageSize: 100 }),
    enabled: open && !options,
  });
  const list = options
    ? options.filter(
        (o) => !q || o.symbol.includes(q.toUpperCase()) || o.name?.toLowerCase().includes(q.toLowerCase()),
      )
    : remote.data?.items;
  return (
    <div>
      <p className="text-[13px] font-medium text-fg-2 mb-1.5">{label}</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full h-14 rounded-xl border border-line-strong bg-elev px-3.5 flex items-center gap-3 text-left"
      >
        {value ? (
          <>
            <CoinIcon symbol={value.symbol} url={value.logoUrl} size={30} />
            <span className="flex-1">
              <span className="font-semibold">{value.symbol}</span>{' '}
              <span className="text-muted text-sm">{value.name}</span>
            </span>
          </>
        ) : (
          <span className="flex-1 text-muted">Select a coin</span>
        )}
        <Icon name="chevronDown" size={18} className="text-muted" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Select coin">
        <div className="flex items-center gap-2 h-11 px-3.5 rounded-xl bg-card-2 mb-3">
          <Icon name="search" size={18} className="text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="flex-1 bg-transparent outline-none"
          />
        </div>
        {!options && remote.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !list?.length ? (
          <Empty icon="coins" title="No coins found" />
        ) : (
          <div className="divide-y divide-line">
            {list.map((a) => (
              <button
                key={a.symbol}
                className="w-full flex items-center gap-3 py-3 text-left"
                onClick={() => (onChange(a), setOpen(false))}
              >
                <CoinIcon symbol={a.symbol} url={a.logoUrl} size={32} />
                <span className="flex-1">
                  <span className="font-semibold block">{a.symbol}</span>
                  <span className="text-[12px] text-muted">{a.name}</span>
                </span>
                {a.extra && <span className="text-sm num text-muted">{a.extra}</span>}
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </div>
  );
}

export interface NetworkOption {
  id: string;
  code: string;
  name: string;
  memoRequired: boolean;
  confirmations: number;
  minDeposit: string;
  minWithdraw: string;
  withdrawFee: string;
  withdrawFeePercent: string;
  depositEnabled: boolean;
  withdrawEnabled: boolean;
}

export function useNetworks(asset: string | undefined) {
  return useQuery({
    queryKey: ['networks', asset],
    queryFn: () => get<{ items: NetworkOption[] }>(`/wallets/networks/${asset}`),
    enabled: Boolean(asset),
  });
}
