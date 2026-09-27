/** Candle intervals supported by the platform. Provider support is advertised per provider. */
export const INTERVALS = ['1s', '1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const;
export type Interval = (typeof INTERVALS)[number];

const MS: Record<Interval, number> = {
  '1s': 1_000,
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
  '1w': 604_800_000,
};

export function isInterval(v: unknown): v is Interval {
  return typeof v === 'string' && (INTERVALS as readonly string[]).includes(v);
}

export function intervalMs(i: Interval): number {
  return MS[i];
}

/**
 * Start time (ms, UTC) of the candle that contains `ts`.
 * Weekly candles are aligned to Monday 00:00 UTC (exchange convention);
 * the Unix epoch was a Thursday, so the first Monday is 4 days later.
 */
export function candleOpenTime(ts: number, i: Interval): number {
  const ms = MS[i];
  if (i === '1w') {
    const offset = 4 * 86_400_000; // shift so that Monday is the boundary
    return Math.floor((ts - offset) / ms) * ms + offset;
  }
  return Math.floor(ts / ms) * ms;
}
