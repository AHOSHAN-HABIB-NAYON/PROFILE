'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { get } from './api';
import type { Me, PublicConfig, Wallets } from './types';
import { onPrivate } from './realtime';
import { toast } from '@/components/ui/toast';

/** Orders placed from this tab already show their own confirmation toast. */
export const ownOrderIds = new Set<string>();

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => get<PublicConfig>('/config/public'),
    staleTime: 60_000,
  });
}

export function useSetting<T = unknown>(key: string, fallback: T): T {
  const { data } = useConfig();
  return (data?.settings?.[key] as T | undefined) ?? fallback;
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => get<{ user: Me | null }>('/auth/me').then((r) => r.user),
    staleTime: 30_000,
  });
}

export function useWallets(enabled = true) {
  return useQuery({
    queryKey: ['wallets'],
    queryFn: () => get<Wallets>('/wallets'),
    enabled,
    staleTime: 5_000,
  });
}

/**
 * Keeps React Query caches coherent with private WebSocket events: balance/order/trade events
 * patch or invalidate exactly the affected queries.
 */
export function usePrivateEvents() {
  const qc = useQueryClient();
  useEffect(
    () =>
      onPrivate((ev, data) => {
        if (ev === 'balance:updated') {
          const b = data as { asset: string; available: string; locked: string; total: string };
          qc.setQueryData<Wallets>(['wallets'], (w) => {
            if (!w) return w;
            const items = w.items.some((i) => i.asset === b.asset)
              ? w.items.map((i) =>
                  i.asset === b.asset
                    ? { ...i, available: b.available, locked: b.locked, total: b.total }
                    : i,
                )
              : [
                  ...w.items,
                  {
                    asset: b.asset,
                    name: null,
                    logoUrl: null,
                    available: b.available,
                    locked: b.locked,
                    total: b.total,
                    price: null,
                    value: null,
                  },
                ];
            return { ...w, items };
          });
          qc.invalidateQueries({ queryKey: ['portfolio'] });
        } else if (ev.startsWith('order:') || ev === 'trade:new') {
          qc.invalidateQueries({ queryKey: ['orders'] });
          qc.invalidateQueries({ queryKey: ['my-trades'] });
          if (
            ev === 'order:filled' &&
            !ownOrderIds.has((data as { clientOrderId: string | null }).clientOrderId ?? '')
          ) {
            const o = data as { symbol: string; side: string; filledQty: string };
            toast('Order filled', {
              body: `${o.side === 'buy' ? 'Bought' : 'Sold'} ${o.filledQty} ${o.symbol}`,
            });
          }
        } else if (ev === 'notification:new') {
          qc.invalidateQueries({ queryKey: ['notifications'] });
        } else if (ev === 'withdrawal:updated') {
          qc.invalidateQueries({ queryKey: ['withdrawals'] });
        } else if (ev === 'session:revoked') {
          qc.setQueryData(['me'], null);
          toast.error('Signed out', 'This session was ended from another device.');
          window.location.href = '/login';
        }
      }),
    [qc],
  );
}
