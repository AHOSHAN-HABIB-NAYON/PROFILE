import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { sql } from 'kysely';
import { z } from 'zod';
import { cache } from '../../core/cache.js';
import { badRequest, notFound } from '../../core/errors.js';
import { pageParams, parse, zPhone, zText } from '../../core/validate.js';
import { db, json } from '../../db/index.js';
import { CARD_COLUMNS, activeFlashMap, applySearch, applySort, categoryTreeIds, effectivePrice, parseSpecs, toCards, visibleProducts } from '../../services/catalog.js';
import { createOrder, publicOrder } from '../../services/orders.js';
import { quote } from '../../services/pricing.js';
import { clientIp, deviceHash } from '../../services/requestInfo.js';
import { settings } from '../../services/settings.js';
import { gaClientId, trackServer, type ServerEvent } from '../../services/tracking.js';

export const storeRouter = Router();

const here = path.dirname(fileURLToPath(import.meta.url));
let geoCache: unknown = null;
function geo() {
  if (!geoCache) {
    const candidates = [path.join(here, '..', '..', 'data', 'bd-geo.json'), path.join(here, '..', '..', '..', 'src', 'data', 'bd-geo.json')];
    const file = candidates.find((f) => fs.existsSync(f));
    geoCache = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  }
  return geoCache as Array<{ name: string; bn: string; division: string; upazilas: Array<{ name: string; bn: string }> }>;
}

async function ttl() { return Math.max(5, await settings.num('cache_ttl_seconds')); }

function publicCache(res: Response, seconds: number) {
  res.set('Cache-Control', `public, max-age=${Math.min(seconds, 60)}, stale-while-revalidate=${seconds * 5}`);
}

// ------------------------------------------------------------ bootstrap
storeRouter.get('/bootstrap', async (_req, res) => {
  const data = await cache.remember('public:bootstrap', await ttl(), async () => {
    const [s, categories, pages] = await Promise.all([
      settings.public(),
      db().selectFrom('categories').select(['id', 'parent_id', 'name', 'slug', 'icon_type', 'icon_value', 'image']).where('is_active', '=', 1).where('deleted_at', 'is', null).orderBy('sort_order').orderBy('name').execute(),
      db().selectFrom('pages').select(['slug', 'title']).where('is_active', '=', 1).where('show_in_footer', '=', 1).orderBy('id').execute(),
    ]);
    return { settings: s, categories, pages };
  });
  publicCache(res, 60);
  res.json(data);
});

storeRouter.get('/geo', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.json(geo());
});

// ------------------------------------------------------------ home
async function sectionProducts(key: string, limit: number) {
  let q = visibleProducts().select([...CARD_COLUMNS]);
  switch (key) {
    case 'best_selling': q = q.where('p.sold_count', '>', 0).orderBy('p.sold_count', 'desc'); break;
    case 'new_arrivals': q = q.orderBy('p.created_at', 'desc'); break;
    case 'featured': q = q.where('p.is_featured', '=', 1).orderBy('p.updated_at', 'desc'); break;
    case 'free_delivery': q = q.where('p.free_delivery', '=', 1).orderBy('p.sold_count', 'desc'); break;
    case 'recommended': q = q.orderBy(sql`(p.rating_avg * 20 + LEAST(p.view_count, 500) / 10 + LEAST(p.sold_count, 500) / 5)`, 'desc'); break;
    default: return [];
  }
  return toCards(await q.orderBy('p.id', 'desc').limit(limit).execute());
}

storeRouter.get('/home', async (_req, res) => {
  const data = await cache.remember('home:v1', await ttl(), async () => {
    const now = new Date();
    const [sections, banners] = await Promise.all([
      db().selectFrom('home_sections').selectAll().where('is_enabled', '=', 1).orderBy('sort_order').execute(),
      db().selectFrom('banners').select(['id', 'title', 'subtitle', 'button_text', 'image', 'mobile_image', 'link_type', 'link_value'])
        .where('is_active', '=', 1).where('deleted_at', 'is', null)
        .where((eb) => eb.or([eb('starts_at', 'is', null), eb('starts_at', '<=', now)]))
        .where((eb) => eb.or([eb('ends_at', 'is', null), eb('ends_at', '>', now)]))
        .orderBy('sort_order').orderBy('id', 'desc').limit(10).execute(),
    ]);
    const out: Array<Record<string, unknown>> = [];
    for (const s of sections) {
      const base = { key: s.section_key, title: s.title, subtitle: s.subtitle, columns: s.grid_columns, limit: s.product_limit, perPage: s.per_page, config: json.parse(s.config, {}) };
      if (s.section_key === 'categories') {
        out.push(base);
      } else if (s.section_key === 'flash_sale') {
        if (!(await settings.bool('flash_sale_enabled'))) continue;
        const flash = await activeFlashMap();
        if (!flash.size) continue;
        const ids = [...flash.keys()];
        const rows = await visibleProducts().select([...CARD_COLUMNS]).where('p.id', 'in', ids).limit(s.product_limit).execute();
        if (!rows.length) continue;
        const endsAt = [...flash.values()].map((f) => f.endsAt).sort()[0];
        out.push({ ...base, endsAt, products: await toCards(rows) });
      } else if (s.section_key === 'combo_offers') {
        if (!(await settings.bool('combo_enabled'))) continue;
        const combos = await comboList(s.product_limit);
        if (combos.length) out.push({ ...base, combos });
      } else if (s.section_key === 'coupon_highlight') {
        if (!(await settings.bool('coupons_enabled'))) continue;
        const c = await db().selectFrom('coupons').select(['code', 'description', 'type', 'value', 'min_order', 'expires_at'])
          .where('highlight_on_home', '=', 1).where('is_active', '=', 1).where('deleted_at', 'is', null)
          .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', now)]))
          .where((eb) => eb.or([eb('starts_at', 'is', null), eb('starts_at', '<=', now)]))
          .orderBy('id', 'desc').limit(s.product_limit || 1).execute();
        if (c.length) out.push({ ...base, coupons: c });
      } else {
        const products = await sectionProducts(s.section_key, s.product_limit);
        if (products.length) out.push({ ...base, products });
      }
    }
    return { banners, sections: out };
  });
  publicCache(res, 30);
  res.json(data);
});

// ------------------------------------------------------------ products
const listSchema = z.object({
  q: z.string().max(100).optional(),
  category: z.string().max(160).optional(),
  brand: z.string().max(160).optional(),
  sort: z.enum(['new', 'price_asc', 'price_desc', 'popular', 'rating']).optional(),
  section: z.enum(['best_selling', 'new_arrivals', 'featured', 'free_delivery', 'recommended', 'flash_sale']).optional(),
  min: z.coerce.number().min(0).optional(),
  max: z.coerce.number().min(0).optional(),
  in_stock: z.enum(['1', '0']).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
});

storeRouter.get('/products', async (req, res) => {
  const f = parse(listSchema, req.query);
  const perPage = await settings.num('products_per_page');
  const { page, limit, offset } = pageParams(f, perPage || 20, 60);
  const key = `public:products:${JSON.stringify({ ...f, page, limit })}`;
  const data = await cache.remember(key, await ttl(), async () => {
    let q = visibleProducts();
    let category = null as null | { id: number; name: string; slug: string; description: string | null; seo_title: string | null; seo_description: string | null };
    if (f.category) {
      category = (await db().selectFrom('categories').select(['id', 'name', 'slug', 'description', 'seo_title', 'seo_description']).where('slug', '=', f.category).where('deleted_at', 'is', null).executeTakeFirst()) ?? null;
      if (!category) return null;
      const ids = await categoryTreeIds(category.id);
      q = q.where((eb) => eb.or([eb('p.category_id', 'in', ids), eb('p.subcategory_id', 'in', ids)]));
    }
    if (f.brand) {
      const b = await db().selectFrom('brands').select('id').where('slug', '=', f.brand).executeTakeFirst();
      q = q.where('p.brand_id', '=', b?.id ?? -1);
    }
    if (f.q) q = applySearch(q, f.q);
    if (f.min !== undefined) q = q.where(sql`COALESCE(NULLIF(p.sale_price, 0), p.price)`, '>=', f.min);
    if (f.max !== undefined) q = q.where(sql`COALESCE(NULLIF(p.sale_price, 0), p.price)`, '<=', f.max);
    if (f.in_stock === '1') q = q.where('p.stock', '>', 0);
    if (f.section === 'featured') q = q.where('p.is_featured', '=', 1);
    if (f.section === 'free_delivery') q = q.where('p.free_delivery', '=', 1);
    if (f.section === 'flash_sale') {
      const ids = [...(await activeFlashMap()).keys()];
      q = q.where('p.id', 'in', ids.length ? ids : [-1]);
    }
    const sort = f.sort ?? (f.section === 'best_selling' ? 'popular' : f.section === 'recommended' ? 'rating' : 'new');
    const total = await q.select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst();
    const rows = await applySort(q.select([...CARD_COLUMNS]), sort).limit(limit).offset(offset).execute();
    return { category, items: await toCards(rows), total: Number(total?.n ?? 0), page, limit };
  });
  if (!data) throw notFound('Category not found');
  publicCache(res, 30);
  res.json(data);
});

storeRouter.get('/search/suggest', async (req, res) => {
  const term = String(req.query.q ?? '').trim().slice(0, 60);
  if (term.length < 2) { res.json({ products: [], categories: [] }); return; }
  const data = await cache.remember(`public:suggest:${term.toLowerCase()}`, 120, async () => {
    const products = await applySearch(visibleProducts().select([...CARD_COLUMNS]), term).orderBy('p.sold_count', 'desc').limit(6).execute();
    const categories = await db().selectFrom('categories').select(['name', 'slug']).where('name', 'like', `%${term.replace(/[%_\\]/g, '')}%`).where('is_active', '=', 1).where('deleted_at', 'is', null).limit(4).execute();
    return { products: await toCards(products), categories };
  });
  res.json(data);
});

storeRouter.get('/products/:slug', async (req, res) => {
  const slug = String(req.params.slug).slice(0, 280);
  const data = await cache.remember(`public:product:${slug}`, await ttl(), async () => {
    const p = await visibleProducts().selectAll('p').where('p.slug', '=', slug).executeTakeFirst();
    if (!p) return null;
    const [images, variants, category, brand, flash] = await Promise.all([
      db().selectFrom('product_images').select(['id', 'path', 'width', 'height', 'alt']).where('product_id', '=', p.id).orderBy('is_main', 'desc').orderBy('sort_order').orderBy('id').execute(),
      db().selectFrom('product_variants').select(['id', 'sku', 'size', 'color', 'color_hex', 'price', 'sale_price', 'stock']).where('product_id', '=', p.id).where('is_active', '=', 1).orderBy('sort_order').orderBy('id').execute(),
      p.category_id ? db().selectFrom('categories').select(['id', 'name', 'slug']).where('id', '=', p.category_id).executeTakeFirst() : null,
      p.brand_id ? db().selectFrom('brands').select(['id', 'name', 'slug', 'logo']).where('id', '=', p.brand_id).executeTakeFirst() : null,
      activeFlashMap(),
    ]);
    const relatedRows = await visibleProducts().select([...CARD_COLUMNS]).where('p.id', '!=', p.id)
      .where((eb) => (p.category_id ? eb('p.category_id', '=', p.category_id) : eb('p.is_featured', '=', 1)))
      .orderBy('p.sold_count', 'desc').limit(10).execute();
    const f = flash.get(p.id);
    const sale = effectivePrice(p, flash);
    return {
      id: p.id, name: p.name, slug: p.slug, sku: p.sku, price: Number(p.price), salePrice: sale,
      discount: Number(p.price) > sale ? Math.round(((Number(p.price) - sale) / Number(p.price)) * 100) : 0,
      stock: p.stock, inStock: p.stock > 0, lowStock: p.stock > 0 && p.stock <= p.low_stock_threshold,
      shortDescription: p.short_description, description: p.description, specifications: parseSpecs(p.specifications),
      rating: Number(p.rating_avg), ratingCount: p.rating_count, freeDelivery: Boolean(p.free_delivery), codAvailable: Boolean(p.cod_available),
      hasVariants: Boolean(p.has_variants), sizeRequired: Boolean(p.size_required), weight: p.weight,
      images, category, brand,
      variants: variants.map((v) => ({ id: v.id, sku: v.sku, size: v.size, color: v.color, colorHex: v.color_hex, stock: v.stock, price: effectivePrice(p, flash, v), regularPrice: Number(v.price ?? p.price) })),
      flash: f ? { endsAt: f.endsAt, remaining: f.remaining, title: f.title } : null,
      seo: { title: p.seo_title, description: p.seo_description, keywords: p.seo_keywords, image: p.social_image ?? p.meta_image },
      related: await toCards(relatedRows),
      updatedAt: p.updated_at,
    };
  });
  if (!data) throw notFound('Product not found');
  // Throttled view counter: once per visitor per product per 30 minutes.
  const viewer = `${clientIp(req)}:${data.id}`;
  if (!(await cache.get(`view:${viewer}`))) {
    await cache.set(`view:${viewer}`, 1, 1800);
    void db().updateTable('products').set({ view_count: sql`view_count + 1` }).where('id', '=', data.id).execute().catch(() => {});
  }
  publicCache(res, 30);
  res.json(data);
});

storeRouter.get('/products/:slug/reviews', async (req, res) => {
  const { limit, offset, page } = pageParams(req.query as Record<string, unknown>, 10, 30);
  const p = await visibleProducts().select(['p.id']).where('p.slug', '=', String(req.params.slug)).executeTakeFirst();
  if (!p) throw notFound();
  const rows = await db().selectFrom('product_reviews').select(['id', 'customer_name', 'rating', 'comment', 'created_at']).where('product_id', '=', p.id).where('is_approved', '=', 1).orderBy('id', 'desc').limit(limit).offset(offset).execute();
  res.json({ items: rows, page });
});

const reviewLimiter = rateLimit({ windowMs: 3600_000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false });
storeRouter.post('/products/:slug/reviews', reviewLimiter, async (req, res) => {
  if (!(await settings.bool('reviews_enabled'))) throw badRequest('Reviews are disabled');
  const body = parse(z.object({ name: zText(120).pipe(z.string().min(2)), phone: zPhone.optional(), rating: z.coerce.number().int().min(1).max(5), comment: zText(2000).optional() }), req.body);
  const p = await visibleProducts().select(['p.id']).where('p.slug', '=', String(req.params.slug)).executeTakeFirst();
  if (!p) throw notFound();
  const approved = await settings.bool('reviews_auto_approve');
  await db().insertInto('product_reviews').values({ product_id: p.id, customer_name: body.name, phone: body.phone ?? null, rating: body.rating, comment: body.comment ?? null, is_approved: approved ? 1 : 0 }).execute();
  if (approved) await refreshRating(p.id);
  res.json({ ok: true, pending: !approved });
});

export async function refreshRating(productId: number) {
  const r = await db().selectFrom('product_reviews').select([sql<number>`AVG(rating)`.as('avg'), sql<number>`COUNT(*)`.as('n')]).where('product_id', '=', productId).where('is_approved', '=', 1).executeTakeFirst();
  await db().updateTable('products').set({ rating_avg: Number(r?.avg ?? 0), rating_count: Number(r?.n ?? 0) } as never).where('id', '=', productId).execute();
  await cache.del('public:');
}

// ------------------------------------------------------------ categories / brands / pages
storeRouter.get('/categories', async (_req, res) => {
  const data = await cache.remember('public:categories', await ttl(), async () => {
    const cats = await db().selectFrom('categories as c')
      .select(['c.id', 'c.parent_id', 'c.name', 'c.slug', 'c.icon_type', 'c.icon_value', 'c.image', 'c.description'])
      .select((eb) => eb.selectFrom('products as p').select((e) => e.fn.countAll<number>().as('n'))
        .where('p.status', '=', 'active').where('p.deleted_at', 'is', null)
        .where((w) => w.or([w('p.category_id', '=', w.ref('c.id')), w('p.subcategory_id', '=', w.ref('c.id'))])).as('product_count'))
      .where('c.is_active', '=', 1).where('c.deleted_at', 'is', null).orderBy('c.sort_order').orderBy('c.name').execute();
    // representative image: first product image of the category when no category image
    const out = [];
    for (const c of cats) {
      let image = c.image;
      if (!image) {
        const img = await db().selectFrom('product_images as i').innerJoin('products as p', 'p.id', 'i.product_id').select('i.path')
          .where((w) => w.or([w('p.category_id', '=', c.id), w('p.subcategory_id', '=', c.id)])).where('p.status', '=', 'active').where('p.deleted_at', 'is', null)
          .orderBy('p.sold_count', 'desc').orderBy('i.is_main', 'desc').limit(1).executeTakeFirst();
        image = img?.path ?? null;
      }
      out.push({ ...c, image, product_count: Number(c.product_count ?? 0) });
    }
    return out;
  });
  publicCache(res, 60);
  res.json(data);
});

storeRouter.get('/brands', async (_req, res) => {
  const data = await cache.remember('public:brands', await ttl(), () =>
    db().selectFrom('brands').select(['id', 'name', 'slug', 'logo']).where('is_active', '=', 1).where('deleted_at', 'is', null).orderBy('sort_order').orderBy('name').execute());
  publicCache(res, 60);
  res.json(data);
});

storeRouter.get('/pages/:slug', async (req, res) => {
  const page = await db().selectFrom('pages').select(['slug', 'title', 'content', 'seo_title', 'seo_description', 'updated_at']).where('slug', '=', String(req.params.slug)).where('is_active', '=', 1).executeTakeFirst();
  if (!page) throw notFound('Page not found');
  publicCache(res, 60);
  res.json(page);
});

// ------------------------------------------------------------ combos & flash
async function comboList(limit = 50, slug?: string) {
  const now = new Date();
  let q = db().selectFrom('combo_offers').selectAll().where('is_active', '=', 1).where('deleted_at', 'is', null)
    .where((eb) => eb.or([eb('starts_at', 'is', null), eb('starts_at', '<=', now)]))
    .where((eb) => eb.or([eb('ends_at', 'is', null), eb('ends_at', '>', now)]));
  if (slug) q = q.where('slug', '=', slug);
  const combos = await q.orderBy('sort_order').orderBy('id', 'desc').limit(limit).execute();
  if (!combos.length) return [];
  const items = await db().selectFrom('combo_items as ci').innerJoin('products as p', 'p.id', 'ci.product_id')
    .select(['ci.combo_id', 'ci.quantity', ...CARD_COLUMNS]).where('ci.combo_id', 'in', combos.map((c) => c.id)).execute();
  const cards = await toCards(items);
  return combos.map((c) => {
    const parts = items.map((it, idx) => ({ it, card: cards[idx]! })).filter((x) => x.it.combo_id === c.id);
    const regular = parts.reduce((s, x) => s + x.card.price * x.it.quantity, 0);
    const available = parts.length > 0 && parts.every((x) => x.card.stock >= x.it.quantity);
    return {
      id: c.id, name: c.name, slug: c.slug, description: c.description, image: c.image ?? parts[0]?.card.image ?? null, price: Number(c.price),
      regularPrice: regular, savings: Math.max(0, regular - Number(c.price)), available, endsAt: c.ends_at,
      items: parts.map((x) => ({ ...x.card, quantity: x.it.quantity })),
    };
  });
}

storeRouter.get('/combos', async (_req, res) => {
  if (!(await settings.bool('combo_enabled'))) { res.json([]); return; }
  res.json(await cache.remember('public:combos', await ttl(), () => comboList(50)));
});

storeRouter.get('/combos/:slug', async (req, res) => {
  const [combo] = await comboList(1, String(req.params.slug));
  if (!combo) throw notFound('Combo offer not found');
  res.json(combo);
});

// ------------------------------------------------------------ cart / checkout
const cartItem = z.object({
  productId: z.coerce.number().int().positive().optional(),
  variantId: z.coerce.number().int().positive().nullable().optional(),
  comboId: z.coerce.number().int().positive().optional(),
  qty: z.coerce.number().int().min(1).max(100),
}).refine((v) => Boolean(v.productId) !== Boolean(v.comboId), 'Each item needs a productId or a comboId');

const quoteSchema = z.object({ items: z.array(cartItem).max(50), couponCode: z.string().trim().max(40).optional().nullable(), district: z.string().trim().max(80).optional().nullable() });

const quoteLimiter = rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: 'draft-7', legacyHeaders: false });
storeRouter.post('/cart/quote', quoteLimiter, async (req, res) => {
  const body = parse(quoteSchema, req.body);
  res.json(await quote(body.items, { couponCode: body.couponCode, district: body.district }));
});

const checkoutSchema = z.object({
  name: zText(120).pipe(z.string().min(2, 'আপনার নাম লিখুন')),
  phone: zPhone,
  district: z.string().trim().min(2).max(80),
  upazila: z.string().trim().min(2, 'উপজেলা/থানা নির্বাচন করুন').max(80),
  address: zText(500).pipe(z.string().min(5, 'সম্পূর্ণ ঠিকানা লিখুন')),
  note: zText(1000).optional().nullable(),
  couponCode: z.string().trim().max(40).optional().nullable(),
  items: z.array(cartItem).min(1).max(50),
  device: z.string().max(256).optional().nullable(),
  eventId: z.string().max(80).optional().nullable(),
  fbp: z.string().max(200).optional().nullable(),
  fbc: z.string().max(300).optional().nullable(),
});

const checkoutLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many attempts. Please wait a few minutes.' } });
storeRouter.post('/checkout', checkoutLimiter, async (req, res) => {
  const input = parse(checkoutSchema, req.body);
  const districts = geo();
  const d = districts.find((x) => x.name.toLowerCase() === input.district.toLowerCase());
  if (!d) throw badRequest('জেলা নির্বাচন করুন');
  input.district = d.name;
  const { order } = await createOrder(req, input);
  res.status(201).json({ orderNo: order.order_no, token: order.public_token, total: Number(order.total) });
});

storeRouter.get('/orders/:orderNo', async (req, res) => {
  const token = String(req.query.token ?? '');
  if (token.length < 20) throw notFound('Order not found');
  res.set('Cache-Control', 'no-store');
  res.json(await publicOrder(String(req.params.orderNo), token));
});

const trackLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
storeRouter.post('/track', trackLimiter, async (req, res) => {
  const { orderNo, phone } = parse(z.object({ orderNo: z.string().trim().toUpperCase().max(24), phone: zPhone }), req.body);
  const o = await db().selectFrom('orders').select(['id', 'order_no', 'status', 'total', 'created_at', 'tracking_code', 'courier_id', 'courier_status', 'item_count']).where('order_no', '=', orderNo).where('phone', '=', phone).where('deleted_at', 'is', null).executeTakeFirst();
  if (!o) throw notFound('অর্ডার পাওয়া যায়নি। অর্ডার আইডি ও মোবাইল নম্বর যাচাই করুন।');
  const history = await db().selectFrom('order_status_history as h').innerJoin('order_statuses as s', 's.code', 'h.to_status').select(['h.to_status', 's.label', 's.label_bn', 'h.created_at']).where('h.order_id', '=', o.id).orderBy('h.id').execute();
  const statuses = await db().selectFrom('order_statuses').selectAll().orderBy('sort_order').execute();
  const courier = o.courier_id ? await db().selectFrom('couriers').select('name').where('id', '=', o.courier_id).executeTakeFirst() : null;
  res.json({ orderNo: o.order_no, status: o.status, total: Number(o.total), itemCount: o.item_count, createdAt: o.created_at, trackingCode: o.tracking_code, courier: courier?.name ?? null, courierStatus: o.courier_status, history, statuses });
});

// Returning-customer autofill. Full address is only returned to the same
// device that used it before; otherwise just non-sensitive hints.
const lookupLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false });
storeRouter.post('/customers/lookup', lookupLimiter, async (req, res) => {
  const { phone, device } = parse(z.object({ phone: zPhone, device: z.string().max(256).optional().nullable() }), req.body);
  res.set('Cache-Control', 'no-store');
  const customer = await db().selectFrom('customers').select(['id', 'name', 'is_blocked']).where('phone', '=', phone).executeTakeFirst();
  if (!customer || customer.is_blocked) { res.json({ found: false }); return; }
  const addresses = await db().selectFrom('addresses').select(['name', 'district', 'upazila', 'address', 'device_hash']).where('customer_id', '=', customer.id).orderBy('last_used_at', 'desc').limit(3).execute();
  const dh = deviceHash(req, device);
  const sameDevice = Boolean(dh && addresses.some((a) => a.device_hash === dh));
  const latest = addresses[0];
  if (!latest) { res.json({ found: false }); return; }
  if (sameDevice) {
    res.json({ found: true, trusted: true, suggestions: addresses.filter((a) => a.device_hash === dh).map(({ device_hash: _d, ...a }) => a) });
    return;
  }
  const masked = customer.name.split(/\s+/).map((w, i) => (i === 0 ? w : w[0] + '•••')).join(' ');
  res.json({ found: true, trusted: false, suggestions: [{ name: masked, district: latest.district, upazila: latest.upazila, address: '' }] });
});

// ------------------------------------------------------------ analytics beacon
const EVENT_MAP: Record<string, ServerEvent['name']> = { page_view: 'PageView', view_item: 'ViewContent', search: 'Search', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout' };
const eventSchema = z.object({
  event: z.enum(['page_view', 'view_item', 'search', 'add_to_cart', 'begin_checkout', 'view_category']),
  sessionId: z.string().max(64).optional(),
  device: z.string().max(256).optional(),
  productId: z.coerce.number().int().positive().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  value: z.coerce.number().min(0).max(1e8).optional(),
  term: z.string().max(100).optional(),
  path: z.string().max(300).optional(),
  eventId: z.string().max(80).optional(),
  fbp: z.string().max(200).optional(),
  fbc: z.string().max(300).optional(),
  qty: z.coerce.number().int().min(1).max(100).optional(),
});

const eventLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false });
storeRouter.post('/events', eventLimiter, async (req, res) => {
  // sendBeacon posts text/plain
  const raw = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  const e = parse(eventSchema, raw);
  const ip = clientIp(req);
  await db().insertInto('analytics_events').values({
    event: e.event, session_id: e.sessionId ?? null, device_hash: deviceHash(req, e.device), product_id: e.productId ?? null, category_id: e.categoryId ?? null,
    value: e.value ?? null, meta: json.stringify({ term: e.term, path: e.path }), ip,
  }).execute();
  const name = EVENT_MAP[e.event];
  if (name && e.eventId) {
    trackServer({
      name, eventId: e.eventId, url: e.path, ip, userAgent: req.get('user-agent') ?? null, fbp: e.fbp, fbc: e.fbc, gaClientId: gaClientId(req.cookies?._ga),
      value: e.value, currency: await settings.str('currency'), searchTerm: e.term,
      contents: e.productId ? [{ id: String(e.productId), quantity: e.qty ?? 1, price: e.value }] : undefined,
    });
  }
  res.status(204).end();
});
