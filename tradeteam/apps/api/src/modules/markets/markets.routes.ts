import { Router } from 'express';
import { z } from 'zod';
import { INTERVALS, fmt, type PublicTrade } from '@tradeteam/shared';
import { h } from '../../http/async';
import { parseQuery } from '../../http/middleware/validate';
import { requireUser } from '../../http/middleware/auth';
import { Errors } from '../../http/errors';
import { exec, query } from '../../infrastructure/db';
import { allMarkets, isVisible, marketBySymbol, toDTO, getTicker, type MarketRow } from './registry';
import { getCandles, getOrderBook, getRecentTrades } from '../market-data/rest';
import { getSetting } from '../settings/settings.service';

export const marketsRouter = Router();

const listSchema = z.object({
  category: z.string().max(12).default('all'),
  q: z.string().trim().max(40).optional(),
  sort: z.enum(['volume', 'change', 'price', 'marketcap', 'name']).default('volume'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  symbols: z.string().max(4000).optional(), // explicit list, comma separated
});

async function favoriteIds(userId?: number): Promise<Set<number>> {
  if (!userId) return new Set();
  const rows = await query<{ market_id: number }>('SELECT market_id FROM favorites WHERE user_id = ?', [
    userId,
  ]);
  return new Set(rows.map((r) => Number(r.market_id)));
}

const num = (s: string | null | undefined) => (s ? Number(s) : 0);

function sortValue(m: MarketRow, sort: string): number | string {
  const t = getTicker(m.symbol);
  switch (sort) {
    case 'price':
      return num(t?.c);
    case 'change':
      return num(t?.p);
    case 'marketcap':
      return num(m.market_cap);
    case 'name':
      return m.symbol;
    default:
      return num(t?.q);
  }
}

/**
 * Server-side filtered, searched, sorted and paginated view over the complete dynamic market
 * list (thousands of pairs). Sorting uses display numbers only; no financial math happens here.
 */
marketsRouter.get(
  '/markets',
  h(async (req, res) => {
    const q = parseQuery(listSchema, req.query);
    const favs = await favoriteIds(req.auth?.id);
    const cat = q.category.toUpperCase();
    let list = allMarkets().filter(isVisible);
    if (!getSetting('market.futures_enabled')) list = list.filter((m) => m.type === 'spot');
    if (q.symbols) {
      const want = new Set(q.symbols.toUpperCase().split(',').slice(0, 200));
      list = list.filter((m) => want.has(m.symbol));
    } else if (cat === 'FAVORITES') list = list.filter((m) => favs.has(m.id));
    else if (cat === 'SPOT') list = list.filter((m) => m.type === 'spot');
    else if (cat === 'FUTURES') list = list.filter((m) => m.type === 'futures');
    else if (cat !== 'ALL') list = list.filter((m) => m.quote === cat);
    if (q.q) {
      const needle = q.q.toUpperCase().replace(/[\s/_-]/g, '');
      list = list.filter(
        (m) =>
          m.symbol.includes(needle) ||
          m.base.includes(needle) ||
          (m.base_name?.toUpperCase().includes(q.q!.toUpperCase()) ?? false),
      );
      // Exact base matches first, then prefix matches.
      list.sort((a, b) => rank(a, needle) - rank(b, needle));
    }
    const dir = q.dir === 'asc' ? 1 : -1;
    if (!q.q) {
      list.sort((a, b) => {
        const va = sortValue(a, q.sort);
        const vb = sortValue(b, q.sort);
        if (typeof va === 'string') return dir * va.localeCompare(vb as string);
        return dir * ((va as number) - (vb as number));
      });
    }
    const total = list.length;
    const start = (q.page - 1) * q.pageSize;
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      items: list.slice(start, start + q.pageSize).map((m) => toDTO(m, favs.has(m.id))),
      total,
      page: q.page,
      pageSize: q.pageSize,
      quotes: quoteCounts(),
    });
  }),
);

function rank(m: MarketRow, needle: string) {
  if (m.base === needle || m.symbol === needle) return 0;
  if (m.symbol.startsWith(needle)) return 1;
  return 2;
}

let quoteCache: { at: number; v: { quote: string; count: number }[] } = { at: 0, v: [] };
function quoteCounts() {
  if (Date.now() - quoteCache.at < 30_000) return quoteCache.v;
  const counts = new Map<string, number>();
  for (const m of allMarkets()) if (isVisible(m)) counts.set(m.quote, (counts.get(m.quote) ?? 0) + 1);
  quoteCache = {
    at: Date.now(),
    v: [...counts].map(([quote, count]) => ({ quote, count })).sort((a, b) => b.count - a.count),
  };
  return quoteCache.v;
}

marketsRouter.get(
  '/markets/movers',
  h(async (req, res) => {
    const q = parseQuery(
      z.object({
        quote: z.string().max(10).default('USDT'),
        limit: z.coerce.number().int().min(1).max(50).default(10),
        minQuoteVolume: z.coerce.number().min(0).default(100_000),
      }),
      req.query,
    );
    const list = allMarkets()
      .filter((m) => isVisible(m) && m.status === 'trading' && m.quote === q.quote.toUpperCase())
      .map((m) => ({ m, t: getTicker(m.symbol) }))
      .filter((x) => x.t && Number(x.t.q) >= q.minQuoteVolume);
    const byChange = [...list].sort((a, b) => Number(b.t!.p) - Number(a.t!.p));
    const byVolume = [...list].sort((a, b) => Number(b.t!.q) - Number(a.t!.q));
    res.json({
      gainers: byChange.slice(0, q.limit).map((x) => toDTO(x.m)),
      losers: byChange
        .slice(-q.limit)
        .reverse()
        .map((x) => toDTO(x.m)),
      volume: byVolume.slice(0, q.limit).map((x) => toDTO(x.m)),
    });
  }),
);

function requireMarket(symbol: string) {
  const m = marketBySymbol(symbol);
  if (!m || !isVisible(m)) throw Errors.notFound('Market not found');
  return m;
}

marketsRouter.get(
  '/markets/:symbol',
  h(async (req, res) => {
    const m = requireMarket(String(req.params.symbol));
    const favs = await favoriteIds(req.auth?.id);
    res.json({ market: toDTO(m, favs.has(m.id)) });
  }),
);

marketsRouter.post(
  '/markets/:symbol/favorite',
  requireUser,
  h(async (req, res) => {
    const m = requireMarket(String(req.params.symbol));
    await exec('INSERT IGNORE INTO favorites (user_id, market_id) VALUES (?,?)', [req.auth!.id, m.id]);
    res.json({ favorite: true });
  }),
);

marketsRouter.delete(
  '/markets/:symbol/favorite',
  requireUser,
  h(async (req, res) => {
    const m = requireMarket(String(req.params.symbol));
    await exec('DELETE FROM favorites WHERE user_id = ? AND market_id = ?', [req.auth!.id, m.id]);
    res.json({ favorite: false });
  }),
);

marketsRouter.get(
  '/assets',
  h(async (req, res) => {
    const q = parseQuery(
      z.object({
        q: z.string().trim().max(40).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(500).default(100),
      }),
      req.query,
    );
    const like = q.q ? `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
    const where = `status = 'active'${like ? ' AND (symbol LIKE ? OR name LIKE ?)' : ''}`;
    const params = like ? [like, like] : [];
    const rows = await query(
      `SELECT id, symbol, name, logo_url AS logoUrl, market_cap AS marketCap, deposit_enabled AS depositEnabled, withdraw_enabled AS withdrawEnabled FROM assets WHERE ${where} ORDER BY market_cap IS NULL, market_cap DESC, symbol LIMIT ? OFFSET ?`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize],
    );
    const total = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM assets WHERE ${where}`, params);
    res.json({ items: rows, total: Number(total[0]?.n ?? 0), page: q.page, pageSize: q.pageSize });
  }),
);

marketsRouter.get(
  '/candles/:symbol',
  h(async (req, res) => {
    const m = requireMarket(String(req.params.symbol));
    const q = parseQuery(
      z.object({
        interval: z.enum(INTERVALS).default('1m'),
        endTime: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().min(1).max(1000).default(500),
      }),
      req.query,
    );
    const candles = await getCandles(m, q.interval, q.endTime, q.limit);
    res.json({ symbol: m.symbol, interval: q.interval, candles, serverTime: Date.now() });
  }),
);

marketsRouter.get(
  '/orderbook/:symbol',
  h(async (req, res) => {
    const m = requireMarket(String(req.params.symbol));
    const q = parseQuery(z.object({ depth: z.coerce.number().int().min(5).max(100).default(20) }), req.query);
    res.json(await getOrderBook(m, q.depth));
  }),
);

marketsRouter.get(
  '/trades/:symbol',
  h(async (req, res) => {
    const m = requireMarket(String(req.params.symbol));
    const q = parseQuery(z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }), req.query);
    let trades = await getRecentTrades(m, q.limit);
    if (!trades.length && m.engine === 'internal') {
      const rows = await query<{
        id: number;
        price: string;
        qty: string;
        taker_side: 'buy' | 'sell';
        created_at: Date;
      }>(
        'SELECT id, price, qty, taker_side, created_at FROM trades WHERE market_id = ? ORDER BY id DESC LIMIT ?',
        [m.id, q.limit],
      );
      trades = rows.map((r): PublicTrade => ({
        s: m.symbol,
        id: String(r.id),
        p: fmt(r.price),
        q: fmt(r.qty),
        side: r.taker_side,
        T: r.created_at.getTime(),
      }));
    }
    res.json({ symbol: m.symbol, trades });
  }),
);
