import type { Candle, Interval, OrderBookSnapshot, PublicTrade } from '@tradeteam/shared';
import { candleOpenTime, fmt, intervalMs } from '@tradeteam/shared';
import { redis } from '../../infrastructure/redis';
import { query } from '../../infrastructure/db';
import { logger } from '../../infrastructure/logger';
import { getSetting } from '../settings/settings.service';
import { BinanceProvider } from './binance';
import type { MarketRow } from '../markets/registry';
import { allMarkets } from '../markets/registry';
import type { MarketDataProvider } from './provider';

/**
 * Request-path market data (history & snapshots). External markets are served from the provider's
 * REST API behind Redis caching (immutable closed-candle pages cached for an hour, the live page
 * for two seconds) with a database fallback; internal markets are served from our own tables and
 * the engine's live snapshots.
 */
let restProvider: BinanceProvider | null = null;
let restSig = '';

export function providerFor(m: MarketRow): MarketDataProvider | null {
  if (m.provider !== 'binance') return null;
  const sig = getSetting('market.binance_rest_url');
  if (!restProvider || sig !== restSig) {
    restProvider = new BinanceProvider(
      getSetting('market.binance_rest_url'),
      getSetting('market.binance_ws_url'),
    );
    restSig = sig;
  }
  restProvider.setSymbolMap(
    allMarkets()
      .filter((x) => x.provider === 'binance')
      .map((x) => [x.symbol, x.provider_symbol]),
  );
  return restProvider;
}

async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = await redis().get(key);
  if (hit) return JSON.parse(hit) as T;
  // Single-flight per key across instances to avoid a thundering herd on the provider.
  const lock = await redis().set(`${key}:lock`, '1', 'PX', 3000, 'NX');
  if (!lock) {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const again = await redis().get(key);
      if (again) return JSON.parse(again) as T;
    }
  }
  try {
    const v = await fn();
    await redis().set(key, JSON.stringify(v), 'EX', ttl);
    return v;
  } finally {
    await redis().del(`${key}:lock`);
  }
}

async function dbCandles(
  m: MarketRow,
  interval: Interval,
  endTime: number | undefined,
  limit: number,
): Promise<Candle[]> {
  const rows = await query<{
    open_time: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }>(
    `SELECT open_time, open, high, low, close, volume FROM candles WHERE market_id = ? AND \`interval\` = ? ${endTime ? 'AND open_time <= ?' : ''} ORDER BY open_time DESC LIMIT ?`,
    endTime ? [m.id, interval, endTime, limit] : [m.id, interval, limit],
  );
  return rows.reverse().map((r) => ({
    s: m.symbol,
    i: interval,
    t: Number(r.open_time),
    o: fmt(r.open),
    h: fmt(r.high),
    l: fmt(r.low),
    c: fmt(r.close),
    v: fmt(r.volume),
    x: true,
  }));
}

export async function getCandles(
  m: MarketRow,
  interval: Interval,
  endTime: number | undefined,
  limit: number,
): Promise<Candle[]> {
  const p = providerFor(m);
  if (p) {
    const isLive = !endTime || endTime >= Date.now() - intervalMs(interval);
    const bucket = endTime ? candleOpenTime(endTime, interval) : 'live';
    try {
      return await cached(`cd:${m.symbol}:${interval}:${bucket}:${limit}`, isLive ? 2 : 3600, () =>
        p.fetchCandles(m.symbol, interval, { endTime, limit }),
      );
    } catch (e) {
      logger.warn({ err: (e as Error).message, symbol: m.symbol }, 'provider candles failed, using database');
      return dbCandles(m, interval, endTime, limit);
    }
  }
  const out = await dbCandles(m, interval, endTime, limit);
  if (!endTime) {
    const live = await redis().get(`md:candle:${m.symbol}:${interval}`);
    if (live) {
      const c = JSON.parse(live) as Candle;
      if (!out.length || c.t > out[out.length - 1]!.t) out.push(c);
      else if (c.t === out[out.length - 1]!.t) out[out.length - 1] = c;
    }
  }
  return out;
}

export async function getOrderBook(m: MarketRow, depth: number): Promise<OrderBookSnapshot> {
  const live = await redis().get(`md:book:${m.symbol}`);
  if (live) {
    const b = JSON.parse(live) as OrderBookSnapshot;
    if (m.provider !== 'binance' || Date.now() - b.E < 2000)
      return { ...b, bids: b.bids.slice(0, depth), asks: b.asks.slice(0, depth) };
  }
  const p = providerFor(m);
  if (p) return cached(`ob:${m.symbol}:${depth}`, 1, () => p.fetchOrderBook(m.symbol, depth));
  return { s: m.symbol, u: 0, bids: [], asks: [], E: Date.now() };
}

export async function getRecentTrades(m: MarketRow, limit: number): Promise<PublicTrade[]> {
  const live = await redis().lrange(`md:trades:${m.symbol}`, 0, limit - 1);
  if (live.length >= Math.min(limit, 20) || m.provider !== 'binance')
    return live.map((t) => JSON.parse(t) as PublicTrade);
  const p = providerFor(m)!;
  const list = await cached(`tr:${m.symbol}:${limit}`, 1, () => p.fetchTrades(m.symbol, limit));
  return [...list].reverse();
}
