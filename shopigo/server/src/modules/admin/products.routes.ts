import { Router } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import { cache } from '../../core/cache.js';
import { conflict, notFound } from '../../core/errors.js';
import { pageParams, parse, slugify, zBool, zOptionalMoney, zText } from '../../core/validate.js';
import { db, json } from '../../db/index.js';
import { requirePermission } from '../../middleware/auth.js';
import { audit, diff } from '../../services/audit.js';
import { sanitizeHtml } from '../../services/html.js';
import { settings } from '../../services/settings.js';
import { moveToTrash } from '../../services/trash.js';
import { refreshRating } from '../store/store.routes.js';

export const productsRouter = Router();
export const reviewsRouter = Router();

async function invalidate() {
  await cache.del('public:');
  await cache.del('home:');
  await cache.del('flash:');
}

productsRouter.get('/', requirePermission('products.view'), async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, offset } = pageParams(q, 25, 100);
  let base = db().selectFrom('products as p').where('p.deleted_at', 'is', null);
  if (q.status) base = base.where('p.status', '=', q.status);
  if (q.category) base = base.where((eb) => eb.or([eb('p.category_id', '=', Number(q.category)), eb('p.subcategory_id', '=', Number(q.category))]));
  if (q.stock === 'low') base = base.where(sql<boolean>`p.stock <= p.low_stock_threshold`).where('p.stock', '>', 0);
  if (q.stock === 'out') base = base.where('p.stock', '<=', 0);
  if (q.q) {
    const like = `%${q.q.trim().slice(0, 60).replace(/[%_\\]/g, '')}%`;
    base = base.where((eb) => eb.or([eb('p.name', 'like', like), eb('p.sku', 'like', like)]));
  }
  const sortCol = ({ name: 'p.name', price: 'p.price', stock: 'p.stock', sold: 'p.sold_count', views: 'p.view_count' } as const)[q.sort as 'name'] ?? 'p.id';
  const [rows, total] = await Promise.all([
    base.leftJoin('categories as c', 'c.id', 'p.category_id')
      .select(['p.id', 'p.name', 'p.slug', 'p.sku', 'p.price', 'p.sale_price', 'p.stock', 'p.low_stock_threshold', 'p.status', 'p.is_featured', 'p.free_delivery', 'p.sold_count', 'p.view_count', 'p.has_variants', 'p.created_at', 'c.name as category_name'])
      .select((eb) => eb.selectFrom('product_images as i').select('i.path').whereRef('i.product_id', '=', 'p.id').orderBy('i.is_main', 'desc').orderBy('i.sort_order').limit(1).as('image'))
      .orderBy(sortCol, q.dir === 'asc' ? 'asc' : 'desc').limit(limit).offset(offset).execute(),
    base.select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst(),
  ]);
  res.json({ items: rows, total: Number(total?.n ?? 0), page, limit });
});

productsRouter.get('/low-stock', requirePermission('products.view'), async (_req, res) => {
  const rows = await db().selectFrom('products').select(['id', 'name', 'sku', 'stock', 'low_stock_threshold', 'status'])
    .where('deleted_at', 'is', null).where(sql<boolean>`stock <= low_stock_threshold`).orderBy('stock').limit(200).execute();
  res.json(rows);
});

productsRouter.get('/lookup', requirePermission('products.view', 'orders.manage', 'marketing.manage'), async (req, res) => {
  const term = String(req.query.q ?? '').trim().slice(0, 60);
  let q = db().selectFrom('products').select(['id', 'name', 'sku', 'price', 'sale_price', 'stock', 'has_variants']).where('deleted_at', 'is', null);
  if (term) q = q.where((eb) => eb.or([eb('name', 'like', `%${term.replace(/[%_\\]/g, '')}%`), eb('sku', '=', term), eb('id', '=', Number(term) || -1)]));
  const rows = await q.orderBy('sold_count', 'desc').limit(20).execute();
  const variants = rows.length ? await db().selectFrom('product_variants').select(['id', 'product_id', 'size', 'color', 'stock', 'price', 'sale_price']).where('product_id', 'in', rows.map((r) => r.id)).where('is_active', '=', 1).execute() : [];
  res.json(rows.map((r) => ({ ...r, variants: variants.filter((v) => v.product_id === r.id) })));
});

productsRouter.get('/:id', requirePermission('products.view'), async (req, res) => {
  const id = Number(req.params.id);
  const p = await db().selectFrom('products').selectAll().where('id', '=', id).executeTakeFirst();
  if (!p) throw notFound('Product not found');
  const [images, variants] = await Promise.all([
    db().selectFrom('product_images').selectAll().where('product_id', '=', id).orderBy('is_main', 'desc').orderBy('sort_order').orderBy('id').execute(),
    db().selectFrom('product_variants').selectAll().where('product_id', '=', id).orderBy('sort_order').orderBy('id').execute(),
  ]);
  res.json({ ...p, specifications: json.parse(p.specifications, []), images, variants });
});

const variantSchema = z.object({
  id: z.number().int().positive().optional(),
  sku: z.string().trim().max(80).nullable().optional(),
  size: z.string().trim().max(40).nullable().optional(),
  color: z.string().trim().max(60).nullable().optional(),
  color_hex: z.string().trim().regex(/^#[0-9a-fA-F]{3,8}$/).nullable().optional().or(z.literal('')),
  price: zOptionalMoney,
  sale_price: zOptionalMoney,
  stock: z.coerce.number().int().min(0).max(1_000_000),
  is_active: zBool.default(true),
});

const productSchema = z.object({
  name: zText(255).pipe(z.string().min(2)),
  slug: z.string().trim().max(280).optional().nullable(),
  sku: z.string().trim().max(80).optional().nullable(),
  category_id: z.coerce.number().int().positive().nullable().optional(),
  subcategory_id: z.coerce.number().int().positive().nullable().optional(),
  brand_id: z.coerce.number().int().positive().nullable().optional(),
  price: z.coerce.number().min(0).max(100_000_000),
  sale_price: zOptionalMoney,
  cost_price: zOptionalMoney,
  stock: z.coerce.number().int().min(0).max(1_000_000).default(0),
  low_stock_threshold: z.coerce.number().int().min(0).max(100000).optional(),
  weight: zOptionalMoney,
  short_description: zText(1000).nullable().optional(),
  description: z.string().max(200_000).nullable().optional(),
  specifications: z.array(z.object({ label: zText(120), value: zText(500) })).max(60).default([]),
  status: z.enum(['draft', 'active', 'archived']).default('active'),
  is_featured: zBool.default(false),
  is_flash_sale: zBool.default(false),
  is_combo: zBool.default(false),
  free_delivery: zBool.default(false),
  cod_available: zBool.default(true),
  size_required: zBool.optional(),
  seo_title: zText(255).nullable().optional(),
  seo_description: zText(500).nullable().optional(),
  seo_keywords: zText(500).nullable().optional(),
  meta_image: z.string().max(255).nullable().optional(),
  social_image: z.string().max(255).nullable().optional(),
  images: z.array(z.object({ id: z.number().int().positive().optional(), path: z.string().regex(/^[a-z0-9_-]+\/\d{4}\/\d{2}\/[A-Za-z0-9_-]+$/), alt: zText(255).nullable().optional(), width: z.number().int().nullable().optional(), height: z.number().int().nullable().optional() })).max(20).default([]),
  variants: z.array(variantSchema).max(100).default([]),
});

type ProductInput = z.infer<typeof productSchema>;

async function uniqueSlug(base: string, excludeId?: number): Promise<string> {
  let slug = slugify(base);
  for (let i = 2; i < 200; i++) {
    let q = db().selectFrom('products').select('id').where('slug', '=', slug);
    if (excludeId) q = q.where('id', '!=', excludeId);
    if (!(await q.executeTakeFirst())) return slug;
    slug = `${slugify(base)}-${i}`;
  }
  return `${slugify(base)}-${Date.now()}`;
}

function columns(input: ProductInput, slug: string, lowDefault: number) {
  const hasVariants = input.variants.length > 0;
  const stock = hasVariants ? input.variants.filter((v) => v.is_active).reduce((s, v) => s + v.stock, 0) : input.stock;
  return {
    name: input.name,
    slug,
    sku: input.sku || null,
    category_id: input.category_id ?? null,
    subcategory_id: input.subcategory_id ?? null,
    brand_id: input.brand_id ?? null,
    price: input.price,
    sale_price: input.sale_price,
    cost_price: input.cost_price,
    stock,
    low_stock_threshold: input.low_stock_threshold ?? lowDefault,
    weight: input.weight,
    short_description: input.short_description ?? null,
    description: sanitizeHtml(input.description ?? null),
    specifications: JSON.stringify(input.specifications),
    has_variants: hasVariants ? 1 : 0,
    size_required: (input.size_required ?? input.variants.some((v) => v.size)) ? 1 : 0,
    status: input.status,
    is_featured: input.is_featured ? 1 : 0,
    is_flash_sale: input.is_flash_sale ? 1 : 0,
    is_combo: input.is_combo ? 1 : 0,
    free_delivery: input.free_delivery ? 1 : 0,
    cod_available: input.cod_available ? 1 : 0,
    seo_title: input.seo_title ?? null,
    seo_description: input.seo_description ?? null,
    seo_keywords: input.seo_keywords ?? null,
    meta_image: input.meta_image ?? null,
    social_image: input.social_image ?? null,
  };
}

async function syncChildren(productId: number, input: ProductInput) {
  await db().transaction().execute(async (trx) => {
    // images: order in the payload = display order, first = main
    const keep = input.images.map((i) => i.path);
    await trx.deleteFrom('product_images').where('product_id', '=', productId).where((eb) => (keep.length ? eb('path', 'not in', keep) : eb.val(true))).execute();
    const existing = await trx.selectFrom('product_images').select(['id', 'path']).where('product_id', '=', productId).execute();
    for (const [idx, img] of input.images.entries()) {
      const row = existing.find((e) => e.path === img.path);
      const values = { alt: img.alt ?? null, sort_order: idx, is_main: idx === 0 ? 1 : 0 };
      if (row) await trx.updateTable('product_images').set(values).where('id', '=', row.id).execute();
      else await trx.insertInto('product_images').values({ product_id: productId, path: img.path, width: img.width ?? null, height: img.height ?? null, ...values }).execute();
    }
    // variants
    const ids = input.variants.filter((v) => v.id).map((v) => v.id!);
    await trx.deleteFrom('product_variants').where('product_id', '=', productId).where((eb) => (ids.length ? eb('id', 'not in', ids) : eb.val(true))).execute();
    for (const [idx, v] of input.variants.entries()) {
      const values = { sku: v.sku || null, size: v.size || null, color: v.color || null, color_hex: v.color_hex || null, price: v.price, sale_price: v.sale_price, stock: v.stock, is_active: v.is_active ? 1 : 0, sort_order: idx };
      if (v.id) await trx.updateTable('product_variants').set(values).where('id', '=', v.id).where('product_id', '=', productId).execute();
      else await trx.insertInto('product_variants').values({ product_id: productId, ...values }).execute();
    }
  });
}

function skuConflict(err: unknown): never {
  const e = err as { code?: string; message?: string };
  if (e.code === 'ER_DUP_ENTRY') throw conflict(e.message?.includes('sku') ? 'SKU already exists' : 'Slug already exists');
  throw err;
}

productsRouter.post('/', requirePermission('products.manage'), async (req, res) => {
  const input = parse(productSchema, req.body);
  const slug = await uniqueSlug(input.slug || input.name);
  const lowDefault = await settings.num('low_stock_default');
  const result = await db().insertInto('products').values(columns(input, slug, lowDefault)).executeTakeFirstOrThrow().catch(skuConflict);
  const id = Number(result.insertId);
  await syncChildren(id, input);
  await audit(req, { action: 'product.created', targetType: 'product', targetId: id, newValue: { name: input.name, price: input.price, stock: input.stock } });
  await invalidate();
  res.status(201).json({ id, slug });
});

productsRouter.put('/:id', requirePermission('products.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const before = await db().selectFrom('products').selectAll().where('id', '=', id).executeTakeFirst();
  if (!before) throw notFound('Product not found');
  const input = parse(productSchema, req.body);
  const slug = input.slug && input.slug !== before.slug ? await uniqueSlug(input.slug, id) : before.slug;
  const cols = columns(input, slug, before.low_stock_threshold);
  await db().updateTable('products').set(cols).where('id', '=', id).execute().catch(skuConflict);
  await syncChildren(id, input);
  const d = diff(before as unknown as Record<string, unknown>, cols as unknown as Record<string, unknown>);
  await audit(req, { action: 'product.updated', targetType: 'product', targetId: id, oldValue: d.oldValue, newValue: d.newValue });
  await invalidate();
  res.json({ id, slug });
});

productsRouter.patch('/:id', requirePermission('products.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const patch = parse(z.object({
    status: z.enum(['draft', 'active', 'archived']).optional(),
    stock: z.coerce.number().int().min(0).max(1_000_000).optional(),
    price: z.coerce.number().min(0).optional(),
    sale_price: zOptionalMoney.optional(),
    is_featured: zBool.optional(),
    free_delivery: zBool.optional(),
  }), req.body);
  const before = await db().selectFrom('products').selectAll().where('id', '=', id).executeTakeFirst();
  if (!before) throw notFound();
  const set: Record<string, unknown> = { ...patch };
  if (patch.is_featured !== undefined) set.is_featured = patch.is_featured ? 1 : 0;
  if (patch.free_delivery !== undefined) set.free_delivery = patch.free_delivery ? 1 : 0;
  if (patch.stock !== undefined && before.has_variants) delete set.stock; // variant products derive stock
  await db().updateTable('products').set(set).where('id', '=', id).execute();
  const d = diff(before as unknown as Record<string, unknown>, set);
  await audit(req, { action: 'product.updated', targetType: 'product', targetId: id, oldValue: d.oldValue, newValue: d.newValue });
  await invalidate();
  res.json({ ok: true });
});

productsRouter.post('/:id/duplicate', requirePermission('products.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const p = await db().selectFrom('products').selectAll().where('id', '=', id).executeTakeFirst();
  if (!p) throw notFound();
  const { id: _id, created_at: _c, updated_at: _u, deleted_at: _d, rating_avg: _r, rating_count: _rc, view_count: _v, sold_count: _s, ...rest } = p;
  const slug = await uniqueSlug(`${p.slug}-copy`);
  const r = await db().insertInto('products').values({ ...rest, name: `${p.name} (Copy)`, slug, sku: null, status: 'draft' }).executeTakeFirstOrThrow();
  const newId = Number(r.insertId);
  const imgs = await db().selectFrom('product_images').selectAll().where('product_id', '=', id).execute();
  for (const { id: _i, product_id: _p, created_at: _ca, ...img } of imgs) await db().insertInto('product_images').values({ ...img, product_id: newId }).execute();
  const vars = await db().selectFrom('product_variants').selectAll().where('product_id', '=', id).execute();
  for (const { id: _i, product_id: _p, ...v } of vars) await db().insertInto('product_variants').values({ ...v, sku: null, product_id: newId }).execute();
  await audit(req, { action: 'product.duplicated', targetType: 'product', targetId: newId, newValue: { from: id } });
  res.status(201).json({ id: newId });
});

productsRouter.delete('/:id', requirePermission('products.manage'), async (req, res) => {
  await moveToTrash(req, 'product', Number(req.params.id));
  res.json({ ok: true });
});

// ---- reviews moderation
reviewsRouter.get('/', requirePermission('products.view'), async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, offset } = pageParams(q, 30, 100);
  let base = db().selectFrom('product_reviews as r').innerJoin('products as p', 'p.id', 'r.product_id');
  if (q.status === 'pending') base = base.where('r.is_approved', '=', 0);
  if (q.status === 'approved') base = base.where('r.is_approved', '=', 1);
  const rows = await base.select(['r.id', 'r.customer_name', 'r.phone', 'r.rating', 'r.comment', 'r.is_approved', 'r.created_at', 'p.name as product_name', 'p.id as product_id']).orderBy('r.id', 'desc').limit(limit).offset(offset).execute();
  res.json({ items: rows, page });
});

reviewsRouter.post('/:id', requirePermission('products.manage'), async (req, res) => {
  const { action } = parse(z.object({ action: z.enum(['approve', 'reject', 'delete']) }), req.body);
  const id = Number(req.params.id);
  const r = await db().selectFrom('product_reviews').select(['product_id']).where('id', '=', id).executeTakeFirst();
  if (!r) throw notFound();
  if (action === 'delete') await db().deleteFrom('product_reviews').where('id', '=', id).execute();
  else await db().updateTable('product_reviews').set({ is_approved: action === 'approve' ? 1 : 0 }).where('id', '=', id).execute();
  await refreshRating(r.product_id);
  await audit(req, { action: `review.${action}`, targetType: 'review', targetId: id });
  res.json({ ok: true });
});
