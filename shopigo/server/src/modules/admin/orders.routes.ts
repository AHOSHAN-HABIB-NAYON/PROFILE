import { Router } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import { cache } from '../../core/cache.js';
import { badRequest, notFound } from '../../core/errors.js';
import { pageParams, parse, zPhone, zText } from '../../core/validate.js';
import { customerCourierHistory, sendToCourier, syncShipmentStatus } from '../../couriers/index.js';
import { db, json } from '../../db/index.js';
import { requirePermission } from '../../middleware/auth.js';
import { audit } from '../../services/audit.js';
import { changeStatus, editOrder } from '../../services/orders.js';
import { settings } from '../../services/settings.js';
import { moveToTrash } from '../../services/trash.js';

export const ordersRouter = Router();

ordersRouter.get('/statuses', async (_req, res) => {
  res.json(await db().selectFrom('order_statuses').selectAll().orderBy('sort_order').execute());
});

ordersRouter.get('/', requirePermission('orders.view'), async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, offset } = pageParams(q, 25, 100);
  let base = db().selectFrom('orders as o').where('o.deleted_at', 'is', null);
  if (q.status && q.status !== 'all') base = base.where('o.status', '=', q.status);
  if (q.risk) base = base.where('o.risk_level', '=', q.risk);
  if (q.courier) base = base.where('o.courier_id', '=', Number(q.courier));
  if (q.from) base = base.where('o.created_at', '>=', new Date(q.from));
  if (q.to) base = base.where('o.created_at', '<', new Date(new Date(q.to).getTime() + 86400_000));
  if (q.q) {
    const term = q.q.trim().slice(0, 60);
    const like = `%${term.replace(/[%_\\]/g, '')}%`;
    base = base.where((eb) => eb.or([eb('o.order_no', 'like', like), eb('o.phone', 'like', like), eb('o.customer_name', 'like', like), eb('o.consignment_id', '=', term)]));
  }
  const [rows, total, counts] = await Promise.all([
    base
      .leftJoin('couriers as c', 'c.id', 'o.courier_id')
      .select(['o.id', 'o.order_no', 'o.customer_name', 'o.phone', 'o.district', 'o.upazila', 'o.status', 'o.total', 'o.item_count', 'o.risk_level', 'o.risk_score', 'o.consignment_id', 'o.created_at', 'c.name as courier_name'])
      .select((eb) => eb.selectFrom('order_items as i').select(sql<string>`GROUP_CONCAT(CONCAT(i.name, ' ×', i.quantity) SEPARATOR ', ')`.as('x')).whereRef('i.order_id', '=', 'o.id').as('items_summary'))
      .orderBy('o.id', 'desc').limit(limit).offset(offset).execute(),
    base.select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst(),
    db().selectFrom('orders').select(['status', (eb) => eb.fn.countAll<number>().as('n')]).where('deleted_at', 'is', null).groupBy('status').execute(),
  ]);
  res.json({ items: rows, total: Number(total?.n ?? 0), page, limit, counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) });
});

ordersRouter.get('/:id', requirePermission('orders.view'), async (req, res) => {
  const id = Number(req.params.id);
  const o = await db().selectFrom('orders').selectAll().where('id', '=', id).executeTakeFirst();
  if (!o) throw notFound('Order not found');
  const [items, history, shipments, customer, courier, sameIp, samePhone] = await Promise.all([
    db().selectFrom('order_items').selectAll().where('order_id', '=', id).execute(),
    db().selectFrom('order_status_history as h').leftJoin('admins as a', 'a.id', 'h.admin_id').select(['h.id', 'h.from_status', 'h.to_status', 'h.note', 'h.created_at', 'a.name as admin_name']).where('h.order_id', '=', id).orderBy('h.id').execute(),
    db().selectFrom('courier_shipments as s').innerJoin('couriers as c', 'c.id', 's.courier_id').select(['s.id', 's.consignment_id', 's.tracking_code', 's.status', 's.cod_amount', 's.error', 's.response_payload', 's.created_at', 'c.name as courier_name']).where('s.order_id', '=', id).orderBy('s.id', 'desc').execute(),
    o.customer_id ? db().selectFrom('customers').selectAll().where('id', '=', o.customer_id).executeTakeFirst() : null,
    o.courier_id ? db().selectFrom('couriers').select(['id', 'name', 'code']).where('id', '=', o.courier_id).executeTakeFirst() : null,
    o.ip ? db().selectFrom('orders').select((eb) => eb.fn.countAll<number>().as('n')).where('ip', '=', o.ip).where('id', '!=', id).executeTakeFirst() : null,
    db().selectFrom('orders').select(['id', 'order_no', 'status', 'total', 'created_at']).where('phone', '=', o.phone).where('id', '!=', id).orderBy('id', 'desc').limit(10).execute(),
  ]);
  res.json({
    ...o,
    device_info: json.parse(o.device_info, {}),
    risk_reasons: json.parse(o.risk_reasons, []),
    items,
    history,
    shipments: shipments.map((s) => ({ ...s, response_payload: json.parse(s.response_payload, null) })),
    customer,
    courier,
    otherOrdersFromIp: Number(sameIp?.n ?? 0),
    previousOrders: samePhone,
    whatsappNumber: await settings.str('whatsapp_number'),
  });
});

ordersRouter.get('/:id/courier-history', requirePermission('orders.view'), async (req, res) => {
  const o = await db().selectFrom('orders').select('phone').where('id', '=', Number(req.params.id)).executeTakeFirst();
  if (!o) throw notFound();
  const local = await db().selectFrom('orders').select([
    sql<number>`COUNT(*)`.as('total'),
    sql<number>`SUM(status = 'delivered')`.as('delivered'),
    sql<number>`SUM(status = 'cancelled')`.as('cancelled'),
    sql<number>`SUM(status = 'returned')`.as('returned'),
  ]).where('phone', '=', o.phone).where('deleted_at', 'is', null).executeTakeFirst();
  res.json({ local, external: await customerCourierHistory(o.phone) });
});

ordersRouter.post('/:id/status', requirePermission('orders.manage'), async (req, res) => {
  const { status, note } = parse(z.object({ status: z.string().max(30), note: zText(500).optional().nullable() }), req.body);
  const id = Number(req.params.id);
  const before = await db().selectFrom('orders').select(['status', 'order_no']).where('id', '=', id).executeTakeFirst();
  if (!before) throw notFound();
  await changeStatus(id, status, req.admin!.id, note);
  await audit(req, { action: 'order.status_changed', targetType: 'order', targetId: id, oldValue: { status: before.status }, newValue: { status, note } });
  if (status === 'confirmed' && (await settings.bool('courier_auto_send'))) {
    try { await sendToCourier(id, null, req.admin!.id); } catch { /* failure is recorded + notified */ }
  }
  await cache.del('dash:');
  res.json({ ok: true });
});

ordersRouter.post('/bulk-status', requirePermission('orders.manage'), async (req, res) => {
  const { ids, status } = parse(z.object({ ids: z.array(z.number().int().positive()).min(1).max(200), status: z.string().max(30) }), req.body);
  const done: number[] = [];
  const failed: Array<{ id: number; error: string }> = [];
  for (const id of ids) {
    try { await changeStatus(id, status, req.admin!.id, 'Bulk update'); done.push(id); } catch (err) { failed.push({ id, error: (err as Error).message }); }
  }
  await audit(req, { action: 'order.bulk_status', targetType: 'order', newValue: { ids: done, status } });
  res.json({ done, failed });
});

const editSchema = z.object({
  customer_name: zText(120).pipe(z.string().min(2)).optional(),
  phone: zPhone.optional(),
  district: z.string().trim().max(80).optional(),
  upazila: z.string().trim().max(80).optional(),
  address: zText(500).optional(),
  note: zText(1000).nullable().optional(),
  admin_note: zText(1000).nullable().optional(),
  delivery_charge: z.coerce.number().min(0).max(100000).optional(),
  discount: z.coerce.number().min(0).max(10000000).optional(),
  items: z.array(z.object({
    id: z.number().int().positive().optional(),
    productId: z.number().int().positive().nullable().optional(),
    variantId: z.number().int().positive().nullable().optional(),
    name: zText(255).optional(),
    size: z.string().max(40).nullable().optional(),
    unitPrice: z.coerce.number().min(0).max(10000000),
    qty: z.coerce.number().int().min(1).max(1000),
  })).optional(),
});

ordersRouter.put('/:id', requirePermission('orders.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const edit = parse(editSchema, req.body);
  const { before, after } = await editOrder(id, edit);
  const oldValue: Record<string, unknown> = {};
  for (const k of Object.keys(after)) oldValue[k] = (before as Record<string, unknown>)[k];
  await audit(req, { action: 'order.edited', targetType: 'order', targetId: id, oldValue, newValue: { ...after, items: edit.items } });
  res.json({ ok: true });
});

ordersRouter.post('/:id/courier', requirePermission('courier.send'), async (req, res) => {
  const { courierId } = parse(z.object({ courierId: z.coerce.number().int().positive().nullable().optional() }), req.body);
  const id = Number(req.params.id);
  const result = await sendToCourier(id, courierId ?? null, req.admin!.id);
  await audit(req, { action: 'order.courier_sent', targetType: 'order', targetId: id, newValue: { courier: result.courier, consignmentId: result.consignmentId, trackingCode: result.trackingCode } });
  res.json({ ok: true, courier: result.courier, consignmentId: result.consignmentId, trackingCode: result.trackingCode, status: result.status, response: result.raw });
});

ordersRouter.post('/:id/courier/sync', requirePermission('orders.view'), async (req, res) => {
  const id = Number(req.params.id);
  const r = await syncShipmentStatus(id);
  const o = await db().selectFrom('orders').select('status').where('id', '=', id).executeTakeFirstOrThrow();
  if (r.mapped && r.mapped !== o.status && !['delivered', 'cancelled', 'returned'].includes(o.status)) {
    await changeStatus(id, r.mapped, req.admin!.id, `Courier status: ${r.status}`);
  }
  res.json(r);
});

ordersRouter.post('/bulk-courier', requirePermission('courier.send'), async (req, res) => {
  const { ids, courierId } = parse(z.object({ ids: z.array(z.number().int().positive()).min(1).max(100), courierId: z.coerce.number().int().positive().nullable().optional() }), req.body);
  const results: Array<{ id: number; ok: boolean; message: string }> = [];
  for (const id of ids) {
    try {
      const r = await sendToCourier(id, courierId ?? null, req.admin!.id);
      results.push({ id, ok: true, message: r.consignmentId ?? 'sent' });
    } catch (err) {
      results.push({ id, ok: false, message: (err as Error).message });
    }
  }
  await audit(req, { action: 'order.bulk_courier', targetType: 'order', newValue: results });
  res.json({ results });
});

ordersRouter.delete('/:id', requirePermission('orders.delete'), async (req, res) => {
  await moveToTrash(req, 'order', Number(req.params.id));
  res.json({ ok: true });
});

/** Internal admin note (also added to the order timeline). */
ordersRouter.post('/:id/notes', requirePermission('orders.manage'), async (req, res) => {
  const { note } = parse(z.object({ note: zText(1000) }), req.body);
  const id = Number(req.params.id);
  const o = await db().selectFrom('orders').select(['admin_note', 'status']).where('id', '=', id).executeTakeFirst();
  if (!o) throw notFound();
  if (!note) throw badRequest('Note is empty');
  await db().updateTable('orders').set({ admin_note: note }).where('id', '=', id).execute();
  await db().insertInto('order_status_history').values({ order_id: id, from_status: o.status, to_status: o.status, note, admin_id: req.admin!.id }).execute();
  res.json({ ok: true });
});
