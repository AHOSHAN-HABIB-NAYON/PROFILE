'use client';
import { memo, useEffect, useRef } from 'react';
import { channelName, type Ticker } from '@tradeteam/shared';
import { lastPrice, tickers, useChannels } from '@/lib/realtime';
import { fmtPct, fmtPrice, signClass } from '@/lib/format';
import { cx } from '@/components/ui/primitives';

/** Subscribes to one market's ticker channel for as long as the component is mounted. */
export function useTicker(symbol: string | null | undefined, fallback?: Ticker | null) {
  useChannels([symbol ? channelName('ticker', symbol) : null]);
  const t = tickers.use(symbol ?? null);
  return t ?? fallback ?? null;
}

export function useLivePrice(symbol: string | null | undefined, fallback?: string | null) {
  const lp = lastPrice.use(symbol ?? null);
  const t = tickers.use(symbol ?? null);
  return { price: lp?.p ?? t?.c ?? fallback ?? null, dir: lp?.dir ?? 0 };
}

/** Price cell that flashes green/red on change, re-rendering only itself. */
export const LivePrice = memo(function LivePrice({
  symbol,
  fallback,
  precision,
  className,
}: {
  symbol: string;
  fallback?: string | null;
  precision?: number;
  className?: string;
}) {
  const { price } = useLivePrice(symbol, fallback);
  const el = useRef<HTMLSpanElement>(null);
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (!el.current || !price) return;
    if (prev.current && prev.current !== price) {
      const up = Number(price) > Number(prev.current);
      el.current.classList.remove('flash-up', 'flash-down');
      void el.current.offsetWidth;
      el.current.classList.add(up ? 'flash-up' : 'flash-down');
    }
    prev.current = price;
  }, [price]);
  return (
    <span ref={el} className={cx('num rounded px-0.5 -mx-0.5', className)}>
      {fmtPrice(price, precision)}
    </span>
  );
});

export const LiveChange = memo(function LiveChange({
  symbol,
  fallback,
  pill,
}: {
  symbol: string;
  fallback?: string | null;
  pill?: boolean;
}) {
  const t = tickers.use(symbol);
  const p = t?.p ?? fallback ?? null;
  if (pill) {
    const n = Number(p ?? 0);
    return (
      <span
        className={cx(
          'inline-flex justify-center min-w-[74px] px-2 h-7 items-center rounded-lg text-[13px] font-semibold num text-white',
          n > 0 ? 'bg-up' : n < 0 ? 'bg-down' : 'bg-faint',
        )}
      >
        {fmtPct(p)}
      </span>
    );
  }
  return <span className={cx('num font-semibold', signClass(p))}>{fmtPct(p)}</span>;
});
