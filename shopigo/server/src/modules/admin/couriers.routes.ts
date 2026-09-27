import { Router } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import { badRequest, notFound } from '../../core/errors.js';
import { parse, zBool } from '../../core/validate.js';
import { ADAPTERS, adapterFor, credentialView, resolveCredentials, saveCredentials } from '../../couriers/index.js';
import { db } from '../../db/index.js';
import { requirePermission } from '../../middleware/auth.js';
import { audit } from '../../services/audit.js';

export const couriersRouter = Router();

/** Minimal list for order screens (no credentials). */
couriersRouter.get('/enabled', requirePermission('orders.view'), async (_req, res) => {
  const rows = await db().selectFrom('couriers').select(['id', 'name', 'code', 'driver', 'is_default']).where('is_enabled', '=', 1).execute();
  res.json(rows.filter((r) => ADAPTERS[r.driver]?.capabilities.shipments));
});

couriersRouter.get('/', requirePermission('couriers.manage'), async (_req, res) => {
  const rows = await db().selectFrom('couriers').selectAll().orderBy('id').execute();
  const out = [];
  for (const c of rows) {
    const a = adapterFor(c.driver);
    out.push({ ...c, label: a.label, description: a.description, capabilities: a.capabilities, fields: await credentialView(c) });
  }
  res.json(out);
});

couriersRouter.put('/:id', requirePermission('couriers.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const v = parse(z.object({ name: z.string().trim().min(2).max(80).optional(), is_enabled: zBool.optional(), is_default: zBool.optional(), credentials: z.record(z.string().max(5000)).optional() }), req.body);
  const courier = await db().selectFrom('couriers').selectAll().where('id', '=', id).executeTakeFirst();
  if (!courier) throw notFound();
  if (v.is_default && !adapterFor(courier.driver).capabilities.shipments) throw badRequest(`${courier.name} cannot be the default shipping courier`);
  if (v.is_default) await db().updateTable('couriers').set({ is_default: 0 }).execute();
  const set: Record<string, unknown> = {};
  if (v.name) set.name = v.name;
  if (v.is_enabled !== undefined) set.is_enabled = v.is_enabled ? 1 : 0;
  if (v.is_default !== undefined) set.is_default = v.is_default ? 1 : 0;
  if (Object.keys(set).length) await db().updateTable('couriers').set(set).where('id', '=', id).execute();
  if (v.credentials) await saveCredentials(id, courier.driver, v.credentials);
  await audit(req, { action: 'courier.updated', targetType: 'courier', targetId: id, newValue: { ...set, credentialsChanged: Boolean(v.credentials) } });
  res.json({ ok: true });
});

couriersRouter.post('/:id/test', requirePermission('couriers.manage'), async (req, res) => {
  const courier = await db().selectFrom('couriers').selectAll().where('id', '=', Number(req.params.id)).executeTakeFirst();
  if (!courier) throw notFound();
  try {
    res.json(await adapterFor(courier.driver).test(await resolveCredentials(courier)));
  } catch (err) {
    res.json({ ok: false, message: (err as Error).message });
  }
});

couriersRouter.get('/report', requirePermission('couriers.manage', 'analytics.view'), async (req, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86400_000);
  const to = req.query.to ? new Date(new Date(String(req.query.to)).getTime() + 86400_000) : new Date();
  const rows = await db().selectFrom('orders as o').innerJoin('couriers as c', 'c.id', 'o.courier_id')
    .select([
      'c.id', 'c.name',
      sql<number>`COUNT(*)`.as('total'),
      sql<number>`SUM(o.status = 'delivered')`.as('delivered'),
      sql<number>`SUM(o.status = 'cancelled')`.as('cancelled'),
      sql<number>`SUM(o.status = 'returned')`.as('returned'),
      sql<number>`SUM(o.status IN ('courier_sent','in_transit'))`.as('pending'),
      sql<number>`COALESCE(SUM(o.total), 0)`.as('cod_total'),
      sql<number>`COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total END), 0)`.as('cod_collected'),
    ])
    .where('o.created_at', '>=', from).where('o.created_at', '<', to).where('o.deleted_at', 'is', null)
    .groupBy(['c.id', 'c.name']).execute();
  const failures = await db().selectFrom('courier_shipments').select(sql<number>`COUNT(*)`.as('n')).where('status', '=', 'failed').where('created_at', '>=', from).executeTakeFirst();
  res.json({
    from, to,
    couriers: rows.map((r) => {
      const finished = Number(r.delivered) + Number(r.returned) + Number(r.cancelled);
      return { ...r, total: Number(r.total), delivered: Number(r.delivered), cancelled: Number(r.cancelled), returned: Number(r.returned), pending: Number(r.pending), cod_total: Number(r.cod_total), cod_collected: Number(r.cod_collected), success_rate: finished ? Math.round((Number(r.delivered) / finished) * 100) : null };
    }),
    failedRequests: Number(failures?.n ?? 0),
  });
});
