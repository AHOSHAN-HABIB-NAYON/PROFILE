import Decimal from 'decimal.js';
import { D, dec, floorTo, toDb, type OrderSide, type OrderType, type TimeInForce } from '@tradeteam/shared';
import { exec, one, query, tx } from '../../infrastructure/db';
import { Errors, AppError } from '../../http/errors';
import { getSetting } from '../settings/settings.service';
import { marketBySymbol, getTicker, type MarketRow } from '../markets/registry';
import { BalanceSession, publishBalances } from '../wallets/ledger';
import { assetSymbol } from '../wallets/assets-cache';
import { getOrder, normalize, toOrderDTO, type OrderRow } from './orders.repo';
import { submitToEngine, cancelInEngine, localEngine } from './engine-client';
import { submitExternal, cancelExternal, exchangeConfigured } from './external';
import { getTradingFees } from './fees';

export interface PlaceOrderInput {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  timeInForce?: TimeInForce;
  price?: string;
  stopPrice?: string;
  quantity?: string;
  quoteQuantity?: string;
  clientOrderId?: string;
}

const MARKET_BUY_BUFFER = new D('1.05'); // lock headroom for quantity-based market buys (internal engine)

function onStep(v: Decimal, step: string) {
  const s = dec(step);
  return s.lte(0) || v.mod(s).isZero();
}

/**
 * Validates an order against market rules and the user's balance, locks the required funds and
 * records the order atomically, then hands it to the internal engine or the exchange adapter.
 * All amounts are decimal strings validated server-side; nothing from the client is trusted.
 */
export async function placeOrder(userId: number, input: PlaceOrderInput) {
  if (getSetting('maintenance.enabled')) throw Errors.unavailable('Trading is paused for maintenance');
  const m = marketBySymbol(input.symbol);
  if (!m || m.enabled !== 1 || m.status === 'delisted') throw Errors.notFound('Market not found');
  if (m.status !== 'trading') throw Errors.conflict('Trading is halted on this market', 'market_halted');
  if (m.engine === 'external' && !exchangeConfigured()) {
    throw new AppError(
      503,
      'exchange_unavailable',
      'Trading on this market requires exchange connectivity, which is not configured.',
    );
  }
  const tif = input.timeInForce ?? 'GTC';
  const price = input.price ? dec(input.price) : null;
  const stop = input.stopPrice ? dec(input.stopPrice) : null;
  const qty = input.quantity ? dec(input.quantity) : null;
  const quoteQty = input.quoteQuantity ? dec(input.quoteQuantity) : null;
  const isStopType = ['stop_market', 'stop_limit', 'take_profit', 'stop_loss'].includes(input.type);
  const needsPrice = input.type === 'limit' || input.type === 'stop_limit';
  const fail = (msg: string) => {
    throw Errors.validation([{ path: 'order', message: msg }]);
  };

  if (needsPrice && !price) fail('Price is required');
  if (isStopType && !stop) fail('Trigger price is required');
  if (price && (price.lte(0) || !onStep(price, m.tick_size)))
    fail(`Price must be a multiple of ${dec(m.tick_size).toFixed()}`);
  if (stop && (stop.lte(0) || !onStep(stop, m.tick_size)))
    fail(`Trigger price must be a multiple of ${dec(m.tick_size).toFixed()}`);
  if (!qty && !quoteQty) fail('Amount is required');
  if (qty && quoteQty) fail('Specify either amount or total, not both');
  if (quoteQty && !(input.type === 'market' && input.side === 'buy'))
    fail('Total is only supported for market buy orders');
  if (tif === 'FOK' && !qty) fail('Fill-or-kill requires an amount');
  if (qty) {
    if (qty.lte(0) || !onStep(qty, m.step_size))
      fail(`Amount must be a multiple of ${dec(m.step_size).toFixed()}`);
    if (qty.lt(m.min_qty)) fail(`Minimum amount is ${dec(m.min_qty).toFixed()} ${m.base}`);
    if (m.max_qty && qty.gt(m.max_qty)) fail(`Maximum amount is ${dec(m.max_qty).toFixed()} ${m.base}`);
  }
  if (m.engine === 'external' && input.side === 'buy' && input.type === 'market' && !quoteQty)
    fail('Market buys on this market must specify a total');
  if (m.engine === 'external' && input.side === 'buy' && isStopType && !price)
    fail('Conditional buys on this market require a limit price');

  // Reference price for notional checks and market-order locks.
  const t = getTicker(m.symbol);
  const eng = localEngine()?.bestPrices(m.id);
  const refPx =
    price ?? stop ?? (input.side === 'buy' ? eng?.ask : eng?.bid) ?? eng?.last ?? (t ? dec(t.c) : null);
  const notional = quoteQty ?? (qty && refPx ? qty.times(refPx) : null);
  if (notional && notional.lt(m.min_notional))
    fail(`Minimum order value is ${dec(m.min_notional).toFixed()} ${m.quote}`);
  if (notional && m.max_notional && notional.gt(m.max_notional))
    fail(`Maximum order value is ${dec(m.max_notional).toFixed()} ${m.quote}`);

  // Funds to lock.
  let lockAsset: number;
  let lockAmount: Decimal;
  if (input.side === 'sell') {
    lockAsset = m.base_asset_id;
    lockAmount = qty!;
  } else {
    lockAsset = m.quote_asset_id;
    if (quoteQty) lockAmount = quoteQty;
    else if (price) lockAmount = floorTo(qty!.times(price), 18);
    else {
      if (!refPx) throw Errors.conflict('No market price available yet for a market order', 'no_price');
      lockAmount = floorTo(qty!.times(refPx).times(MARKET_BUY_BUFFER), 18);
    }
  }

  // Trigger direction is relative to the *last traded* price, never the order's own limit price.
  const lastPx = eng?.last ?? (t ? dec(t.c) : null);
  const triggerCondition = isStopType ? triggerFor(input.type, input.side, stop!, lastPx) : null;
  let order!: OrderRow;
  let balances: ReturnType<BalanceSession['changed']> = [];
  try {
    await tx(async (c) => {
      const bs = new BalanceSession(c);
      await bs.lock([[userId, lockAsset]]);
      if (bs.get(userId, lockAsset).available.lt(lockAmount))
        throw Errors.insufficient(`Insufficient ${assetSymbol(lockAsset)} balance`);
      const r = await exec(
        `INSERT INTO orders (user_id, market_id, client_order_id, side, type, time_in_force, status, price, stop_price, trigger_condition, quantity, quote_quantity, lock_asset_id, locked_remaining, engine)
         VALUES (?,?,?,?,?,?, 'pending', ?,?,?,?,?,?,?,?)`,
        [
          userId,
          m.id,
          input.clientOrderId ?? null,
          input.side,
          input.type,
          tif,
          price ? toDb(price) : null,
          stop ? toDb(stop) : null,
          triggerCondition,
          qty ? toDb(qty) : null,
          quoteQty ? toDb(quoteQty) : null,
          lockAsset,
          toDb(lockAmount),
          m.engine,
        ],
        c,
      );
      await bs.lockFunds(userId, lockAsset, lockAmount, 'order', r.insertId);
      order = (await getOrder(r.insertId, c))!;
      balances = bs.changed(assetSymbol);
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ER_DUP_ENTRY')
      throw Errors.conflict('Duplicate clientOrderId', 'duplicate_order');
    throw e;
  }
  publishBalances(balances);
  const processed = m.engine === 'internal' ? await submitToEngine(order.id) : await submitExternal(order.id);
  return toOrderDTO(processed);
}

/**
 * Stop-market / stop-limit direction is inferred from the current price (trigger above → fires
 * on rise, below → fires on fall). Take-profit and stop-loss are defined by side.
 */
export function triggerFor(
  type: OrderType,
  side: OrderSide,
  stop: Decimal,
  ref: Decimal | null | undefined,
): 'gte' | 'lte' {
  if (type === 'take_profit') return side === 'sell' ? 'gte' : 'lte';
  if (type === 'stop_loss') return side === 'sell' ? 'lte' : 'gte';
  if (!ref) return side === 'buy' ? 'gte' : 'lte';
  return stop.gte(ref) ? 'gte' : 'lte';
}

export async function cancelOrder(userId: number, orderId: string) {
  const o = await getOrder(orderId);
  if (!o || o.user_id !== userId) throw Errors.notFound('Order not found');
  if (!['pending', 'open', 'partially_filled'].includes(o.status))
    throw Errors.conflict('Order is no longer open', 'order_closed');
  const r = o.engine === 'internal' ? await cancelInEngine(orderId) : await cancelExternal(orderId);
  return toOrderDTO(r);
}

export async function cancelAll(userId: number, symbol?: string) {
  const m = symbol ? marketBySymbol(symbol) : null;
  const rows = await query<{ id: string }>(
    `SELECT id FROM orders WHERE user_id = ? AND status IN ('pending','open','partially_filled') ${m ? 'AND market_id = ?' : ''} LIMIT 500`,
    m ? [userId, m.id] : [userId],
  );
  let n = 0;
  for (const r of rows) {
    try {
      await cancelOrder(userId, String(r.id));
      n++;
    } catch {
      /* already closed */
    }
  }
  return n;
}

export interface OrderFilters {
  symbol?: string;
  side?: OrderSide;
  type?: OrderType;
  status?: string;
  open?: boolean;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

export async function listOrders(userId: number, f: OrderFilters) {
  const where: string[] = ['user_id = ?'];
  const params: (string | number | Date)[] = [userId];
  if (f.symbol) {
    const m = marketBySymbol(f.symbol);
    if (!m) return { items: [], total: 0, page: f.page, pageSize: f.pageSize };
    where.push('market_id = ?');
    params.push(m.id);
  }
  if (f.side) {
    where.push('side = ?');
    params.push(f.side);
  }
  if (f.type) {
    where.push('type = ?');
    params.push(f.type);
  }
  if (f.open) where.push("status IN ('pending','open','partially_filled')");
  else if (f.status) {
    where.push('status = ?');
    params.push(f.status);
  }
  if (f.from) {
    where.push('created_at >= ?');
    params.push(f.from);
  }
  if (f.to) {
    where.push('created_at <= ?');
    params.push(f.to);
  }
  const w = where.join(' AND ');
  const rows = await query<OrderRow>(`SELECT * FROM orders WHERE ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, [
    ...params,
    f.pageSize,
    (f.page - 1) * f.pageSize,
  ]);
  const total = await one<{ n: number }>(`SELECT COUNT(*) AS n FROM orders WHERE ${w}`, params);
  return {
    items: rows.map((r) => toOrderDTO(normalize(r))),
    total: Number(total?.n ?? 0),
    page: f.page,
    pageSize: f.pageSize,
  };
}

export async function listUserTrades(
  userId: number,
  f: { symbol?: string; side?: OrderSide; from?: Date; to?: Date; page: number; pageSize: number },
) {
  const where = ['f.user_id = ?'];
  const params: (string | number | Date)[] = [userId];
  if (f.symbol) {
    const m = marketBySymbol(f.symbol);
    if (!m) return { items: [], total: 0, page: f.page, pageSize: f.pageSize };
    where.push('f.market_id = ?');
    params.push(m.id);
  }
  if (f.side) {
    where.push('f.side = ?');
    params.push(f.side);
  }
  if (f.from) {
    where.push('f.created_at >= ?');
    params.push(f.from);
  }
  if (f.to) {
    where.push('f.created_at <= ?');
    params.push(f.to);
  }
  const w = where.join(' AND ');
  const rows = await query<{
    id: number;
    order_id: number;
    trade_id: number;
    symbol: string;
    side: string;
    role: string;
    price: string;
    qty: string;
    quote_qty: string;
    fee: string;
    fee_asset: string;
    realized_pnl: string | null;
    created_at: Date;
  }>(
    `SELECT f.id, f.order_id, f.trade_id, m.symbol, f.side, f.role, f.price, f.qty, f.quote_qty, f.fee, f.fee_asset, f.realized_pnl, f.created_at
     FROM order_fills f JOIN markets m ON m.id = f.market_id WHERE ${w} ORDER BY f.id DESC LIMIT ? OFFSET ?`,
    [...params, f.pageSize, (f.page - 1) * f.pageSize],
  );
  const total = await one<{ n: number }>(`SELECT COUNT(*) AS n FROM order_fills f WHERE ${w}`, params);
  const { fmt } = await import('@tradeteam/shared');
  return {
    items: rows.map((r) => ({
      id: String(r.id),
      orderId: String(r.order_id),
      tradeId: String(r.trade_id),
      symbol: r.symbol,
      side: r.side,
      role: r.role,
      price: fmt(r.price),
      qty: fmt(r.qty),
      quoteQty: fmt(r.quote_qty),
      fee: fmt(r.fee),
      feeAsset: r.fee_asset,
      realizedPnl: r.realized_pnl ? fmt(r.realized_pnl) : null,
      createdAt: r.created_at,
    })),
    total: Number(total?.n ?? 0),
    page: f.page,
    pageSize: f.pageSize,
  };
}

export function feePreview(m: MarketRow) {
  return getTradingFees(m.id);
}
