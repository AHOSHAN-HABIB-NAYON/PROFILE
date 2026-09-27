import type { Candle, Interval, OrderBookSnapshot, PublicTrade, Ticker } from '@tradeteam/shared';
import { WS, channelName, parseChannel, isInterval, toDb } from '@tradeteam/shared';
import { redis, redisPub, redisSub } from '../../infrastructure/redis';
import { exec } from '../../infrastructure/db';
import { logger } from '../../infrastructure/logger';
import { publishMarket } from '../../websocket/bus';
import { getSetting } from '../settings/settings.service';
import { allMarkets, marketBySymbol, setTickers } from '../markets/registry';
import { syncMarkets } from '../markets/sync';
import { BinanceProvider } from './binance';
import { CandleAggregator } from './aggregator';
import type { KlineEvent, MarketDataProvider, StreamKey } from './provider';
import { streamId } from './provider';

/**
 * Market Data Service (runs in the process(es) with RUN_MARKET_DATA=true; one active leader).
 *
 *   Provider WS ──► normalise ──► CandleAggregator ──► Redis Pub/Sub (tt:md:<channel>) ──► gateways
 *                                    └─► Redis snapshots (latest book / candle / trades / tickers)
 *
 * Upstream subscriptions are demand-driven: gateways register interest per channel
 * (md:interest:<instance> sets + md:ctl notifications); the hub subscribes upstream only to
 * streams that someone is watching and releases them after a grace period.
 */
const FLUSH_MS = 25; // micro-batching window for trades/candles (latency vs. fan-out efficiency)
const UNSUB_GRACE_MS = 20_000;
const LEADER_KEY = 'md:leader';

export class MarketDataHub {
  provider: MarketDataProvider | null = null;
  private agg = new CandleAggregator();
  private activeChannels = new Set<string>();
  private upstream = new Map<string, StreamKey>(); // streamId -> key currently subscribed
  private pendingUnsub = new Map<string, NodeJS.Timeout>();
  private tradeBuf = new Map<string, PublicTrade[]>();
  private candleBuf = new Map<string, Candle>();
  private closedBuf: Candle[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private timers: NodeJS.Timeout[] = [];
  private isLeader = false;
  private stats = { trades: 0, books: 0, klines: 0, tickers: 0 };

  constructor(private readonly instanceId: string) {}

  async start() {
    await this.tryLead();
    this.timers.push(
      setInterval(
        () => this.tryLead().catch((e) => logger.error({ err: e.message }, 'md leader error')),
        10_000,
      ),
    );
  }

  /** Simple leader election so only one process holds upstream connections. */
  private async tryLead() {
    const r = redis();
    if (this.isLeader) {
      const cur = await r.get(LEADER_KEY);
      if (cur === this.instanceId) await r.expire(LEADER_KEY, 30);
      else await this.stepDown();
      return;
    }
    const ok = await r.set(LEADER_KEY, this.instanceId, 'EX', 30, 'NX');
    if (ok) await this.becomeLeader();
  }

  private async becomeLeader() {
    this.isLeader = true;
    logger.info({ instance: this.instanceId }, 'market-data leader');
    const providerName = getSetting('market.provider');
    if (providerName === 'binance') {
      const p = new BinanceProvider(
        getSetting('market.binance_rest_url'),
        getSetting('market.binance_ws_url'),
      );
      this.provider = p;
      this.refreshSymbolMap();
      p.on('tickers', (t: Ticker[]) => this.onTickers(t));
      p.on('trade', (t: PublicTrade) => this.onTrade(t));
      p.on('book', (b: OrderBookSnapshot) => this.onBook(b));
      p.on('kline', (k: KlineEvent) => this.onKline(k));
      p.on('status', (s: { connected: boolean; detail?: string }) => {
        logger.info(s, 'provider connection');
        publishMarket('status', WS.MARKET_STATUS, { provider: 'binance', ...s });
      });
      await p.start();
      // Initial full ticker snapshot so lists are populated before the first WS batch.
      p.fetchTickers()
        .then((t) => this.onTickers(t))
        .catch((e) => logger.warn({ err: e.message }, 'initial tickers failed'));
      this.scheduleSync();
    }
    await this.listenInterest();
    this.timers.push(setInterval(() => this.reconcileInterest().catch(() => undefined), 15_000));
    this.timers.push(setInterval(() => this.writeHealth().catch(() => undefined), 5_000));
    this.timers.push(
      setInterval(
        () => this.persistClosed().catch((e) => logger.warn({ err: e.message }, 'candle persist failed')),
        5_000,
      ),
    );
    await this.reconcileInterest();
  }

  private async stepDown() {
    logger.warn('market-data leadership lost');
    this.isLeader = false;
    await this.provider?.stop();
    this.provider = null;
    this.upstream.clear();
  }

  refreshSymbolMap() {
    if (this.provider instanceof BinanceProvider) {
      this.provider.setSymbolMap(
        allMarkets()
          .filter((m) => m.provider === 'binance')
          .map((m) => [m.symbol, m.provider_symbol]),
      );
    }
  }

  private scheduleSync() {
    const run = async () => {
      if (!this.provider || !this.isLeader) return;
      try {
        await syncMarkets(this.provider);
        const { loadMarkets } = await import('../markets/registry');
        await loadMarkets();
        this.refreshSymbolMap();
      } catch (e) {
        logger.error({ err: (e as Error).message }, 'market sync failed');
      }
    };
    run();
    const t = setInterval(run, getSetting('market.sync_minutes') * 60_000);
    this.timers.push(t);
  }

  // ───────────── interest management ─────────────
  private listening = false;
  private async listenInterest() {
    if (this.listening) return;
    this.listening = true;
    const sub = redisSub();
    await sub.subscribe('md:ctl');
    sub.on('message', (ch, msg) => {
      if (ch !== 'md:ctl' || !this.isLeader) return;
      try {
        const m = JSON.parse(msg) as { op: 'sub' | 'unsub'; ch: string };
        if (m.op === 'sub') this.activate(m.ch);
        else this.reconcileInterest().catch(() => undefined);
      } catch {
        /* ignore */
      }
    });
  }

  /** Union of all gateway instances' interest sets (instances refresh their TTL while alive). */
  async reconcileInterest() {
    const r = redis();
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await r.scan(cursor, 'MATCH', 'md:interest:*', 'COUNT', 200);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');
    const channels = keys.length ? await r.sunion(...keys) : [];
    const wanted = new Set(channels);
    for (const ch of wanted) this.activate(ch);
    for (const ch of [...this.activeChannels]) if (!wanted.has(ch)) this.deactivate(ch);
  }

  private upstreamFor(ch: string): StreamKey[] {
    const p = parseChannel(ch);
    if (!p) return [];
    const m = marketBySymbol(p.symbol);
    if (!m || m.provider !== this.provider?.name) return []; // internal markets are published by the engine
    if (p.kind === 'trades') return [{ kind: 'trades', symbol: p.symbol }];
    if (p.kind === 'book') return [{ kind: 'book', symbol: p.symbol }];
    if (p.kind === 'candles' && isInterval(p.interval) && this.provider.intervals.includes(p.interval)) {
      return [
        { kind: 'kline', symbol: p.symbol, interval: p.interval },
        { kind: 'trades', symbol: p.symbol },
      ];
    }
    return [];
  }

  private activate(ch: string) {
    if (this.activeChannels.has(ch)) return;
    this.activeChannels.add(ch);
    const p = parseChannel(ch);
    if (p?.kind === 'candles' && isInterval(p.interval)) this.agg.track(p.symbol, p.interval);
    this.syncUpstream();
  }

  private deactivate(ch: string) {
    if (!this.activeChannels.delete(ch)) return;
    const p = parseChannel(ch);
    if (p?.kind === 'candles' && isInterval(p.interval)) this.agg.untrack(p.symbol, p.interval);
    this.syncUpstream();
  }

  private syncUpstream() {
    if (!this.provider) return;
    const desired = new Map<string, StreamKey>();
    for (const ch of this.activeChannels) for (const k of this.upstreamFor(ch)) desired.set(streamId(k), k);
    const toSub: StreamKey[] = [];
    for (const [id, k] of desired) {
      const pending = this.pendingUnsub.get(id);
      if (pending) {
        clearTimeout(pending);
        this.pendingUnsub.delete(id);
      }
      if (!this.upstream.has(id)) {
        this.upstream.set(id, k);
        toSub.push(k);
      }
    }
    if (toSub.length) this.provider.subscribe(toSub);
    for (const [id, k] of this.upstream) {
      if (desired.has(id) || this.pendingUnsub.has(id)) continue;
      this.pendingUnsub.set(
        id,
        setTimeout(() => {
          this.pendingUnsub.delete(id);
          this.upstream.delete(id);
          this.provider?.unsubscribe([k]);
        }, UNSUB_GRACE_MS),
      );
    }
  }

  // ───────────── event handling ─────────────
  private onTickers(list: Ticker[]) {
    this.stats.tickers += list.length;
    setTickers(list);
    const pipe = redis().pipeline();
    for (const t of list) pipe.hset('md:tickers', t.s, JSON.stringify(t));
    pipe.exec().catch(() => undefined);
    // One batched message for all API instances (in-memory market lists)…
    redisPub()
      .publish('tt:tickers', JSON.stringify(list))
      .catch(() => undefined);
    // …and per-symbol events only for channels somebody is watching.
    for (const t of list) {
      const ch = channelName('ticker', t.s);
      if (this.activeChannels.has(ch)) publishMarket(ch, WS.MARKET_TICKER, t);
    }
  }

  private onTrade(t: PublicTrade) {
    this.stats.trades++;
    const buf = this.tradeBuf.get(t.s);
    if (buf) buf.push(t);
    else this.tradeBuf.set(t.s, [t]);
    const { closed, updated } = this.agg.applyTrade(t);
    for (const c of updated) this.candleBuf.set(`${c.s}:${c.i}`, c);
    for (const c of closed) {
      this.closedBuf.push(c);
      publishMarket(channelName('candles', c.s, c.i), WS.MARKET_CANDLE, c); // close event immediately
    }
    this.scheduleFlush();
  }

  private onKline(k: KlineEvent) {
    this.stats.klines++;
    const c = this.agg.applyKline(k);
    if (!c) return;
    if (c.x) this.closedBuf.push(c);
    this.candleBuf.set(`${c.s}:${c.i}`, c);
    this.scheduleFlush();
  }

  private onBook(b: OrderBookSnapshot) {
    this.stats.books++;
    const ch = channelName('book', b.s);
    const json = JSON.stringify(b);
    redis()
      .set(`md:book:${b.s}`, json, 'EX', 30)
      .catch(() => undefined);
    publishMarket(ch, WS.ORDERBOOK_UPDATE, b);
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_MS);
  }

  private flush() {
    const pipe = redis().pipeline();
    for (const [symbol, trades] of this.tradeBuf) {
      const ch = channelName('trades', symbol);
      if (this.activeChannels.has(ch)) publishMarket(ch, WS.MARKET_TRADE, trades);
      const last = trades[trades.length - 1]!;
      const tick = { s: symbol, p: last.p, T: last.T };
      const tch = channelName('ticker', symbol);
      if (this.activeChannels.has(tch)) publishMarket(tch, WS.MARKET_TICK, tick);
      pipe.lpush(`md:trades:${symbol}`, ...trades.map((t) => JSON.stringify(t)).reverse());
      pipe.ltrim(`md:trades:${symbol}`, 0, 99);
      pipe.expire(`md:trades:${symbol}`, 3600);
    }
    this.tradeBuf.clear();
    for (const c of this.candleBuf.values()) {
      const ch = channelName('candles', c.s, c.i);
      if (this.activeChannels.has(ch)) publishMarket(ch, WS.MARKET_CANDLE, c);
      pipe.set(`md:candle:${c.s}:${c.i}`, JSON.stringify(c), 'EX', 600);
    }
    this.candleBuf.clear();
    pipe.exec().catch(() => undefined);
  }

  /** Persist closed candles (≥1m) so history survives provider REST outages. */
  private async persistClosed() {
    if (!this.closedBuf.length) return;
    const batch = this.closedBuf.splice(0, 500).filter((c) => c.i !== '1s');
    const rows = batch.map((c) => ({ c, m: marketBySymbol(c.s) })).filter((x) => x.m);
    if (!rows.length) return;
    await exec(
      `INSERT INTO candles (market_id, \`interval\`, open_time, open, high, low, close, volume) VALUES ${rows.map(() => '(?,?,?,?,?,?,?,?)').join(',')}
       ON DUPLICATE KEY UPDATE open = VALUES(open), high = VALUES(high), low = VALUES(low), close = VALUES(close), volume = VALUES(volume)`,
      rows.flatMap(({ c, m }) => [m!.id, c.i, c.t, toDb(c.o), toDb(c.h), toDb(c.l), toDb(c.c), toDb(c.v)]),
    );
  }

  private async writeHealth() {
    const h = this.provider?.health() ?? {
      connected: false,
      connections: 0,
      streams: 0,
      lastMessageAt: null,
    };
    await redis().set(
      'md:health',
      JSON.stringify({
        ...h,
        provider: this.provider?.name ?? getSetting('market.provider'),
        leader: this.instanceId,
        channels: this.activeChannels.size,
        upstream: this.upstream.size,
        stats: this.stats,
        at: Date.now(),
      }),
      'EX',
      20,
    );
  }

  currentCandle(symbol: string, interval: Interval) {
    return this.agg.current(symbol, interval);
  }

  async stop() {
    this.timers.forEach(clearInterval);
    this.pendingUnsub.forEach(clearTimeout);
    if (this.isLeader) await redis().del(LEADER_KEY);
    await this.provider?.stop();
  }
}
