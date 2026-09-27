import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { BinanceProvider } from '../src/modules/market-data/binance';

/** A local stand-in for Binance's REST + combined-stream API (wire formats as documented). */
let server: http.Server;
let wss: WebSocketServer;
let base = '';
const subscriptions: string[][] = [];
const sockets: WebSocket[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url?.startsWith('/api/v3/exchangeInfo')) {
      res.end(
        JSON.stringify({
          symbols: [
            {
              symbol: 'BTCUSDT',
              status: 'TRADING',
              baseAsset: 'BTC',
              quoteAsset: 'USDT',
              isSpotTradingAllowed: true,
              filters: [
                { filterType: 'PRICE_FILTER', tickSize: '0.01000000' },
                {
                  filterType: 'LOT_SIZE',
                  minQty: '0.00001000',
                  maxQty: '9000.00000000',
                  stepSize: '0.00001000',
                },
                { filterType: 'NOTIONAL', minNotional: '5.00000000', maxNotional: '9000000.00000000' },
              ],
            },
            {
              symbol: 'NEWCOINBTC',
              status: 'BREAK',
              baseAsset: 'NEWCOIN',
              quoteAsset: 'BTC',
              isSpotTradingAllowed: true,
              filters: [],
            },
            {
              symbol: 'OLDUSDT',
              status: 'END_OF_DAY',
              baseAsset: 'OLD',
              quoteAsset: 'USDT',
              isSpotTradingAllowed: true,
              filters: [],
            },
          ],
        }),
      );
    } else if (req.url?.startsWith('/api/v3/klines')) {
      res.end(
        JSON.stringify([
          [
            1700000000000,
            '100.00',
            '110.00',
            '90.00',
            '105.00',
            '12.5',
            1700000059999,
            '1300',
            42,
            '6',
            '600',
            '0',
          ],
        ]),
      );
    } else if (req.url?.startsWith('/api/v3/ticker/24hr')) {
      res.end(
        JSON.stringify([
          {
            symbol: 'BTCUSDT',
            lastPrice: '105.00000000',
            openPrice: '100.00',
            highPrice: '110',
            lowPrice: '90',
            volume: '12.5',
            quoteVolume: '1300',
            priceChangePercent: '5.000',
            closeTime: 1,
          },
        ]),
      );
    } else res.writeHead(404).end('{}');
  });
  wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    sockets.push(ws);
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString()) as { method: string; params: string[]; id: number };
      if (m.method === 'SUBSCRIBE') {
        subscriptions.push(m.params);
        ws.send(JSON.stringify({ result: null, id: m.id }));
        for (const p of m.params) {
          if (p.endsWith('@trade'))
            ws.send(
              JSON.stringify({
                stream: p,
                data: { e: 'trade', s: 'BTCUSDT', t: 777, p: '105.10', q: '0.5', T: 1700000001000, m: true },
              }),
            );
          if (p.includes('@kline_1m'))
            ws.send(
              JSON.stringify({
                stream: p,
                data: {
                  e: 'kline',
                  k: {
                    t: 1700000000000,
                    i: '1m',
                    o: '100',
                    h: '106',
                    l: '99',
                    c: '105.1',
                    v: '13',
                    x: false,
                    L: 777,
                  },
                },
              }),
            );
          if (p.includes('@depth20'))
            ws.send(
              JSON.stringify({
                stream: p,
                data: { lastUpdateId: 9, bids: [['105.00', '1.00000']], asks: [['105.20', '2.50000']] },
              }),
            );
        }
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  wss.close();
  server.close();
});

describe('BinanceProvider', () => {
  it('normalises instruments (all pairs, halted and delisted handling)', async () => {
    const p = new BinanceProvider(`http://${base}`, `ws://${base}`);
    const list = await p.fetchInstruments();
    expect(list.map((i) => i.symbol)).toEqual(['BTCUSDT', 'NEWCOINBTC']);
    expect(list[0]).toMatchObject({
      base: 'BTC',
      quote: 'USDT',
      tickSize: '0.01000000',
      stepSize: '0.00001000',
      minNotional: '5.00000000',
      status: 'trading',
    });
    expect(list[1]!.status).toBe('halted');
    const k = await p.fetchCandles('BTCUSDT', '1m', { limit: 1 });
    expect(k[0]).toMatchObject({ o: '100', h: '110', c: '105', v: '12.5', x: true });
    const t = await p.fetchTickers();
    expect(t[0]).toMatchObject({ s: 'BTCUSDT', c: '105', p: '5' });
  });

  it('multiplexes subscriptions, normalises events, and resubscribes after reconnect', async () => {
    const p = new BinanceProvider(`http://${base}`, `ws://${base}`);
    p.setSymbolMap([['BTCUSDT', 'BTCUSDT']]);
    const trades: unknown[] = [];
    const books: unknown[] = [];
    const klines: unknown[] = [];
    p.on('trade', (t) => trades.push(t));
    p.on('book', (b) => books.push(b));
    p.on('kline', (k) => klines.push(k));
    await p.start();
    p.subscribe([
      { kind: 'trades', symbol: 'BTCUSDT' },
      { kind: 'book', symbol: 'BTCUSDT' },
      { kind: 'kline', symbol: 'BTCUSDT', interval: '1m' },
    ]);
    await new Promise((r) => setTimeout(r, 800));
    // one batched SUBSCRIBE carrying all three streams on a single connection
    expect(
      subscriptions.some(
        (s) =>
          s.length === 3 &&
          s.includes('btcusdt@trade') &&
          s.includes('btcusdt@depth20@100ms') &&
          s.includes('btcusdt@kline_1m'),
      ),
    ).toBe(true);
    expect(trades[0]).toEqual({
      s: 'BTCUSDT',
      id: '777',
      p: '105.1',
      q: '0.5',
      side: 'sell',
      T: 1700000001000,
    });
    expect(books[0]).toMatchObject({ s: 'BTCUSDT', u: 9, bids: [['105', '1']], asks: [['105.2', '2.5']] });
    expect(klines[0]).toMatchObject({ s: 'BTCUSDT', i: '1m', c: '105.1', lastTradeId: '777' });

    // Kill every connection: provider must reconnect and resubscribe automatically.
    const before = subscriptions.length;
    sockets.forEach((s) => s.terminate());
    await new Promise((r) => setTimeout(r, 2500));
    expect(subscriptions.length).toBeGreaterThan(before);
    expect(subscriptions.slice(before).flat()).toEqual(
      expect.arrayContaining(['btcusdt@trade', 'btcusdt@depth20@100ms', 'btcusdt@kline_1m']),
    );
    expect(p.health().connected).toBe(true);
    await p.stop();
  });
});
