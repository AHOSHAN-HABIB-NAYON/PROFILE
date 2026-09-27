import { Router } from 'express';
import { sql } from 'kysely';
import { cache } from '../../core/cache.js';
import { db } from '../../db/index.js';
import { requirePermission } from '../../middleware/auth.js';
import { settings } from '../../services/settings.js';

export const dashboardRouter = Router();

/** Offset like "+06:00" for an IANA zone at a given instant. */
function tzOffset(tz: string, at = new Date()): { minutes: number; label: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(at);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+06:00';
    const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
    if (!m) return { minutes: 0, label: '+00:00' };
    const minutes = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
    return { minutes, label: `${m[1]}${m[2]}:${m[3] ?? '00'}` };
  } catch {
    return { minutes: 360, label: '+06:00' };
  }
}

export type Range = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'year';

export function rangeBounds(range: Range, tz: string) {
  const { minutes, label } = tzOffset(tz);
  const nowLocal = new Date(Date.now() + minutes * 60_000);
  const startOfLocalDay = Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate()) - minutes * 60_000;
  const day = 86400_000;
  let from: number;
  let to = Date.now();
  let bucket: 'hour' | 'day' | 'month' = 'day';
  switch (range) {
    case 'today': from = startOfLocalDay; bucket = 'hour'; break;
    case 'yesterday': from = startOfLocalDay - day; to = startOfLocalDay; bucket = 'hour'; break;
    case '7d': from = startOfLocalDay - 6 * day; break;
    case '30d': from = startOfLocalDay - 29 * day; break;
    case 'month': from = Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), 1) - minutes * 60_000; break;
    case 'year': from = Date.UTC(nowLocal.getUTCFullYear(), 0, 1) - minutes * 60_000; bucket = 'month'; break;
  }
  const span = to - from;
  return { from: new Date(from), to: new Date(to), prevFrom: new Date(from - span), prevTo: new Date(from), bucket, offset: label };
}

const RANGES: Range[] = ['today', 'yesterday', '7d', '30d', 'month', 'year'];

async function kpis(from: Date, to: Date) {
  const r = await db().selectFrom('orders').select([
    sql<number>`COUNT(*)`.as('orders'),
    sql<number>`COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','returned') THEN total END), 0)`.as('sales'),
    sql<number>`COALESCE(SUM(CASE WHEN status = 'delivered' THEN total END), 0)`.as('revenue'),
    sql<number>`COALESCE(SUM(CASE WHEN status = 'delivered' THEN total - delivery_charge END), 0)`.as('net_revenue'),
    sql<number>`SUM(status = 'cancelled')`.as('cancelled'),
    sql<number>`SUM(status = 'delivered')`.as('delivered'),
    sql<number>`SUM(status = 'returned')`.as('returned'),
    sql<number>`SUM(status IN ('new','pending'))`.as('pending'),
    sql<number>`COUNT(DISTINCT phone)`.as('customers'),
    sql<number>`SUM(risk_level = 'HIGH')`.as('high_risk'),
  ]).where('created_at', '>=', from).where('created_at', '<', to).where('deleted_at', 'is', null).executeTakeFirst();
  const orders = Number(r?.orders ?? 0);
  const sales = Number(r?.sales ?? 0);
  const valid = orders - Number(r?.cancelled ?? 0) - Number(r?.returned ?? 0);
  return {
    orders, sales, revenue: Number(r?.revenue ?? 0), netRevenue: Number(r?.net_revenue ?? 0), cancelled: Number(r?.cancelled ?? 0), delivered: Number(r?.delivered ?? 0),
    returned: Number(r?.returned ?? 0), pending: Number(r?.pending ?? 0), customers: Number(r?.customers ?? 0), highRisk: Number(r?.high_risk ?? 0),
    aov: valid > 0 ? Math.round(sales / valid) : 0,
  };
}

dashboardRouter.get('/', requirePermission('dashboard.view'), async (req, res) => {
  const range = (RANGES.includes(req.query.range as Range) ? req.query.range : 'today') as Range;
  const data = await cache.remember(`dash:${range}`, 30, async () => {
    const tz = await settings.str('timezone');
    const b = rangeBounds(range, tz);
    const fmt = b.bucket === 'hour' ? '%H:00' : b.bucket === 'month' ? '%Y-%m' : '%Y-%m-%d';
    const [current, previous, series, statusRows, lowStock, outOfStock, fraud, recent, newCustomers, couriers] = await Promise.all([
      kpis(b.from, b.to),
      kpis(b.prevFrom, b.prevTo),
      db().selectFrom('orders').select([
        sql<string>`DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', ${b.offset}), ${fmt})`.as('bucket'),
        sql<number>`COUNT(*)`.as('orders'),
        sql<number>`COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','returned') THEN total END), 0)`.as('sales'),
      ]).where('created_at', '>=', b.from).where('created_at', '<', b.to).where('deleted_at', 'is', null).groupBy('bucket').orderBy('bucket').execute(),
      db().selectFrom('orders').select(['status', sql<number>`COUNT(*)`.as('n')]).where('created_at', '>=', b.from).where('created_at', '<', b.to).where('deleted_at', 'is', null).groupBy('status').execute(),
      db().selectFrom('products').select(sql<number>`COUNT(*)`.as('n')).where('deleted_at', 'is', null).where('stock', '>', 0).where(sql<boolean>`stock <= low_stock_threshold`).executeTakeFirst(),
      db().selectFrom('products').select(sql<number>`COUNT(*)`.as('n')).where('deleted_at', 'is', null).where('status', '=', 'active').where('stock', '<=', 0).executeTakeFirst(),
      db().selectFrom('fraud_events').select(sql<number>`COUNT(*)`.as('n')).where('created_at', '>=', b.from).where('created_at', '<', b.to).executeTakeFirst(),
      db().selectFrom('orders').select(['id', 'order_no', 'customer_name', 'total', 'status', 'risk_level', 'created_at', 'district']).where('deleted_at', 'is', null).orderBy('id', 'desc').limit(8).execute(),
      db().selectFrom('customers').select(sql<number>`COUNT(*)`.as('n')).where('created_at', '>=', b.from).where('created_at', '<', b.to).executeTakeFirst(),
      db().selectFrom('orders as o').innerJoin('couriers as c', 'c.id', 'o.courier_id').select(['c.name', sql<number>`COUNT(*)`.as('n')]).where('o.created_at', '>=', b.from).where('o.created_at', '<', b.to).groupBy('c.name').execute(),
    ]);
    const pct = (a: number, p: number) => (p === 0 ? (a > 0 ? 100 : 0) : Math.round(((a - p) / p) * 100));
    return {
      range, from: b.from, to: b.to, bucket: b.bucket,
      kpis: current,
      change: { orders: pct(current.orders, previous.orders), sales: pct(current.sales, previous.sales), revenue: pct(current.revenue, previous.revenue), aov: pct(current.aov, previous.aov) },
      series: series.map((s) => ({ bucket: s.bucket, orders: Number(s.orders), sales: Number(s.sales) })),
      statuses: Object.fromEntries(statusRows.map((s) => [s.status, Number(s.n)])),
      lowStock: Number(lowStock?.n ?? 0),
      outOfStock: Number(outOfStock?.n ?? 0),
      fraudAlerts: Number(fraud?.n ?? 0),
      newCustomers: Number(newCustomers?.n ?? 0),
      couriers: couriers.map((c) => ({ name: c.name, orders: Number(c.n) })),
      recent,
    };
  });
  res.json(data);
});

dashboardRouter.get('/analytics', requirePermission('analytics.view'), async (req, res) => {
  const range = (RANGES.includes(req.query.range as Range) ? req.query.range : '30d') as Range;
  const data = await cache.remember(`dash:analytics:${range}`, 60, async () => {
    const tz = await settings.str('timezone');
    const b = rangeBounds(range, tz);
    const [bestProducts, mostViewed, topCategories, funnel, districts, profit] = await Promise.all([
      db().selectFrom('order_items as i').innerJoin('orders as o', 'o.id', 'i.order_id')
        .select(['i.product_id', 'i.name', sql<number>`SUM(i.quantity)`.as('qty'), sql<number>`SUM(i.line_total)`.as('sales')])
        .where('o.created_at', '>=', b.from).where('o.created_at', '<', b.to).where('o.status', 'not in', ['cancelled', 'returned']).where('o.deleted_at', 'is', null)
        .groupBy(['i.product_id', 'i.name']).orderBy('qty', 'desc').limit(10).execute(),
      db().selectFrom('analytics_events as e').innerJoin('products as p', 'p.id', 'e.product_id')
        .select(['p.id', 'p.name', sql<number>`COUNT(*)`.as('views')])
        .where('e.event', '=', 'view_item').where('e.created_at', '>=', b.from).where('e.created_at', '<', b.to)
        .groupBy(['p.id', 'p.name']).orderBy('views', 'desc').limit(10).execute(),
      db().selectFrom('order_items as i').innerJoin('orders as o', 'o.id', 'i.order_id').innerJoin('products as p', 'p.id', 'i.product_id').innerJoin('categories as c', 'c.id', 'p.category_id')
        .select(['c.id', 'c.name', sql<number>`SUM(i.quantity)`.as('qty'), sql<number>`SUM(i.line_total)`.as('sales')])
        .where('o.created_at', '>=', b.from).where('o.created_at', '<', b.to).where('o.status', 'not in', ['cancelled', 'returned']).where('o.deleted_at', 'is', null)
        .groupBy(['c.id', 'c.name']).orderBy('sales', 'desc').limit(8).execute(),
      db().selectFrom('analytics_events').select(['event', sql<number>`COUNT(DISTINCT COALESCE(session_id, device_hash, id))`.as('n')])
        .where('created_at', '>=', b.from).where('created_at', '<', b.to).where('event', 'in', ['page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase']).groupBy('event').execute(),
      db().selectFrom('orders').select(['district', sql<number>`COUNT(*)`.as('orders'), sql<number>`SUM(total)`.as('sales')])
        .where('created_at', '>=', b.from).where('created_at', '<', b.to).where('deleted_at', 'is', null).groupBy('district').orderBy('orders', 'desc').limit(10).execute(),
      db().selectFrom('order_items as i').innerJoin('orders as o', 'o.id', 'i.order_id')
        .select([sql<number>`SUM(i.line_total)`.as('sales'), sql<number>`SUM(COALESCE(i.cost_price, 0) * i.quantity)`.as('cost'), sql<number>`SUM(i.cost_price IS NULL)`.as('missing_cost')])
        .where('o.created_at', '>=', b.from).where('o.created_at', '<', b.to).where('o.status', '=', 'delivered').where('o.deleted_at', 'is', null).executeTakeFirst(),
    ]);
    const topViewedAllTime = mostViewed.length ? [] : await db().selectFrom('products').select(['id', 'name', 'view_count as views']).where('deleted_at', 'is', null).orderBy('view_count', 'desc').limit(10).execute();
    return {
      range,
      bestProducts: bestProducts.map((p) => ({ ...p, qty: Number(p.qty), sales: Number(p.sales) })),
      mostViewed: (mostViewed.length ? mostViewed : topViewedAllTime).map((p) => ({ ...p, views: Number(p.views) })),
      topCategories: topCategories.map((c) => ({ ...c, qty: Number(c.qty), sales: Number(c.sales) })),
      funnel: Object.fromEntries(funnel.map((f) => [f.event, Number(f.n)])),
      districts: districts.map((d) => ({ ...d, orders: Number(d.orders), sales: Number(d.sales) })),
      profit: { sales: Number(profit?.sales ?? 0), cost: Number(profit?.cost ?? 0), gross: Number(profit?.sales ?? 0) - Number(profit?.cost ?? 0), itemsWithoutCost: Number(profit?.missing_cost ?? 0) },
    };
  });
  res.json(data);
});
