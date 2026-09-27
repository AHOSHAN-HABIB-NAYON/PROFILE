import Decimal from 'decimal.js';
import { D, fmt, type BookLevel } from '@tradeteam/shared';

/**
 * In-memory limit order book with price-time priority.
 * Levels are kept in sorted arrays (bids descending, asks ascending) and located by binary
 * search; each level is a FIFO queue. All prices/quantities are Decimal — no floats.
 */
export interface RestingOrder {
  id: string;
  userId: number;
  side: 'buy' | 'sell';
  price: Decimal;
  remaining: Decimal;
  seq: number; // arrival sequence (time priority)
}

interface Level {
  price: Decimal;
  key: string;
  orders: RestingOrder[];
  total: Decimal;
}

export class OrderBook {
  bids: Level[] = [];
  asks: Level[] = [];
  private index = new Map<string, { side: 'buy' | 'sell'; level: Level }>();
  private seq = 0;
  version = 0;

  constructor(readonly symbol: string) {}

  nextSeq() {
    return ++this.seq;
  }

  private levels(side: 'buy' | 'sell') {
    return side === 'buy' ? this.bids : this.asks;
  }

  /** Binary search: position of price in the side's ordering. */
  private find(side: 'buy' | 'sell', price: Decimal): { idx: number; found: boolean } {
    const arr = this.levels(side);
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const cmp = arr[mid]!.price.cmp(price);
      if (cmp === 0) return { idx: mid, found: true };
      const before = side === 'buy' ? cmp > 0 : cmp < 0;
      if (before) lo = mid + 1;
      else hi = mid;
    }
    return { idx: lo, found: false };
  }

  add(o: RestingOrder) {
    const arr = this.levels(o.side);
    const { idx, found } = this.find(o.side, o.price);
    let level: Level;
    if (found) level = arr[idx]!;
    else {
      level = { price: o.price, key: o.price.toFixed(), orders: [], total: new D(0) };
      arr.splice(idx, 0, level);
    }
    level.orders.push(o);
    level.total = level.total.plus(o.remaining);
    this.index.set(o.id, { side: o.side, level });
    this.version++;
  }

  get(id: string): RestingOrder | null {
    const e = this.index.get(id);
    return e?.level.orders.find((o) => o.id === id) ?? null;
  }

  has(id: string) {
    return this.index.has(id);
  }

  remove(id: string): RestingOrder | null {
    const e = this.index.get(id);
    if (!e) return null;
    const i = e.level.orders.findIndex((o) => o.id === id);
    const [o] = e.level.orders.splice(i, 1);
    e.level.total = e.level.total.minus(o!.remaining);
    this.index.delete(id);
    if (!e.level.orders.length) {
      const arr = this.levels(e.side);
      arr.splice(arr.indexOf(e.level), 1);
    }
    this.version++;
    return o!;
  }

  /** Reduce a resting order after a fill; removes it when fully filled. */
  reduce(id: string, qty: Decimal) {
    const e = this.index.get(id);
    if (!e) return;
    const o = e.level.orders.find((x) => x.id === id)!;
    o.remaining = o.remaining.minus(qty);
    e.level.total = e.level.total.minus(qty);
    if (o.remaining.lte(0)) this.remove(id);
    else this.version++;
  }

  bestBid() {
    return this.bids[0]?.price ?? null;
  }
  bestAsk() {
    return this.asks[0]?.price ?? null;
  }

  /** Iterate opposite-side orders in priority order for an incoming order. */
  *opposite(side: 'buy' | 'sell'): Generator<RestingOrder> {
    const arr = side === 'buy' ? this.asks : this.bids;
    for (const level of arr) for (const o of level.orders) yield o;
  }

  depth(n: number): { bids: BookLevel[]; asks: BookLevel[] } {
    const map = (l: Level): BookLevel => [fmt(l.price), fmt(l.total)];
    return { bids: this.bids.slice(0, n).map(map), asks: this.asks.slice(0, n).map(map) };
  }

  levelCounts(n: number) {
    const map = (side: 'bid' | 'ask') => (l: Level) => ({
      side,
      price: l.price,
      qty: l.total,
      count: l.orders.length,
    });
    return [...this.bids.slice(0, n).map(map('bid')), ...this.asks.slice(0, n).map(map('ask'))];
  }

  size() {
    return this.index.size;
  }
}
