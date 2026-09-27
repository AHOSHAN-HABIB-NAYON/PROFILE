import crypto from 'node:crypto';
import { D, dec, fmt, toDb, floorTo, WS } from '@tradeteam/shared';
import { exec, query, tx } from '../../infrastructure/db';
import { redis } from '../../infrastructure/redis';
import { logger } from '../../infrastructure/logger';
import { getSetting } from '../settings/settings.service';
import { marketById } from '../markets/registry';
import { BalanceSession, publishBalances } from '../wallets/ledger';
import { assetSymbol } from '../wallets/assets-cache';
import { publishUser } from '../../websocket/bus';
import { notify } from '../notifications/notifications.service';
import { getTradingFees } from './fees';
import { getOrder, toOrderDTO, type OrderRow } from './orders.repo';
import { acquire, dispose, refPrice } from './cost-basis';

/**
 * External execution (broker / omnibus model) against Binance Spot.
 *
 * Users' funds are locked in the internal ledger first; the order is then placed on the exchange
 * with clientOrderId = tt_<orderId> (idempotent). Fills are pulled by a reconciliation loop from
 * the exchange's authoritative trade list and settled exactly once (unique external trade id per
 * market). Terminal exchange states release any remaining lock. Nothing is ever simulated: when
 * credentials are missing the order is rejected and funds are released.
 */
const STATUS: Record<string, OrderRow['status']> = {
  NEW: 'open',
  PARTIALLY_FILLED: 'partially_filled',
  FILLED: 'filled',
  CANCELED: 'cancelled',
  PENDING_CANCEL: 'open',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  EXPIRED_IN_MATCH: 'expired',
};

export class ExchangeError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly exchangeCode?: number,
  ) {
    super(message);
  }
}

let timeOffset = 0;
let offsetAt = 0;

function creds() {
  const key = getSetting('exchange.api_key');
  const secret = getSetting('exchange.api_secret');
  return key && secret ? { key, secret } : null;
}

export function exchangeConfigured() {
  return creds() !== null;
}

async function syncTime(base: string) {
  if (Date.now() - offsetAt < 60_000) return;
  const r = await fetch(`${base}/api/v3/time`, { signal: AbortSignal.timeout(5000) });
  const { serverTime } = (await r.json()) as { serverTime: number };
  timeOffset = serverTime - Date.now();
  offsetAt = Date.now();
}

async function signed<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<T> {
  const c = creds();
  if (!c) throw new ExchangeError('Exchange credentials are not configured', 503);
  const base = getSetting('market.binance_rest_url');
  await syncTime(base).catch(() => undefined);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  qs.set('recvWindow', '5000');
  qs.set('timestamp', String(Date.now() + timeOffset));
  qs.set('signature', crypto.createHmac('sha256', c.secret).update(qs.toString()).digest('hex'));
  const r = await fetch(`${base}${path}?${qs}`, {
    method,
    headers: { 'X-MBX-APIKEY': c.key },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await r.json().catch(() => ({}))) as { code?: number; msg?: string };
  if (!r.ok) throw new ExchangeError(body.msg ?? `Exchange error ${r.status}`, r.status, body.code);
  return body as T;
}

function exchangeType(o: OrderRow): Record<string, string | undefined> {
  const hasPrice = o.price !== null;
  const lossDirection =
    (o.side === 'sell' && o.trigger_condition === 'lte') ||
    (o.side === 'buy' && o.trigger_condition === 'gte');
  switch (o.type) {
    case 'market':
      return { type: 'MARKET' };
    case 'limit':
      return { type: 'LIMIT', timeInForce: o.time_in_force };
    case 'stop_loss':
      return { type: hasPrice ? 'STOP_LOSS_LIMIT' : 'STOP_LOSS', timeInForce: hasPrice ? 'GTC' : undefined };
    case 'take_profit':
      return {
        type: hasPrice ? 'TAKE_PROFIT_LIMIT' : 'TAKE_PROFIT',
        timeInForce: hasPrice ? 'GTC' : undefined,
      };
    case 'stop_market':
      return { type: lossDirection ? 'STOP_LOSS' : 'TAKE_PROFIT' };
    case 'stop_limit':
      return { type: lossDirection ? 'STOP_LOSS_LIMIT' : 'TAKE_PROFIT_LIMIT', timeInForce: 'GTC' };
  }
}

export async function submitExternal(orderId: string): Promise<OrderRow> {
  const o = (await getOrder(orderId))!;
  const m = marketById(o.market_id)!;
  try {
    const t = exchangeType(o);
    const r = await signed<{ orderId: number; status: string }>('POST', '/api/v3/order', {
      symbol: m.provider_symbol,
      side: o.side.toUpperCase(),
      ...t,
      quantity: o.quantity ? fmt(o.quantity) : undefined,
      quoteOrderQty: !o.quantity && o.quote_quantity ? fmt(o.quote_quantity) : undefined,
      price:
        o.price && t.type !== 'MARKET' && !['STOP_LOSS', 'TAKE_PROFIT'].includes(t.type!)
          ? fmt(o.price)
          : undefined,
      stopPrice: o.stop_price ? fmt(o.stop_price) : undefined,
      newClientOrderId: `tt_${o.id}`,
      newOrderRespType: 'ACK',
    });
    await exec('UPDATE orders SET external_id = ?, status = ? WHERE id = ? AND status = ?', [
      String(r.orderId),
      o.trigger_condition ? 'pending' : 'open',
      o.id,
      'pending',
    ]);
    const cur = (await getOrder(o.id))!;
    publishUser(cur.user_id, WS.ORDER_CREATED, toOrderDTO(cur));
    await reconcileOrder(cur).catch((e) =>
      logger.warn({ err: (e as Error).message }, 'immediate reconcile failed'),
    );
    return (await getOrder(o.id))!;
  } catch (e) {
    const err = e as ExchangeError;
    // Network/5xx: the order may or may not exist on the exchange — keep it pending; reconciliation resolves it.
    if (!(err instanceof ExchangeError) || err.status >= 500) {
      if (err instanceof ExchangeError && err.status === 503 && !exchangeConfigured())
        return rejectLocal(o, 'exchange_not_configured');
      logger.error({ err: err.message, order: o.id }, 'external submit uncertain; will reconcile');
      return o;
    }
    return rejectLocal(o, `exchange: ${err.message}`.slice(0, 250));
  }
}

async function rejectLocal(o: OrderRow, reason: string) {
  let balances: ReturnType<BalanceSession['changed']> = [];
  await tx(async (c) => {
    const cur = (await getOrder(o.id, c, true))!;
    if (!['pending', 'open', 'partially_filled'].includes(cur.status)) return;
    const bs = new BalanceSession(c);
    if (dec(cur.locked_remaining).gt(0))
      await bs.unlockFunds(cur.user_id, cur.lock_asset_id, cur.locked_remaining, 'order', cur.id);
    await exec(
      "UPDATE orders SET status = 'rejected', locked_remaining = 0, reject_reason = ? WHERE id = ?",
      [reason, cur.id],
      c,
    );
    balances = bs.changed(assetSymbol);
  });
  publishBalances(balances);
  const out = (await getOrder(o.id))!;
  publishUser(out.user_id, WS.ORDER_UPDATED, toOrderDTO(out));
  return out;
}

export async function cancelExternal(orderId: string): Promise<OrderRow> {
  const o = (await getOrder(orderId))!;
  const m = marketById(o.market_id)!;
  try {
    await signed('DELETE', '/api/v3/order', { symbol: m.provider_symbol, origClientOrderId: `tt_${o.id}` });
  } catch (e) {
    const err = e as ExchangeError;
    // -2011 unknown order: never reached the exchange (or already done) → reconcile decides.
    if (err.exchangeCode !== -2011) throw e;
  }
  await reconcileOrder(o);
  return (await getOrder(orderId))!;
}

/** Pulls authoritative state + fills for one order and settles new fills exactly once. */
export async function reconcileOrder(o: OrderRow) {
  const m = marketById(o.market_id);
  if (!m) return;
  let ex: { status: string; orderId: number } | null = null;
  try {
    ex = await signed<{ status: string; orderId: number }>('GET', '/api/v3/order', {
      symbol: m.provider_symbol,
      origClientOrderId: `tt_${o.id}`,
    });
  } catch (e) {
    const err = e as ExchangeError;
    if (err.exchangeCode === -2013 && Date.now() - o.created_at.getTime() > 60_000) {
      await rejectLocal(o, 'exchange_order_not_found');
    }
    return;
  }
  const trades = await signed<
    { id: number; price: string; qty: string; quoteQty: string; isBuyer: boolean; time: number }[]
  >('GET', '/api/v3/myTrades', {
    symbol: m.provider_symbol,
    orderId: ex.orderId,
  });
  const fees = getTradingFees(m.id);
  const status = STATUS[ex.status] ?? o.status;
  let balances: ReturnType<BalanceSession['changed']> = [];
  let newFills = 0;
  await tx(async (c) => {
    const cur = (await getOrder(o.id, c, true))!;
    const bs = new BalanceSession(c);
    await bs.lock([
      [cur.user_id, m.base_asset_id],
      [cur.user_id, m.quote_asset_id],
    ]);
    let filledQty = dec(cur.filled_qty);
    let filledQuote = dec(cur.filled_quote);
    let feeTotal = dec(cur.fee_total);
    let locked = dec(cur.locked_remaining);
    const qRef = refPrice(m.quote);
    for (const t of trades) {
      const ref = String(t.id);
      const dup = await query(
        'SELECT id FROM trades WHERE market_id = ? AND external_ref = ?',
        [m.id, ref],
        c,
      );
      if (dup.length) continue;
      const qty = dec(t.qty);
      const quote = floorTo(dec(t.quoteQty), 18);
      const price = dec(t.price);
      const isBuy = cur.side === 'buy';
      const fee = isBuy ? floorTo(qty.times(fees.taker), 18) : floorTo(quote.times(fees.taker), 18);
      const debit = isBuy ? quote : qty;
      if (debit.gt(locked)) {
        // Exchange filled more than we locked (should be impossible with correct locks) — stop and alert.
        throw new Error(`external fill exceeds lock for order ${cur.id}`);
      }
      const tr = await exec(
        `INSERT INTO trades (market_id, price, qty, quote_qty, taker_side, maker_order_id, taker_order_id, maker_user_id, taker_user_id, maker_fee, taker_fee, external_ref)
         VALUES (?,?,?,?,?,NULL,?,NULL,?,0,?,?)`,
        [m.id, toDb(price), toDb(qty), toDb(quote), cur.side, cur.id, cur.user_id, toDb(fee), ref],
        c,
      );
      const tradeId = tr.insertId;
      const [spend, receive] = isBuy
        ? [m.quote_asset_id, m.base_asset_id]
        : [m.base_asset_id, m.quote_asset_id];
      const gross = isBuy ? qty : quote;
      await bs.apply({
        userId: cur.user_id,
        assetId: spend,
        available: 0,
        locked: debit.neg(),
        type: 'trade_debit',
        refType: 'trade',
        refId: tradeId,
      });
      await bs.apply({
        userId: cur.user_id,
        assetId: receive,
        available: gross,
        locked: 0,
        type: 'trade_credit',
        refType: 'trade',
        refId: tradeId,
      });
      if (fee.gt(0))
        await bs.apply({
          userId: cur.user_id,
          assetId: receive,
          available: fee.neg(),
          locked: 0,
          type: 'trade_fee',
          refType: 'trade',
          refId: tradeId,
        });
      const valueRef = qRef ? quote.times(qRef) : null;
      let realized = null;
      if (isBuy) {
        if (valueRef) await acquire(c, cur.user_id, m.base_asset_id, qty.minus(fee), valueRef);
        realized = await dispose(c, cur.user_id, m.quote_asset_id, quote, valueRef);
      } else {
        realized = await dispose(c, cur.user_id, m.base_asset_id, qty, valueRef);
        if (valueRef) await acquire(c, cur.user_id, m.quote_asset_id, quote.minus(fee), valueRef);
      }
      await exec(
        `INSERT INTO order_fills (order_id, trade_id, user_id, market_id, side, role, price, qty, quote_qty, fee, fee_asset, realized_pnl) VALUES (?,?,?,?,?,'taker',?,?,?,?,?,?)`,
        [
          cur.id,
          tradeId,
          cur.user_id,
          m.id,
          cur.side,
          toDb(price),
          toDb(qty),
          toDb(quote),
          toDb(fee),
          isBuy ? m.base : m.quote,
          realized ? toDb(realized) : null,
        ],
        c,
      );
      filledQty = filledQty.plus(qty);
      filledQuote = filledQuote.plus(quote);
      feeTotal = feeTotal.plus(fee);
      locked = locked.minus(debit);
      newFills++;
    }
    const terminal = ['filled', 'cancelled', 'rejected', 'expired'].includes(status);
    if (terminal && locked.gt(0)) {
      await bs.unlockFunds(cur.user_id, cur.lock_asset_id, locked, 'order', cur.id);
      locked = new D(0);
    }
    await exec(
      'UPDATE orders SET status = ?, filled_qty = ?, filled_quote = ?, fee_total = ?, fee_asset = ?, locked_remaining = ?, external_id = COALESCE(external_id, ?) WHERE id = ?',
      [
        status,
        toDb(filledQty),
        toDb(filledQuote),
        toDb(feeTotal),
        cur.side === 'buy' ? m.base : m.quote,
        toDb(locked),
        String(ex!.orderId),
        cur.id,
      ],
      c,
    );
    balances = bs.changed(assetSymbol);
  });
  const out = (await getOrder(o.id))!;
  if (newFills || out.status !== o.status) {
    publishBalances(balances);
    publishUser(
      out.user_id,
      out.status === 'filled'
        ? WS.ORDER_FILLED
        : out.status === 'cancelled'
          ? WS.ORDER_CANCELLED
          : WS.ORDER_UPDATED,
      toOrderDTO(out),
    );
    if (newFills) {
      notify(
        out.user_id,
        out.status === 'filled' ? 'order_filled' : 'order_partial',
        out.status === 'filled' ? 'Order filled' : 'Order partially filled',
        `${out.side === 'buy' ? 'Bought' : 'Sold'} ${fmt(out.filled_qty)} ${m.base} on ${m.symbol}.`,
        { orderId: out.id },
      ).catch(() => undefined);
    }
  }
}

/** Reconciliation worker: keeps external orders in sync with the exchange. */
export function startExternalReconciler() {
  let running = false;
  return setInterval(async () => {
    if (running || !exchangeConfigured()) return;
    const lock = await redis().set('lock:ext-reconcile', '1', 'EX', 10, 'NX');
    if (!lock) return;
    running = true;
    try {
      const rows = await query<OrderRow>(
        "SELECT * FROM orders WHERE engine = 'external' AND status IN ('pending','open','partially_filled') ORDER BY updated_at LIMIT 50",
      );
      for (const r of rows) {
        r.id = String(r.id);
        r.user_id = Number(r.user_id);
        r.market_id = Number(r.market_id);
        r.lock_asset_id = Number(r.lock_asset_id);
        await reconcileOrder(r).catch((e) =>
          logger.warn({ err: (e as Error).message, order: r.id }, 'reconcile failed'),
        );
      }
    } finally {
      running = false;
      await redis().del('lock:ext-reconcile');
    }
  }, 3000);
}

/** Admin view: omnibus exchange balances vs. the sum of users' internal balances. */
export async function balanceReconciliation() {
  const internal = await query<{ symbol: string; total: string }>(
    'SELECT a.symbol, SUM(b.available + b.locked) AS total FROM balances b JOIN assets a ON a.id = b.asset_id GROUP BY a.symbol HAVING total > 0',
  );
  let exchange: { asset: string; free: string; locked: string }[] = [];
  let error: string | null = null;
  try {
    exchange = (
      await signed<{ balances: { asset: string; free: string; locked: string }[] }>(
        'GET',
        '/api/v3/account',
        { omitZeroBalances: 'true' },
      )
    ).balances;
  } catch (e) {
    error = (e as Error).message;
  }
  const ex = new Map(exchange.map((b) => [b.asset, dec(b.free).plus(b.locked)]));
  return {
    error,
    rows: internal.map((r) => {
      const e = ex.get(r.symbol) ?? null;
      return {
        asset: r.symbol,
        internal: fmt(r.total),
        exchange: e ? fmt(e) : null,
        difference: e ? fmt(e.minus(r.total)) : null,
      };
    }),
  };
}
