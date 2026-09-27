import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dec } from '@tradeteam/shared';
import { query, one, exec } from '../src/infrastructure/db';
import { startHarness, userAgent, balance, type Harness } from './harness';

let h: Harness;
let alice: Awaited<ReturnType<typeof userAgent>>;
let bob: Awaited<ReturnType<typeof userAgent>>;

beforeAll(async () => {
  h = await startHarness();
  alice = await userAgent(h, 'alice@example.com', { USDT: '10000' });
  bob = await userAgent(h, 'bob@example.com', { TST: '100' });
});
afterAll(async () => h?.stop());

async function place(u: typeof alice, body: Record<string, unknown>) {
  return u.agent
    .post('/api/orders')
    .set('x-csrf-token', u.csrf)
    .send({ symbol: 'TSTUSDT', ...body });
}

describe('order validation', () => {
  it('rejects bad tick / step / min notional / insufficient balance', async () => {
    expect((await place(alice, { side: 'buy', type: 'limit', price: '10.001', quantity: '1' })).status).toBe(
      422,
    );
    expect(
      (await place(alice, { side: 'buy', type: 'limit', price: '10', quantity: '1.00001' })).status,
    ).toBe(422);
    expect((await place(alice, { side: 'buy', type: 'limit', price: '0.01', quantity: '1' })).status).toBe(
      422,
    ); // < min notional 1
    const r = await place(alice, { side: 'buy', type: 'limit', price: '100', quantity: '1000' });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('insufficient_balance');
    expect((await place(alice, { side: 'buy', type: 'limit', price: '-1', quantity: '1' })).status).toBe(422);
    expect(
      (
        await alice.agent
          .post('/api/orders')
          .send({ symbol: 'TSTUSDT', side: 'buy', type: 'limit', price: '10', quantity: '1' })
      ).status,
    ).toBe(403); // CSRF
  });
});

describe('internal matching & settlement', () => {
  it('rests a limit sell, locks funds, and shows in the book', async () => {
    const r = await place(bob, { side: 'sell', type: 'limit', price: '10', quantity: '5' });
    expect(r.status).toBe(201);
    expect(r.body.order.status).toBe('open');
    expect(await balance(bob.id, 'TST')).toEqual({
      available: '95.000000000000000000',
      locked: '5.000000000000000000',
    });
    await new Promise((r) => setTimeout(r, 60)); // book snapshots are coalesced (20ms)
    const book = await bob.agent.get('/api/orderbook/TSTUSDT');
    expect(book.body.asks[0]).toEqual(['10', '5']);
  });

  it('crossing limit buy fills at maker price with price improvement released and fees charged', async () => {
    const r = await place(alice, { side: 'buy', type: 'limit', price: '12', quantity: '2' });
    expect(r.status).toBe(201);
    expect(r.body.order.status).toBe('filled');
    expect(r.body.order.avgPrice).toBe('10');
    // alice paid 20 USDT (not 24), received 2 TST minus 0.1% fee
    const a = await balance(alice.id, 'USDT');
    expect(dec(a.available).toFixed()).toBe('9980');
    expect(dec(a.locked).toFixed()).toBe('0');
    expect(dec((await balance(alice.id, 'TST')).available).toFixed()).toBe('1.998');
    // bob sold 2 TST, received 20 USDT minus 0.1%
    expect(dec((await balance(bob.id, 'USDT')).available).toFixed()).toBe('19.98');
    expect(dec((await balance(bob.id, 'TST')).locked).toFixed()).toBe('3');
    const maker = await one<{ status: string; filled_qty: string }>(
      "SELECT status, filled_qty FROM orders WHERE user_id = ? AND side = 'sell'",
      [bob.id],
    );
    expect(maker?.status).toBe('partially_filled');
  });

  it('market buy by total consumes the book and returns unused funds', async () => {
    const r = await place(alice, { side: 'buy', type: 'market', quoteQuantity: '100' });
    expect(r.status).toBe(201);
    expect(r.body.order.status).toBe('filled');
    expect(r.body.order.filledQty).toBe('3'); // only 3 TST were left at 10
    expect(dec((await balance(alice.id, 'USDT')).available).toFixed()).toBe('9950');
    expect(dec((await balance(alice.id, 'USDT')).locked).toFixed()).toBe('0');
  });

  it('market order with no liquidity is rejected and unlocked', async () => {
    const r = await place(alice, { side: 'buy', type: 'market', quoteQuantity: '10' });
    expect(r.body.order.status).toBe('rejected');
    expect(dec((await balance(alice.id, 'USDT')).locked).toFixed()).toBe('0');
  });

  it('cancel releases the remaining lock', async () => {
    const r = await place(alice, { side: 'buy', type: 'limit', price: '5', quantity: '10' });
    expect(r.body.order.status).toBe('open');
    expect(dec((await balance(alice.id, 'USDT')).locked).toFixed()).toBe('50');
    const c = await alice.agent.delete(`/api/orders/${r.body.order.id}`).set('x-csrf-token', alice.csrf);
    expect(c.body.order.status).toBe('cancelled');
    expect(dec((await balance(alice.id, 'USDT')).locked).toFixed()).toBe('0');
    // cannot cancel someone else's order
    const other = await place(bob, { side: 'sell', type: 'limit', price: '50', quantity: '1' });
    expect(
      (await alice.agent.delete(`/api/orders/${other.body.order.id}`).set('x-csrf-token', alice.csrf)).status,
    ).toBe(404);
  });

  it('stop-limit triggers when last price crosses', async () => {
    // current last price is 10; place stop-limit sell by alice at trigger 9 (fires on fall)
    const s = await place(alice, {
      side: 'sell',
      type: 'stop_limit',
      stopPrice: '9',
      price: '8',
      quantity: '1',
    });
    expect(s.body.order.status).toBe('pending');
    // bob bids at 8.5 and then alice's crossing trade prints below 9
    await place(bob, { side: 'buy', type: 'limit', price: '8.5', quantity: '0.5' });
    await place(alice, { side: 'sell', type: 'limit', price: '8.5', quantity: '0.2' }); // trade at 8.5 → trigger
    await new Promise((r) => setTimeout(r, 300));
    const o = await one<{ status: string; triggered_at: Date | null; filled_qty: string }>(
      'SELECT status, triggered_at, filled_qty FROM orders WHERE id = ?',
      [s.body.order.id],
    );
    expect(o?.triggered_at).not.toBeNull();
    expect(['partially_filled', 'open', 'filled']).toContain(o?.status);
  });

  it('never allows a negative balance, even with concurrent orders', async () => {
    const carol = await userAgent(h, 'carol@example.com', { USDT: '100' });
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        place(carol, { side: 'buy', type: 'limit', price: '4', quantity: '5' }),
      ),
    );
    const ok = results.filter((r) => r.status === 201).length;
    expect(ok).toBe(5); // 5 × 20 USDT = 100
    const b = await balance(carol.id, 'USDT');
    expect(dec(b.available).toFixed()).toBe('0');
    expect(dec(b.locked).toFixed()).toBe('100');
  });

  it('ledger reconciles exactly with balances and value is conserved', async () => {
    const rows = await query<{ user_id: number; asset_id: number; a: string; l: string }>(
      'SELECT user_id, asset_id, SUM(available_delta) AS a, SUM(locked_delta) AS l FROM ledger_entries GROUP BY user_id, asset_id',
    );
    for (const r of rows) {
      const b = await one<{ available: string; locked: string }>(
        'SELECT available, locked FROM balances WHERE user_id = ? AND asset_id = ?',
        [r.user_id, r.asset_id],
      );
      expect(dec(r.a).eq(b!.available)).toBe(true);
      expect(dec(r.l).eq(b!.locked)).toBe(true);
    }
    // Total TST in the system = seeded 100 minus fees collected in TST.
    const tst = await one<{ t: string }>(
      "SELECT SUM(b.available + b.locked) AS t FROM balances b JOIN assets a ON a.id = b.asset_id WHERE a.symbol = 'TST'",
    );
    const fees = await one<{ f: string }>(
      "SELECT COALESCE(SUM(fee), 0) AS f FROM order_fills WHERE fee_asset = 'TST'",
    );
    expect(dec(tst!.t).plus(fees!.f).toFixed()).toBe('100');
  });

  it('ledger is append-only at the database level', async () => {
    await expect(exec('UPDATE ledger_entries SET memo = ? WHERE id = 1', ['x'])).rejects.toThrow(
      /append-only/,
    );
    await expect(exec('DELETE FROM ledger_entries WHERE id = 1')).rejects.toThrow(/append-only/);
  });

  it('lists orders and trades with filters', async () => {
    const o = await alice.agent.get('/api/orders?status=filled');
    expect(o.body.items.length).toBeGreaterThan(0);
    expect(o.body.items.every((x: { status: string }) => x.status === 'filled')).toBe(true);
    const open = await alice.agent.get('/api/orders?open=true');
    expect(
      open.body.items.every((x: { status: string }) =>
        ['open', 'partially_filled', 'pending'].includes(x.status),
      ),
    ).toBe(true);
    const t = await alice.agent.get('/api/trades?symbol=TSTUSDT');
    expect(t.body.items.length).toBeGreaterThan(0);
    const pub = await alice.agent.get('/api/trades/TSTUSDT');
    expect(pub.body.trades.length).toBeGreaterThan(0);
  });

  it('engine rebuilds the book from the database after restart', async () => {
    const before = h.engine.snapshot(
      (await one<{ id: number }>("SELECT id FROM markets WHERE symbol = 'TSTUSDT'"))!.id,
    );
    const { MatchingEngine } = await import('../src/modules/trading/engine');
    const e2 = new MatchingEngine();
    await e2.start();
    const after = e2.snapshot(
      (await one<{ id: number }>("SELECT id FROM markets WHERE symbol = 'TSTUSDT'"))!.id,
    );
    expect(after).toEqual(before);
    await e2.stop();
  });

  it('portfolio and wallets are served', async () => {
    const w = await alice.agent.get('/api/wallets');
    expect(w.body.items.find((x: { asset: string }) => x.asset === 'TST')).toBeTruthy();
    const p = await alice.agent.get('/api/portfolio');
    expect(p.status).toBe(200);
    expect(p.body.holdings.length).toBeGreaterThan(0);
  });
});
