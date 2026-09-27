import { describe, expect, it } from 'vitest';
import {
  candleOpenTime,
  intervalMs,
  parseChannel,
  channelName,
  sma,
  ema,
  rsi,
  bollinger,
  vwap,
  macd,
  dec,
  floorTo,
  fmt,
  toDb,
  stepToPrecision,
  isDecimalString,
} from '../src/index';

describe('intervals', () => {
  it('aligns minute candles', () => {
    expect(candleOpenTime(Date.UTC(2024, 0, 1, 10, 5, 42), '1m')).toBe(Date.UTC(2024, 0, 1, 10, 5));
    expect(candleOpenTime(Date.UTC(2024, 0, 1, 10, 7, 0), '5m')).toBe(Date.UTC(2024, 0, 1, 10, 5));
    expect(intervalMs('4h')).toBe(14_400_000);
  });
  it('aligns weekly candles to Monday', () => {
    // 2024-01-03 is a Wednesday, week starts Monday 2024-01-01
    expect(candleOpenTime(Date.UTC(2024, 0, 3, 12), '1w')).toBe(Date.UTC(2024, 0, 1));
    expect(new Date(candleOpenTime(Date.UTC(2025, 5, 15), '1w')).getUTCDay()).toBe(1);
  });
});

describe('channels', () => {
  it('round trips', () => {
    expect(parseChannel(channelName('candles', 'BTCUSDT', '1m'))).toEqual({
      kind: 'candles',
      symbol: 'BTCUSDT',
      interval: '1m',
    });
    expect(parseChannel('book:ETHBTC')).toEqual({ kind: 'book', symbol: 'ETHBTC' });
    expect(parseChannel('book:eth')).toBeNull();
    expect(parseChannel('candles:BTCUSDT:2m')).toBeNull();
    expect(parseChannel('ticker:../../x')).toBeNull();
  });
});

describe('decimal', () => {
  it('avoids float errors', () => {
    expect(dec('0.1').plus('0.2').toFixed()).toBe('0.3');
    expect(floorTo('1.23456789', 4).toFixed()).toBe('1.2345');
    expect(fmt('1.2300')).toBe('1.23');
    expect(fmt('100')).toBe('100');
    expect(toDb('1.5', 4)).toBe('1.5000');
    expect(stepToPrecision('0.00010000')).toBe(4);
    expect(stepToPrecision('1.00000000')).toBe(0);
    expect(isDecimalString('12.5')).toBe(true);
    expect(isDecimalString('-1')).toBe(false);
    expect(isDecimalString('1e5')).toBe(false);
  });
});

describe('indicators', () => {
  const data = Array.from({ length: 60 }, (_, i) => ({
    time: i * 60,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i + (i % 3),
    volume: 10 + i,
  }));
  it('sma', () => {
    const s = sma(data, 5);
    expect(s).toHaveLength(56);
    expect(s[0]!.value).toBeCloseTo((100 + 102 + 104 + 103 + 105) / 5);
  });
  it('ema seeds with sma', () => {
    const e = ema(data, 5);
    expect(e[0]!.value).toBeCloseTo(sma(data, 5)[0]!.value);
  });
  it('rsi within range', () => {
    for (const p of rsi(data)) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(100);
    }
  });
  it('bollinger bands ordered', () => {
    const b = bollinger(data);
    b.upper.forEach((u, i) => expect(u.value).toBeGreaterThanOrEqual(b.lower[i]!.value));
  });
  it('macd lengths', () => {
    const m = macd(data);
    expect(m.signal.length).toBe(m.histogram.length);
    expect(m.macd.length).toBe(60 - 25);
  });
  it('vwap', () => {
    expect(vwap(data)).toHaveLength(60);
  });
});
