import type { OrderDTO, OrderSide, OrderStatus, OrderType, TimeInForce } from '@tradeteam/shared';
import { fmt, dec } from '@tradeteam/shared';
import type { Executor } from '../../infrastructure/db';
import { one, query } from '../../infrastructure/db';
import { marketById } from '../markets/registry';

export interface OrderRow {
  id: string;
  user_id: number;
  market_id: number;
  client_order_id: string | null;
  side: OrderSide;
  type: OrderType;
  time_in_force: TimeInForce;
  status: OrderStatus;
  price: string | null;
  stop_price: string | null;
  trigger_condition: 'gte' | 'lte' | null;
  quantity: string | null;
  quote_quantity: string | null;
  filled_qty: string;
  filled_quote: string;
  fee_total: string;
  fee_asset: string | null;
  lock_asset_id: number;
  locked_remaining: string;
  engine: 'internal' | 'external';
  external_id: string | null;
  reject_reason: string | null;
  triggered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function getOrder(id: string | number, ex?: Executor, forUpdate = false) {
  const r = await one<OrderRow>(
    `SELECT * FROM orders WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [String(id)],
    ex,
  );
  if (r) normalize(r);
  return r;
}

export function normalize(r: OrderRow) {
  r.id = String(r.id);
  r.user_id = Number(r.user_id);
  r.market_id = Number(r.market_id);
  r.lock_asset_id = Number(r.lock_asset_id);
  return r;
}

export async function listOpenInternal(ex?: Executor) {
  const rows = await query<OrderRow>(
    "SELECT * FROM orders WHERE engine = 'internal' AND status IN ('open','partially_filled','pending') ORDER BY created_at, id",
    [],
    ex,
  );
  return rows.map(normalize);
}

export function toOrderDTO(o: OrderRow): OrderDTO {
  const m = marketById(o.market_id);
  const fq = dec(o.filled_qty);
  return {
    id: o.id,
    clientOrderId: o.client_order_id,
    symbol: m?.symbol ?? String(o.market_id),
    side: o.side,
    type: o.type,
    status: o.status,
    timeInForce: o.time_in_force,
    price: o.price ? fmt(o.price) : null,
    stopPrice: o.stop_price ? fmt(o.stop_price) : null,
    quantity: o.quantity ? fmt(o.quantity) : null,
    quoteQuantity: o.quote_quantity ? fmt(o.quote_quantity) : null,
    filledQty: fmt(o.filled_qty),
    filledQuote: fmt(o.filled_quote),
    avgPrice: fq.gt(0)
      ? fmt(
          dec(o.filled_quote)
            .div(fq)
            .toDecimalPlaces(m?.price_precision ?? 8),
        )
      : null,
    fee: fmt(o.fee_total),
    feeAsset: o.fee_asset,
    rejectReason: o.reject_reason,
    createdAt: o.created_at.toISOString(),
    updatedAt: o.updated_at.toISOString(),
  };
}
