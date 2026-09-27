import { Router } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import { notFound } from '../../core/errors.js';
import { pageParams, parse, zBool, zText } from '../../core/validate.js';
import { customerCourierHistory } from '../../couriers/index.js';
import { db } from '../../db/index.js';
import { requirePermission } from '../../middleware/auth.js';
import { audit } from '../../services/audit.js';

export const customersRouter = Router();

customersRouter.get('/', requirePermission('customers.view'), async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, offset } = pageParams(q, 25, 100);
  let base = db().selectFrom('customers');
  if (q.q) {
    const like = `%${q.q.trim().slice(0, 60).replace(/[%_\\]/g, '')}%`;
    base = base.where((eb) => eb.or([eb('phone', 'like', like), eb('name', 'like', like)]));
  }
  if (q.blocked === '1') base = base.where('is_blocked', '=', 1);
  const sort = ({ orders: 'total_orders', spent: 'total_spent', recent: 'last_order_at' } as const)[q.sort as 'orders'] ?? 'last_order_at';
  const [items, total] = await Promise.all([
    base.selectAll().orderBy(sort, 'desc').limit(limit).offset(offset).execute(),
    base.select(sql<number>`COUNT(*)`.as('n')).executeTakeFirst(),
  ]);
  res.json({ items, total: Number(total?.n ?? 0), page, limit });
});

customersRouter.get('/:id', requirePermission('customers.view'), async (req, res) => {
  const c = await db().selectFrom('customers').selectAll().where('id', '=', Number(req.params.id)).executeTakeFirst();
  if (!c) throw notFound();
  const [orders, addresses, byCourier] = await Promise.all([
    db().selectFrom('orders').select(['id', 'order_no', 'status', 'total', 'created_at', 'courier_id', 'risk_level']).where('customer_id', '=', c.id).where('deleted_at', 'is', null).orderBy('id', 'desc').limit(50).execute(),
    db().selectFrom('addresses').selectAll().where('customer_id', '=', c.id).orderBy('last_used_at', 'desc').execute(),
    db().selectFrom('orders as o').innerJoin('couriers as k', 'k.id', 'o.courier_id').select(['k.name', sql<number>`COUNT(*)`.as('total'), sql<number>`SUM(o.status = 'delivered')`.as('delivered'), sql<number>`SUM(o.status = 'returned')`.as('returned'), sql<number>`SUM(o.status = 'cancelled')`.as('cancelled')]).where('o.customer_id', '=', c.id).groupBy('k.name').execute(),
  ]);
  res.json({ ...c, orders, addresses: addresses.map(({ device_hash: _d, ...a }) => a), byCourier });
});

customersRouter.get('/:id/courier-history', requirePermission('customers.view'), async (req, res) => {
  const c = await db().selectFrom('customers').select('phone').where('id', '=', Number(req.params.id)).executeTakeFirst();
  if (!c) throw notFound();
  res.json(await customerCourierHistory(c.phone));
});

customersRouter.put('/:id', requirePermission('customers.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const v = parse(z.object({ name: zText(120).optional(), email: z.string().email().max(190).nullable().optional().or(z.literal('')), notes: zText(1000).nullable().optional(), is_blocked: zBool.optional() }), req.body);
  const before = await db().selectFrom('customers').selectAll().where('id', '=', id).executeTakeFirst();
  if (!before) throw notFound();
  const set: Record<string, unknown> = {};
  if (v.name) set.name = v.name;
  if (v.email !== undefined) set.email = v.email || null;
  if (v.notes !== undefined) set.notes = v.notes;
  if (v.is_blocked !== undefined) set.is_blocked = v.is_blocked ? 1 : 0;
  await db().updateTable('customers').set(set).where('id', '=', id).execute();
  await audit(req, { action: v.is_blocked !== undefined && Boolean(before.is_blocked) !== v.is_blocked ? (v.is_blocked ? 'customer.blocked' : 'customer.unblocked') : 'customer.updated', targetType: 'customer', targetId: id, oldValue: { is_blocked: before.is_blocked, notes: before.notes }, newValue: set });
  res.json({ ok: true });
});
