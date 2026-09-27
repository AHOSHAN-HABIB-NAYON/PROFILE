import { D, dec, fmt, toDb } from '@tradeteam/shared';
import { exec, query } from '../../infrastructure/db';
import { redis } from '../../infrastructure/redis';
import { logger } from '../../infrastructure/logger';
import { getTicker } from '../markets/registry';
import { refPrice, REFERENCE, STABLES } from '../trading/cost-basis';

/** Server-authoritative portfolio analytics (reference currency: USDT). */
export async function portfolio(userId: number) {
  const rows = await query<{
    asset_id: number;
    symbol: string;
    name: string | null;
    logo_url: string | null;
    available: string;
    locked: string;
    cb_qty: string | null;
    cb_cost: string | null;
    realized: string | null;
  }>(
    `SELECT b.asset_id, a.symbol, a.name, a.logo_url, b.available, b.locked, cb.quantity AS cb_qty, cb.cost AS cb_cost, cb.realized_pnl AS realized
     FROM balances b JOIN assets a ON a.id = b.asset_id LEFT JOIN cost_basis cb ON cb.user_id = b.user_id AND cb.asset_id = b.asset_id
     WHERE b.user_id = ? AND (b.available > 0 OR b.locked > 0)`,
    [userId],
  );
  const realizedAll = await query<{ r: string | null }>(
    'SELECT SUM(realized_pnl) AS r FROM cost_basis WHERE user_id = ?',
    [userId],
  );
  let total = new D(0);
  let unrealized = new D(0);
  let pnl24h = new D(0);
  const holdings = rows.map((r) => {
    const qty = dec(r.available).plus(r.locked);
    const px = refPrice(r.symbol);
    const value = px ? qty.times(px) : null;
    if (value) total = total.plus(value);
    const stable = STABLES.has(r.symbol);
    const avg =
      !stable && r.cb_qty && dec(r.cb_qty).gt(0) ? dec(r.cb_cost).div(r.cb_qty) : stable ? new D(1) : null;
    const u = avg && px && !stable ? px.minus(avg).times(Decimal_min(qty, dec(r.cb_qty ?? 0))) : null;
    if (u) unrealized = unrealized.plus(u);
    const t = getTicker(`${r.symbol}${REFERENCE}`);
    if (t && !stable) pnl24h = pnl24h.plus(dec(t.c).minus(t.o).times(qty));
    return {
      asset: r.symbol,
      name: r.name,
      logoUrl: r.logo_url,
      quantity: fmt(qty),
      price: px ? fmt(px.toDecimalPlaces(8)) : null,
      value: value ? fmt(value.toDecimalPlaces(2)) : null,
      avgEntry: avg ? fmt(avg.toDecimalPlaces(8)) : null,
      unrealizedPnl: u ? fmt(u.toDecimalPlaces(2)) : null,
      unrealizedPnlPct:
        u && avg && avg.gt(0) ? fmt(px!.minus(avg).div(avg).times(100).toDecimalPlaces(2)) : null,
      realizedPnl: r.realized ? fmt(dec(r.realized).toDecimalPlaces(2)) : '0',
      change24h: t ? t.p : stable ? '0' : null,
    };
  });
  holdings.sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0));
  const allocation = holdings
    .filter((h) => h.value && Number(h.value) > 0)
    .map((h) => ({
      asset: h.asset,
      value: h.value!,
      pct: total.gt(0) ? fmt(dec(h.value!).div(total).times(100).toDecimalPlaces(2)) : '0',
    }));

  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const snap = await query<{ value: string }>(
    'SELECT value FROM portfolio_snapshots WHERE user_id = ? AND ts <= ? ORDER BY ts DESC LIMIT 1',
    [userId, midnight],
  );
  const flows = await query<{ symbol: string; type: string; amt: string }>(
    `SELECT a.symbol, t.type, SUM(t.amount) AS amt FROM transactions t JOIN assets a ON a.id = t.asset_id
     WHERE t.user_id = ? AND t.created_at >= ? AND t.status IN ('completed','approved','manual_review','pending') GROUP BY a.symbol, t.type`,
    [userId, midnight],
  );
  let netFlow = new D(0);
  for (const f of flows) {
    const px = refPrice(f.symbol) ?? new D(0);
    const v = dec(f.amt).times(px);
    netFlow = ['deposit', 'transfer_in'].includes(f.type) ? netFlow.plus(v) : netFlow.minus(v);
  }
  const startValue = snap[0] ? dec(snap[0].value) : null;
  const today = startValue ? total.minus(startValue).minus(netFlow) : null;
  const realized = dec(realizedAll[0]?.r ?? 0);
  return {
    currency: REFERENCE,
    totalValue: fmt(total.toDecimalPlaces(2)),
    pnlToday: today ? fmt(today.toDecimalPlaces(2)) : null,
    pnlTodayPct:
      today && startValue && startValue.gt(0)
        ? fmt(today.div(startValue).times(100).toDecimalPlaces(2))
        : null,
    pnl24h: fmt(pnl24h.toDecimalPlaces(2)),
    pnl24hPct: total.minus(pnl24h).gt(0)
      ? fmt(pnl24h.div(total.minus(pnl24h)).times(100).toDecimalPlaces(2))
      : '0',
    unrealizedPnl: fmt(unrealized.toDecimalPlaces(2)),
    realizedPnl: fmt(realized.toDecimalPlaces(2)),
    totalPnl: fmt(unrealized.plus(realized).toDecimalPlaces(2)),
    holdings,
    allocation,
  };
}

function Decimal_min(a: InstanceType<typeof D>, b: InstanceType<typeof D>) {
  return a.lt(b) ? a : b;
}

export async function performance(userId: number, range: '1d' | '7d' | '30d' | '90d' | '1y') {
  const days = { '1d': 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[range];
  const rows = await query<{ ts: Date; value: string }>(
    'SELECT ts, value FROM portfolio_snapshots WHERE user_id = ? AND ts >= NOW() - INTERVAL ? DAY ORDER BY ts',
    [userId, days],
  );
  return rows.map((r) => ({
    time: Math.floor(r.ts.getTime() / 1000),
    value: fmt(dec(r.value).toDecimalPlaces(2)),
  }));
}

/** Hourly snapshot job (one instance, Redis lock). Set-based valuation over all balances. */
export async function snapshotAll() {
  const ok = await redis().set('lock:portfolio-snapshot', '1', 'EX', 1800, 'NX');
  if (!ok) return 0;
  try {
    const ts = new Date();
    ts.setUTCMinutes(0, 0, 0);
    let lastId = 0;
    let n = 0;
    for (;;) {
      const users = await query<{ user_id: number }>(
        'SELECT DISTINCT user_id FROM balances WHERE user_id > ? AND (available > 0 OR locked > 0) ORDER BY user_id LIMIT 500',
        [lastId],
      );
      if (!users.length) break;
      lastId = Number(users[users.length - 1]!.user_id);
      const ids = users.map((u) => Number(u.user_id));
      const bals = await query<{ user_id: number; symbol: string; amt: string }>(
        `SELECT b.user_id, a.symbol, (b.available + b.locked) AS amt FROM balances b JOIN assets a ON a.id = b.asset_id WHERE b.user_id IN (${ids.map(() => '?').join(',')})`,
        ids,
      );
      const values = new Map<number, InstanceType<typeof D>>();
      for (const b of bals) {
        const px = refPrice(b.symbol);
        if (!px) continue;
        values.set(Number(b.user_id), (values.get(Number(b.user_id)) ?? new D(0)).plus(dec(b.amt).times(px)));
      }
      const entries = [...values];
      if (entries.length) {
        await exec(
          `INSERT INTO portfolio_snapshots (user_id, ts, value) VALUES ${entries.map(() => '(?,?,?)').join(',')} ON DUPLICATE KEY UPDATE value = VALUES(value)`,
          entries.flatMap(([u, v]) => [u, ts, toDb(v)]),
        );
      }
      n += entries.length;
    }
    return n;
  } catch (e) {
    logger.error({ err: (e as Error).message }, 'portfolio snapshot failed');
    return 0;
  } finally {
    await redis().del('lock:portfolio-snapshot');
  }
}
