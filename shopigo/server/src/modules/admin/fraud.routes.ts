import { Router } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import { badRequest } from '../../core/errors.js';
import { pageParams, parse, zText } from '../../core/validate.js';
import { db, json } from '../../db/index.js';
import { requirePermission } from '../../middleware/auth.js';
import { audit } from '../../services/audit.js';
import { block } from '../../services/fraud.js';

export const fraudRouter = Router();
fraudRouter.use(requirePermission('fraud.manage'));

const TABLES = { ip: 'blocked_ips', device: 'blocked_devices', phone: 'blocked_phones' } as const;
type Kind = keyof typeof TABLES;

fraudRouter.get('/summary', async (_req, res) => {
  const since = new Date(Date.now() - 7 * 86400_000);
  const [events, blocks, highRisk] = await Promise.all([
    db().selectFrom('fraud_events').select(['action', sql<number>`COUNT(*)`.as('n')]).where('created_at', '>=', since).groupBy('action').execute(),
    Promise.all((Object.keys(TABLES) as Kind[]).map(async (k) => [k, Number((await db().selectFrom(TABLES[k]).select(sql<number>`COUNT(*)`.as('n')).where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', new Date())])).executeTakeFirst())?.n ?? 0)] as const)),
    db().selectFrom('orders').select(sql<number>`COUNT(*)`.as('n')).where('risk_level', '=', 'HIGH').where('created_at', '>=', since).executeTakeFirst(),
  ]);
  res.json({ events: Object.fromEntries(events.map((e) => [e.action, Number(e.n)])), activeBlocks: Object.fromEntries(blocks), highRiskOrders: Number(highRisk?.n ?? 0) });
});

fraudRouter.get('/events', async (req, res) => {
  const { page, limit, offset } = pageParams(req.query as Record<string, unknown>, 30, 100);
  const rows = await db().selectFrom('fraud_events as f').leftJoin('orders as o', 'o.id', 'f.order_id').select(['f.id', 'f.type', 'f.ip', 'f.phone', 'f.device_hash', 'f.order_id', 'f.risk_score', 'f.risk_level', 'f.reasons', 'f.action', 'f.created_at', 'o.order_no'])
    .orderBy('f.id', 'desc').limit(limit).offset(offset).execute();
  res.json({ items: rows.map((r) => ({ ...r, reasons: json.parse(r.reasons, []) })), page });
});

fraudRouter.get('/blocks', async (req, res) => {
  const kind = (String(req.query.type ?? 'ip') as Kind);
  if (!TABLES[kind]) throw badRequest('Invalid type');
  const rows = await db().selectFrom(TABLES[kind]).selectAll().orderBy('updated_at', 'desc').limit(500).execute();
  res.json(rows.map((r) => ({ ...r, active: !r.expires_at || new Date(r.expires_at).getTime() > Date.now(), lifetime: !r.expires_at })));
});

fraudRouter.post('/blocks', async (req, res) => {
  const v = parse(z.object({ type: z.enum(['ip', 'device', 'phone']), value: z.string().trim().min(3).max(64), reason: zText(500).default('Manual block'), hours: z.coerce.number().int().min(1).max(24 * 3650).nullable().optional() }), req.body);
  await block(TABLES[v.type], v.value, v.reason, v.hours ?? null, req.admin!.id);
  await audit(req, { action: 'fraud.blocked', targetType: v.type, targetId: v.value, newValue: { reason: v.reason, hours: v.hours ?? 'lifetime' } });
  res.json({ ok: true });
});

fraudRouter.delete('/blocks/:type/:id', async (req, res) => {
  const kind = req.params.type as Kind;
  if (!TABLES[kind]) throw badRequest('Invalid type');
  const row = await db().selectFrom(TABLES[kind]).selectAll().where('id', '=', Number(req.params.id)).executeTakeFirst();
  await db().deleteFrom(TABLES[kind]).where('id', '=', Number(req.params.id)).execute();
  await audit(req, { action: 'fraud.unblocked', targetType: kind, targetId: row?.value ?? req.params.id, oldValue: row });
  res.json({ ok: true });
});
