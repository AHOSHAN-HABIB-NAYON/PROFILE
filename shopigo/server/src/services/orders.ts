import crypto from 'node:crypto';
import type { Request } from 'express';
import { sql, type Kysely, type Transaction } from 'kysely';
import { cache } from '../core/cache.js';
import { randomToken } from '../core/crypto.js';
import { HttpError, badRequest, notFound } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { db, json } from '../db/index.js';
import type { DB } from '../db/types.js';
import { assessOrder, recordFlagged } from './fraud.js';
import { notify } from './notifications.js';
import { quote, type CartInput, type QuoteLine } from './pricing.js';
import { clientIp, deviceHash, deviceInfo, ipLocation } from './requestInfo.js';
import { settings } from './settings.js';
import { gaClientId, trackServer } from './tracking.js';

export interface CheckoutInput {
  name: string;
  phone: string;
  district: string;
  upazila: string;
  address: string;
  note?: string | null;
  couponCode?: string | null;
  items: CartInput[];
  device?: string | null;
  eventId?: string | null;
  fbp?: string | null;
  fbc?: string | null;
}

const FINAL_STATUSES = new Set(['delivered', 'cancelled', 'returned']);
const RESTOCK_STATUSES = new Set(['cancelled', 'returned']);

async function generateOrderNo(trx: Kysely<DB> | Transaction<DB>): Promise<string> {
  const prefix = ((await settings.str('order_prefix')) || 'SG').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
  const now = new Date();
  const dhaka = new Date(now.getTime() + 6 * 3600_000);
  const ymd = `${String(dhaka.getUTCFullYear()).slice(2)}${String(dhaka.getUTCMonth() + 1).padStart(2, '0')}${String(dhaka.getUTCDate()).padStart(2, '0')}`;
  for (let i = 0; i < 6; i++) {
    const candidate = `${prefix}${ymd}${crypto.randomInt(1000, 99999).toString().padStart(5, '0')}`;
    const exists = await trx.selectFrom('orders').select('id').where('order_no', '=', candidate).executeTakeFirst();
    if (!exists) return candidate;
  }
  return `${prefix}${ymd}${Date.now().toString().slice(-7)}`;
}

/** Decrements stock atomically; returns false if not enough stock. */
async function takeStock(trx: Transaction<DB>, line: QuoteLine): Promise<boolean> {
  if (line.type === 'combo') {
    for (const part of line.comboItems ?? []) {
      const r = await trx.updateTable('products').set({ stock: sql`stock - ${part.qty * line.qty}`, sold_count: sql`sold_count + ${part.qty * line.qty}` }).where('id', '=', part.productId).where('stock', '>=', part.qty * line.qty).executeTakeFirst();
      if (!Number(r.numUpdatedRows)) return false;
    }
    return true;
  }
  if (line.variantId) {
    const r = await trx.updateTable('product_variants').set({ stock: sql`stock - ${line.qty}` }).where('id', '=', line.variantId).where('stock', '>=', line.qty).executeTakeFirst();
    if (!Number(r.numUpdatedRows)) return false;
    // Keep the product-level stock as the sum of its variants.
    await trx.updateTable('products').set({ stock: sql`GREATEST(stock - ${line.qty}, 0)`, sold_count: sql`sold_count + ${line.qty}` }).where('id', '=', line.productId!).execute();
    return true;
  }
  const r = await trx.updateTable('products').set({ stock: sql`stock - ${line.qty}`, sold_count: sql`sold_count + ${line.qty}` }).where('id', '=', line.productId!).where('stock', '>=', line.qty).executeTakeFirst();
  return Number(r.numUpdatedRows) > 0;
}

export async function createOrder(req: Request, input: CheckoutInput) {
  if (!(await settings.bool('cod_enabled'))) throw badRequest('Ordering is temporarily unavailable');
  if (!input.items.length) throw badRequest('আপনার কার্ট খালি');

  const q = await quote(input.items, { couponCode: input.couponCode, district: input.district, phone: input.phone });
  if (q.errors.length) throw new HttpError(409, q.errors[0]!, 'CART_CHANGED', { errors: q.errors });
  if (input.couponCode && q.couponError) throw new HttpError(409, q.couponError, 'COUPON_INVALID');
  if (q.deliveryCharge === null) throw badRequest('Please select your district');

  const ip = clientIp(req);
  const device = deviceHash(req, input.device);
  const risk = await assessOrder({ ip, phone: input.phone, deviceHash: device, address: input.address, district: input.district, totalQty: q.itemCount, subtotal: q.subtotal });
  const info = deviceInfo(req);
  const publicToken = randomToken(32);

  const orderId = await db().transaction().execute(async (trx) => {
    // Customer (identified by phone — no account required)
    const now = new Date();
    await trx
      .insertInto('customers')
      .values({ phone: input.phone, name: input.name, district: input.district, upazila: input.upazila, address: input.address, is_blocked: 0, total_orders: 1, first_order_at: now, last_order_at: now })
      .onDuplicateKeyUpdate({ name: input.name, district: input.district, upazila: input.upazila, address: input.address, last_order_at: now, total_orders: sql`total_orders + 1` })
      .execute();
    const customer = await trx.selectFrom('customers').select(['id']).where('phone', '=', input.phone).executeTakeFirstOrThrow();

    const orderNo = await generateOrderNo(trx);
    const res = await trx
      .insertInto('orders')
      .values({
        order_no: orderNo, public_token: publicToken, customer_id: customer.id, customer_name: input.name, phone: input.phone,
        district: input.district, upazila: input.upazila, address: input.address, note: input.note || null, status: 'new', payment_method: 'cod',
        subtotal: q.subtotal, discount: q.discount, delivery_charge: q.deliveryCharge ?? 0, total: q.total,
        coupon_id: q.coupon?.id ?? null, coupon_code: q.coupon?.code ?? null, item_count: q.itemCount,
        ip, ip_location: null, device_hash: device, user_agent: req.get('user-agent')?.slice(0, 500) ?? null, device_info: json.stringify(info),
        risk_score: risk.score, risk_level: risk.level, risk_reasons: json.stringify(risk.reasons), source: 'web',
      })
      .executeTakeFirstOrThrow();
    const id = Number(res.insertId);

    for (const line of q.lines) {
      if (!(await takeStock(trx, line))) throw new HttpError(409, `${line.name}: স্টক শেষ হয়ে গেছে`, 'OUT_OF_STOCK');
      if (line.flashSaleId && line.productId) {
        await trx.updateTable('flash_sale_items').set({ sold_count: sql`sold_count + ${line.qty}` }).where('flash_sale_id', '=', line.flashSaleId).where('product_id', '=', line.productId).execute();
      }
      await trx
        .insertInto('order_items')
        .values({
          order_id: id, product_id: line.productId, variant_id: line.variantId, combo_id: line.comboId, name: line.name, sku: line.sku,
          size: line.size, color: line.color, image: line.image, unit_price: line.unitPrice, cost_price: line.costPrice, quantity: line.qty, line_total: line.lineTotal,
        })
        .execute();
    }
    if (q.coupon) {
      const upd = await trx.updateTable('coupons').set({ used_count: sql`used_count + 1` }).where('id', '=', q.coupon.id).where((eb) => eb.or([eb('usage_limit', 'is', null), eb('used_count', '<', eb.ref('usage_limit'))])).executeTakeFirst();
      if (!Number(upd.numUpdatedRows)) throw new HttpError(409, 'This coupon has reached its usage limit', 'COUPON_INVALID');
      await trx.insertInto('coupon_usage').values({ coupon_id: q.coupon.id, order_id: id, phone: input.phone, discount: q.discount }).execute();
    }
    await trx.insertInto('order_status_history').values({ order_id: id, from_status: null, to_status: 'new', note: 'Order placed (Cash on Delivery)', admin_id: null }).execute();

    // Remember the address for returning-customer autofill.
    const addr = await trx.selectFrom('addresses').select('id').where('customer_id', '=', customer.id).where('address', '=', input.address).executeTakeFirst();
    if (addr) await trx.updateTable('addresses').set({ last_used_at: now, name: input.name, district: input.district, upazila: input.upazila, device_hash: device }).where('id', '=', addr.id).execute();
    else await trx.insertInto('addresses').values({ customer_id: customer.id, name: input.name, phone: input.phone, district: input.district, upazila: input.upazila, address: input.address, device_hash: device, last_used_at: now }).execute();
    return id;
  });

  const order = await db().selectFrom('orders').selectAll().where('id', '=', orderId).executeTakeFirstOrThrow();

  // ---- after commit: best-effort side effects
  void (async () => {
    try {
      await recordFlagged({ ip, phone: input.phone, deviceHash: device, address: input.address, district: input.district, totalQty: q.itemCount, subtotal: q.subtotal }, risk, orderId);
      await notify('new_order', `New order ${order.order_no}`, `${order.customer_name} · ৳${Number(order.total).toLocaleString('en-IN')} · ${order.district}`, `/admin/orders/${orderId}`, { risk: risk.level });
      await checkLowStock(q.lines);
      await db().insertInto('analytics_events').values({ event: 'purchase', device_hash: device, value: q.total, meta: json.stringify({ order: order.order_no, items: q.itemCount }), ip, session_id: null, product_id: null, category_id: null }).execute();
      if (await settings.bool('ip_geolocation_enabled')) {
        const loc = await ipLocation(ip);
        if (loc) await db().updateTable('orders').set({ ip_location: loc }).where('id', '=', orderId).execute();
      }
      await cache.del('home:');
    } catch (err) {
      logger.error({ err }, 'post-order side effects failed');
    }
  })();
  trackServer({
    name: 'Purchase', eventId: input.eventId || `purchase_${order.order_no}`, url: req.get('referer') ?? undefined, ip, userAgent: req.get('user-agent') ?? null,
    fbp: input.fbp ?? null, fbc: input.fbc ?? null, gaClientId: gaClientId(req.cookies?._ga), phone: input.phone, customerName: input.name, city: input.district,
    value: q.total, currency: await settings.str('currency'), orderId: order.order_no,
    contents: q.lines.map((l) => ({ id: String(l.productId ?? `combo-${l.comboId}`), quantity: l.qty, price: l.unitPrice, name: l.name })),
  });

  return { order, quote: q };
}

async function checkLowStock(lines: QuoteLine[]) {
  const ids = [...new Set(lines.flatMap((l) => (l.productId ? [l.productId] : (l.comboItems ?? []).map((c) => c.productId))))];
  if (!ids.length) return;
  const low = await db().selectFrom('products').select(['id', 'name', 'stock', 'low_stock_threshold']).where('id', 'in', ids).where(sql<boolean>`stock <= low_stock_threshold`).execute();
  for (const p of low) {
    await notify('low_stock', p.stock <= 0 ? `Out of stock: ${p.name}` : `Low stock: ${p.name}`, `${p.stock} left (threshold ${p.low_stock_threshold})`, `/admin/products/${p.id}`);
  }
}

/** Public, privacy-safe order summary (requires the unguessable token). */
export async function publicOrder(orderNo: string, token: string) {
  const o = await db().selectFrom('orders').selectAll().where('order_no', '=', orderNo).where('deleted_at', 'is', null).executeTakeFirst();
  if (!o || o.public_token !== token) throw notFound('Order not found');
  const items = await db().selectFrom('order_items').select(['name', 'size', 'color', 'image', 'unit_price', 'quantity', 'line_total']).where('order_id', '=', o.id).execute();
  const status = await db().selectFrom('order_statuses').select(['label', 'label_bn', 'color']).where('code', '=', o.status).executeTakeFirst();
  return {
    orderNo: o.order_no, status: o.status, statusLabel: status?.label_bn ?? status?.label ?? o.status, customerName: o.customer_name, phone: o.phone,
    district: o.district, upazila: o.upazila, address: o.address, subtotal: Number(o.subtotal), discount: Number(o.discount), deliveryCharge: Number(o.delivery_charge), total: Number(o.total),
    itemCount: o.item_count, createdAt: o.created_at, trackingCode: o.tracking_code,
    items: items.map((i) => ({ name: i.name, size: i.size, color: i.color, image: i.image, unitPrice: Number(i.unit_price), qty: i.quantity, lineTotal: Number(i.line_total) })),
  };
}

async function restock(trx: Transaction<DB>, orderId: number) {
  const items = await trx.selectFrom('order_items').selectAll().where('order_id', '=', orderId).execute();
  for (const i of items) {
    if (i.combo_id) {
      const parts = await trx.selectFrom('combo_items').select(['product_id', 'quantity']).where('combo_id', '=', i.combo_id).execute();
      for (const p of parts) await trx.updateTable('products').set({ stock: sql`stock + ${p.quantity * i.quantity}`, sold_count: sql`GREATEST(sold_count - ${p.quantity * i.quantity}, 0)` }).where('id', '=', p.product_id).execute();
      continue;
    }
    if (i.variant_id) await trx.updateTable('product_variants').set({ stock: sql`stock + ${i.quantity}` }).where('id', '=', i.variant_id).execute();
    if (i.product_id) await trx.updateTable('products').set({ stock: sql`stock + ${i.quantity}`, sold_count: sql`GREATEST(sold_count - ${i.quantity}, 0)` }).where('id', '=', i.product_id).execute();
  }
}

export async function changeStatus(orderId: number, to: string, adminId: number | null, note?: string | null) {
  const statusRow = await db().selectFrom('order_statuses').select('code').where('code', '=', to).executeTakeFirst();
  if (!statusRow) throw badRequest('Unknown status');
  return db().transaction().execute(async (trx) => {
    const o = await trx.selectFrom('orders').selectAll().where('id', '=', orderId).forUpdate().executeTakeFirst();
    if (!o) throw notFound('Order not found');
    if (o.status === to) return o;
    const patch: Record<string, unknown> = { status: to };
    if (to === 'confirmed' && !o.confirmed_at) patch.confirmed_at = new Date();
    if (to === 'delivered') patch.delivered_at = new Date();
    if (to === 'cancelled') patch.cancelled_at = new Date();
    // Stock goes back when an open order is cancelled/returned, and is taken again if re-opened.
    const wasRestocked = RESTOCK_STATUSES.has(o.status);
    const willRestock = RESTOCK_STATUSES.has(to);
    if (!wasRestocked && willRestock) await restock(trx, orderId);
    if (wasRestocked && !willRestock) {
      const items = await trx.selectFrom('order_items').selectAll().where('order_id', '=', orderId).execute();
      for (const i of items) {
        if (i.variant_id) await trx.updateTable('product_variants').set({ stock: sql`GREATEST(stock - ${i.quantity}, 0)` }).where('id', '=', i.variant_id).execute();
        if (i.product_id) await trx.updateTable('products').set({ stock: sql`GREATEST(stock - ${i.quantity}, 0)`, sold_count: sql`sold_count + ${i.quantity}` }).where('id', '=', i.product_id).execute();
      }
    }
    await trx.updateTable('orders').set(patch).where('id', '=', orderId).execute();
    await trx.insertInto('order_status_history').values({ order_id: orderId, from_status: o.status, to_status: to, note: note ?? null, admin_id: adminId }).execute();
    if (o.customer_id) {
      const counters: Record<string, string> = { delivered: 'delivered_orders', cancelled: 'cancelled_orders', returned: 'returned_orders' };
      if (counters[o.status]) await trx.updateTable('customers').set({ [counters[o.status]!]: sql`GREATEST(${sql.ref(counters[o.status]!)} - 1, 0)` }).where('id', '=', o.customer_id).execute();
      if (counters[to]) await trx.updateTable('customers').set({ [counters[to]!]: sql`${sql.ref(counters[to]!)} + 1` }).where('id', '=', o.customer_id).execute();
      if (to === 'delivered') await trx.updateTable('customers').set({ total_spent: sql`total_spent + ${Number(o.total)}` }).where('id', '=', o.customer_id).execute();
      if (o.status === 'delivered') await trx.updateTable('customers').set({ total_spent: sql`GREATEST(total_spent - ${Number(o.total)}, 0)` }).where('id', '=', o.customer_id).execute();
    }
    return { ...o, ...patch };
  });
}

export interface OrderEdit {
  customer_name?: string;
  phone?: string;
  district?: string;
  upazila?: string;
  address?: string;
  note?: string | null;
  admin_note?: string | null;
  delivery_charge?: number;
  discount?: number;
  items?: Array<{ id?: number; productId?: number | null; variantId?: number | null; name?: string; unitPrice: number; qty: number; size?: string | null }>;
}

/** Admin edit before the parcel is handed to the courier. Totals are recalculated server-side. */
export async function editOrder(orderId: number, edit: OrderEdit) {
  return db().transaction().execute(async (trx) => {
    const o = await trx.selectFrom('orders').selectAll().where('id', '=', orderId).forUpdate().executeTakeFirst();
    if (!o) throw notFound('Order not found');
    if (o.consignment_id) throw badRequest('This order has already been sent to the courier and can no longer be edited');
    if (FINAL_STATUSES.has(o.status)) throw badRequest(`A ${o.status} order cannot be edited`);
    const patch: Record<string, unknown> = {};
    for (const k of ['customer_name', 'phone', 'district', 'upazila', 'address', 'note', 'admin_note'] as const) if (edit[k] !== undefined) patch[k] = edit[k];
    let subtotal = Number(o.subtotal);
    let itemCount = o.item_count;
    if (edit.items) {
      if (!edit.items.length) throw badRequest('An order needs at least one item');
      const existing = await trx.selectFrom('order_items').selectAll().where('order_id', '=', orderId).execute();
      if (existing.some((e) => e.combo_id)) throw badRequest('Items of orders containing combo offers cannot be edited — edit customer and delivery details only');
      const keepIds = new Set(edit.items.filter((i) => i.id).map((i) => i.id!));
      // Return stock for removed/changed lines, then take it for the new state.
      for (const e of existing) {
        if (e.variant_id) await trx.updateTable('product_variants').set({ stock: sql`stock + ${e.quantity}` }).where('id', '=', e.variant_id).execute();
        if (e.product_id) await trx.updateTable('products').set({ stock: sql`stock + ${e.quantity}`, sold_count: sql`GREATEST(sold_count - ${e.quantity}, 0)` }).where('id', '=', e.product_id).execute();
        if (!keepIds.has(e.id)) await trx.deleteFrom('order_items').where('id', '=', e.id).execute();
      }
      subtotal = 0;
      itemCount = 0;
      for (const it of edit.items) {
        const prev = it.id ? existing.find((e) => e.id === it.id) : undefined;
        const productId = it.productId ?? prev?.product_id ?? null;
        const variantId = it.variantId ?? prev?.variant_id ?? null;
        let name = it.name ?? prev?.name ?? '';
        let image = prev?.image ?? null;
        let sku = prev?.sku ?? null;
        let size = it.size ?? prev?.size ?? null;
        if (productId && !prev) {
          const p = await trx.selectFrom('products').select(['name', 'sku']).where('id', '=', productId).executeTakeFirst();
          if (!p) throw badRequest('Product not found');
          name = it.name || p.name;
          sku = p.sku;
          const img = await trx.selectFrom('product_images').select('path').where('product_id', '=', productId).orderBy('is_main', 'desc').orderBy('sort_order').executeTakeFirst();
          image = img?.path ?? null;
          if (variantId) {
            const v = await trx.selectFrom('product_variants').select(['size']).where('id', '=', variantId).executeTakeFirst();
            size = v?.size ?? size;
          }
        }
        if (variantId) {
          const r = await trx.updateTable('product_variants').set({ stock: sql`stock - ${it.qty}` }).where('id', '=', variantId).where('stock', '>=', it.qty).executeTakeFirst();
          if (!Number(r.numUpdatedRows)) throw badRequest(`Not enough stock for ${name}`);
        }
        if (productId) {
          const r = await trx.updateTable('products').set({ stock: sql`stock - ${it.qty}`, sold_count: sql`sold_count + ${it.qty}` }).where('id', '=', productId).where('stock', '>=', it.qty).executeTakeFirst();
          if (!Number(r.numUpdatedRows)) throw badRequest(`Not enough stock for ${name}`);
        }
        const lineTotal = Math.round(it.unitPrice * it.qty * 100) / 100;
        subtotal += lineTotal;
        itemCount += it.qty;
        if (prev) await trx.updateTable('order_items').set({ unit_price: it.unitPrice, quantity: it.qty, line_total: lineTotal, name, size }).where('id', '=', prev.id).execute();
        else await trx.insertInto('order_items').values({ order_id: orderId, product_id: productId, variant_id: variantId, combo_id: null, name, sku, size, color: null, image, unit_price: it.unitPrice, cost_price: null, quantity: it.qty, line_total: lineTotal }).execute();
      }
    }
    const delivery = edit.delivery_charge ?? Number(o.delivery_charge);
    const discount = Math.min(edit.discount ?? Number(o.discount), subtotal);
    Object.assign(patch, { subtotal, item_count: itemCount, delivery_charge: delivery, discount, total: Math.round((subtotal - discount + delivery) * 100) / 100 });
    await trx.updateTable('orders').set(patch).where('id', '=', orderId).execute();
    return { before: o, after: patch };
  });
}
