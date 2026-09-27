/** WebSocket event names — shared contract between gateway and clients. */
export const WS = {
  // client -> server
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  TIME_SYNC: 'time:sync',
  // server -> client (market data)
  MARKET_TICK: 'market:tick',
  MARKET_TICKER: 'market:ticker',
  MARKET_CANDLE: 'market:candle',
  MARKET_TRADE: 'market:trade',
  ORDERBOOK_UPDATE: 'orderbook:update',
  MARKET_STATUS: 'market:status',
  // server -> client (private, user room)
  TRADE_NEW: 'trade:new',
  ORDER_CREATED: 'order:created',
  ORDER_UPDATED: 'order:updated',
  ORDER_FILLED: 'order:filled',
  ORDER_CANCELLED: 'order:cancelled',
  BALANCE_UPDATED: 'balance:updated',
  NOTIFICATION_NEW: 'notification:new',
  SESSION_REVOKED: 'session:revoked',
} as const;

/**
 * Channel names. Clients subscribe to channels; the gateway maps them to Socket.IO rooms and
 * Redis pub/sub channels. Symbols are dynamic (validated against the market registry).
 *   ticker:BTCUSDT          24h ticker for one market
 *   trades:BTCUSDT          public trade stream
 *   book:BTCUSDT            order book snapshots / updates
 *   candles:BTCUSDT:1m      live candle for an interval
 */
export type ChannelKind = 'ticker' | 'trades' | 'book' | 'candles';

export function channelName(kind: ChannelKind, symbol: string, interval?: string): string {
  return kind === 'candles' ? `candles:${symbol}:${interval}` : `${kind}:${symbol}`;
}

const CHANNEL_RE =
  /^(ticker|trades|book):([A-Z0-9]{2,30})$|^candles:([A-Z0-9]{2,30}):(1s|1m|3m|5m|15m|30m|1h|4h|1d|1w)$/;

export function parseChannel(ch: string): { kind: ChannelKind; symbol: string; interval?: string } | null {
  const m = CHANNEL_RE.exec(ch);
  if (!m) return null;
  if (m[1]) return { kind: m[1] as ChannelKind, symbol: m[2]! };
  return { kind: 'candles', symbol: m[3]!, interval: m[4]! };
}

export const MAX_CHANNELS_PER_SOCKET = 200;
