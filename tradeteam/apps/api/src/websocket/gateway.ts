import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import msgpackParser from 'socket.io-msgpack-parser';
import { parse as parseCookie } from 'cookie';
import { WS, parseChannel, type ChannelKind } from '@tradeteam/shared';
import { redis, redisSub } from '../infrastructure/redis';
import { logger } from '../infrastructure/logger';
import { loadEnv } from '../config/env';
import { resolveSession, sessionCookieName } from '../modules/auth/sessions';
import { getSetting } from '../modules/settings/settings.service';
import { isVisible, marketBySymbol } from '../modules/markets/registry';
import { BUS } from './bus';

/**
 * WebSocket gateway (Socket.IO over a single persistent connection per client).
 *
 * - Binary MessagePack framing; per-message deflate only above a size threshold.
 * - Channel subscriptions are multiplexed over the one socket: clients join rooms for exactly the
 *   channels they view (dynamic symbols validated against the registry), so no client ever
 *   receives data for markets it is not looking at.
 * - Each gateway instance subscribes to Redis only for channels with local members and records its
 *   interest (md:interest:<instance>, TTL-refreshed) so the market-data hub can open/close upstream
 *   provider streams on demand.
 * - Private events go to the per-user room; revoked sessions are disconnected immediately.
 * - Heartbeats: Socket.IO ping/pong (15s/10s) + an explicit time:sync RPC for clock offset.
 */
export class Gateway {
  io: Server;
  private local = new Map<string, number>(); // channel -> local subscriber count
  private sessions = new Map<number, Set<string>>(); // sessionId -> socket ids
  private interestKey: string;
  private timer: NodeJS.Timeout | null = null;
  stats = { connections: 0, messagesOut: 0 };

  constructor(server: HttpServer) {
    const env = loadEnv();
    this.interestKey = `md:interest:${env.INSTANCE_ID}`;
    this.io = new Server(server, {
      path: '/socket.io',
      parser: msgpackParser,
      serveClient: false,
      transports: ['websocket', 'polling'],
      pingInterval: 15_000,
      pingTimeout: 10_000,
      maxHttpBufferSize: 64 * 1024,
      perMessageDeflate: { threshold: getSetting('ws.compression_threshold') },
      cors: { origin: env.NODE_ENV === 'production' ? new URL(env.APP_URL).origin : true, credentials: true },
      allowRequest: (req, cb) => {
        // Reject cross-site WebSocket hijacking attempts in production.
        const origin = req.headers.origin;
        if (env.NODE_ENV === 'production' && origin && origin !== new URL(env.APP_URL).origin)
          return cb('origin not allowed', false);
        cb(null, true);
      },
    });
  }

  async start() {
    const sub = redisSub();
    await sub.subscribe(BUS.USER, BUS.BROADCAST, BUS.SESSION);
    sub.on('message', (channel, message) => this.onBus(channel, message));
    this.io.use(async (socket, next) => {
      try {
        const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
        const ctx = await resolveSession('user', cookies[sessionCookieName('user')]);
        socket.data.userId = ctx?.id ?? null;
        socket.data.sessionId = ctx?.sessionId ?? null;
        socket.data.channels = new Set<string>();
        next();
      } catch (e) {
        next(e as Error);
      }
    });
    this.io.on('connection', (s) => this.onConnection(s));
    this.timer = setInterval(() => this.refreshInterest().catch(() => undefined), 15_000);
  }

  private onConnection(s: Socket) {
    this.stats.connections++;
    const userId = s.data.userId as number | null;
    if (userId) {
      s.join([`u:${userId}`, 'authed']);
      const sid = s.data.sessionId as number;
      if (!this.sessions.has(sid)) this.sessions.set(sid, new Set());
      this.sessions.get(sid)!.add(s.id);
    }
    s.emit('hello', { serverTime: Date.now(), authenticated: Boolean(userId) });

    s.on(WS.TIME_SYNC, (clientTime: unknown, ack?: (r: unknown) => void) => {
      if (typeof ack === 'function') ack({ clientTime, serverTime: Date.now() });
    });

    s.on(WS.SUBSCRIBE, async (channels: unknown, ack?: (r: unknown) => void) => {
      const res = await this.subscribe(s, channels);
      if (typeof ack === 'function') ack(res);
    });

    s.on(WS.UNSUBSCRIBE, (channels: unknown, ack?: (r: unknown) => void) => {
      const list = Array.isArray(channels) ? channels.slice(0, 200) : [];
      for (const ch of list) if (typeof ch === 'string') this.leave(s, ch);
      if (typeof ack === 'function') ack({ ok: true });
    });

    s.on('disconnect', () => {
      this.stats.connections--;
      for (const ch of s.data.channels as Set<string>) this.decrement(ch);
      (s.data.channels as Set<string>).clear();
      const sid = s.data.sessionId as number | null;
      if (sid) {
        this.sessions.get(sid)?.delete(s.id);
        if (!this.sessions.get(sid)?.size) this.sessions.delete(sid);
      }
    });
  }

  private async subscribe(s: Socket, channels: unknown) {
    const list = Array.isArray(channels) ? channels.slice(0, 200) : [];
    const max = getSetting('ws.max_channels_per_socket');
    const joined: string[] = [];
    const rejected: string[] = [];
    const mine = s.data.channels as Set<string>;
    for (const ch of list) {
      if (typeof ch !== 'string') continue;
      const p = parseChannel(ch);
      const m = p ? marketBySymbol(p.symbol) : null;
      if (!p || !m || !isVisible(m) || (mine.size >= max && !mine.has(ch))) {
        rejected.push(String(ch).slice(0, 60));
        continue;
      }
      if (!mine.has(ch)) {
        mine.add(ch);
        s.join(ch);
        await this.increment(ch);
      }
      joined.push(ch);
      this.sendSnapshot(s, ch, p.kind, p.symbol, p.interval).catch(() => undefined);
    }
    return { joined, rejected };
  }

  private leave(s: Socket, ch: string) {
    const mine = s.data.channels as Set<string>;
    if (!mine.delete(ch)) return;
    s.leave(ch);
    this.decrement(ch);
  }

  /** Immediate state for new subscribers so the UI never waits for the next tick. */
  private async sendSnapshot(s: Socket, ch: string, kind: ChannelKind, symbol: string, interval?: string) {
    const r = redis();
    if (kind === 'ticker') {
      const t = await r.hget('md:tickers', symbol);
      if (t) s.emit(WS.MARKET_TICKER, { c: ch, d: JSON.parse(t), snapshot: true });
    } else if (kind === 'book') {
      const b = await r.get(`md:book:${symbol}`);
      if (b) s.emit(WS.ORDERBOOK_UPDATE, { c: ch, d: JSON.parse(b), snapshot: true });
    } else if (kind === 'trades') {
      const list = await r.lrange(`md:trades:${symbol}`, 0, 49);
      if (list.length)
        s.emit(WS.MARKET_TRADE, { c: ch, d: list.map((x) => JSON.parse(x)).reverse(), snapshot: true });
    } else if (kind === 'candles') {
      const c = await r.get(`md:candle:${symbol}:${interval}`);
      if (c) s.emit(WS.MARKET_CANDLE, { c: ch, d: JSON.parse(c), snapshot: true });
    }
  }

  private async increment(ch: string) {
    const n = (this.local.get(ch) ?? 0) + 1;
    this.local.set(ch, n);
    if (n === 1) {
      await redisSub().subscribe(BUS.MD_PREFIX + ch);
      await redis().sadd(this.interestKey, ch);
      await redis().expire(this.interestKey, 45);
      await redis().publish('md:ctl', JSON.stringify({ op: 'sub', ch }));
    }
  }

  private decrement(ch: string) {
    const n = (this.local.get(ch) ?? 0) - 1;
    if (n > 0) {
      this.local.set(ch, n);
      return;
    }
    this.local.delete(ch);
    redisSub()
      .unsubscribe(BUS.MD_PREFIX + ch)
      .catch(() => undefined);
    redis()
      .srem(this.interestKey, ch)
      .then(() => redis().publish('md:ctl', JSON.stringify({ op: 'unsub', ch })))
      .catch(() => undefined);
  }

  private async refreshInterest() {
    const chans = [...this.local.keys()];
    const pipe = redis().pipeline();
    pipe.del(this.interestKey);
    if (chans.length) {
      pipe.sadd(this.interestKey, ...chans);
      pipe.expire(this.interestKey, 45);
    }
    await pipe.exec();
  }

  private onBus(channel: string, message: string) {
    try {
      if (channel.startsWith(BUS.MD_PREFIX)) {
        const ch = channel.slice(BUS.MD_PREFIX.length);
        if (!this.local.has(ch)) return;
        const m = JSON.parse(message) as { e: string; c: string; d: unknown };
        this.io.to(ch).emit(m.e, { c: ch, d: m.d });
        this.stats.messagesOut++;
      } else if (channel === BUS.USER) {
        const m = JSON.parse(message) as { u: string; e: string; d: unknown };
        this.io.to(`u:${m.u}`).emit(m.e, m.d);
      } else if (channel === BUS.BROADCAST) {
        const m = JSON.parse(message) as { e: string; d: unknown };
        if (m.e === WS.NOTIFICATION_NEW) this.io.to('authed').emit(m.e, m.d);
        else this.io.emit(m.e, m.d);
      } else if (channel === BUS.SESSION) {
        const { sid } = JSON.parse(message) as { sid: number };
        for (const id of this.sessions.get(sid) ?? []) {
          const s = this.io.sockets.sockets.get(id);
          s?.emit(WS.SESSION_REVOKED, {});
          s?.disconnect(true);
        }
      }
    } catch (e) {
      logger.warn({ err: (e as Error).message, channel }, 'gateway bus message failed');
    }
  }

  health() {
    return {
      connections: this.io.engine.clientsCount,
      channels: this.local.size,
      messagesOut: this.stats.messagesOut,
    };
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    await redis()
      .del(this.interestKey)
      .catch(() => undefined);
    await new Promise<void>((r) => this.io.close(() => r()));
  }
}
