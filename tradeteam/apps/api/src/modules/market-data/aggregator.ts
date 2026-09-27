import type { Candle, Interval, PublicTrade } from '@tradeteam/shared';
import { candleOpenTime, intervalMs, dec, fmt } from '@tradeteam/shared';
import type { KlineEvent } from './provider';

interface State {
  candle: Candle;
  lastTradeId: bigint; // highest trade id already reflected in the candle
}

function tid(id: string | undefined): bigint {
  if (!id || !/^\d+$/.test(id)) return -1n;
  return BigInt(id);
}

/**
 * Real-time OHLCV aggregation from live trades, reconciled against provider klines.
 *
 * Trades give the lowest latency (every tick updates the current candle immediately); the
 * provider's kline stream is authoritative and carries the last trade id it includes, which lets
 * us deduplicate exactly: a trade is applied only if its id is greater than the last id already
 * reflected. Out-of-order or duplicate trades are therefore ignored, late klines never overwrite
 * a more complete candle, and a new candle opens automatically when a trade crosses the boundary.
 */
export class CandleAggregator {
  private states = new Map<string, State>(); // `${symbol}|${interval}`

  /**
   * @param authoritative true when this aggregator sees *every* trade of the market (internal
   * matching engine). Then a candle can be opened from the first trade without an upstream seed.
   */
  constructor(private readonly authoritative = false) {}

  private key(s: string, i: Interval) {
    return `${s}|${i}`;
  }

  track(symbol: string, interval: Interval) {
    const k = this.key(symbol, interval);
    if (!this.states.has(k)) this.states.set(k, { candle: null as unknown as Candle, lastTradeId: -1n });
  }

  untrack(symbol: string, interval: Interval) {
    this.states.delete(this.key(symbol, interval));
  }

  tracked(symbol: string): Interval[] {
    const out: Interval[] = [];
    for (const k of this.states.keys()) {
      const [s, i] = k.split('|') as [string, Interval];
      if (s === symbol) out.push(i);
    }
    return out;
  }

  current(symbol: string, interval: Interval): Candle | null {
    return this.states.get(this.key(symbol, interval))?.candle ?? null;
  }

  /** Authoritative kline update. Returns the candle to publish, or null if stale. */
  applyKline(k: KlineEvent): Candle | null {
    const st = this.states.get(this.key(k.s, k.i));
    if (!st) return null;
    const incomingTid = tid(k.lastTradeId);
    const cur = st.candle;
    if (!cur || k.t > cur.t || (k.t === cur.t && incomingTid >= st.lastTradeId)) {
      st.candle = { s: k.s, i: k.i, t: k.t, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v, x: k.x };
      if (incomingTid >= 0n) st.lastTradeId = incomingTid;
      return st.candle;
    }
    return null;
  }

  /** Seed from a REST kline (start of subscription) without trade-id information. */
  seed(c: Candle, lastTradeId?: string) {
    const st = this.states.get(this.key(c.s, c.i));
    if (!st) return;
    if (!st.candle || c.t >= st.candle.t) {
      st.candle = { ...c };
      if (lastTradeId) st.lastTradeId = tid(lastTradeId);
    }
  }

  /**
   * Applies a trade to every tracked interval of its symbol.
   * Returns [closedCandles, updatedCandles] to publish.
   */
  applyTrade(t: PublicTrade): { closed: Candle[]; updated: Candle[] } {
    const closed: Candle[] = [];
    const updated: Candle[] = [];
    const id = tid(t.id);
    for (const interval of this.tracked(t.s)) {
      const st = this.states.get(this.key(t.s, interval))!;
      if (id >= 0n && id <= st.lastTradeId) continue; // duplicate or already in kline
      const open = candleOpenTime(t.T, interval);
      const cur = st.candle;
      if (!cur && this.authoritative) {
        st.candle = { s: t.s, i: interval, t: open, o: t.p, h: t.p, l: t.p, c: t.p, v: t.q, x: false };
        if (id >= 0n) st.lastTradeId = id;
        updated.push(st.candle);
        continue;
      }
      if (!cur) {
        // No seed yet: we cannot know the true open/high/low of a candle in progress, so we wait
        // for the authoritative kline/REST seed rather than publishing an incorrect candle.
        continue;
      }
      if (open < cur.t) continue; // late trade belonging to an older candle
      if (open >= cur.t + intervalMs(interval)) {
        if (!cur.x) closed.push({ ...cur, x: true });
        st.candle = { s: t.s, i: interval, t: open, o: t.p, h: t.p, l: t.p, c: t.p, v: t.q, x: false };
      } else {
        const p = dec(t.p);
        st.candle = {
          ...cur,
          h: p.gt(cur.h) ? t.p : cur.h,
          l: p.lt(cur.l) ? t.p : cur.l,
          c: t.p,
          v: fmt(dec(cur.v).plus(t.q)),
        };
      }
      if (id >= 0n) st.lastTradeId = id;
      updated.push(st.candle);
    }
    return { closed, updated };
  }
}
