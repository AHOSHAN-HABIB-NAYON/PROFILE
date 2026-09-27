import type { PoolConnection } from 'mysql2/promise';
import Decimal from 'decimal.js';
import { D, dec, toDb } from '@tradeteam/shared';
import { exec, one } from '../../infrastructure/db';
import { getTicker } from '../markets/registry';
import { assetSymbol } from '../wallets/assets-cache';

/**
 * Average-cost basis per (user, asset), valued in the platform reference currency (USDT).
 * Acquisitions add quantity and cost; disposals realise P&L against the average cost.
 */
export const STABLES = new Set(['USDT', 'USDC', 'FDUSD', 'USD', 'BUSD', 'DAI', 'TUSD', 'USDP']);
export const REFERENCE = 'USDT';

/** Current reference-currency price of an asset, or null when no route exists. */
export function refPrice(symbol: string): Decimal | null {
  if (STABLES.has(symbol)) return new D(1);
  const direct = getTicker(`${symbol}${REFERENCE}`);
  if (direct) return dec(direct.c);
  for (const via of ['BTC', 'ETH', 'BNB']) {
    const a = getTicker(`${symbol}${via}`);
    const b = getTicker(`${via}${REFERENCE}`);
    if (a && b) return dec(a.c).times(b.c);
  }
  const inv = getTicker(`${REFERENCE}${symbol}`);
  if (inv && dec(inv.c).gt(0)) return new D(1).div(inv.c);
  return null;
}

async function row(c: PoolConnection, userId: number, assetId: number) {
  await exec('INSERT IGNORE INTO cost_basis (user_id, asset_id) VALUES (?,?)', [userId, assetId], c);
  const r = await one<{ quantity: string; cost: string; realized_pnl: string }>(
    'SELECT quantity, cost, realized_pnl FROM cost_basis WHERE user_id = ? AND asset_id = ? FOR UPDATE',
    [userId, assetId],
    c,
  );
  return { qty: dec(r!.quantity), cost: dec(r!.cost), realized: dec(r!.realized_pnl) };
}

export async function acquire(
  c: PoolConnection,
  userId: number,
  assetId: number,
  qty: Decimal,
  valueRef: Decimal,
) {
  if (STABLES.has(assetSymbol(assetId)) || qty.lte(0)) return;
  const r = await row(c, userId, assetId);
  await exec(
    'UPDATE cost_basis SET quantity = ?, cost = ? WHERE user_id = ? AND asset_id = ?',
    [toDb(r.qty.plus(qty)), toDb(r.cost.plus(valueRef)), userId, assetId],
    c,
  );
}

/** Returns realised P&L (reference currency) for the disposal. */
export async function dispose(
  c: PoolConnection,
  userId: number,
  assetId: number,
  qty: Decimal,
  proceedsRef: Decimal | null,
): Promise<Decimal | null> {
  if (STABLES.has(assetSymbol(assetId)) || qty.lte(0)) return null;
  const r = await row(c, userId, assetId);
  if (r.qty.lte(0)) return null;
  const q = Decimal.min(qty, r.qty);
  const avg = r.cost.div(r.qty);
  const costOut = avg.times(q);
  const realized = proceedsRef ? proceedsRef.times(q.div(qty)).minus(costOut) : null;
  await exec(
    'UPDATE cost_basis SET quantity = ?, cost = ?, realized_pnl = ? WHERE user_id = ? AND asset_id = ?',
    [
      toDb(r.qty.minus(q)),
      toDb(Decimal.max(0, r.cost.minus(costOut))),
      toDb(realized ? r.realized.plus(realized) : r.realized),
      userId,
      assetId,
    ],
    c,
  );
  return realized;
}
