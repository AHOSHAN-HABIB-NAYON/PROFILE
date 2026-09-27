import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { Candle, Interval, OrderBookSnapshot, PublicTrade, Ticker } from '@tradeteam/shared';
import { dec, fmt } from '@tradeteam/shared';
import { logger } from '../../infrastructure/logger';
import type { Instrument, MarketDataProvider, StreamKey } from './provider';
import { streamId } from './provider';

/**
 * Binance spot market-data adapter.
 *  - REST for metadata, 24h statistics, historical klines, depth snapshots and recent trades
 *  - Combined-stream WebSockets, multiplexed: many streams per connection (capped well below the
 *    1024 limit), dynamic SUBSCRIBE/UNSUBSCRIBE batching that respects the 5 msg/s control limit,
 *    automatic reconnect with exponential backoff + full resubscription, proactive reconnect
 *    before the 24h connection lifetime, and stale-connection detection.
 */
const MAX_STREAMS_PER_CONN = 200;
const FLUSH_MS = 250;
const STALE_MS = 60_000;

type Kind = StreamKey['kind'];

function toBinanceStream(k: StreamKey, providerSymbol: string) {
  const s = providerSymbol.toLowerCase();
  if (k.kind === 'trades') return `${s}@trade`;
  if (k.kind === 'book') return `${s}@depth20@100ms`;
  return `${s}@kline_${k.interval}`;
}

class Conn {
  ws: WebSocket | null = null;
  streams = new Set<string>(); // binance stream names that should be active
  private pendingSub = new Set<string>();
  private pendingUnsub = new Set<string>();
  private reqId = 1;
  private attempts = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private lifeTimer: NodeJS.Timeout | null = null;
  lastMessageAt = 0;
  connected = false;
  closed = false;

  constructor(
    private readonly url: string,
    private readonly onMessage: (stream: string, data: unknown) => void,
    private readonly onStatus: (connected: boolean) => void,
    private readonly fixedStreams: string[] = [],
  ) {
    fixedStreams.forEach((s) => this.streams.add(s));
  }

  open() {
    if (this.closed) return;
    const ws = new WebSocket(`${this.url}/stream`, { perMessageDeflate: false, handshakeTimeout: 10_000 });
    this.ws = ws;
    ws.on('open', () => {
      this.attempts = 0;
      this.connected = true;
      this.lastMessageAt = Date.now();
      this.onStatus(true);
      // Resubscribe everything this connection owns.
      this.pendingSub = new Set(this.streams);
      this.pendingUnsub.clear();
      this.scheduleFlush();
      // Binance closes connections after 24h: reconnect proactively a little earlier.
      this.lifeTimer = setTimeout(() => ws.close(4000, 'lifetime'), 23 * 3_600_000);
    });
    ws.on('message', (raw) => {
      this.lastMessageAt = Date.now();
      let msg: { stream?: string; data?: unknown; result?: unknown; id?: number; error?: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.error) logger.warn({ error: msg.error }, 'binance ws control error');
      if (msg.stream && msg.data !== undefined) this.onMessage(msg.stream, msg.data);
    });
    ws.on('close', () => this.handleClose());
    ws.on('error', (e) => logger.warn({ err: e.message }, 'binance ws error'));
  }

  private handleClose() {
    this.connected = false;
    if (this.lifeTimer) clearTimeout(this.lifeTimer);
    this.onStatus(false);
    if (this.closed) return;
    const delay = Math.min(30_000, 500 * 2 ** this.attempts) + Math.random() * 500;
    this.attempts++;
    setTimeout(() => this.open(), delay);
  }

  isStale(now: number) {
    return this.connected && now - this.lastMessageAt > STALE_MS && this.streams.size > 0;
  }

  forceReconnect() {
    this.ws?.terminate();
  }

  add(stream: string) {
    if (this.streams.has(stream)) return;
    this.streams.add(stream);
    this.pendingUnsub.delete(stream);
    this.pendingSub.add(stream);
    this.scheduleFlush();
  }

  remove(stream: string) {
    if (!this.streams.delete(stream)) return;
    this.pendingSub.delete(stream);
    this.pendingUnsub.add(stream);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_MS);
  }

  /** One control message per flush per direction keeps us under 5 msg/s. */
  private flush() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const send = (method: string, set: Set<string>) => {
      if (!set.size) return;
      const params = [...set].slice(0, 100);
      params.forEach((p) => set.delete(p));
      this.ws!.send(JSON.stringify({ method, params, id: this.reqId++ }));
    };
    send('UNSUBSCRIBE', this.pendingUnsub);
    send('SUBSCRIBE', this.pendingSub);
    if (this.pendingSub.size || this.pendingUnsub.size) this.scheduleFlush();
  }

  close() {
    this.closed = true;
    if (this.lifeTimer) clearTimeout(this.lifeTimer);
    this.ws?.close();
  }
}

export class BinanceProvider extends EventEmitter implements MarketDataProvider {
  readonly name = 'binance';
  readonly intervals: readonly Interval[] = ['1s', '1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
  private conns: Conn[] = [];
  private tickerConn: Conn | null = null;
  private owner = new Map<string, Conn>(); // binance stream -> conn
  private streamToKey = new Map<string, { kind: Kind; symbol: string; interval?: Interval }>();
  private symbolMap = new Map<string, string>(); // internal symbol -> provider symbol
  private reverse = new Map<string, string>(); // provider symbol (upper) -> internal symbol
  private watchdog: NodeJS.Timeout | null = null;

  constructor(
    private readonly restUrl: string,
    private readonly wsUrl: string,
  ) {
    super();
    this.setMaxListeners(50);
  }

  setSymbolMap(pairs: [internal: string, provider: string][]) {
    this.symbolMap = new Map(pairs);
    this.reverse = new Map(pairs.map(([i, p]) => [p.toUpperCase(), i]));
  }

  private ps(symbol: string) {
    return this.symbolMap.get(symbol) ?? symbol;
  }
  private internal(providerSymbol: string) {
    return this.reverse.get(providerSymbol.toUpperCase()) ?? providerSymbol.toUpperCase();
  }

  private async get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
    const url = `${this.restUrl}${path}${qs.size ? `?${qs}` : ''}`;
    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      try {
        const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
        if (r.status === 429 || r.status === 418) {
          const retry = Number(r.headers.get('retry-after') ?? 5);
          throw Object.assign(new Error(`Binance rate limited (${r.status})`), {
            retryAfter: retry,
            fatal: r.status === 418,
          });
        }
        if (!r.ok)
          throw Object.assign(
            new Error(`Binance ${path} failed: ${r.status} ${await r.text().catch(() => '')}`),
            { status: r.status },
          );
        return (await r.json()) as T;
      } catch (e) {
        const err = e as { status?: number; fatal?: boolean; retryAfter?: number };
        if (attempt >= 2 || err.fatal || (err.status && err.status >= 400 && err.status < 500)) throw e;
        await new Promise((res) => setTimeout(res, (err.retryAfter ?? 0.5 * 2 ** attempt) * 1000));
      } finally {
        clearTimeout(t);
      }
    }
  }

  async fetchInstruments(): Promise<Instrument[]> {
    type F = { filterType: string; [k: string]: string };
    const info = await this.get<{
      symbols: {
        symbol: string;
        status: string;
        baseAsset: string;
        quoteAsset: string;
        isSpotTradingAllowed: boolean;
        filters: F[];
      }[];
    }>('/api/v3/exchangeInfo', { permissions: 'SPOT' });
    const out: Instrument[] = [];
    for (const s of info.symbols) {
      if (s.isSpotTradingAllowed === false) continue;
      if (!['TRADING', 'BREAK', 'HALT'].includes(s.status)) continue; // END_OF_DAY etc. → treated as delisted
      const f = (t: string) => s.filters.find((x) => x.filterType === t);
      const price = f('PRICE_FILTER');
      const lot = f('LOT_SIZE');
      const notional = f('NOTIONAL') ?? f('MIN_NOTIONAL');
      out.push({
        symbol: s.symbol,
        providerSymbol: s.symbol,
        base: s.baseAsset,
        quote: s.quoteAsset,
        type: 'spot',
        status: s.status === 'TRADING' ? 'trading' : 'halted',
        tickSize: price?.tickSize ?? '0.00000001',
        stepSize: lot?.stepSize ?? '0.00000001',
        minQty: lot?.minQty ?? '0',
        maxQty: lot?.maxQty && dec(lot.maxQty).gt(0) ? lot.maxQty : null,
        minNotional: notional?.minNotional ?? '0',
        maxNotional:
          notional?.maxNotional && dec(notional.maxNotional).lt('1e17') ? notional.maxNotional : null,
      });
    }
    return out;
  }

  async fetchTickers(): Promise<Ticker[]> {
    const rows = await this.get<
      {
        symbol: string;
        lastPrice: string;
        openPrice: string;
        highPrice: string;
        lowPrice: string;
        volume: string;
        quoteVolume: string;
        priceChangePercent: string;
        closeTime: number;
      }[]
    >('/api/v3/ticker/24hr');
    return rows.map((r) => ({
      s: this.internal(r.symbol),
      c: fmt(r.lastPrice),
      o: fmt(r.openPrice),
      h: fmt(r.highPrice),
      l: fmt(r.lowPrice),
      v: fmt(r.volume),
      q: fmt(r.quoteVolume),
      p: fmt(dec(r.priceChangePercent).toDecimalPlaces(2)),
      E: r.closeTime,
    }));
  }

  async fetchCandles(
    symbol: string,
    interval: Interval,
    opts: { endTime?: number; limit: number },
  ): Promise<Candle[]> {
    const rows = await this.get<(string | number)[][]>('/api/v3/klines', {
      symbol: this.ps(symbol),
      interval,
      endTime: opts.endTime,
      limit: Math.min(1000, opts.limit),
    });
    const now = Date.now();
    return rows.map((k) => ({
      s: symbol,
      i: interval,
      t: Number(k[0]),
      o: fmt(String(k[1])),
      h: fmt(String(k[2])),
      l: fmt(String(k[3])),
      c: fmt(String(k[4])),
      v: fmt(String(k[5])),
      x: Number(k[6]) < now,
    }));
  }

  async fetchOrderBook(symbol: string, depth: number): Promise<OrderBookSnapshot> {
    const limit = [5, 10, 20, 50, 100, 500, 1000].find((l) => l >= depth) ?? 100;
    const r = await this.get<{ lastUpdateId: number; bids: [string, string][]; asks: [string, string][] }>(
      '/api/v3/depth',
      {
        symbol: this.ps(symbol),
        limit,
      },
    );
    return {
      s: symbol,
      u: r.lastUpdateId,
      bids: r.bids.slice(0, depth).map(([p, q]) => [fmt(p), fmt(q)]),
      asks: r.asks.slice(0, depth).map(([p, q]) => [fmt(p), fmt(q)]),
      E: Date.now(),
    };
  }

  async fetchTrades(symbol: string, limit: number): Promise<PublicTrade[]> {
    const rows = await this.get<
      { id: number; price: string; qty: string; time: number; isBuyerMaker: boolean }[]
    >('/api/v3/trades', {
      symbol: this.ps(symbol),
      limit: Math.min(1000, limit),
    });
    return rows.map((t) => ({
      s: symbol,
      id: String(t.id),
      p: fmt(t.price),
      q: fmt(t.qty),
      side: t.isBuyerMaker ? 'sell' : 'buy',
      T: t.time,
    }));
  }

  async start() {
    this.tickerConn = new Conn(
      this.wsUrl,
      (s, d) => this.handle(s, d),
      (c) => this.emit('status', { connected: c, detail: 'tickers' }),
      ['!miniTicker@arr'],
    );
    this.tickerConn.open();
    this.watchdog = setInterval(() => {
      const now = Date.now();
      for (const c of [this.tickerConn!, ...this.conns]) if (c.isStale(now)) c.forceReconnect();
    }, 15_000);
  }

  async stop() {
    if (this.watchdog) clearInterval(this.watchdog);
    this.tickerConn?.close();
    this.conns.forEach((c) => c.close());
    this.conns = [];
    this.owner.clear();
  }

  subscribe(keys: StreamKey[]) {
    for (const k of keys) {
      const name = toBinanceStream(k, this.ps(k.symbol));
      if (this.owner.has(name)) continue;
      let conn = this.conns.find((c) => c.streams.size < MAX_STREAMS_PER_CONN);
      if (!conn) {
        conn = new Conn(
          this.wsUrl,
          (s, d) => this.handle(s, d),
          (c) => this.emit('status', { connected: c, detail: 'streams' }),
        );
        this.conns.push(conn);
        conn.open();
      }
      conn.add(name);
      this.owner.set(name, conn);
      this.streamToKey.set(name, k);
    }
  }

  unsubscribe(keys: StreamKey[]) {
    for (const k of keys) {
      const name = toBinanceStream(k, this.ps(k.symbol));
      const conn = this.owner.get(name);
      if (!conn) continue;
      conn.remove(name);
      this.owner.delete(name);
      this.streamToKey.delete(name);
    }
    // Close idle connections (keep at least none; they'll be recreated on demand).
    this.conns = this.conns.filter((c) => {
      if (c.streams.size === 0) {
        c.close();
        return false;
      }
      return true;
    });
  }

  health() {
    const all = [this.tickerConn, ...this.conns].filter(Boolean) as Conn[];
    return {
      connected: Boolean(this.tickerConn?.connected),
      connections: all.filter((c) => c.connected).length,
      streams: this.owner.size + 1,
      lastMessageAt: Math.max(0, ...all.map((c) => c.lastMessageAt)) || null,
    };
  }

  /** Normalises raw Binance payloads into the platform's internal event format. */
  private handle(stream: string, data: unknown) {
    if (stream === '!miniTicker@arr') {
      const arr = data as {
        s: string;
        c: string;
        o: string;
        h: string;
        l: string;
        v: string;
        q: string;
        E: number;
      }[];
      const out: Ticker[] = arr.map((t) => {
        const o = dec(t.o);
        return {
          s: this.internal(t.s),
          c: fmt(t.c),
          o: fmt(t.o),
          h: fmt(t.h),
          l: fmt(t.l),
          v: fmt(t.v),
          q: fmt(t.q),
          p: o.isZero() ? '0' : fmt(dec(t.c).minus(o).div(o).times(100).toDecimalPlaces(2)),
          E: t.E,
        };
      });
      this.emit('tickers', out);
      return;
    }
    const key = this.streamToKey.get(stream);
    if (!key) return; // stream we no longer care about
    if (key.kind === 'trades') {
      const t = data as { t: number; p: string; q: string; T: number; m: boolean };
      const trade: PublicTrade = {
        s: key.symbol,
        id: String(t.t),
        p: fmt(t.p),
        q: fmt(t.q),
        side: t.m ? 'sell' : 'buy',
        T: t.T,
      };
      this.emit('trade', trade);
    } else if (key.kind === 'book') {
      const b = data as { lastUpdateId: number; bids: [string, string][]; asks: [string, string][] };
      const snap: OrderBookSnapshot = {
        s: key.symbol,
        u: b.lastUpdateId,
        bids: b.bids.map(([p, q]) => [fmt(p), fmt(q)]),
        asks: b.asks.map(([p, q]) => [fmt(p), fmt(q)]),
        E: Date.now(),
      };
      this.emit('book', snap);
    } else {
      const k = (
        data as {
          k: {
            t: number;
            i: Interval;
            o: string;
            h: string;
            l: string;
            c: string;
            v: string;
            x: boolean;
            L: number;
          };
        }
      ).k;
      this.emit('kline', {
        s: key.symbol,
        i: k.i,
        t: k.t,
        o: fmt(k.o),
        h: fmt(k.h),
        l: fmt(k.l),
        c: fmt(k.c),
        v: fmt(k.v),
        x: k.x,
        lastTradeId: String(k.L),
      });
    }
  }
}

export { streamId };
