import type { EventEmitter } from 'node:events';
import type { Candle, Interval, OrderBookSnapshot, PublicTrade, Ticker } from '@tradeteam/shared';

/** Normalised instrument metadata from a provider. */
export interface Instrument {
  symbol: string; // internal symbol, e.g. BTCUSDT
  providerSymbol: string;
  base: string;
  quote: string;
  type: 'spot' | 'futures';
  status: 'trading' | 'halted';
  tickSize: string;
  stepSize: string;
  minQty: string;
  maxQty: string | null;
  minNotional: string;
  maxNotional: string | null;
}

export interface AssetMeta {
  symbol: string;
  name?: string | null;
  logoUrl?: string | null;
  marketCap?: string | null;
}

/** Upstream stream kinds a provider can be asked to subscribe to. */
export type StreamKind = 'trades' | 'book' | 'kline';
export interface StreamKey {
  kind: StreamKind;
  symbol: string;
  interval?: Interval;
}

export function streamId(k: StreamKey) {
  return k.kind === 'kline' ? `kline:${k.symbol}:${k.interval}` : `${k.kind}:${k.symbol}`;
}

/**
 * Stream events emitted by a provider:
 *   'tickers'  Ticker[]              (all-market ticker batch)
 *   'trade'    PublicTrade
 *   'book'     OrderBookSnapshot
 *   'kline'    Candle & { firstTradeId?: string; lastTradeId?: string }
 *   'status'   { connected: boolean; detail?: string }
 */
export interface MarketDataProvider extends EventEmitter {
  readonly name: string;
  readonly intervals: readonly Interval[];
  fetchInstruments(): Promise<Instrument[]>;
  fetchTickers(): Promise<Ticker[]>;
  fetchCandles(
    symbol: string,
    interval: Interval,
    opts: { endTime?: number; limit: number },
  ): Promise<Candle[]>;
  fetchOrderBook(symbol: string, depth: number): Promise<OrderBookSnapshot>;
  fetchTrades(symbol: string, limit: number): Promise<PublicTrade[]>;
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribe(keys: StreamKey[]): void;
  unsubscribe(keys: StreamKey[]): void;
  health(): { connected: boolean; connections: number; streams: number; lastMessageAt: number | null };
}

export type KlineEvent = Candle & { lastTradeId?: string };
