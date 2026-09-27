import { sql } from 'kysely';
import { HttpError } from '../core/errors.js';
import { db, json } from '../db/index.js';
import { customerCourierHistory } from '../couriers/index.js';
import { notify } from './notifications.js';
import { settings } from './settings.js';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export interface RiskContext { ip: string | null; phone: string; deviceHash: string | null; address: string; district: string; totalQty: number; subtotal: number }
export interface RiskResult { score: number; level: RiskLevel; reasons: string[] }

type BlockTable = 'blocked_ips' | 'blocked_devices' | 'blocked_phones';

const REJECT_MESSAGE = 'দুঃখিত, এই মুহূর্তে আপনার অর্ডারটি গ্রহণ করা যাচ্ছে না। অনুগ্রহ করে আমাদের সাথে WhatsApp বা ফোনে যোগাযোগ করুন।';

async function activeBlock(table: BlockTable, value: string | null) {
  if (!value) return null;
  const row = await db().selectFrom(table).selectAll().where('value', '=', value).executeTakeFirst();
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

async function countSince(column: 'ip' | 'phone' | 'device_hash', value: string, hours: number): Promise<number> {
  const since = new Date(Date.now() - hours * 3600_000);
  const r = await db()
    .selectFrom('orders')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where(column, '=', value)
    .where('created_at', '>=', since)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return Number(r?.n ?? 0);
}

async function recordEvent(type: string, ctx: Partial<RiskContext>, risk: RiskResult, action: string, orderId: number | null = null) {
  await db()
    .insertInto('fraud_events')
    .values({ type, ip: ctx.ip ?? null, phone: ctx.phone ?? null, device_hash: ctx.deviceHash ?? null, order_id: orderId, risk_score: risk.score, risk_level: risk.level, reasons: json.stringify(risk.reasons), action })
    .execute();
}

/** Block (or extend a block on) a value. Lifetime after N temporary blocks. */
export async function block(table: BlockTable, value: string, reason: string, hours: number | null, adminId: number | null = null): Promise<void> {
  const expires = hours == null ? null : new Date(Date.now() + hours * 3600_000);
  await db()
    .insertInto(table)
    .values({ value, reason, expires_at: expires, created_by: adminId, attempts: 1 })
    .onDuplicateKeyUpdate({ reason, expires_at: expires, created_by: adminId, attempts: sql`attempts + 1` })
    .execute();
}

async function rejectAndMaybeBlock(kind: 'ip' | 'phone' | 'device', value: string, ctx: RiskContext, reason: string): Promise<never> {
  const risk: RiskResult = { score: 100, level: 'HIGH', reasons: [reason] };
  await recordEvent(`${kind}_limit`, ctx, risk, 'rejected');
  const windowHours = await settings.num('fraud_ip_window_hours');
  const since = new Date(Date.now() - Math.max(1, windowHours) * 3600_000);
  const column = kind === 'ip' ? 'ip' : kind === 'phone' ? 'phone' : 'device_hash';
  const attempts = await db()
    .selectFrom('fraud_events')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where(column, '=', value)
    .where('action', '=', 'rejected')
    .where('created_at', '>=', since)
    .executeTakeFirst();
  const threshold = Math.max(1, await settings.num('fraud_attempts_before_block'));
  if (Number(attempts?.n ?? 0) >= threshold) {
    const table: BlockTable = kind === 'ip' ? 'blocked_ips' : kind === 'phone' ? 'blocked_phones' : 'blocked_devices';
    const prior = await db().selectFrom(table).select('attempts').where('value', '=', value).executeTakeFirst();
    const lifetimeAfter = await settings.num('fraud_lifetime_after_blocks');
    const lifetime = lifetimeAfter > 0 && (prior?.attempts ?? 0) + 1 >= lifetimeAfter;
    await block(table, value, lifetime ? `Automatic lifetime block: ${reason}` : `Automatic temporary block: ${reason}`, lifetime ? null : await settings.num('fraud_temp_block_hours'));
    await recordEvent('auto_block', ctx, risk, lifetime ? 'blocked_lifetime' : 'blocked');
    await notify('fraud', `${lifetime ? 'Lifetime' : 'Temporary'} block: ${kind.toUpperCase()} ${kind === 'device' ? value.slice(0, 10) + '…' : value}`, reason, '/admin/fraud');
  } else {
    await notify('fraud', `Order attempt rejected (${kind} limit)`, `${reason} — ${ctx.phone}`, '/admin/fraud');
  }
  throw new HttpError(429, REJECT_MESSAGE, 'ORDER_LIMIT');
}

/**
 * Hard gates first (block lists and configured order limits), then a
 * weighted score from softer signals. Throws for rejected orders.
 */
export async function assessOrder(ctx: RiskContext): Promise<RiskResult> {
  if (!(await settings.bool('fraud_enabled'))) return { score: 0, level: 'LOW', reasons: [] };

  for (const [table, value, label] of [['blocked_ips', ctx.ip, 'IP'], ['blocked_devices', ctx.deviceHash, 'device'], ['blocked_phones', ctx.phone, 'phone']] as const) {
    const b = await activeBlock(table, value);
    if (b) {
      await recordEvent('blocked_attempt', ctx, { score: 100, level: 'HIGH', reasons: [`Blocked ${label}: ${b.reason ?? ''}`] }, 'rejected');
      throw new HttpError(403, REJECT_MESSAGE, 'BLOCKED');
    }
  }
  const customer = await db().selectFrom('customers').select(['is_blocked']).where('phone', '=', ctx.phone).executeTakeFirst();
  if (customer?.is_blocked) {
    await recordEvent('blocked_attempt', ctx, { score: 100, level: 'HIGH', reasons: ['Blocked customer'] }, 'rejected');
    throw new HttpError(403, REJECT_MESSAGE, 'BLOCKED');
  }

  const ipLimit = await settings.num('fraud_ip_limit');
  const ipHours = await settings.num('fraud_ip_window_hours');
  const ipCount = ctx.ip ? await countSince('ip', ctx.ip, ipHours) : 0;
  if (ctx.ip && ipLimit > 0 && ipCount >= ipLimit) await rejectAndMaybeBlock('ip', ctx.ip, ctx, `More than ${ipLimit} order(s) from the same IP within ${ipHours}h`);

  const phoneLimit = await settings.num('fraud_phone_limit');
  const phoneHours = await settings.num('fraud_phone_window_hours');
  const phoneCount = await countSince('phone', ctx.phone, phoneHours);
  if (phoneLimit > 0 && phoneCount >= phoneLimit) await rejectAndMaybeBlock('phone', ctx.phone, ctx, `More than ${phoneLimit} order(s) from the same phone within ${phoneHours}h`);

  const deviceLimit = await settings.num('fraud_device_limit');
  const deviceCount = ctx.deviceHash ? await countSince('device_hash', ctx.deviceHash, ipHours) : 0;
  if (ctx.deviceHash && deviceLimit > 0 && deviceCount >= deviceLimit) await rejectAndMaybeBlock('device', ctx.deviceHash, ctx, `More than ${deviceLimit} order(s) from the same device within ${ipHours}h`);

  // ---- soft signals
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => { score += points; reasons.push(reason); };

  if (ipCount > 0) add(Math.min(30, ipCount * 15), `${ipCount} recent order(s) from this IP`);
  if (phoneCount > 0) add(Math.min(30, phoneCount * 10), `${phoneCount} recent order(s) from this phone`);
  if (deviceCount > 0) add(Math.min(30, deviceCount * 15), `${deviceCount} recent order(s) from this device`);
  if (!ctx.deviceHash) add(5, 'No device fingerprint');

  const since7d = new Date(Date.now() - 7 * 24 * 3600_000);
  const sameAddress = await db()
    .selectFrom('orders')
    .select((eb) => eb.fn.count<number>('phone').distinct().as('n'))
    .where('address', '=', ctx.address)
    .where('phone', '!=', ctx.phone)
    .where('created_at', '>=', since7d)
    .executeTakeFirst();
  if (Number(sameAddress?.n ?? 0) > 0) add(20, `Same address used by ${sameAddress?.n} other phone number(s) in 7 days`);

  const history = await db()
    .selectFrom('orders')
    .select([
      sql<number>`SUM(status IN ('cancelled','returned'))`.as('bad'),
      sql<number>`SUM(status = 'delivered')`.as('good'),
      sql<number>`COUNT(*)`.as('total'),
    ])
    .where('phone', '=', ctx.phone)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  const bad = Number(history?.bad ?? 0);
  const good = Number(history?.good ?? 0);
  if (bad >= 2) add(25, `${bad} previous cancelled/returned orders`);
  else if (bad === 1 && good === 0) add(10, 'Previous order was cancelled/returned');
  if (bad > 0 && good > 0 && bad / (bad + good) > 0.5) add(15, 'More than 50% of past orders failed');
  if (good >= 2) { score = Math.max(0, score - 15); reasons.push(`Trusted: ${good} delivered orders`); }

  const maxQty = await settings.num('fraud_max_quantity');
  if (maxQty > 0 && ctx.totalQty >= maxQty) add(25, `Suspicious quantity (${ctx.totalQty} items)`);
  if (ctx.subtotal >= 50_000) add(10, 'Unusually high order value');

  if (await settings.bool('bdcourier_check_enabled')) {
    const h = await customerCourierHistory(ctx.phone);
    if (h && h.total >= 3) {
      if (h.successRatio < 50) add(30, `Courier success ratio ${h.successRatio}% (${h.delivered}/${h.total})`);
      else if (h.successRatio < 75) add(10, `Courier success ratio ${h.successRatio}%`);
      else reasons.push(`Courier success ratio ${h.successRatio}%`);
    }
  }

  score = Math.min(100, score);
  const medium = await settings.num('fraud_medium_threshold');
  const high = await settings.num('fraud_high_threshold');
  const level: RiskLevel = score >= high ? 'HIGH' : score >= medium ? 'MEDIUM' : 'LOW';
  const result = { score, level, reasons };
  if (level === 'HIGH' && (await settings.bool('fraud_reject_high'))) {
    await recordEvent('high_risk', ctx, result, 'rejected');
    await notify('fraud', 'High-risk order rejected', `${ctx.phone}: ${reasons.join('; ')}`, '/admin/fraud');
    throw new HttpError(403, REJECT_MESSAGE, 'HIGH_RISK');
  }
  return result;
}

export async function recordFlagged(ctx: RiskContext, risk: RiskResult, orderId: number): Promise<void> {
  if (risk.level === 'LOW') return;
  await recordEvent('risky_order', ctx, risk, 'flagged', orderId);
  if (risk.level === 'HIGH') await notify('fraud', 'High-risk order received', `${ctx.phone} — score ${risk.score}: ${risk.reasons.join('; ')}`, `/admin/orders/${orderId}`);
}
