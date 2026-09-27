import { describe, expect, it } from 'vitest';
import { CandleAggregator } from '../src/modules/market-data/aggregator';

const T0 = Date.UTC(2025, 0, 1, 12, 0, 0);
const trade = (id: number, p: string, q: string, t: number) => ({
  s: 'BTCUSDT',
  id: String(id),
  p,
  q,
  side: 'buy' as const,
  T: t,
});

describe('CandleAggregator', () => {
  it('waits for an authoritative seed in external mode', () => {
    const a = new CandleAggregator();
    a.track('BTCUSDT', '1m');
    expect(a.applyTrade(trade(1, '100', '1', T0)).updated).toHaveLength(0);
  });

  it('reconciles klines with trades using trade ids (dedupe)', () => {
    const a = new CandleAggregator();
    a.track('BTCUSDT', '1m');
    const k = a.applyKline({
      s: 'BTCUSDT',
      i: '1m',
      t: T0,
      o: '100',
      h: '105',
      l: '99',
      c: '101',
      v: '10',
      x: false,
      lastTradeId: '50',
    });
    expect(k?.c).toBe('101');
    // trade already included in kline (id <= 50) → ignored
    expect(a.applyTrade(trade(50, '200', '1', T0 + 1000)).updated).toHaveLength(0);
    // new trade updates high/close/volume
    const u = a.applyTrade(trade(51, '106', '0.5', T0 + 2000)).updated[0]!;
    expect([u.h, u.c, u.v]).toEqual(['106', '106', '10.5']);
    // duplicate delivery ignored
    expect(a.applyTrade(trade(51, '106', '0.5', T0 + 2000)).updated).toHaveLength(0);
    // stale kline (older last trade id) does not overwrite
    expect(
      a.applyKline({
        s: 'BTCUSDT',
        i: '1m',
        t: T0,
        o: '100',
        h: '105',
        l: '99',
        c: '101',
        v: '10',
        x: false,
        lastTradeId: '50',
      }),
    ).toBeNull();
    // newer kline wins
    expect(
      a.applyKline({
        s: 'BTCUSDT',
        i: '1m',
        t: T0,
        o: '100',
        h: '106',
        l: '98',
        c: '104',
        v: '12',
        x: false,
        lastTradeId: '60',
      })?.l,
    ).toBe('98');
  });

  it('opens a new candle at the boundary and emits the closed one', () => {
    const a = new CandleAggregator(true);
    a.track('BTCUSDT', '1m');
    a.track('BTCUSDT', '5m');
    a.applyTrade(trade(1, '100', '1', T0 + 10_000));
    a.applyTrade(trade(2, '90', '1', T0 + 20_000));
    const r = a.applyTrade(trade(3, '95', '2', T0 + 60_000));
    expect(r.closed).toHaveLength(1);
    expect(r.closed[0]).toMatchObject({
      i: '1m',
      t: T0,
      o: '100',
      h: '100',
      l: '90',
      c: '90',
      v: '2',
      x: true,
    });
    const cur1 = a.current('BTCUSDT', '1m')!;
    expect(cur1).toMatchObject({ t: T0 + 60_000, o: '95', v: '2', x: false });
    const cur5 = a.current('BTCUSDT', '5m')!;
    expect(cur5).toMatchObject({ t: T0, o: '100', l: '90', c: '95', v: '4' });
  });

  it('ignores late trades from previous candles (out-of-order)', () => {
    const a = new CandleAggregator(true);
    a.track('BTCUSDT', '1m');
    a.applyTrade(trade(10, '100', '1', T0 + 60_000));
    expect(a.applyTrade({ ...trade(11, '1', '1', T0 + 5_000) }).updated).toHaveLength(0);
    expect(a.current('BTCUSDT', '1m')!.l).toBe('100');
  });
});
