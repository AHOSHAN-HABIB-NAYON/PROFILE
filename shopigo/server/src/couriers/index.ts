import { cache } from '../core/cache.js';
import { decrypt, encrypt } from '../core/crypto.js';
import { badRequest, notFound } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { db, json } from '../db/index.js';
import { notify } from '../services/notifications.js';
import { settings } from '../services/settings.js';
import { bdcourier } from './bdcourier.js';
import { custom } from './custom.js';
import { pathao } from './pathao.js';
import { redx } from './redx.js';
import { steadfast } from './steadfast.js';
import { CourierError, type CourierAdapter, type Credentials, type CustomerHistory, type ShipmentOrder } from './types.js';

export const ADAPTERS: Record<string, CourierAdapter> = { steadfast, pathao, redx, bdcourier, custom };

export function adapterFor(driver: string): CourierAdapter {
  const a = ADAPTERS[driver];
  if (!a) throw badRequest(`Unknown courier driver: ${driver}`);
  return a;
}

/** Env vars (COURIER_<CODE>_<FIELD>) override stored values — handy for secrets supplied by the host. */
export async function resolveCredentials(courier: { id: number; code: string; driver: string }): Promise<Credentials> {
  const row = await db().selectFrom('courier_credentials').select('credentials').where('courier_id', '=', courier.id).executeTakeFirst();
  let stored: Credentials = {};
  if (row?.credentials) {
    try { stored = JSON.parse(decrypt(row.credentials)) as Credentials; } catch (err) { logger.error({ err, courier: courier.code }, 'courier credentials could not be decrypted'); }
  }
  const out: Credentials = { ...stored };
  for (const field of adapterFor(courier.driver).fields) {
    const envKey = `COURIER_${courier.code.toUpperCase()}_${field.key.toUpperCase()}`;
    if (process.env[envKey]) out[field.key] = process.env[envKey]!;
  }
  return out;
}

/** Admin view of credentials: secrets are masked, env-provided values flagged. */
export async function credentialView(courier: { id: number; code: string; driver: string }) {
  const creds = await resolveCredentials(courier);
  const adapter = adapterFor(courier.driver);
  return adapter.fields.map((f) => {
    const fromEnv = Boolean(process.env[`COURIER_${courier.code.toUpperCase()}_${f.key.toUpperCase()}`]);
    const value = creds[f.key] ?? '';
    return { ...f, value: f.secret ? (value ? '__SET__' : '') : value, fromEnv };
  });
}

export async function saveCredentials(courierId: number, driver: string, input: Record<string, string>): Promise<void> {
  const courier = await db().selectFrom('couriers').selectAll().where('id', '=', courierId).executeTakeFirstOrThrow();
  const existing = await resolveCredentials(courier);
  const adapter = adapterFor(driver);
  const next: Credentials = {};
  for (const f of adapter.fields) {
    const v = input[f.key];
    if (f.secret && (v === '__SET__' || v === undefined)) { if (existing[f.key]) next[f.key] = existing[f.key]!; continue; }
    if (v !== undefined && v !== '') next[f.key] = String(v).trim();
  }
  const enc = encrypt(JSON.stringify(next));
  await db().insertInto('courier_credentials').values({ courier_id: courierId, credentials: enc }).onDuplicateKeyUpdate({ credentials: enc }).execute();
}

export async function shipmentForOrder(orderId: number): Promise<ShipmentOrder> {
  const o = await db().selectFrom('orders').selectAll().where('id', '=', orderId).executeTakeFirst();
  if (!o) throw notFound('Order not found');
  const items = await db()
    .selectFrom('order_items as i')
    .leftJoin('products as p', 'p.id', 'i.product_id')
    .select(['i.name', 'i.quantity', 'i.size', 'p.weight'])
    .where('i.order_id', '=', orderId)
    .execute();
  const weight = items.reduce((s, i) => s + Number(i.weight ?? 0.3) * i.quantity, 0);
  return {
    orderNo: o.order_no,
    customerName: o.customer_name,
    phone: o.phone,
    district: o.district,
    upazila: o.upazila,
    address: o.address,
    note: [o.note, await settings.str('courier_note_template')].filter(Boolean).join(' | '),
    codAmount: Number(o.total),
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    itemDescription: items.map((i) => `${i.name}${i.size ? ` (${i.size})` : ''} x${i.quantity}`).join(', '),
    weightKg: Math.max(0.5, Math.round(weight * 10) / 10),
    value: Number(o.subtotal),
  };
}

export async function sendToCourier(orderId: number, courierId: number | null, adminId: number | null) {
  const courier = courierId
    ? await db().selectFrom('couriers').selectAll().where('id', '=', courierId).executeTakeFirst()
    : await db().selectFrom('couriers').selectAll().where('is_default', '=', 1).where('is_enabled', '=', 1).executeTakeFirst();
  if (!courier) throw badRequest('No courier selected (and no default courier is enabled)');
  if (!courier.is_enabled) throw badRequest(`${courier.name} is disabled`);
  const adapter = adapterFor(courier.driver);
  if (!adapter.createShipment) throw badRequest(`${courier.name} cannot create parcels`);
  const order = await db().selectFrom('orders').select(['id', 'status', 'consignment_id', 'order_no', 'total']).where('id', '=', orderId).where('deleted_at', 'is', null).executeTakeFirst();
  if (!order) throw notFound('Order not found');
  if (order.consignment_id) throw badRequest(`Already sent to courier (consignment ${order.consignment_id})`);
  if (['cancelled', 'returned', 'delivered'].includes(order.status)) throw badRequest(`Cannot ship an order that is ${order.status}`);

  const shipment = await shipmentForOrder(orderId);
  const creds = await resolveCredentials(courier);
  try {
    const result = await adapter.createShipment(shipment, creds);
    await db().insertInto('courier_shipments').values({
      order_id: orderId, courier_id: courier.id, consignment_id: result.consignmentId, tracking_code: result.trackingCode, status: result.status,
      cod_amount: shipment.codAmount, request_payload: json.stringify(result.request ?? shipment), response_payload: json.stringify(result.raw), error: null,
    }).execute();
    await db().updateTable('orders').set({ courier_id: courier.id, consignment_id: result.consignmentId, tracking_code: result.trackingCode, courier_status: result.status, status: 'courier_sent' }).where('id', '=', orderId).execute();
    await db().insertInto('order_status_history').values({ order_id: orderId, from_status: order.status, to_status: 'courier_sent', note: `Sent to ${courier.name} (${result.consignmentId})`, admin_id: adminId }).execute();
    return { courier: courier.name, ...result };
  } catch (err) {
    const message = err instanceof CourierError ? err.message : `Courier request failed: ${(err as Error).message}`;
    await db().insertInto('courier_shipments').values({
      order_id: orderId, courier_id: courier.id, consignment_id: null, tracking_code: null, status: 'failed',
      cod_amount: shipment.codAmount, request_payload: json.stringify(shipment), response_payload: json.stringify(err instanceof CourierError ? err.raw : null), error: message.slice(0, 1000),
    }).execute();
    await notify('courier_failure', `Courier failed for ${order.order_no}`, message, `/admin/orders/${orderId}`);
    throw badRequest(message);
  }
}

/** Pulls latest status from the courier and advances the order when it maps to one of ours. */
export async function syncShipmentStatus(orderId: number): Promise<{ status: string; mapped: string | null }> {
  const order = await db().selectFrom('orders').select(['id', 'status', 'courier_id', 'consignment_id', 'tracking_code']).where('id', '=', orderId).executeTakeFirst();
  if (!order?.courier_id || !order.consignment_id) throw badRequest('This order has not been sent to a courier');
  const courier = await db().selectFrom('couriers').selectAll().where('id', '=', order.courier_id).executeTakeFirstOrThrow();
  const adapter = adapterFor(courier.driver);
  if (!adapter.getStatus) throw badRequest(`${courier.name} does not support tracking`);
  const result = await adapter.getStatus({ consignmentId: order.consignment_id, trackingCode: order.tracking_code }, await resolveCredentials(courier));
  await db().updateTable('orders').set({ courier_status: result.status }).where('id', '=', orderId).execute();
  await db().updateTable('courier_shipments').set({ status: result.status, response_payload: json.stringify(result.raw) }).where('order_id', '=', orderId).where('consignment_id', '=', order.consignment_id).execute();
  return { status: result.status, mapped: result.mappedStatus };
}

export async function customerCourierHistory(phone: string): Promise<CustomerHistory | null> {
  const courier = await db().selectFrom('couriers').selectAll().where('driver', '=', 'bdcourier').executeTakeFirst();
  if (!courier) return null;
  const creds = await resolveCredentials(courier);
  if (!creds.api_key) return null;
  return cache.remember(`bdc:${phone}`, 6 * 3600, async () => {
    try { return await bdcourier.customerHistory!(phone, creds); } catch (err) { logger.warn({ err: (err as Error).message }, 'BD Courier lookup failed'); return null as unknown as CustomerHistory; }
  });
}
