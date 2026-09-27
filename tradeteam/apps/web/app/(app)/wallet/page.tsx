'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useWallets } from '@/lib/hooks';
import { fmtNum, fmtUsd } from '@/lib/format';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, Empty, Skeleton, Toggle } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icons';
import { CoinIcon } from '@/components/ui/coin';

const ACTIONS: { href: string; label: string; icon: IconName }[] = [
  { href: '/wallet/deposit', label: 'Deposit', icon: 'deposit' },
  { href: '/wallet/withdraw', label: 'Withdraw', icon: 'withdraw' },
  { href: '/wallet/transfer', label: 'Transfer', icon: 'transfer' },
  { href: '/transactions', label: 'History', icon: 'history' },
];

export default function WalletPage() {
  const w = useWallets();
  const [hideSmall, setHideSmall] = useState(false);
  const [hidden, setHidden] = useState(false);
  const items = (w.data?.items ?? []).filter((b) => !hideSmall || Number(b.value ?? 1) >= 1);
  const mask = (s: string) => (hidden ? '••••••' : s);
  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title="Wallet" />
      <Card className="bg-gradient-to-br from-accent to-accent-2 !border-0 text-white">
        <div className="flex items-center justify-between">
          <p className="text-[13px] opacity-85">Total balance</p>
          <button onClick={() => setHidden((h) => !h)} className="opacity-85" aria-label="Hide balances">
            <Icon name={hidden ? 'eyeOff' : 'eye'} size={18} />
          </button>
        </div>
        {w.isLoading ? (
          <Skeleton className="h-10 w-48 mt-1 opacity-40" />
        ) : (
          <p className="text-[34px] font-extrabold num">{mask(fmtUsd(w.data?.totalValue))}</p>
        )}
        <div className="grid grid-cols-2 gap-3 mt-3 text-[13px]">
          <div>
            <p className="opacity-75">Available</p>
            <p className="font-semibold num">{mask(fmtUsd(w.data?.availableValue))}</p>
          </div>
          <div>
            <p className="opacity-75">Locked in orders / withdrawals</p>
            <p className="font-semibold num">{mask(fmtUsd(w.data?.lockedValue))}</p>
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-4 gap-2">
        {ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-card border border-line shadow-card"
          >
            <span className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
              <Icon name={a.icon} />
            </span>
            <span className="text-[12px] font-semibold">{a.label}</span>
          </Link>
        ))}
      </div>
      <Card padded={false}>
        <div className="flex items-center justify-between px-4 pt-3">
          <h2 className="font-semibold">Assets</h2>
          <div className="w-52">
            <Toggle
              checked={hideSmall}
              onChange={setHideSmall}
              label={<span className="text-[13px] text-muted">Hide small balances</span>}
            />
          </div>
        </div>
        {w.isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : !items.length ? (
          <Empty
            icon="wallet"
            title="No assets yet"
            description="Deposit crypto to get started."
            action={
              <Link href="/wallet/deposit" className="text-accent font-semibold text-sm">
                Deposit
              </Link>
            }
          />
        ) : (
          <div className="divide-y divide-line">
            {items.map((b) => (
              <div key={b.asset} className="flex items-center gap-3 px-4 py-3">
                <CoinIcon symbol={b.asset} url={b.logoUrl} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{b.asset}</div>
                  <div className="text-[12px] text-muted truncate">{b.name ?? b.asset}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold num">{mask(fmtNum(b.total, 8))}</div>
                  <div className="text-[12px] text-muted num">
                    {mask(b.value ? fmtUsd(b.value) : '—')}
                    {Number(b.locked) > 0 && ` · ${fmtNum(b.locked, 8)} locked`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
