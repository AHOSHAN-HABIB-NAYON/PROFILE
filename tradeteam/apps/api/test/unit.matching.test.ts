import { describe, expect, it } from 'vitest';
import { D } from '@tradeteam/shared';
import { OrderBook } from '../src/modules/trading/book';
import { planMatch, type Incoming } from '../src/modules/trading/matching';

function book() {
  const b = new OrderBook('TSTUSDT');
  const add = (id: string, userId: number, side: 'buy' | 'sell', price: string, qty: string) =>
    b.add({ id, userId, side, price: new D(price), remaining: new D(qty), seq: b.nextSeq() });
  add('a1', 1, 'sell', '101', '1');
  add('a2', 2, 'sell', '100', '0.5');
  add('a3', 3, 'sell', '100', '0.7'); // same price, later → lower priority
  add('b1', 4, 'buy', '99', '2');
  add('b2', 5, 'buy', '98', '1');
  return b;
}

const inc = (o: Partial<Incoming>): Incoming => ({
  id: 'x',
  userId: 9,
  side: 'buy',
  kind: 'limit',
  price: null,
  quantity: null,
  quoteBudget: null,
  timeInForce: 'GTC',
  qtyPrecision: 8,
  ...o,
});

describe('OrderBook', () => {
  it('keeps price-time priority and level totals', () => {
    const b = book();
    expect(b.bestAsk()!.toFixed()).toBe('100');
    expect(b.bestBid()!.toFixed()).toBe('99');
    expect(b.depth(5).asks).toEqual([
      ['100', '1.2'],
      ['101', '1'],
    ]);
    expect([...b.opposite('buy')].map((o) => o.id)).toEqual(['a2', 'a3', 'a1']);
    b.reduce('a2', new D('0.5'));
    expect(b.has('a2')).toBe(false);
    expect(b.depth(5).asks[0]).toEqual(['100', '0.7']);
    b.remove('a3');
    expect(b.bestAsk()!.toFixed()).toBe('101');
  });
});

describe('planMatch', () => {
  it('fills a crossing limit buy across levels in priority order and rests the remainder', () => {
    const p = planMatch(book(), inc({ price: new D('100.5'), quantity: new D('1.5') }));
    expect(p.fills.map((f) => [f.maker.id, f.qty.toFixed(), f.price.toFixed()])).toEqual([
      ['a2', '0.5', '100'],
      ['a3', '0.7', '100'],
    ]);
    expect(p.filledQty.toFixed()).toBe('1.2');
    expect(p.remainingQty!.toFixed()).toBe('0.3');
    expect(p.rest).toBe(true);
  });

  it('does not mutate the book', () => {
    const b = book();
    planMatch(b, inc({ price: new D('200'), quantity: new D('10') }));
    expect(b.depth(5).asks).toHaveLength(2);
    expect(b.size()).toBe(5);
  });

  it('market buy by quote budget stops when budget is exhausted', () => {
    const p = planMatch(book(), inc({ kind: 'market', quoteBudget: new D('75'), timeInForce: 'IOC' }));
    expect(p.filledQuote.lte(75)).toBe(true);
    expect(p.filledQty.toFixed()).toBe('0.75');
    expect(p.rest).toBe(false);
  });

  it('market sell sweeps bids', () => {
    const p = planMatch(
      book(),
      inc({ side: 'sell', kind: 'market', quantity: new D('2.5'), timeInForce: 'IOC' }),
    );
    expect(p.fills.map((f) => f.maker.id)).toEqual(['b1', 'b2']);
    expect(p.filledQuote.toFixed()).toBe(new D('2').times(99).plus(new D('0.5').times(98)).toFixed());
  });

  it('IOC limit does not rest', () => {
    const p = planMatch(book(), inc({ price: new D('100'), quantity: new D('5'), timeInForce: 'IOC' }));
    expect(p.filledQty.toFixed()).toBe('1.2');
    expect(p.rest).toBe(false);
  });

  it('FOK rejects when not fully fillable and fills when it is', () => {
    expect(
      planMatch(book(), inc({ price: new D('100'), quantity: new D('2'), timeInForce: 'FOK' })).rejected,
    ).toBe('fok_unfillable');
    const ok = planMatch(book(), inc({ price: new D('101'), quantity: new D('2'), timeInForce: 'FOK' }));
    expect(ok.rejected).toBeUndefined();
    expect(ok.filledQty.toFixed()).toBe('2');
  });

  it('applies self-trade prevention (cancel maker)', () => {
    const p = planMatch(book(), inc({ userId: 2, price: new D('101'), quantity: new D('1') }));
    expect(p.selfTradeCancels.map((o) => o.id)).toEqual(['a2']);
    expect(p.fills[0]!.maker.id).toBe('a3');
  });

  it('non-crossing limit rests entirely', () => {
    const p = planMatch(book(), inc({ price: new D('99.5'), quantity: new D('1') }));
    expect(p.fills).toHaveLength(0);
    expect(p.rest).toBe(true);
  });

  it('market order without liquidity is rejected', () => {
    const p = planMatch(
      new OrderBook('X'),
      inc({ kind: 'market', quantity: new D('1'), timeInForce: 'IOC' }),
    );
    expect(p.rejected).toBe('no_liquidity');
  });

  it('respects quantity precision', () => {
    const p = planMatch(
      book(),
      inc({ kind: 'market', quoteBudget: new D('33.333'), qtyPrecision: 2, timeInForce: 'IOC' }),
    );
    expect(p.filledQty.decimalPlaces()).toBeLessThanOrEqual(2);
  });
});
