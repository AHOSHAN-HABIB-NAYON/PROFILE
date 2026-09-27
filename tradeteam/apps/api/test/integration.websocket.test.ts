import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import msgpackParser from 'socket.io-msgpack-parser';
import type { AddressInfo } from 'node:net';
import { WS } from '@tradeteam/shared';
import { Gateway } from '../src/websocket/gateway';
import { publishMarket } from '../src/websocket/bus';
import { redis } from '../src/infrastructure/redis';
import { startHarness, userAgent, type Harness } from './harness';

let h: Harness;
let gw: Gateway;
let url: string;
beforeAll(async () => {
  h = await startHarness();
  gw = new Gateway(h.server);
  await gw.start();
  url = `http://127.0.0.1:${(h.server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await gw.stop();
  await h.stop();
});

function connect(cookie?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(url, {
      transports: ['websocket'],
      parser: msgpackParser,
      extraHeaders: cookie ? { cookie } : undefined,
      reconnection: false,
    });
    s.on('hello', () => resolve(s));
    s.on('connect_error', reject);
  });
}

const once = <T>(s: Socket, ev: string, pred: (d: T) => boolean = () => true) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${ev}`)), 5000);
    const fn = (d: T) => {
      if (!pred(d)) return;
      clearTimeout(t);
      s.off(ev, fn);
      resolve(d);
    };
    s.on(ev, fn);
  });

describe('websocket gateway', () => {
  it('syncs time and validates dynamic channels', async () => {
    const s = await connect();
    const t = await s.emitWithAck(WS.TIME_SYNC, 123);
    expect(t.clientTime).toBe(123);
    expect(Math.abs(t.serverTime - Date.now())).toBeLessThan(2000);
    const r = await s.emitWithAck(WS.SUBSCRIBE, [
      'book:TSTUSDT',
      'book:NOPEUSDT',
      'garbage',
      'candles:TSTUSDT:1m',
    ]);
    expect(r.joined).toEqual(['book:TSTUSDT', 'candles:TSTUSDT:1m']);
    expect(r.rejected).toEqual(['book:NOPEUSDT', 'garbage']);
    const members = await redis().smembers(`md:interest:${process.env.INSTANCE_ID ?? process.pid}`);
    expect(members).toEqual(expect.arrayContaining(['book:TSTUSDT']));
    s.disconnect();
  });

  it('delivers only subscribed market channels', async () => {
    const a = await connect();
    const b = await connect();
    await a.emitWithAck(WS.SUBSCRIBE, ['trades:TSTUSDT']);
    let bGot = false;
    b.on(WS.MARKET_TRADE, () => (bGot = true));
    const got = once<{ c: string; d: unknown[] }>(a, WS.MARKET_TRADE, (m) => !('snapshot' in m));
    await new Promise((r) => setTimeout(r, 50));
    publishMarket('trades:TSTUSDT', WS.MARKET_TRADE, [
      { s: 'TSTUSDT', id: '1', p: '1', q: '1', side: 'buy', T: Date.now() },
    ]);
    const m = await got;
    expect(m.c).toBe('trades:TSTUSDT');
    await new Promise((r) => setTimeout(r, 100));
    expect(bGot).toBe(false);
    a.disconnect();
    b.disconnect();
  });

  it('streams real engine order-book updates and private order/balance events', async () => {
    const seller = await userAgent(h, 'ws-seller@example.com', { TST: '10' });
    const cookie = (await seller.agent.get('/api/auth/me')).request.getHeader?.('cookie') as
      string | undefined;
    const jar = (
      seller.agent as unknown as { jar: { getCookies: (o: object) => { name: string; value: string }[] } }
    ).jar;
    const cookies = jar
      .getCookies({ domain: '127.0.0.1', path: '/', secure: false, script: false })
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
    const s = await connect(cookie ?? cookies);
    await s.emitWithAck(WS.SUBSCRIBE, ['book:TSTUSDT']);
    const book = once<{ d: { asks: [string, string][] } }>(s, WS.ORDERBOOK_UPDATE, (m) =>
      m.d.asks.some(([p]) => p === '7'),
    );
    const created = once<{ status: string }>(s, WS.ORDER_CREATED);
    const bal = once<{ asset: string; locked: string }>(s, WS.BALANCE_UPDATED, (b) => b.asset === 'TST');
    const r = await seller.agent
      .post('/api/orders')
      .set('x-csrf-token', seller.csrf)
      .send({ symbol: 'TSTUSDT', side: 'sell', type: 'limit', price: '7', quantity: '2' });
    expect(r.status).toBe(201);
    expect((await book).d.asks.find(([p]) => p === '7')).toEqual(['7', '2']);
    expect((await created).status).toBe('open');
    expect((await bal).locked).toBe('2');
    s.disconnect();
  });
});
