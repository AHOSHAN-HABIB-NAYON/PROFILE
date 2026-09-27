import { query } from '../../infrastructure/db';
import { redisSub, redisPub } from '../../infrastructure/redis';
import { logger } from '../../infrastructure/logger';

/**
 * Fee schedule resolution (in memory, refreshed on `fees:changed`):
 *   trading:    market-specific row → global default row (market_id NULL)
 *   withdrawal: network-specific row (fixed + percent)
 *   deposit:    network-specific row (fixed + percent), usually zero
 * Rates are decimal strings (0.001 = 0.1%).
 */
interface FeeRow {
  scope: 'trading' | 'withdrawal' | 'deposit';
  market_id: number | null;
  network_id: number | null;
  maker_rate: string | null;
  taker_rate: string | null;
  fixed_amount: string | null;
  percent_rate: string | null;
}

let rows: FeeRow[] = [];

export async function loadFees() {
  rows = await query<FeeRow>(
    'SELECT scope, market_id, network_id, maker_rate, taker_rate, fixed_amount, percent_rate FROM fees',
  );
  rows.forEach((r) => {
    r.market_id = r.market_id === null ? null : Number(r.market_id);
    r.network_id = r.network_id === null ? null : Number(r.network_id);
  });
}

export function getTradingFees(marketId: number): { maker: string; taker: string } {
  const specific = rows.find((r) => r.scope === 'trading' && r.market_id === marketId);
  const def = rows.find((r) => r.scope === 'trading' && r.market_id === null);
  return {
    maker: specific?.maker_rate ?? def?.maker_rate ?? '0.001',
    taker: specific?.taker_rate ?? def?.taker_rate ?? '0.001',
  };
}

export function getNetworkFee(
  scope: 'withdrawal' | 'deposit',
  networkId: number,
): { fixed: string; percent: string } {
  const r = rows.find((x) => x.scope === scope && x.network_id === networkId);
  return { fixed: r?.fixed_amount ?? '0', percent: r?.percent_rate ?? '0' };
}

export async function subscribeFeeUpdates() {
  const sub = redisSub();
  await sub.subscribe('fees:changed');
  sub.on('message', (ch) => {
    if (ch === 'fees:changed') loadFees().catch((e) => logger.error({ err: e.message }, 'fee reload failed'));
  });
}

export async function notifyFeesChanged() {
  await loadFees();
  await redisPub().publish('fees:changed', '1');
}
