import type { Interval } from './intervals';

/** All monetary values travel as decimal strings. Never as JS numbers. */
export type Dec = string;

export interface Ticker {
  s: string; // symbol
  c: Dec; // last price
  o: Dec; // open 24h
  h: Dec;
  l: Dec;
  v: Dec; // base volume
  q: Dec; // quote volume
  p: Dec; // price change percent
  E: number; // event time (ms)
}

export interface Candle {
  s: string;
  i: Interval;
  t: number; // open time ms
  o: Dec;
  h: Dec;
  l: Dec;
  c: Dec;
  v: Dec;
  x: boolean; // closed
}

export interface PublicTrade {
  s: string;
  id: string;
  p: Dec;
  q: Dec;
  side: 'buy' | 'sell'; // taker side
  T: number;
}

export type BookLevel = [price: Dec, qty: Dec];

export interface OrderBookSnapshot {
  s: string;
  u: number; // monotonically increasing update id
  bids: BookLevel[];
  asks: BookLevel[];
  E: number;
}

export interface MarketDTO {
  symbol: string;
  base: string;
  quote: string;
  baseName: string | null;
  logoUrl: string | null;
  type: 'spot' | 'futures';
  status: 'trading' | 'halted' | 'delisted';
  engine: 'internal' | 'external';
  pricePrecision: number;
  qtyPrecision: number;
  minQty: Dec;
  maxQty: Dec | null;
  minNotional: Dec;
  makerFee: Dec;
  takerFee: Dec;
  marketCap: Dec | null;
  ticker: Ticker | null;
  favorite?: boolean;
}

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop_market' | 'stop_limit' | 'take_profit' | 'stop_loss';
export type OrderStatus =
  'pending' | 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected' | 'expired';
export type TimeInForce = 'GTC' | 'IOC' | 'FOK';

export interface OrderDTO {
  id: string;
  clientOrderId: string | null;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  timeInForce: TimeInForce;
  price: Dec | null;
  stopPrice: Dec | null;
  quantity: Dec | null;
  quoteQuantity: Dec | null;
  filledQty: Dec;
  filledQuote: Dec;
  avgPrice: Dec | null;
  fee: Dec;
  feeAsset: string | null;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BalanceDTO {
  asset: string;
  available: Dec;
  locked: Dec;
  total: Dec;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
