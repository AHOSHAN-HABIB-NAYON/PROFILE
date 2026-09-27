'use client';
import { memo, useMemo, useState } from 'react';
import { channelName, D, type BookLevel } from '@tradeteam/shared';
import { books, useChannels } from '@/lib/realtime';
import { fmtNum } from '@/lib/format';
import { cx } from '@/components/ui/primitives';
import { useLivePrice } from './live';
import { orderFormPrice } from './order-form';

/** Groups levels by a multiple of the tick size (display aggregation only). */
function aggregate(levels: BookLevel[], step: string | null, side: 'bid' | 'ask'): [string, string][] {
  if (!step) return levels;
  const s = new D(step);
  const map = new Map<string, InstanceType<typeof D>>();
  for (const [p, q] of levels) {
    const bucket = side === 'bid' ? new D(p).div(s).floor().times(s) : new D(p).div(s).ceil().times(s);
    const k = bucket.toFixed();
    map.set(k, (map.get(k) ?? new D(0)).plus(q));
  }
  const out = [...map].map(([p, q]) => [p, q.toFixed()] as [string, string]);
  out.sort((a, b) => (side === 'bid' ? Number(b[0]) - Number(a[0]) : Number(a[0]) - Number(b[0])));
  return out;
}

const Level = memo(function Level({
  price,
  qty,
  total,
  max,
  side,
  pricePrecision,
  qtyPrecision,
}: {
  price: string;
  qty: string;
  total: number;
  max: number;
  side: 'bid' | 'ask';
  pricePrecision: number;
  qtyPrecision: number;
}) {
  return (
    <button
      onClick={() => orderFormPrice.set({ price, t: Date.now() })}
      className="relative w-full grid grid-cols-3 px-3 h-[22px] items-center text-[12px] num hover:bg-card-2 text-left"
    >
      <span
        className={cx(
          'absolute inset-y-0 right-0 opacity-60',
          side === 'bid' ? 'bg-up-soft' : 'bg-down-soft',
        )}
        style={{ width: `${Math.min(100, (total / (max || 1)) * 100)}%` }}
      />
      <span className={cx('relative font-medium', side === 'bid' ? 'text-up' : 'text-down')}>
        {fmtNum(price, pricePrecision, pricePrecision)}
      </span>
      <span className="relative text-right text-fg-2">{fmtNum(qty, qtyPrecision)}</span>
      <span className="relative text-right text-muted">{fmtNum(String(total), qtyPrecision)}</span>
    </button>
  );
});

/**
 * Real-time order book (asks / spread / bids) with cumulative-depth bars and price aggregation.
 * Clicking a level fills the order form price. Only this component subscribes to book updates.
 */
export function OrderBook({
  symbol,
  pricePrecision,
  qtyPrecision,
  tickSize,
  depth = 12,
  quote,
  base,
}: {
  symbol: string;
  pricePrecision: number;
  qtyPrecision: number;
  tickSize: string;
  depth?: number;
  quote: string;
  base: string;
}) {
  useChannels([channelName('book', symbol)]);
  const book = books.use(symbol);
  const { price, dir } = useLivePrice(symbol);
  const steps = useMemo(() => {
    const t = new D(tickSize || '0.01');
    return [null, t.times(10).toFixed(), t.times(100).toFixed(), t.times(1000).toFixed()];
  }, [tickSize]);
  const [step, setStep] = useState<string | null>(null);
  const [view, setView] = useState<'both' | 'bids' | 'asks'>('both');

  const { asks, bids, maxTotal, spread } = useMemo(() => {
    const a = aggregate(book?.asks ?? [], step, 'ask').slice(0, view === 'both' ? depth : depth * 2);
    const b = aggregate(book?.bids ?? [], step, 'bid').slice(0, view === 'both' ? depth : depth * 2);
    let t = 0;
    const at = a.map(([p, q]) => ({ p, q, t: (t += Number(q)) }));
    t = 0;
    const bt = b.map(([p, q]) => ({ p, q, t: (t += Number(q)) }));
    const max = Math.max(at[at.length - 1]?.t ?? 0, bt[bt.length - 1]?.t ?? 0);
    const sp = a[0] && b[0] ? new D(a[0][0]).minus(b[0][0]) : null;
    return {
      asks: at.reverse(),
      bids: bt,
      maxTotal: max,
      spread: sp && b[0] ? { abs: sp.toFixed(), pct: sp.div(b[0][0]).times(100).toFixed(3) } : null,
    };
  }, [book, step, view, depth]);

  return (
    <div className="bg-card rounded-2xl border border-line shadow-card overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-3 h-11 border-b border-line">
        <div className="flex gap-1">
          {(['both', 'bids', 'asks'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cx(
                'h-7 px-2 rounded-md text-[12px] font-semibold capitalize',
                view === v ? 'bg-card-2 text-fg' : 'text-muted',
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <select
          value={step ?? ''}
          onChange={(e) => setStep(e.target.value || null)}
          className="bg-card-2 rounded-md h-7 px-2 text-[12px] outline-none"
          aria-label="Price grouping"
        >
          {steps.map((s) => (
            <option key={s ?? 'none'} value={s ?? ''}>
              {s ? fmtNum(s, 8) : fmtNum(tickSize, 8)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 px-3 h-7 items-center text-[11px] text-muted">
        <span>Price ({quote})</span>
        <span className="text-right">Amount ({base})</span>
        <span className="text-right">Total</span>
      </div>
      {!book ? (
        <div className="px-3 py-6 text-center text-[13px] text-muted">Waiting for order book…</div>
      ) : (
        <>
          {view !== 'bids' &&
            asks.map((l) => (
              <Level
                key={`a${l.p}`}
                price={l.p}
                qty={l.q}
                total={l.t}
                max={maxTotal}
                side="ask"
                pricePrecision={pricePrecision}
                qtyPrecision={qtyPrecision}
              />
            ))}
          <div className="flex items-center justify-between px-3 h-10 border-y border-line bg-card-2/50">
            <span
              className={cx(
                'text-[17px] font-bold num',
                dir > 0 ? 'text-up' : dir < 0 ? 'text-down' : 'text-fg',
              )}
            >
              {price ? fmtNum(price, pricePrecision, pricePrecision) : '—'}
            </span>
            <span className="text-[11px] text-muted num">
              {spread ? `Spread ${fmtNum(spread.abs, pricePrecision)} (${spread.pct}%)` : ''}
            </span>
          </div>
          {view !== 'asks' &&
            bids.map((l) => (
              <Level
                key={`b${l.p}`}
                price={l.p}
                qty={l.q}
                total={l.t}
                max={maxTotal}
                side="bid"
                pricePrecision={pricePrecision}
                qtyPrecision={qtyPrecision}
              />
            ))}
        </>
      )}
    </div>
  );
}
