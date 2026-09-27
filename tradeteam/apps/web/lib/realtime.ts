'use client';
import { io, type Socket } from 'socket.io-client';
import msgpackParser from 'socket.io-msgpack-parser';
import { useEffect } from 'react';
import { WS, type Candle, type OrderBookSnapshot, type PublicTrade, type Ticker } from '@tradeteam/shared';
import { createKeyedStore, createValueStore } from './store';

/**
 * Single multiplexed WebSocket per tab.
 *  - automatic reconnect with backoff; every active channel is re-subscribed on reconnect
 *  - ref-counted channel subscriptions (many components can watch the same channel)
 *  - server clock offset from time:sync RPC (NTP-style, best of several samples)
 *  - latency / health reporting from ping round trips
 *  - duplicate & out-of-order protection: order-book update ids, trade ids and candle open
 *    times must move forward; stale events are dropped
 * Events are written into keyed stores; React components subscribe to single keys.
 */
export const tickers = createKeyedStore<Ticker>();
export const lastPrice = createKeyedStore<{ p: string; dir: 1 | -1 | 0; T: number }>();
export const books = createKeyedStore<OrderBookSnapshot>();
export const trades = createKeyedStore<PublicTrade[]>();
export const connection = createValueStore<{
  state: 'connecting' | 'open' | 'closed';
  latencyMs: number | null;
  offsetMs: number;
  authenticated: boolean;
}>({
  state: 'connecting',
  latencyMs: null,
  offsetMs: 0,
  authenticated: false,
});

type CandleListener = (c: Candle) => void;
type PrivateListener = (event: string, data: unknown) => void;

const refs = new Map<string, number>();
const candleListeners = new Map<string, Set<CandleListener>>();
const privateListeners = new Set<PrivateListener>();
const lastTradeId = new Map<string, bigint>();
const lastCandleT = new Map<string, number>();
let socket: Socket | null = null;

const PRIVATE_EVENTS = [
  WS.ORDER_CREATED,
  WS.ORDER_UPDATED,
  WS.ORDER_FILLED,
  WS.ORDER_CANCELLED,
  WS.BALANCE_UPDATED,
  WS.TRADE_NEW,
  WS.NOTIFICATION_NEW,
  WS.SESSION_REVOKED,
  'withdrawal:updated',
];

function sym(ch: string) {
  return ch.split(':')[1]!;
}

async function syncClock(s: Socket) {
  const samples: { offset: number; rtt: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const t0 = Date.now();
    try {
      const r = (await s.timeout(3000).emitWithAck(WS.TIME_SYNC, t0)) as { serverTime: number };
      const t1 = Date.now();
      samples.push({ rtt: t1 - t0, offset: r.serverTime - (t0 + (t1 - t0) / 2) });
    } catch {
      /* ignore sample */
    }
  }
  if (!samples.length) return;
  const best = samples.sort((a, b) => a.rtt - b.rtt)[0]!;
  connection.set({ ...connection.get(), offsetMs: Math.round(best.offset), latencyMs: best.rtt });
}

export function serverNow() {
  return Date.now() + connection.get().offsetMs;
}

function ensureSocket(): Socket {
  if (socket) return socket;
  const s = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    parser: msgpackParser,
    withCredentials: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 8000,
    randomizationFactor: 0.4,
  });
  socket = s;
  s.on('connect', () => {
    connection.set({ ...connection.get(), state: 'open' });
    const chans = [...refs.keys()];
    if (chans.length) s.emit(WS.SUBSCRIBE, chans);
    void syncClock(s);
  });
  s.on('hello', (h: { authenticated: boolean }) =>
    connection.set({ ...connection.get(), authenticated: h.authenticated }),
  );
  s.on('disconnect', () => connection.set({ ...connection.get(), state: 'closed' }));
  s.io.on('reconnect_attempt', () => connection.set({ ...connection.get(), state: 'connecting' }));
  s.io.engine?.on('pong' as never, () => undefined);
  const ping = setInterval(() => {
    if (!s.connected) return;
    const t0 = Date.now();
    s.timeout(4000).emit(WS.TIME_SYNC, t0, (err: unknown) => {
      if (!err) connection.set({ ...connection.get(), latencyMs: Date.now() - t0 });
    });
  }, 10_000);
  s.on('close', () => clearInterval(ping));

  s.on(WS.MARKET_TICKER, (m: { c: string; d: Ticker }) => {
    const prev = tickers.get(m.d.s);
    if (prev && prev.E > m.d.E) return;
    tickers.set(m.d.s, m.d);
    if (!lastPrice.get(m.d.s)) lastPrice.set(m.d.s, { p: m.d.c, dir: 0, T: m.d.E });
  });
  s.on(WS.MARKET_TICK, (m: { c: string; d: { s: string; p: string; T: number } }) => {
    const prev = lastPrice.get(m.d.s);
    if (prev && prev.T > m.d.T) return;
    const dir = prev
      ? Number(m.d.p) > Number(prev.p)
        ? 1
        : Number(m.d.p) < Number(prev.p)
          ? -1
          : prev.dir
      : 0;
    lastPrice.set(m.d.s, { p: m.d.p, dir, T: m.d.T });
  });
  s.on(WS.ORDERBOOK_UPDATE, (m: { c: string; d: OrderBookSnapshot; snapshot?: boolean }) => {
    const prev = books.get(m.d.s);
    if (prev && !m.snapshot && m.d.u < prev.u && m.d.E <= prev.E) return; // stale
    books.set(m.d.s, m.d);
  });
  s.on(WS.MARKET_TRADE, (m: { c: string; d: PublicTrade[]; snapshot?: boolean }) => {
    const symbol = sym(m.c);
    const seen = lastTradeId.get(symbol) ?? -1n;
    const fresh = m.d.filter((t) => {
      if (!/^\d+$/.test(t.id)) return true;
      return BigInt(t.id) > seen;
    });
    if (!fresh.length) return;
    const maxId = fresh.reduce((a, t) => (/^\d+$/.test(t.id) && BigInt(t.id) > a ? BigInt(t.id) : a), seen);
    lastTradeId.set(symbol, maxId);
    trades.update(symbol, (prev) => [...fresh.slice().reverse(), ...(prev ?? [])].slice(0, 60));
    const last = fresh[fresh.length - 1]!;
    const prev = lastPrice.get(symbol);
    if (!prev || prev.T <= last.T) {
      const dir = prev
        ? Number(last.p) > Number(prev.p)
          ? 1
          : Number(last.p) < Number(prev.p)
            ? -1
            : prev.dir
        : 0;
      lastPrice.set(symbol, { p: last.p, dir, T: last.T });
    }
  });
  s.on(WS.MARKET_CANDLE, (m: { c: string; d: Candle }) => {
    const key = m.c;
    const prevT = lastCandleT.get(key) ?? 0;
    if (m.d.t < prevT) return; // out-of-order: older candle
    lastCandleT.set(key, m.d.t);
    candleListeners.get(key)?.forEach((l) => l(m.d));
  });
  for (const ev of PRIVATE_EVENTS) s.on(ev, (d: unknown) => privateListeners.forEach((l) => l(ev, d)));
  return s;
}

export function subscribe(channels: string[]) {
  const s = ensureSocket();
  const add: string[] = [];
  for (const ch of channels) {
    const n = (refs.get(ch) ?? 0) + 1;
    refs.set(ch, n);
    if (n === 1) add.push(ch);
  }
  if (add.length && s.connected) s.emit(WS.SUBSCRIBE, add);
  return () => {
    const rm: string[] = [];
    for (const ch of channels) {
      const n = (refs.get(ch) ?? 1) - 1;
      if (n <= 0) {
        refs.delete(ch);
        rm.push(ch);
        if (ch.startsWith('trades:')) lastTradeId.delete(sym(ch));
        if (ch.startsWith('candles:')) lastCandleT.delete(ch);
      } else refs.set(ch, n);
    }
    // Small delay avoids churn when a component re-mounts immediately (route transitions).
    if (rm.length)
      setTimeout(() => {
        const still = rm.filter((c) => !refs.has(c));
        if (still.length && socket?.connected) socket.emit(WS.UNSUBSCRIBE, still);
      }, 1500);
  };
}

export function useChannels(channels: (string | null | undefined)[]) {
  const key = channels.filter(Boolean).join('|');
  useEffect(() => {
    if (!key) return;
    return subscribe(key.split('|'));
  }, [key]);
}

export function onCandle(channel: string, l: CandleListener) {
  let s = candleListeners.get(channel);
  if (!s) candleListeners.set(channel, (s = new Set()));
  s.add(l);
  return () => {
    s!.delete(l);
  };
}

export function onPrivate(l: PrivateListener) {
  ensureSocket();
  privateListeners.add(l);
  return () => {
    privateListeners.delete(l);
  };
}

/** Reconnect with fresh cookies after login/logout so the socket joins the right user room. */
export function reconnectSocket() {
  if (!socket) return;
  socket.disconnect();
  socket.connect();
}

export function seedTickers(list: Ticker[]) {
  for (const t of list) {
    const prev = tickers.get(t.s);
    if (!prev || prev.E <= t.E) tickers.set(t.s, t);
  }
}
