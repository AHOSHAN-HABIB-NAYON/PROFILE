import Decimal from 'decimal.js';
import { D, floorTo } from '@tradeteam/shared';
import type { OrderBook, RestingOrder } from './book';

/**
 * Pure matching planner. Given the book and an incoming order, returns the fills that *would*
 * happen, without mutating the book. The engine settles the plan in one DB transaction and only
 * then applies it to the in-memory book, so a failed settlement can never desynchronise state.
 */
export interface Incoming {
  id: string;
  userId: number;
  side: 'buy' | 'sell';
  kind: 'limit' | 'market';
  price: Decimal | null; // limit price
  quantity: Decimal | null; // base quantity (null → spend `quoteBudget`)
  quoteBudget: Decimal | null; // max quote to spend (market buys)
  timeInForce: 'GTC' | 'IOC' | 'FOK';
  qtyPrecision: number;
}

export interface PlannedFill {
  maker: RestingOrder;
  price: Decimal;
  qty: Decimal;
  quote: Decimal;
}

export interface MatchPlan {
  fills: PlannedFill[];
  filledQty: Decimal;
  filledQuote: Decimal;
  remainingQty: Decimal | null; // for quantity-based orders
  rest: boolean; // remainder should rest on the book
  selfTradeCancels: RestingOrder[]; // own resting orders cancelled by self-trade prevention
  rejected?: 'fok_unfillable' | 'no_liquidity';
}

function crosses(side: 'buy' | 'sell', limit: Decimal | null, makerPrice: Decimal) {
  if (!limit) return true;
  return side === 'buy' ? makerPrice.lte(limit) : makerPrice.gte(limit);
}

export function planMatch(book: OrderBook, o: Incoming): MatchPlan {
  const fills: PlannedFill[] = [];
  const stp: RestingOrder[] = [];
  let remQty = o.quantity;
  let budget = o.quoteBudget;
  let filledQty = new D(0);
  let filledQuote = new D(0);

  for (const maker of book.opposite(o.side)) {
    if (!crosses(o.side, o.price, maker.price)) break;
    if (remQty !== null && remQty.lte(0)) break;
    if (budget !== null && budget.lte(0)) break;
    if (maker.userId === o.userId) {
      // Self-trade prevention (cancel maker): the resting order is removed, matching continues.
      stp.push(maker);
      continue;
    }
    let qty = maker.remaining;
    if (remQty !== null) qty = Decimal.min(qty, remQty);
    if (budget !== null) {
      const affordable = floorTo(budget.div(maker.price), o.qtyPrecision);
      qty = Decimal.min(qty, affordable);
    }
    qty = floorTo(qty, o.qtyPrecision);
    if (qty.lte(0)) break;
    // Quote amounts are truncated to the ledger's 18 decimals once, and the same value is used for
    // both counterparties so value is conserved exactly.
    const quote = floorTo(qty.times(maker.price), 18);
    fills.push({ maker, price: maker.price, qty, quote });
    filledQty = filledQty.plus(qty);
    filledQuote = filledQuote.plus(quote);
    if (remQty !== null) remQty = remQty.minus(qty);
    if (budget !== null) budget = budget.minus(quote);
  }

  if (o.timeInForce === 'FOK') {
    // FOK is only accepted for quantity-based orders (validated at order entry).
    const complete = o.quantity !== null && filledQty.eq(o.quantity);
    if (!complete) {
      return {
        fills: [],
        filledQty: new D(0),
        filledQuote: new D(0),
        remainingQty: o.quantity,
        rest: false,
        selfTradeCancels: [],
        rejected: 'fok_unfillable',
      };
    }
  }
  const rest = o.kind === 'limit' && o.timeInForce === 'GTC' && remQty !== null && remQty.gt(0);
  return {
    fills,
    filledQty,
    filledQuote,
    remainingQty: remQty,
    rest,
    selfTradeCancels: stp,
    rejected: o.kind === 'market' && fills.length === 0 ? 'no_liquidity' : undefined,
  };
}
