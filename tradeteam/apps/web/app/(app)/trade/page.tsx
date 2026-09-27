'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { MarketDTO } from '@tradeteam/shared';
import { get } from '@/lib/api';
import { Spinner } from '@/components/ui/primitives';

function Redirect() {
  const router = useRouter();
  const side = useSearchParams().get('side');
  useEffect(() => {
    let last: string | null = null;
    try {
      last = localStorage.getItem('tt-last-market');
    } catch {
      /* ignore */
    }
    const go = (s: string) => router.replace(`/trade/${s}${side ? `?side=${side}` : ''}`);
    if (last) return go(last);
    get<{ items: MarketDTO[] }>('/markets', { category: 'USDT', sort: 'volume', pageSize: 1 })
      .then((r) => go(r.items[0]?.symbol ?? 'BTCUSDT'))
      .catch(() => go('BTCUSDT'));
  }, [router, side]);
  return (
    <div className="flex justify-center py-20 text-muted">
      <Spinner />
    </div>
  );
}

export default function TradeIndex() {
  return (
    <Suspense>
      <Redirect />
    </Suspense>
  );
}
