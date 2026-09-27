import { Router } from 'express';
import { z } from 'zod';
import { cache } from '../../core/cache.js';
import { badRequest, conflict, notFound } from '../../core/errors.js';
import { parse, slugify, zBool, zOptionalDate, zOptionalMoney, zText } from '../../core/validate.js';
import { db, json } from '../../db/index.js';
import { requirePermission } from '../../middleware/auth.js';
import { audit } from '../../services/audit.js';
import { sanitizeHtml } from '../../services/html.js';
import { moveToTrash } from '../../services/trash.js';

export const marketingRouter = Router();
const perm = requirePermission('marketing.manage');

async function invalidate() {
  await cache.del('public:');
  await cache.del('home:');
  await cache.del('flash:');
}

function dup(msg: string) {
  return (err: unknown): never => {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') throw conflict(msg);
    throw err;
  };
}

// ------------------------------------------------------------ banners
const bannerSchema = z.object({
  title: zText(160).nullable().optional(),
  subtitle: zText(255).nullable().optional(),
  button_text: zText(40).nullable().optional(),
  image: z.string().min(1).max(255),
  mobile_image: z.string().max(255).nullable().optional(),
  link_type: z.enum(['none', 'url', 'product', 'category']).default('none'),
  link_value: z.string().trim().max(500).nullable().optional(),
  starts_at: zOptionalDate,
  ends_at: zOptionalDate,
  sort_order: z.coerce.number().int().default(0),
  is_active: zBool.default(true),
}).refine((v) => v.link_type !== 'url' || !v.link_value || /^(https?:\/\/|\/)/.test(v.link_value), { message: 'Link must start with https:// or /', path: ['link_value'] });

const bannerValues = (v: z.infer<typeof bannerSchema>) => ({ ...v, title: v.title ?? null, subtitle: v.subtitle ?? null, button_text: v.button_text ?? null, mobile_image: v.mobile_image ?? null, link_value: v.link_value ?? null, is_active: v.is_active ? 1 : 0 });

marketingRouter.get('/banners', perm, async (_req, res) => {
  res.json(await db().selectFrom('banners').selectAll().where('deleted_at', 'is', null).orderBy('sort_order').orderBy('id', 'desc').execute());
});
marketingRouter.post('/banners', perm, async (req, res) => {
  const v = parse(bannerSchema, req.body);
  const r = await db().insertInto('banners').values(bannerValues(v)).executeTakeFirstOrThrow();
  await audit(req, { action: 'banner.created', targetType: 'banner', targetId: Number(r.insertId), newValue: v });
  await invalidate();
  res.status(201).json({ id: Number(r.insertId) });
});
marketingRouter.put('/banners/:id', perm, async (req, res) => {
  const v = parse(bannerSchema, req.body);
  await db().updateTable('banners').set(bannerValues(v)).where('id', '=', Number(req.params.id)).execute();
  await audit(req, { action: 'banner.updated', targetType: 'banner', targetId: Number(req.params.id), newValue: v });
  await invalidate();
  res.json({ ok: true });
});
marketingRouter.delete('/banners/:id', perm, async (req, res) => {
  await moveToTrash(req, 'banner', Number(req.params.id));
  res.json({ ok: true });
});

// ------------------------------------------------------------ coupons
const couponSchema = z.object({
  code: z.string().trim().toUpperCase().min(3).max(40).regex(/^[A-Z0-9_-]+$/, 'Letters, numbers, - and _ only'),
  description: zText(255).nullable().optional(),
  type: z.enum(['percent', 'fixed']),
  value: z.coerce.number().positive().max(10_000_000),
  min_order: z.coerce.number().min(0).default(0),
  max_discount: zOptionalMoney,
  starts_at: zOptionalDate,
  expires_at: zOptionalDate,
  usage_limit: z.union([z.literal(''), z.null(), z.undefined(), z.coerce.number().int().positive()]).transform((v) => (v === '' || v === undefined ? null : v)),
  per_customer_limit: z.union([z.literal(''), z.null(), z.undefined(), z.coerce.number().int().positive()]).transform((v) => (v === '' || v === undefined ? null : v)),
  applies_to: z.enum(['all', 'products', 'categories']).default('all'),
  product_ids: z.array(z.number().int().positive()).default([]),
  category_ids: z.array(z.number().int().positive()).default([]),
  is_active: zBool.default(true),
  highlight_on_home: zBool.default(false),
}).refine((v) => v.type !== 'percent' || v.value <= 100, { message: 'Percentage cannot exceed 100', path: ['value'] });

const couponValues = (v: z.infer<typeof couponSchema>) => ({
  ...v, description: v.description ?? null, product_ids: JSON.stringify(v.product_ids), category_ids: JSON.stringify(v.category_ids),
  is_active: v.is_active ? 1 : 0, highlight_on_home: v.highlight_on_home ? 1 : 0,
});

marketingRouter.get('/coupons', perm, async (_req, res) => {
  const rows = await db().selectFrom('coupons').selectAll().where('deleted_at', 'is', null).orderBy('id', 'desc').execute();
  res.json(rows.map((r) => ({ ...r, product_ids: json.parse(r.product_ids, []), category_ids: json.parse(r.category_ids, []) })));
});
marketingRouter.post('/coupons', perm, async (req, res) => {
  const v = parse(couponSchema, req.body);
  const r = await db().insertInto('coupons').values(couponValues(v)).executeTakeFirstOrThrow().catch(dup('Coupon code already exists'));
  await audit(req, { action: 'coupon.created', targetType: 'coupon', targetId: Number(r.insertId), newValue: v });
  await invalidate();
  res.status(201).json({ id: Number(r.insertId) });
});
marketingRouter.put('/coupons/:id', perm, async (req, res) => {
  const v = parse(couponSchema, req.body);
  await db().updateTable('coupons').set(couponValues(v)).where('id', '=', Number(req.params.id)).execute().catch(dup('Coupon code already exists'));
  await audit(req, { action: 'coupon.updated', targetType: 'coupon', targetId: Number(req.params.id), newValue: v });
  await invalidate();
  res.json({ ok: true });
});
marketingRouter.delete('/coupons/:id', perm, async (req, res) => {
  await moveToTrash(req, 'coupon', Number(req.params.id));
  res.json({ ok: true });
});

// ------------------------------------------------------------ flash sales
const flashSchema = z.object({
  title: zText(160).pipe(z.string().min(2)),
  starts_at: z.coerce.date(),
  ends_at: z.coerce.date(),
  is_active: zBool.default(true),
  items: z.array(z.object({ product_id: z.number().int().positive(), sale_price: z.coerce.number().min(0), stock_limit: z.union([z.literal(''), z.null(), z.undefined(), z.coerce.number().int().positive()]).transform((v) => (v === '' || v === undefined ? null : v)) })).max(200).default([]),
}).refine((v) => v.ends_at > v.starts_at, { message: 'End must be after start', path: ['ends_at'] });

marketingRouter.get('/flash-sales', perm, async (_req, res) => {
  const sales = await db().selectFrom('flash_sales').selectAll().orderBy('starts_at', 'desc').execute();
  const items = sales.length ? await db().selectFrom('flash_sale_items as i').innerJoin('products as p', 'p.id', 'i.product_id').select(['i.id', 'i.flash_sale_id', 'i.product_id', 'i.sale_price', 'i.stock_limit', 'i.sold_count', 'p.name', 'p.price', 'p.stock']).where('i.flash_sale_id', 'in', sales.map((s) => s.id)).execute() : [];
  res.json(sales.map((s) => ({ ...s, items: items.filter((i) => i.flash_sale_id === s.id) })));
});

async function saveFlashItems(id: number, items: z.infer<typeof flashSchema>['items']) {
  await db().transaction().execute(async (trx) => {
    const keep = items.map((i) => i.product_id);
    await trx.deleteFrom('flash_sale_items').where('flash_sale_id', '=', id).where((eb) => (keep.length ? eb('product_id', 'not in', keep) : eb.val(true))).execute();
    for (const it of items) {
      await trx.insertInto('flash_sale_items').values({ flash_sale_id: id, product_id: it.product_id, sale_price: it.sale_price, stock_limit: it.stock_limit })
        .onDuplicateKeyUpdate({ sale_price: it.sale_price, stock_limit: it.stock_limit }).execute();
    }
    await trx.updateTable('products').set({ is_flash_sale: 1 }).where('id', 'in', keep.length ? keep : [-1]).execute();
  });
}

marketingRouter.post('/flash-sales', perm, async (req, res) => {
  const v = parse(flashSchema, req.body);
  const r = await db().insertInto('flash_sales').values({ title: v.title, starts_at: v.starts_at, ends_at: v.ends_at, is_active: v.is_active ? 1 : 0 }).executeTakeFirstOrThrow();
  await saveFlashItems(Number(r.insertId), v.items);
  await audit(req, { action: 'flash_sale.created', targetType: 'flash_sale', targetId: Number(r.insertId), newValue: v });
  await invalidate();
  res.status(201).json({ id: Number(r.insertId) });
});
marketingRouter.put('/flash-sales/:id', perm, async (req, res) => {
  const id = Number(req.params.id);
  const v = parse(flashSchema, req.body);
  await db().updateTable('flash_sales').set({ title: v.title, starts_at: v.starts_at, ends_at: v.ends_at, is_active: v.is_active ? 1 : 0 }).where('id', '=', id).execute();
  await saveFlashItems(id, v.items);
  await audit(req, { action: 'flash_sale.updated', targetType: 'flash_sale', targetId: id, newValue: v });
  await invalidate();
  res.json({ ok: true });
});
marketingRouter.delete('/flash-sales/:id', perm, async (req, res) => {
  const id = Number(req.params.id);
  const sale = await db().selectFrom('flash_sales').select('title').where('id', '=', id).executeTakeFirst();
  if (!sale) throw notFound();
  await db().deleteFrom('flash_sales').where('id', '=', id).execute();
  await audit(req, { action: 'flash_sale.deleted', targetType: 'flash_sale', targetId: id, oldValue: sale });
  await invalidate();
  res.json({ ok: true });
});

// ------------------------------------------------------------ combos
const comboSchema = z.object({
  name: zText(200).pipe(z.string().min(2)),
  slug: z.string().trim().max(220).optional().nullable(),
  description: zText(2000).nullable().optional(),
  image: z.string().max(255).nullable().optional(),
  price: z.coerce.number().positive(),
  is_active: zBool.default(true),
  starts_at: zOptionalDate,
  ends_at: zOptionalDate,
  sort_order: z.coerce.number().int().default(0),
  items: z.array(z.object({ product_id: z.number().int().positive(), quantity: z.coerce.number().int().min(1).max(20) })).min(2, 'A combo needs at least two products').max(20),
});

marketingRouter.get('/combos', perm, async (_req, res) => {
  const combos = await db().selectFrom('combo_offers').selectAll().where('deleted_at', 'is', null).orderBy('sort_order').orderBy('id', 'desc').execute();
  const items = combos.length ? await db().selectFrom('combo_items as i').innerJoin('products as p', 'p.id', 'i.product_id').select(['i.combo_id', 'i.product_id', 'i.quantity', 'p.name', 'p.price', 'p.sale_price', 'p.stock']).where('i.combo_id', 'in', combos.map((c) => c.id)).execute() : [];
  res.json(combos.map((c) => {
    const parts = items.filter((i) => i.combo_id === c.id);
    const regular = parts.reduce((s, p) => s + Number(p.price) * p.quantity, 0);
    return { ...c, items: parts, regular_price: regular, savings: Math.max(0, regular - Number(c.price)) };
  }));
});

async function saveCombo(id: number | null, v: z.infer<typeof comboSchema>) {
  const values = { name: v.name, slug: slugify(v.slug || v.name), description: v.description ?? null, image: v.image ?? null, price: v.price, is_active: v.is_active ? 1 : 0, starts_at: v.starts_at, ends_at: v.ends_at, sort_order: v.sort_order };
  return db().transaction().execute(async (trx) => {
    let comboId = id;
    if (comboId) await trx.updateTable('combo_offers').set(values).where('id', '=', comboId).execute();
    else comboId = Number((await trx.insertInto('combo_offers').values(values).executeTakeFirstOrThrow()).insertId);
    await trx.deleteFrom('combo_items').where('combo_id', '=', comboId).execute();
    for (const it of v.items) await trx.insertInto('combo_items').values({ combo_id: comboId, product_id: it.product_id, quantity: it.quantity }).execute();
    await trx.updateTable('products').set({ is_combo: 1 }).where('id', 'in', v.items.map((i) => i.product_id)).execute();
    return comboId;
  }).catch(dup('A combo with this slug already exists'));
}

marketingRouter.post('/combos', perm, async (req, res) => {
  const v = parse(comboSchema, req.body);
  const id = await saveCombo(null, v);
  await audit(req, { action: 'combo.created', targetType: 'combo', targetId: id, newValue: v });
  await invalidate();
  res.status(201).json({ id });
});
marketingRouter.put('/combos/:id', perm, async (req, res) => {
  const v = parse(comboSchema, req.body);
  await saveCombo(Number(req.params.id), v);
  await audit(req, { action: 'combo.updated', targetType: 'combo', targetId: Number(req.params.id), newValue: v });
  await invalidate();
  res.json({ ok: true });
});
marketingRouter.delete('/combos/:id', perm, async (req, res) => {
  await moveToTrash(req, 'combo', Number(req.params.id));
  res.json({ ok: true });
});

// ------------------------------------------------------------ home sections
marketingRouter.get('/home-sections', perm, async (_req, res) => {
  const rows = await db().selectFrom('home_sections').selectAll().orderBy('sort_order').execute();
  res.json(rows.map((r) => ({ ...r, config: json.parse(r.config, {}) })));
});
marketingRouter.put('/home-sections', perm, async (req, res) => {
  const { sections } = parse(z.object({
    sections: z.array(z.object({
      id: z.number().int().positive(),
      title: zText(120).pipe(z.string().min(1)),
      subtitle: zText(255).nullable().optional(),
      is_enabled: zBool,
      product_limit: z.coerce.number().int().min(1).max(60),
      grid_columns: z.coerce.number().int().min(1).max(6),
      per_page: z.coerce.number().int().min(1).max(60),
    })).max(30),
  }), req.body);
  for (const [i, s] of sections.entries()) {
    await db().updateTable('home_sections').set({ title: s.title, subtitle: s.subtitle ?? null, is_enabled: s.is_enabled ? 1 : 0, product_limit: s.product_limit, grid_columns: s.grid_columns, per_page: s.per_page, sort_order: i + 1 }).where('id', '=', s.id).execute();
  }
  await audit(req, { action: 'home_sections.updated', targetType: 'settings', newValue: sections });
  await invalidate();
  res.json({ ok: true });
});

// ------------------------------------------------------------ delivery rules
const ruleSchema = z.object({
  name: zText(120).pipe(z.string().min(1)),
  type: z.enum(['district', 'min_order_free', 'flat']),
  district: z.string().trim().max(80).nullable().optional(),
  charge: z.coerce.number().min(0).max(100000).default(0),
  min_order: zOptionalMoney,
  priority: z.coerce.number().int().default(0),
  is_active: zBool.default(true),
}).refine((v) => v.type !== 'district' || v.district, { message: 'Select a district', path: ['district'] })
  .refine((v) => v.type !== 'min_order_free' || v.min_order != null, { message: 'Minimum order is required', path: ['min_order'] });

const settingsPerm = requirePermission('settings.manage', 'marketing.manage');
marketingRouter.get('/delivery-rules', settingsPerm, async (_req, res) => {
  res.json(await db().selectFrom('delivery_rules').selectAll().orderBy('priority', 'desc').orderBy('id').execute());
});
marketingRouter.post('/delivery-rules', settingsPerm, async (req, res) => {
  const v = parse(ruleSchema, req.body);
  const r = await db().insertInto('delivery_rules').values({ ...v, district: v.district || null, is_active: v.is_active ? 1 : 0 }).executeTakeFirstOrThrow();
  await audit(req, { action: 'delivery_rule.created', targetType: 'delivery_rule', targetId: Number(r.insertId), newValue: v });
  res.status(201).json({ id: Number(r.insertId) });
});
marketingRouter.put('/delivery-rules/:id', settingsPerm, async (req, res) => {
  const v = parse(ruleSchema, req.body);
  await db().updateTable('delivery_rules').set({ ...v, district: v.district || null, is_active: v.is_active ? 1 : 0 }).where('id', '=', Number(req.params.id)).execute();
  await audit(req, { action: 'delivery_rule.updated', targetType: 'delivery_rule', targetId: Number(req.params.id), newValue: v });
  res.json({ ok: true });
});
marketingRouter.delete('/delivery-rules/:id', settingsPerm, async (req, res) => {
  await db().deleteFrom('delivery_rules').where('id', '=', Number(req.params.id)).execute();
  await audit(req, { action: 'delivery_rule.deleted', targetType: 'delivery_rule', targetId: Number(req.params.id) });
  res.json({ ok: true });
});

// ------------------------------------------------------------ content pages
const pageSchema = z.object({
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers and dashes'),
  title: zText(200).pipe(z.string().min(1)),
  content: z.string().max(500_000).nullable().optional(),
  seo_title: zText(255).nullable().optional(),
  seo_description: zText(500).nullable().optional(),
  is_active: zBool.default(true),
  show_in_footer: zBool.default(true),
});
const pagesPerm = requirePermission('pages.manage', 'settings.manage');
marketingRouter.get('/pages', pagesPerm, async (_req, res) => {
  res.json(await db().selectFrom('pages').selectAll().orderBy('id').execute());
});
marketingRouter.post('/pages', pagesPerm, async (req, res) => {
  const v = parse(pageSchema, req.body);
  const r = await db().insertInto('pages').values({ ...v, content: sanitizeHtml(v.content ?? null), seo_title: v.seo_title ?? null, seo_description: v.seo_description ?? null, is_active: v.is_active ? 1 : 0, show_in_footer: v.show_in_footer ? 1 : 0 }).executeTakeFirstOrThrow().catch(dup('Slug already exists'));
  await audit(req, { action: 'page.created', targetType: 'page', targetId: Number(r.insertId), newValue: { slug: v.slug, title: v.title } });
  await invalidate();
  res.status(201).json({ id: Number(r.insertId) });
});
marketingRouter.put('/pages/:id', pagesPerm, async (req, res) => {
  const v = parse(pageSchema, req.body);
  await db().updateTable('pages').set({ ...v, content: sanitizeHtml(v.content ?? null), seo_title: v.seo_title ?? null, seo_description: v.seo_description ?? null, is_active: v.is_active ? 1 : 0, show_in_footer: v.show_in_footer ? 1 : 0 }).where('id', '=', Number(req.params.id)).execute().catch(dup('Slug already exists'));
  await audit(req, { action: 'page.updated', targetType: 'page', targetId: Number(req.params.id), newValue: { slug: v.slug, title: v.title } });
  await invalidate();
  res.json({ ok: true });
});
marketingRouter.delete('/pages/:id', pagesPerm, async (req, res) => {
  const page = await db().selectFrom('pages').selectAll().where('id', '=', Number(req.params.id)).executeTakeFirst();
  if (!page) throw notFound();
  if (['privacy-policy', 'terms-and-conditions'].includes(page.slug)) throw badRequest('Required pages can be disabled but not deleted');
  await db().deleteFrom('pages').where('id', '=', page.id).execute();
  await audit(req, { action: 'page.deleted', targetType: 'page', targetId: page.id, oldValue: page });
  await invalidate();
  res.json({ ok: true });
});
