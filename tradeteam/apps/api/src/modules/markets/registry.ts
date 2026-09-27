import type { MarketDTO, Ticker } from '@tradeteam/shared';
import { fmt } from '@tradeteam/shared';
import { query } from '../../infrastructure/db';
import { redisSub } from '../../infrastructure/redis';
import { logger } from '../../infrastructure/logger';
import { getTradingFees } from '../trading/fees';

/**
 * In-memory market registry (per process), loaded from MySQL and refreshed on `markets:changed`.
 * Tickers for *all* markets are kept in memory from the market-data hub's once-per-batch
 * `tt:tickers` broadcast, so listing/sorting/searching thousands of markets is a pure in-memory
 * operation with no per-request Redis or DB round trips.
 */
export interface MarketRow {
  id: number;
  symbol: string;
  base: string;
  quote: string;
  base_asset_id: number;
  quote_asset_id: number;
  type: 'spot' | 'futures';
  engine: 'internal' | 'external';
  provider: string;
  provider_symbol: string;
  status: 'trading' | 'halted' | 'delisted';
  enabled: number;
  tick_size: string;
  step_size: string;
  price_precision: number;
  qty_precision: number;
  min_qty: string;
  max_qty: string | null;
  min_notional: string;
  max_notional: string | null;
  base_name: string | null;
  logo_url: string | null;
  market_cap: string | null;
  sort_rank: number;
}

let bySymbol = new Map<string, MarketRow>();
let byId = new Map<number, MarketRow>();
const tickers = new Map<string, Ticker>();
let loadedAt = 0;

export async function loadMarkets() {
  const rows = await query<MarketRow>(
    `SELECT m.id, m.symbol, m.base, m.quote, m.base_asset_id, m.quote_asset_id, m.type, m.engine, m.provider, m.provider_symbol,
            m.status, m.enabled, m.tick_size, m.step_size, m.price_precision, m.qty_precision, m.min_qty, m.max_qty,
            m.min_notional, m.max_notional, m.sort_rank, a.name AS base_name, a.logo_url, a.market_cap
     FROM markets m JOIN assets a ON a.id = m.base_asset_id`,
  );
  const s = new Map<string, MarketRow>();
  const i = new Map<number, MarketRow>();
  for (const r of rows) {
    r.id = Number(r.id);
    r.base_asset_id = Number(r.base_asset_id);
    r.quote_asset_id = Number(r.quote_asset_id);
    s.set(r.symbol, r);
    i.set(r.id, r);
  }
  bySymbol = s;
  byId = i;
  loadedAt = Date.now();
  return rows.length;
}

export function marketBySymbol(symbol: string) {
  return bySymbol.get(symbol.toUpperCase()) ?? null;
}
export function marketById(id: number) {
  return byId.get(id) ?? null;
}
export function allMarkets() {
  return [...bySymbol.values()];
}
export function isVisible(m: MarketRow) {
  return m.enabled === 1 && m.status !== 'delisted';
}
export function registryLoadedAt() {
  return loadedAt;
}

export function setTickers(list: Ticker[]) {
  for (const t of list) tickers.set(t.s, t);
}
export function getTicker(symbol: string) {
  return tickers.get(symbol) ?? null;
}
export function tickerCount() {
  return tickers.size;
}

export function toDTO(m: MarketRow, favorite?: boolean): MarketDTO {
  const fees = getTradingFees(m.id);
  return {
    symbol: m.symbol,
    base: m.base,
    quote: m.quote,
    baseName: m.base_name,
    logoUrl: m.logo_url,
    type: m.type,
    status: m.status,
    engine: m.engine,
    pricePrecision: m.price_precision,
    qtyPrecision: m.qty_precision,
    tickSize: fmt(m.tick_size),
    stepSize: fmt(m.step_size),
    minQty: fmt(m.min_qty),
    maxQty: m.max_qty ? fmt(m.max_qty) : null,
    minNotional: fmt(m.min_notional),
    makerFee: fmt(fees.maker),
    takerFee: fmt(fees.taker),
    marketCap: m.market_cap ? fmt(m.market_cap) : null,
    ticker: tickers.get(m.symbol) ?? null,
    ...(favorite !== undefined ? { favorite } : {}),
  };
}

/** Keeps the registry and ticker cache in sync across processes. */
export async function subscribeRegistryUpdates() {
  const sub = redisSub();
  await sub.subscribe('markets:changed', 'tt:tickers');
  sub.on('message', (channel, msg) => {
    if (channel === 'markets:changed') {
      loadMarkets().catch((e) => logger.error({ err: e.message }, 'market reload failed'));
    } else if (channel === 'tt:tickers') {
      try {
        setTickers(JSON.parse(msg) as Ticker[]);
      } catch {
        /* ignore malformed */
      }
    }
  });
}

export async function hydrateTickers() {
  const { redis } = await import('../../infrastructure/redis');
  const all = await redis().hgetall('md:tickers');
  setTickers(Object.values(all).map((v) => JSON.parse(v) as Ticker));
}
