import { sql, type SelectQueryBuilder } from 'kysely';
import { cache } from '../core/cache.js';
import { db, json } from '../db/index.js';
import type { DB, Product } from '../db/types.js';

export interface FlashInfo { flashSaleId: number; price: number; endsAt: string; startsAt: string; remaining: number | null; title: string }

/** Active flash-sale prices keyed by product id (cached briefly). */
export async function activeFlashMap(): Promise<Map<number, FlashInfo>> {
  const rows = await cache.remember('flash:active', 20, async () => {
    const now = new Date();
    return db()
      .selectFrom('flash_sale_items as i')
      .innerJoin('flash_sales as f', 'f.id', 'i.flash_sale_id')
      .select(['i.product_id', 'i.sale_price', 'i.stock_limit', 'i.sold_count', 'f.id as flash_sale_id', 'f.ends_at', 'f.starts_at', 'f.title'])
      .where('f.is_active', '=', 1)
      .where('f.starts_at', '<=', now)
      .where('f.ends_at', '>', now)
      .execute();
  });
  const map = new Map<number, FlashInfo>();
  for (const r of rows) {
    const remaining = r.stock_limit == null ? null : Math.max(0, r.stock_limit - r.sold_count);
    if (remaining === 0) continue;
    const existing = map.get(r.product_id);
    if (!existing || Number(r.sale_price) < existing.price) {
      map.set(r.product_id, { flashSaleId: r.flash_sale_id, price: Number(r.sale_price), endsAt: new Date(r.ends_at).toISOString(), startsAt: new Date(r.starts_at).toISOString(), remaining, title: r.title });
    }
  }
  return map;
}

export function basePrice(p: { price: number; sale_price: number | null }): number {
  const sale = p.sale_price == null ? null : Number(p.sale_price);
  return sale != null && sale > 0 && sale < Number(p.price) ? sale : Number(p.price);
}

export function effectivePrice(p: { id: number; price: number; sale_price: number | null }, flash: Map<number, FlashInfo>, variant?: { price: number | null; sale_price: number | null } | null): number {
  const f = flash.get(p.id);
  if (f) return f.price;
  if (variant && (variant.price != null || variant.sale_price != null)) {
    return basePrice({ price: variant.price ?? p.price, sale_price: variant.sale_price });
  }
  return basePrice(p);
}

export async function mainImages(productIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (!productIds.length) return map;
  const rows = await db()
    .selectFrom('product_images')
    .select(['product_id', 'path'])
    .where('product_id', 'in', productIds)
    .orderBy('product_id')
    .orderBy('is_main', 'desc')
    .orderBy('sort_order')
    .orderBy('id')
    .execute();
  for (const r of rows) if (!map.has(r.product_id)) map.set(r.product_id, r.path);
  return map;
}

export type ProductRow = Pick<Product, 'id' | 'name' | 'slug' | 'sku' | 'price' | 'sale_price' | 'stock' | 'rating_avg' | 'rating_count' | 'free_delivery' | 'has_variants' | 'size_required' | 'category_id' | 'is_featured' | 'sold_count' | 'cod_available' | 'low_stock_threshold'>;

export const CARD_COLUMNS = ['p.id', 'p.name', 'p.slug', 'p.sku', 'p.price', 'p.sale_price', 'p.stock', 'p.rating_avg', 'p.rating_count', 'p.free_delivery', 'p.has_variants', 'p.size_required', 'p.category_id', 'p.is_featured', 'p.sold_count', 'p.cod_available', 'p.low_stock_threshold'] as const;

export interface ProductCard {
  id: number;
  name: string;
  slug: string;
  price: number;
  salePrice: number;
  discount: number;
  image: string | null;
  rating: number;
  ratingCount: number;
  stock: number;
  inStock: boolean;
  freeDelivery: boolean;
  hasVariants: boolean;
  sizeRequired: boolean;
  flash: { endsAt: string; remaining: number | null } | null;
}

export async function toCards(rows: ProductRow[]): Promise<ProductCard[]> {
  const [flash, images] = await Promise.all([activeFlashMap(), mainImages(rows.map((r) => r.id))]);
  return rows.map((p) => {
    const sale = effectivePrice(p, flash);
    const price = Number(p.price);
    const f = flash.get(p.id);
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      price,
      salePrice: sale,
      discount: price > sale ? Math.round(((price - sale) / price) * 100) : 0,
      image: images.get(p.id) ?? null,
      rating: Number(p.rating_avg),
      ratingCount: p.rating_count,
      stock: p.stock,
      inStock: p.stock > 0,
      freeDelivery: Boolean(p.free_delivery),
      hasVariants: Boolean(p.has_variants),
      sizeRequired: Boolean(p.size_required),
      flash: f ? { endsAt: f.endsAt, remaining: f.remaining } : null,
    };
  });
}

/** Base query for storefront-visible products. */
export function visibleProducts() {
  return db()
    .selectFrom('products as p')
    .where('p.status', '=', 'active')
    .where('p.deleted_at', 'is', null);
}

export type ProductQuery = SelectQueryBuilder<DB & { p: DB['products'] }, 'p', object>;

export function applySort<T extends SelectQueryBuilder<any, any, any>>(q: T, sort?: string): T {
  switch (sort) {
    case 'price_asc': return q.orderBy(sql`COALESCE(NULLIF(p.sale_price, 0), p.price)`, 'asc').orderBy('p.id', 'desc') as T;
    case 'price_desc': return q.orderBy(sql`COALESCE(NULLIF(p.sale_price, 0), p.price)`, 'desc').orderBy('p.id', 'desc') as T;
    case 'popular': return q.orderBy('p.sold_count', 'desc').orderBy('p.id', 'desc') as T;
    case 'rating': return q.orderBy('p.rating_avg', 'desc').orderBy('p.rating_count', 'desc') as T;
    case 'views': return q.orderBy('p.view_count', 'desc') as T;
    default: return q.orderBy('p.created_at', 'desc').orderBy('p.id', 'desc') as T;
  }
}

/** Full-text search with a LIKE fallback for short / non-latin queries. */
export function applySearch<T extends SelectQueryBuilder<any, any, any>>(q: T, term: string): T {
  const clean = term.trim().slice(0, 100);
  if (!clean) return q;
  const like = `%${clean.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
  const words = clean.split(/\s+/).filter((w) => w.length >= 3 && /^[\p{L}\p{N}]+$/u.test(w));
  if (words.length) {
    const boolean = words.map((w) => `+${w}*`).join(' ');
    return q.where((eb: any) => eb.or([
      sql<boolean>`MATCH(p.name, p.short_description, p.seo_keywords) AGAINST (${boolean} IN BOOLEAN MODE)`,
      eb('p.name', 'like', like),
      eb('p.sku', '=', clean),
    ])) as T;
  }
  return q.where((eb: any) => eb.or([eb('p.name', 'like', like), eb('p.sku', '=', clean)])) as T;
}

export async function categoryTreeIds(categoryId: number): Promise<number[]> {
  const children = await db().selectFrom('categories').select('id').where('parent_id', '=', categoryId).where('deleted_at', 'is', null).execute();
  return [categoryId, ...children.map((c) => c.id)];
}

export function parseSpecs(value: string | null): Array<{ label: string; value: string }> {
  return json.parse<Array<{ label: string; value: string }>>(value, []);
}
