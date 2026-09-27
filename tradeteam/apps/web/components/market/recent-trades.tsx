'use client';
import { useEffect } from 'react';
import { channelName, type PublicTrade } from '@tradeteam/shared';
import { trades, useChannels } from '@/lib/realtime';
import { get } from '@/lib/api';
import { fmtNum, fmtTime } from '@/lib/format';
import { cx } from '@/components/ui/primitives';

export function RecentTrades({
  symbol,
  pricePrecision,
  qtyPrecision,
  rows = 20,
}: {
  symbol: string;
  pricePrecision: number;
  qtyPrecision: number;
  rows?: number;
}) {
  useChannels([channelName('trades', symbol)]);
  const list = trades.use(symbol);
  useEffect(() => {
    if (trades.get(symbol)?.length) return;
    get<{ trades: PublicTrade[] }>(`/trades/${symbol}`, { limit: 40 })
      .then((r) => {
        if (!trades.get(symbol)?.length)
          trades.set(
            symbol,
            [...r.trades].sort((a, b) => b.T - a.T),
          );
      })
      .catch(() => undefined);
  }, [symbol]);
  return (
    <div className="bg-card rounded-2xl border border-line shadow-card overflow-hidden">
      <div className="px-3 h-11 flex items-center border-b border-line text-[13px] font-semibold">
        Recent trades
      </div>
      <div className="grid grid-cols-3 px-3 h-7 items-center text-[11px] text-muted">
        <span>Price</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Time</span>
      </div>
      {!list?.length ? (
        <div className="px-3 py-6 text-center text-[13px] text-muted">No trades yet</div>
      ) : (
        list.slice(0, rows).map((t) => (
          <div key={t.id} className="grid grid-cols-3 px-3 h-[22px] items-center text-[12px] num">
            <span className={cx('font-medium', t.side === 'buy' ? 'text-up' : 'text-down')}>
              {fmtNum(t.p, pricePrecision, pricePrecision)}
            </span>
            <span className="text-right text-fg-2">{fmtNum(t.q, qtyPrecision)}</span>
            <span className="text-right text-muted">{fmtTime(t.T)}</span>
          </div>
        ))
      )}
    </div>
  );
}
