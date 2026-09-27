import Decimal from 'decimal.js';
import type { PoolConnection } from 'mysql2/promise';
import {
  D,
  dec,
  fmt,
  toDb,
  floorTo,
  WS,
  channelName,
  INTERVALS,
  type Candle,
  type Ticker,
  type PublicTrade,
} from '@tradeteam/shared';
import { exec, query, tx } from '../../infrastructure/db';
import { redis, redisPub } from '../../infrastructure/redis';
import { logger } from '../../infrastructure/logger';
import { publishMarket, publishUser } from '../../websocket/bus';
import { BalanceSession, publishBalances } from '../wallets/ledger';
import { assetSymbol } from '../wallets/assets-cache';
import { allMarkets, marketById, setTickers, type MarketRow } from '../markets/registry';
import { CandleAggregator } from '../market-data/aggregator';
import { notify } from '../notifications/notifications.service';
import { OrderBook, type RestingOrder } from './book';
import { planMatch, type Incoming, type MatchPlan } from './matching';
import { getTradingFees } from './fees';
import { getOrder, listOpenInternal, toOrderDTO, type OrderRow } from './orders.repo';
import { acquire, dispose, refPrice } from './cost-basis';

/**
 * Internal matching engine.
 *
 * - One in-memory OrderBook per internal market, rebuilt from MySQL on startup.
 * - All commands for a market run strictly sequentially (per-market promise queue), which gives
 *   deterministic price-time priority without locks around the book.
 * - Each command: plan (pure) → settle atomically in one DB transaction (orders, trades, fills,
 *   balances + immutable ledger, cost basis) → apply plan to memory → publish events.
 * - Stop / take-profit / stop-loss orders wait in a trigger list and are released when the last
 *   traded price crosses their trigger.
 * Only one process may run the engine (RUN_ENGINE); others send commands over Redis.
 */
type Trigger = { id: string; userId: number; stop: Decimal; cond: 'gte' | 'lte'; seq: number };

interface MarketState {
  m: MarketRow;
  book: OrderBook;
  queue: Promise<unknown>;
  triggers: Trigger[];
  lastPrice: Decimal | null;
  bookDirty: boolean;
  tickerDirty: boolean;
}

interface Fill {
  tradeId: number;
  makerId: string;
  makerUserId: number;
  price: Decimal;
  qty: Decimal;
  quote: Decimal;
}

export class MatchingEngine {
  private markets = new Map<number, MarketState>();
  private agg = new CandleAggregator(true);
  private timers: NodeJS.Timeout[] = [];
  private closedCandles: Candle[] = [];
  private started = false;

  async start() {
    await this.loadMarkets();
    const open = await listOpenInternal();
    let pendingNew: OrderRow[] = [];
    for (const o of open) {
      const st = this.markets.get(o.market_id);
      if (!st) continue;
      if (o.status === 'pending' && o.trigger_condition && !o.triggered_at) {
        st.triggers.push({
          id: o.id,
          userId: o.user_id,
          stop: dec(o.stop_price),
          cond: o.trigger_condition,
          seq: st.book.nextSeq(),
        });
      } else if (o.status === 'pending') {
        pendingNew.push(o); // accepted but not yet processed before a restart
      } else if (o.price) {
        const rem = dec(o.quantity).minus(o.filled_qty);
        if (rem.gt(0))
          st.book.add({
            id: o.id,
            userId: o.user_id,
            side: o.side,
            price: dec(o.price),
            remaining: rem,
            seq: st.book.nextSeq(),
          });
      }
    }
    for (const st of this.markets.values()) await this.publishBook(st);
    for (const o of pendingNew)
      this.submit(o.id).catch((e) => logger.error({ err: e.message, order: o.id }, 'recovery submit failed'));
    pendingNew = [];
    this.timers.push(
      setInterval(
        () => this.flushPeriodic().catch((e) => logger.error({ err: e.message }, 'engine periodic failed')),
        2000,
      ),
    );
    this.timers.push(setInterval(() => this.expireOrders().catch(() => undefined), 30_000));
    this.started = true;
    logger.info({ markets: this.markets.size, restingOrders: open.length }, 'matching engine started');
  }

  /** (Re)load internal markets; keeps existing books. */
  async loadMarkets() {
    for (const m of allMarkets()) {
      if (m.engine !== 'internal') continue;
      if (!this.markets.has(m.id)) {
        this.markets.set(m.id, {
          m,
          book: new OrderBook(m.symbol),
          queue: Promise.resolve(),
          triggers: [],
          lastPrice: null,
          bookDirty: true,
          tickerDirty: true,
        });
        for (const i of INTERVALS) this.agg.track(m.symbol, i);
        await this.seedCandles(m);
        const last = await query<{ price: string }>(
          'SELECT price FROM trades WHERE market_id = ? ORDER BY id DESC LIMIT 1',
          [m.id],
        );
        if (last[0]) this.markets.get(m.id)!.lastPrice = dec(last[0].price);
      } else this.markets.get(m.id)!.m = m;
    }
  }

  private async seedCandles(m: MarketRow) {
    const rows = await query<{
      interval: string;
      open_time: string;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>(
      `SELECT c.\`interval\`, c.open_time, c.open, c.high, c.low, c.close, c.volume FROM candles c
       JOIN (SELECT \`interval\`, MAX(open_time) AS t FROM candles WHERE market_id = ? GROUP BY \`interval\`) x ON x.\`interval\` = c.\`interval\` AND x.t = c.open_time
       WHERE c.market_id = ?`,
      [m.id, m.id],
    );
    for (const r of rows) {
      this.agg.seed({
        s: m.symbol,
        i: r.interval as Candle['i'],
        t: Number(r.open_time),
        o: fmt(r.open),
        h: fmt(r.high),
        l: fmt(r.low),
        c: fmt(r.close),
        v: fmt(r.volume),
        x: false,
      });
    }
  }

  isInternal(marketId: number) {
    return this.markets.has(marketId);
  }

  private enqueue<T>(marketId: number, fn: (st: MarketState) => Promise<T>): Promise<T> {
    const st = this.markets.get(marketId);
    if (!st) return Promise.reject(new Error('Market is not handled by the internal engine'));
    const p = st.queue.then(() => fn(st));
    st.queue = p.catch(() => undefined);
    return p;
  }

  /** Process a newly accepted order (funds already locked, status 'pending'). */
  async submit(orderId: string): Promise<OrderRow> {
    const o = await getOrder(orderId);
    if (!o) throw new Error('order not found');
    if (!this.markets.has(o.market_id)) await this.loadMarkets();
    return this.enqueue(o.market_id, async (st) => {
      const cur = (await getOrder(orderId))!;
      if (cur.status !== 'pending') return cur;
      if (cur.trigger_condition && !cur.triggered_at) {
        const triggerNow =
          st.lastPrice &&
          (cur.trigger_condition === 'gte'
            ? st.lastPrice.gte(cur.stop_price!)
            : st.lastPrice.lte(cur.stop_price!));
        if (!triggerNow) {
          st.triggers.push({
            id: cur.id,
            userId: cur.user_id,
            stop: dec(cur.stop_price),
            cond: cur.trigger_condition,
            seq: st.book.nextSeq(),
          });
          publishUser(cur.user_id, WS.ORDER_CREATED, toOrderDTO(cur));
          return cur;
        }
        await exec('UPDATE orders SET triggered_at = NOW(3) WHERE id = ?', [cur.id]);
        cur.triggered_at = new Date();
      }
      return this.execute(st, cur);
    });
  }

  async cancel(orderId: string, reason = 'user'): Promise<OrderRow> {
    const o = await getOrder(orderId);
    if (!o) throw new Error('order not found');
    return this.enqueue(o.market_id, async (st) => {
      let result!: OrderRow;
      let balances: ReturnType<BalanceSession['changed']> = [];
      await tx(async (c) => {
        const cur = (await getOrder(orderId, c, true))!;
        if (!['open', 'partially_filled', 'pending'].includes(cur.status)) {
          result = cur;
          return;
        }
        const bs = new BalanceSession(c);
        const rem = dec(cur.locked_remaining);
        if (rem.gt(0)) await bs.unlockFunds(cur.user_id, cur.lock_asset_id, rem, 'order', cur.id);
        await exec(
          "UPDATE orders SET status = 'cancelled', locked_remaining = 0, reject_reason = ? WHERE id = ?",
          [reason === 'user' ? null : reason, cur.id],
          c,
        );
        result = (await getOrder(orderId, c))!;
        balances = bs.changed(assetSymbol);
      });
      if (result.status === 'cancelled') {
        st.book.remove(orderId);
        st.triggers = st.triggers.filter((t) => t.id !== orderId);
        st.bookDirty = true;
        this.scheduleBook(st);
        publishBalances(balances);
        publishUser(result.user_id, WS.ORDER_CANCELLED, toOrderDTO(result));
        if (reason !== 'user') {
          notify(
            result.user_id,
            'order_cancelled',
            'Order cancelled',
            `Your ${result.side} order on ${st.m.symbol} was cancelled (${reason}).`,
            { orderId: result.id },
          ).catch(() => undefined);
        }
      }
      return result;
    });
  }

  private incomingFor(st: MarketState, o: OrderRow): Incoming {
    const isLimit =
      o.type === 'limit' ||
      ((o.type === 'stop_limit' || o.type === 'take_profit' || o.type === 'stop_loss') && o.price !== null);
    const qty = o.quantity ? dec(o.quantity).minus(o.filled_qty) : null;
    let budget: Decimal | null = null;
    if (o.side === 'buy' && !isLimit) budget = dec(o.locked_remaining); // market buys are capped by locked quote
    return {
      id: o.id,
      userId: o.user_id,
      side: o.side,
      kind: isLimit ? 'limit' : 'market',
      price: isLimit ? dec(o.price) : null,
      quantity: qty,
      quoteBudget: budget,
      timeInForce: isLimit ? o.time_in_force : o.time_in_force === 'FOK' ? 'FOK' : 'IOC',
      qtyPrecision: st.m.qty_precision,
    };
  }

  /** Match + settle one taker order. Runs inside the market queue. */
  private async execute(st: MarketState, o: OrderRow): Promise<OrderRow> {
    const inc = this.incomingFor(st, o);
    const plan = planMatch(st.book, inc);
    const fees = getTradingFees(st.m.id);
    const fills: Fill[] = [];
    let balances: ReturnType<BalanceSession['changed']> = [];
    const makerUpdates: OrderRow[] = [];
    const stpCancelled: OrderRow[] = [];
    let taker!: OrderRow;
    const makerFillNotices: { order: OrderRow; qty: Decimal }[] = [];

    try {
      await tx(async (c) => {
        const bs = new BalanceSession(c);
        const B = st.m.base_asset_id;
        const Q = st.m.quote_asset_id;
        const users = new Set<number>([
          o.user_id,
          ...plan.fills.map((f) => f.maker.userId),
          ...plan.selfTradeCancels.map((m) => m.userId),
        ]);
        await bs.lock(
          [...users].flatMap(
            (u) =>
              [
                [u, B],
                [u, Q],
              ] as [number, number][],
          ),
        );

        // Self-trade prevention: cancel own resting orders that would have matched.
        for (const own of plan.selfTradeCancels) {
          const mo = (await getOrder(own.id, c, true))!;
          const rem = dec(mo.locked_remaining);
          if (rem.gt(0)) await bs.unlockFunds(mo.user_id, mo.lock_asset_id, rem, 'order', mo.id);
          await exec(
            "UPDATE orders SET status = 'cancelled', locked_remaining = 0, reject_reason = 'self_trade_prevention' WHERE id = ?",
            [mo.id],
            c,
          );
          stpCancelled.push((await getOrder(mo.id, c))!);
        }

        let takerLockUsed = new D(0);
        let takerFee = new D(0);
        const qRef = refPrice(st.m.quote);
        for (const f of plan.fills) {
          const mo = (await getOrder(f.maker.id, c, true))!;
          const takerIsBuy = o.side === 'buy';
          const buyerId = takerIsBuy ? o.user_id : mo.user_id;
          const sellerId = takerIsBuy ? mo.user_id : o.user_id;
          const buyerFee = floorTo(f.qty.times(takerIsBuy ? fees.taker : fees.maker), 18); // in base
          const sellerFee = floorTo(f.quote.times(takerIsBuy ? fees.maker : fees.taker), 18); // in quote
          const tr = await exec(
            `INSERT INTO trades (market_id, price, qty, quote_qty, taker_side, maker_order_id, taker_order_id, maker_user_id, taker_user_id, maker_fee, taker_fee)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [
              st.m.id,
              toDb(f.price),
              toDb(f.qty),
              toDb(f.quote),
              o.side,
              mo.id,
              o.id,
              mo.user_id,
              o.user_id,
              toDb(takerIsBuy ? sellerFee : buyerFee),
              toDb(takerIsBuy ? buyerFee : sellerFee),
            ],
            c,
          );
          const tradeId = tr.insertId;
          // Buyer: pay quote from locked, receive base minus fee. Seller: pay base from locked, receive quote minus fee.
          await bs.apply({
            userId: buyerId,
            assetId: Q,
            available: 0,
            locked: f.quote.neg(),
            type: 'trade_debit',
            refType: 'trade',
            refId: tradeId,
          });
          await bs.apply({
            userId: buyerId,
            assetId: B,
            available: f.qty,
            locked: 0,
            type: 'trade_credit',
            refType: 'trade',
            refId: tradeId,
          });
          if (buyerFee.gt(0))
            await bs.apply({
              userId: buyerId,
              assetId: B,
              available: buyerFee.neg(),
              locked: 0,
              type: 'trade_fee',
              refType: 'trade',
              refId: tradeId,
            });
          await bs.apply({
            userId: sellerId,
            assetId: B,
            available: 0,
            locked: f.qty.neg(),
            type: 'trade_debit',
            refType: 'trade',
            refId: tradeId,
          });
          await bs.apply({
            userId: sellerId,
            assetId: Q,
            available: f.quote,
            locked: 0,
            type: 'trade_credit',
            refType: 'trade',
            refId: tradeId,
          });
          if (sellerFee.gt(0))
            await bs.apply({
              userId: sellerId,
              assetId: Q,
              available: sellerFee.neg(),
              locked: 0,
              type: 'trade_fee',
              refType: 'trade',
              refId: tradeId,
            });

          // Cost basis & realised P&L (reference currency).
          const valueRef = qRef ? f.quote.times(qRef) : null;
          if (valueRef) await acquire(c, buyerId, B, f.qty.minus(buyerFee), valueRef);
          const realizedSell = await dispose(c, sellerId, B, f.qty, valueRef);
          if (valueRef) await acquire(c, sellerId, Q, f.quote.minus(sellerFee), valueRef);
          const realizedBuyQuote = await dispose(c, buyerId, Q, f.quote, valueRef);

          const makerLockUse = mo.side === 'buy' ? f.quote : f.qty;
          const makerFee = mo.side === 'buy' ? buyerFee : sellerFee;
          const makerFilled = dec(mo.filled_qty).plus(f.qty);
          const makerDone = makerFilled.gte(mo.quantity!);
          let makerLocked = dec(mo.locked_remaining).minus(makerLockUse);
          if (makerDone && makerLocked.gt(0)) {
            await bs.unlockFunds(mo.user_id, mo.lock_asset_id, makerLocked, 'order', mo.id); // rounding dust
            makerLocked = new D(0);
          }
          await exec(
            `UPDATE orders SET filled_qty = ?, filled_quote = filled_quote + ?, fee_total = fee_total + ?, fee_asset = ?, locked_remaining = ?, status = ? WHERE id = ?`,
            [
              toDb(makerFilled),
              toDb(f.quote),
              toDb(makerFee),
              mo.side === 'buy' ? st.m.base : st.m.quote,
              toDb(makerLocked),
              makerDone ? 'filled' : 'partially_filled',
              mo.id,
            ],
            c,
          );
          await exec(
            `INSERT INTO order_fills (order_id, trade_id, user_id, market_id, side, role, price, qty, quote_qty, fee, fee_asset, realized_pnl) VALUES
             (?,?,?,?,?,'maker',?,?,?,?,?,?), (?,?,?,?,?,'taker',?,?,?,?,?,?)`,
            [
              mo.id,
              tradeId,
              mo.user_id,
              st.m.id,
              mo.side,
              toDb(f.price),
              toDb(f.qty),
              toDb(f.quote),
              toDb(makerFee),
              mo.side === 'buy' ? st.m.base : st.m.quote,
              mo.side === 'sell'
                ? realizedSell
                  ? toDb(realizedSell)
                  : null
                : realizedBuyQuote
                  ? toDb(realizedBuyQuote)
                  : null,
              o.id,
              tradeId,
              o.user_id,
              st.m.id,
              o.side,
              toDb(f.price),
              toDb(f.qty),
              toDb(f.quote),
              toDb(takerIsBuy ? buyerFee : sellerFee),
              takerIsBuy ? st.m.base : st.m.quote,
              o.side === 'sell'
                ? realizedSell
                  ? toDb(realizedSell)
                  : null
                : realizedBuyQuote
                  ? toDb(realizedBuyQuote)
                  : null,
            ],
            c,
          );
          await exec(
            'INSERT INTO market_ticks (market_id, price, qty, side, ts) VALUES (?,?,?,?,?)',
            [st.m.id, toDb(f.price), toDb(f.qty), o.side, Date.now()],
            c,
          );
          takerLockUsed = takerLockUsed.plus(takerIsBuy ? f.quote : f.qty);
          takerFee = takerFee.plus(takerIsBuy ? buyerFee : sellerFee);
          fills.push({
            tradeId,
            makerId: mo.id,
            makerUserId: mo.user_id,
            price: f.price,
            qty: f.qty,
            quote: f.quote,
          });
          const updatedMaker = (await getOrder(mo.id, c))!;
          makerUpdates.push(updatedMaker);
          makerFillNotices.push({ order: updatedMaker, qty: f.qty });
        }

        // Taker final state.
        const filledQty = dec(o.filled_qty).plus(plan.filledQty);
        let locked = dec(o.locked_remaining).minus(takerLockUsed);
        let status: OrderRow['status'];
        let reason: string | null = null;
        if (plan.rejected === 'fok_unfillable') {
          status = 'expired';
          reason = 'fok_unfillable';
        } else if (plan.rejected === 'no_liquidity') {
          status = 'rejected';
          reason = 'no_liquidity';
        } else if (plan.rest) {
          status = filledQty.gt(0) ? 'partially_filled' : 'open';
        } else if (o.quantity && filledQty.lt(o.quantity)) {
          status = filledQty.gt(0) || inc.kind === 'limit' ? 'expired' : 'rejected';
        } else status = 'filled';
        if (plan.rest && o.side === 'buy') {
          // Keep exactly remaining × limit locked; release price-improvement excess now.
          const needed = floorTo(plan.remainingQty!.times(o.price!), 18);
          const excess = locked.minus(needed);
          if (excess.gt(0)) {
            await bs.unlockFunds(o.user_id, o.lock_asset_id, excess, 'order', o.id);
            locked = needed;
          }
        }
        if (!plan.rest && locked.gt(0)) {
          await bs.unlockFunds(o.user_id, o.lock_asset_id, locked, 'order', o.id);
          locked = new D(0);
        }
        await exec(
          `UPDATE orders SET status = ?, filled_qty = ?, filled_quote = filled_quote + ?, fee_total = fee_total + ?, fee_asset = ?, locked_remaining = ?, reject_reason = COALESCE(?, reject_reason) WHERE id = ?`,
          [
            status,
            toDb(filledQty),
            toDb(plan.filledQuote),
            toDb(takerFee),
            o.side === 'buy' ? st.m.base : st.m.quote,
            toDb(locked),
            reason,
            o.id,
          ],
          c,
        );
        taker = (await getOrder(o.id, c))!;
        balances = bs.changed(assetSymbol);
      });
    } catch (e) {
      // Settlement failed and was rolled back: book untouched. Reject the order and release its lock.
      logger.error({ err: (e as Error).message, order: o.id }, 'settlement failed');
      return this.rejectOrder(o, 'settlement_error');
    }

    // ── commit succeeded: apply the plan to memory ──
    for (const s of plan.selfTradeCancels) st.book.remove(s.id);
    for (const f of plan.fills) st.book.reduce(f.maker.id, f.qty);
    if (plan.rest) {
      st.book.add({
        id: o.id,
        userId: o.user_id,
        side: o.side,
        price: dec(o.price),
        remaining: plan.remainingQty!,
        seq: st.book.nextSeq(),
      });
    }
    st.bookDirty = true;
    this.scheduleBook(st);
    publishBalances(balances);
    for (const s of stpCancelled) publishUser(s.user_id, WS.ORDER_CANCELLED, toOrderDTO(s));
    for (const mu of makerUpdates)
      publishUser(mu.user_id, mu.status === 'filled' ? WS.ORDER_FILLED : WS.ORDER_UPDATED, toOrderDTO(mu));
    const takerDto = toOrderDTO(taker);
    publishUser(
      taker.user_id,
      fills.length ? (taker.status === 'filled' ? WS.ORDER_FILLED : WS.ORDER_UPDATED) : WS.ORDER_CREATED,
      takerDto,
    );
    if (fills.length) this.onTrades(st, o.side, fills, taker, makerFillNotices);
    return taker;
  }

  private async rejectOrder(o: OrderRow, reason: string): Promise<OrderRow> {
    let out!: OrderRow;
    let balances: ReturnType<BalanceSession['changed']> = [];
    await tx(async (c) => {
      const cur = (await getOrder(o.id, c, true))!;
      const bs = new BalanceSession(c);
      const rem = dec(cur.locked_remaining);
      if (rem.gt(0)) await bs.unlockFunds(cur.user_id, cur.lock_asset_id, rem, 'order', cur.id);
      await exec(
        "UPDATE orders SET status = 'rejected', locked_remaining = 0, reject_reason = ? WHERE id = ?",
        [reason, cur.id],
        c,
      );
      out = (await getOrder(o.id, c))!;
      balances = bs.changed(assetSymbol);
    });
    publishBalances(balances);
    publishUser(out.user_id, WS.ORDER_UPDATED, toOrderDTO(out));
    return out;
  }

  private onTrades(
    st: MarketState,
    takerSide: 'buy' | 'sell',
    fills: Fill[],
    taker: OrderRow,
    makers: { order: OrderRow; qty: Decimal }[],
  ) {
    const now = Date.now();
    const pub: PublicTrade[] = fills.map((f) => ({
      s: st.m.symbol,
      id: String(f.tradeId),
      p: fmt(f.price),
      q: fmt(f.qty),
      side: takerSide,
      T: now,
    }));
    publishMarket(channelName('trades', st.m.symbol), WS.MARKET_TRADE, pub);
    const last = pub[pub.length - 1]!;
    publishMarket(channelName('ticker', st.m.symbol), WS.MARKET_TICK, {
      s: st.m.symbol,
      p: last.p,
      T: last.T,
    });
    const pipe = redis().pipeline();
    pipe.lpush(`md:trades:${st.m.symbol}`, ...pub.map((t) => JSON.stringify(t)).reverse());
    pipe.ltrim(`md:trades:${st.m.symbol}`, 0, 99);
    for (const t of pub) {
      const { closed, updated } = this.agg.applyTrade(t);
      this.closedCandles.push(...closed);
      for (const c of closed) publishMarket(channelName('candles', c.s, c.i), WS.MARKET_CANDLE, c);
      for (const c of updated) {
        publishMarket(channelName('candles', c.s, c.i), WS.MARKET_CANDLE, c);
        pipe.set(`md:candle:${c.s}:${c.i}`, JSON.stringify(c));
      }
    }
    pipe.exec().catch(() => undefined);
    // Private trade events for both sides.
    for (const f of fills) {
      publishUser(taker.user_id, WS.TRADE_NEW, {
        id: String(f.tradeId),
        symbol: st.m.symbol,
        side: taker.side,
        price: fmt(f.price),
        qty: fmt(f.qty),
        role: 'taker',
        orderId: taker.id,
        T: now,
      });
      publishUser(f.makerUserId, WS.TRADE_NEW, {
        id: String(f.tradeId),
        symbol: st.m.symbol,
        side: takerSide === 'buy' ? 'sell' : 'buy',
        price: fmt(f.price),
        qty: fmt(f.qty),
        role: 'maker',
        orderId: f.makerId,
        T: now,
      });
    }
    const fillText = (o: OrderRow, qty: Decimal) =>
      `${o.side === 'buy' ? 'Bought' : 'Sold'} ${fmt(qty)} ${st.m.base} on ${st.m.symbol}.`;
    notify(
      taker.user_id,
      taker.status === 'filled' ? 'order_filled' : 'order_partial',
      taker.status === 'filled' ? 'Order filled' : 'Order partially filled',
      fillText(
        taker,
        fills.reduce((a, f) => a.plus(f.qty), new D(0)),
      ),
      { orderId: taker.id },
    ).catch(() => undefined);
    for (const m of makers) {
      notify(
        m.order.user_id,
        m.order.status === 'filled' ? 'order_filled' : 'order_partial',
        m.order.status === 'filled' ? 'Order filled' : 'Order partially filled',
        fillText(m.order, m.qty),
        { orderId: m.order.id },
      ).catch(() => undefined);
    }
    st.lastPrice = dec(last.p);
    st.tickerDirty = true;
    this.checkTriggers(st);
  }

  private checkTriggers(st: MarketState) {
    const p = st.lastPrice;
    if (!p || !st.triggers.length) return;
    const fired = st.triggers
      .filter((t) => (t.cond === 'gte' ? p.gte(t.stop) : p.lte(t.stop)))
      .sort((a, b) => a.seq - b.seq);
    if (!fired.length) return;
    const ids = new Set(fired.map((f) => f.id));
    st.triggers = st.triggers.filter((t) => !ids.has(t.id));
    for (const t of fired) {
      // Queue after the current command; each triggered order is processed as its own command.
      this.enqueue(st.m.id, async () => {
        const o = await getOrder(t.id);
        if (!o || o.status !== 'pending') return;
        await exec('UPDATE orders SET triggered_at = NOW(3) WHERE id = ?', [o.id]);
        o.triggered_at = new Date();
        await this.execute(st, o);
      }).catch((e) => logger.error({ err: e.message, order: t.id }, 'trigger execution failed'));
    }
  }

  private bookTimers = new Map<number, NodeJS.Timeout>();
  private scheduleBook(st: MarketState) {
    if (this.bookTimers.has(st.m.id)) return;
    this.bookTimers.set(
      st.m.id,
      setTimeout(() => {
        this.bookTimers.delete(st.m.id);
        this.publishBook(st).catch(() => undefined);
      }, 20),
    );
  }

  private async publishBook(st: MarketState) {
    const d = st.book.depth(50);
    const snap = { s: st.m.symbol, u: st.book.version, bids: d.bids, asks: d.asks, E: Date.now() };
    await redis().set(`md:book:${st.m.symbol}`, JSON.stringify(snap));
    publishMarket(channelName('book', st.m.symbol), WS.ORDERBOOK_UPDATE, snap);
  }

  /** Periodic: persist closed candles, order-book levels, and publish 24h tickers. */
  private async flushPeriodic() {
    if (this.closedCandles.length) {
      const batch = this.closedCandles.splice(0);
      const rows = batch
        .map((c) => ({ c, m: [...this.markets.values()].find((s) => s.m.symbol === c.s)?.m }))
        .filter((x) => x.m);
      if (rows.length) {
        await exec(
          `INSERT INTO candles (market_id, \`interval\`, open_time, open, high, low, close, volume) VALUES ${rows.map(() => '(?,?,?,?,?,?,?,?)').join(',')}
           ON DUPLICATE KEY UPDATE open = VALUES(open), high = VALUES(high), low = VALUES(low), close = VALUES(close), volume = VALUES(volume)`,
          rows.flatMap(({ c, m }) => [
            m!.id,
            c.i,
            c.t,
            toDb(c.o),
            toDb(c.h),
            toDb(c.l),
            toDb(c.c),
            toDb(c.v),
          ]),
        );
      }
    }
    // Current (open) candles are persisted too so a restart can resume them.
    const tickers: Ticker[] = [];
    for (const st of this.markets.values()) {
      if (st.bookDirty) {
        st.bookDirty = false;
        await exec('DELETE FROM order_book WHERE market_id = ?', [st.m.id]);
        const levels = st.book.levelCounts(50);
        if (levels.length) {
          await exec(
            `INSERT INTO order_book (market_id, side, price, quantity, order_count) VALUES ${levels.map(() => '(?,?,?,?,?)').join(',')}`,
            levels.flatMap((l) => [st.m.id, l.side, toDb(l.price), toDb(l.qty), l.count]),
          );
        }
      }
      if (st.tickerDirty) {
        st.tickerDirty = false;
        for (const i of INTERVALS) {
          const c = this.agg.current(st.m.symbol, i);
          if (c && i !== '1s') {
            await exec(
              `INSERT INTO candles (market_id, \`interval\`, open_time, open, high, low, close, volume) VALUES (?,?,?,?,?,?,?,?)
               ON DUPLICATE KEY UPDATE high = VALUES(high), low = VALUES(low), close = VALUES(close), volume = VALUES(volume)`,
              [st.m.id, i, c.t, toDb(c.o), toDb(c.h), toDb(c.l), toDb(c.c), toDb(c.v)],
            );
          }
        }
        const t = await this.ticker24h(st);
        if (t) tickers.push(t);
      }
    }
    if (tickers.length) {
      setTickers(tickers);
      const pipe = redis().pipeline();
      for (const t of tickers) pipe.hset('md:tickers', t.s, JSON.stringify(t));
      await pipe.exec();
      await redisPub().publish('tt:tickers', JSON.stringify(tickers));
      for (const t of tickers) publishMarket(channelName('ticker', t.s), WS.MARKET_TICKER, t);
    }
  }

  private async ticker24h(st: MarketState): Promise<Ticker | null> {
    const since = Date.now() - 86_400_000;
    const r = await query<{
      o: string | null;
      h: string | null;
      l: string | null;
      v: string | null;
      q: string | null;
    }>(
      `SELECT (SELECT price FROM trades WHERE market_id = ? AND created_at >= ? ORDER BY id ASC LIMIT 1) AS o,
              MAX(price) AS h, MIN(price) AS l, SUM(qty) AS v, SUM(quote_qty) AS q
       FROM trades WHERE market_id = ? AND created_at >= ?`,
      [st.m.id, new Date(since), st.m.id, new Date(since)],
    );
    const row = r[0];
    const c = st.lastPrice;
    if (!c) return null;
    const o = row?.o ? dec(row.o) : c;
    return {
      s: st.m.symbol,
      c: fmt(c),
      o: fmt(o),
      h: fmt(row?.h ?? c),
      l: fmt(row?.l ?? c),
      v: fmt(row?.v ?? 0),
      q: fmt(row?.q ?? 0),
      p: o.isZero() ? '0' : fmt(c.minus(o).div(o).times(100).toDecimalPlaces(2)),
      E: Date.now(),
    };
  }

  private async expireOrders() {
    const rows = await query<{ id: string }>(
      "SELECT id FROM orders WHERE engine = 'internal' AND status IN ('open','partially_filled','pending') AND expires_at IS NOT NULL AND expires_at < NOW(3) LIMIT 200",
    );
    for (const r of rows) await this.cancel(String(r.id), 'expired').catch(() => undefined);
  }

  snapshot(marketId: number) {
    const st = this.markets.get(marketId);
    return st
      ? {
          orders: st.book.size(),
          triggers: st.triggers.length,
          bestBid: st.book.bestBid()?.toFixed() ?? null,
          bestAsk: st.book.bestAsk()?.toFixed() ?? null,
        }
      : null;
  }

  status() {
    return {
      started: this.started,
      markets: this.markets.size,
      resting: [...this.markets.values()].reduce((a, s) => a + s.book.size(), 0),
    };
  }

  bestPrices(marketId: number) {
    const st = this.markets.get(marketId);
    return {
      bid: st?.book.bestBid() ?? null,
      ask: st?.book.bestAsk() ?? null,
      last: st?.lastPrice ?? null,
      book: st?.book ?? null,
    };
  }

  async stop() {
    this.timers.forEach(clearInterval);
    await Promise.all([...this.markets.values()].map((s) => s.queue));
    await this.flushPeriodic().catch(() => undefined);
  }
}

export type { MatchPlan, RestingOrder, PoolConnection };
export { marketById };
