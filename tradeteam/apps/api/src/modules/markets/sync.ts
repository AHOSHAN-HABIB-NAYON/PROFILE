import { dec, stepToPrecision, toDb } from '@tradeteam/shared';
import { exec, query } from '../../infrastructure/db';
import { redis, redisPub } from '../../infrastructure/redis';
import { logger } from '../../infrastructure/logger';
import { getSetting } from '../settings/settings.service';
import type { AssetMeta, Instrument, MarketDataProvider } from '../market-data/provider';

/**
 * Market metadata synchronisation. Pulls the provider's *complete* instrument list, upserts every
 * asset and trading pair, detects newly listed pairs and marks pairs that disappeared from the
 * provider as delisted (re-activating them if they return). Runs on one instance at a time
 * (Redis lock) on a configurable schedule.
 */
export interface SyncReport {
  total: number;
  added: string[];
  delisted: string[];
  relisted: number;
  assets: number;
  durationMs: number;
}

const ICON_CDN = 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color';

export async function syncMarkets(provider: MarketDataProvider): Promise<SyncReport | null> {
  const lock = await redis().set('lock:market-sync', '1', 'EX', 300, 'NX');
  if (!lock) return null;
  const started = Date.now();
  try {
    const instruments = await provider.fetchInstruments();
    if (instruments.length === 0)
      throw new Error('Provider returned no instruments; refusing to delist everything');
    const report = await applyInstruments(provider.name, instruments);
    await exec(
      "INSERT INTO system_settings (`key`, value) VALUES ('market.last_sync', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      [
        JSON.stringify({
          at: new Date().toISOString(),
          ...report,
          added: report.added.length,
          delisted: report.delisted.length,
        }),
      ],
    );
    await redisPub().publish('markets:changed', '1');
    report.durationMs = Date.now() - started;
    logger.info(
      {
        total: report.total,
        added: report.added.length,
        delisted: report.delisted.length,
        ms: report.durationMs,
      },
      'market sync complete',
    );
    if (getSetting('market.enrichment_enabled')) {
      enrichAssets().catch((e) => logger.warn({ err: (e as Error).message }, 'asset enrichment failed'));
    }
    return report;
  } finally {
    await redis().del('lock:market-sync');
  }
}

export async function applyInstruments(providerName: string, instruments: Instrument[]): Promise<SyncReport> {
  // 1) assets
  const symbols = [...new Set(instruments.flatMap((i) => [i.base, i.quote]))];
  for (let i = 0; i < symbols.length; i += 500) {
    const chunk = symbols.slice(i, i + 500);
    await exec(
      `INSERT INTO assets (symbol, logo_url, last_synced_at) VALUES ${chunk.map(() => '(?, ?, NOW(3))').join(',')}
       ON DUPLICATE KEY UPDATE last_synced_at = NOW(3), status = IF(status = 'delisted' AND source = 'provider', 'active', status)`,
      chunk.flatMap((s) => [s, `${ICON_CDN}/${s.toLowerCase()}.png`]),
    );
  }
  const assetRows = await query<{ id: number; symbol: string }>('SELECT id, symbol FROM assets');
  const assetId = new Map(assetRows.map((a) => [a.symbol, Number(a.id)]));

  // 2) markets
  const existing = await query<{ symbol: string; status: string; provider: string }>(
    'SELECT symbol, status, provider FROM markets',
  );
  const existingMap = new Map(existing.map((m) => [m.symbol, m]));
  const engine = getSetting('market.default_engine');
  const added: string[] = [];
  let relisted = 0;
  for (let i = 0; i < instruments.length; i += 300) {
    const chunk = instruments.slice(i, i + 300);
    const params: (string | number | null)[] = [];
    for (const m of chunk) {
      const prev = existingMap.get(m.symbol);
      if (!prev) added.push(m.symbol);
      else if (prev.status === 'delisted') relisted++;
      params.push(
        m.symbol,
        assetId.get(m.base)!,
        assetId.get(m.quote)!,
        m.base,
        m.quote,
        m.type,
        engine,
        providerName,
        m.providerSymbol,
        m.status,
        toDb(m.tickSize),
        toDb(m.stepSize),
        stepToPrecision(m.tickSize),
        stepToPrecision(m.stepSize),
        toDb(m.minQty),
        m.maxQty ? toDb(m.maxQty) : null,
        toDb(m.minNotional),
        m.maxNotional && dec(m.maxNotional).lt('1e17') ? toDb(m.maxNotional) : null,
      );
    }
    await exec(
      `INSERT INTO markets (symbol, base_asset_id, quote_asset_id, base, quote, type, engine, provider, provider_symbol, status,
         tick_size, step_size, price_precision, qty_precision, min_qty, max_qty, min_notional, max_notional, last_synced_at)
       VALUES ${chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(3))').join(',')}
       ON DUPLICATE KEY UPDATE
         status = IF(provider = VALUES(provider), VALUES(status), status),
         delisted_at = IF(provider = VALUES(provider), NULL, delisted_at),
         last_synced_at = NOW(3),
         tick_size = IF(sync_locked, tick_size, VALUES(tick_size)),
         step_size = IF(sync_locked, step_size, VALUES(step_size)),
         price_precision = IF(sync_locked, price_precision, VALUES(price_precision)),
         qty_precision = IF(sync_locked, qty_precision, VALUES(qty_precision)),
         min_qty = IF(sync_locked, min_qty, VALUES(min_qty)),
         max_qty = IF(sync_locked, max_qty, VALUES(max_qty)),
         min_notional = IF(sync_locked, min_notional, VALUES(min_notional)),
         max_notional = IF(sync_locked, max_notional, VALUES(max_notional))`,
      params,
    );
  }

  // 3) delisting: provider markets no longer returned by the provider
  const live = new Set(instruments.map((i) => i.symbol));
  const delisted = existing
    .filter((m) => m.provider === providerName && m.status !== 'delisted' && !live.has(m.symbol))
    .map((m) => m.symbol);
  for (let i = 0; i < delisted.length; i += 500) {
    const chunk = delisted.slice(i, i + 500);
    await exec(
      `UPDATE markets SET status = 'delisted', delisted_at = NOW(3) WHERE symbol IN (${chunk.map(() => '?').join(',')})`,
      chunk,
    );
  }
  if (added.length) logger.info({ count: added.length, sample: added.slice(0, 10) }, 'new markets detected');
  if (delisted.length)
    logger.warn({ count: delisted.length, sample: delisted.slice(0, 10) }, 'markets delisted');
  return { total: instruments.length, added, delisted, relisted, assets: symbols.length, durationMs: 0 };
}

/**
 * Optional enrichment of asset names / logos / market caps from CoinGecko's public API.
 * Only fills provider-sourced assets; admin-edited (manual) assets are never overwritten.
 */
export async function enrichAssets(pages = 4) {
  const meta = new Map<string, AssetMeta>();
  for (let page = 1; page <= pages; page++) {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`,
      { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) },
    );
    if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
    const rows = (await r.json()) as {
      symbol: string;
      name: string;
      image: string;
      market_cap: number | null;
    }[];
    for (const c of rows) {
      const sym = c.symbol.toUpperCase();
      if (!meta.has(sym))
        meta.set(sym, {
          symbol: sym,
          name: c.name,
          logoUrl: c.image,
          marketCap: c.market_cap ? String(c.market_cap) : null,
        });
    }
    if (rows.length < 250) break;
  }
  const list = [...meta.values()];
  for (let i = 0; i < list.length; i += 200) {
    const chunk = list.slice(i, i + 200);
    for (const a of chunk) {
      await exec(
        "UPDATE assets SET name = COALESCE(?, name), logo_url = COALESCE(?, logo_url), market_cap = ? WHERE symbol = ? AND source = 'provider'",
        [a.name ?? null, a.logoUrl ?? null, a.marketCap ? toDb(dec(a.marketCap).toFixed(0)) : null, a.symbol],
      );
    }
  }
  await redisPub().publish('markets:changed', '1');
  return list.length;
}
