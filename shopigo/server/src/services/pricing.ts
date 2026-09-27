import { db, json } from '../db/index.js';
import type { Coupon } from '../db/types.js';
import { activeFlashMap, effectivePrice, mainImages } from './catalog.js';
import { settings } from './settings.js';

/**
 * The single source of truth for prices. The browser only sends ids and
 * quantities — every amount shown in the cart, at checkout and stored on the
 * order is computed here.
 */
export interface CartInput { productId?: number; variantId?: number | null; comboId?: number; qty: number }

export interface QuoteLine {
  key: string;
  type: 'product' | 'combo';
  productId: number | null;
  variantId: number | null;
  comboId: number | null;
  name: string;
  slug: string | null;
  image: string | null;
  sku: string | null;
  size: string | null;
  color: string | null;
  unitPrice: number;
  regularPrice: number;
  costPrice: number | null;
  qty: number;
  lineTotal: number;
  maxQty: number;
  freeDelivery: boolean;
  categoryId: number | null;
  flashSaleId: number | null;
  comboItems?: Array<{ productId: number; qty: number; name: string }>;
  error?: string;
}

export interface Quote {
  lines: QuoteLine[];
  itemCount: number;
  subtotal: number;
  discount: number;
  deliveryCharge: number | null;
  deliveryOptions: { insideDhaka: number; outsideDhaka: number };
  freeDelivery: boolean;
  total: number;
  coupon: { id: number; code: string; description: string | null } | null;
  couponError: string | null;
  errors: string[];
}

const round = (n: number) => Math.round(n * 100) / 100;

export async function quote(items: CartInput[], opts: { couponCode?: string | null; district?: string | null; phone?: string | null } = {}): Promise<Quote> {
  const maxQtySetting = Math.max(1, await settings.num('max_order_quantity'));
  const flash = await activeFlashMap();
  const errors: string[] = [];
  const lines: QuoteLine[] = [];

  const productIds = [...new Set(items.filter((i) => i.productId).map((i) => i.productId!))];
  const variantIds = [...new Set(items.filter((i) => i.variantId).map((i) => i.variantId!))];
  const comboIds = [...new Set(items.filter((i) => i.comboId).map((i) => i.comboId!))];

  const [products, variants, combos] = await Promise.all([
    productIds.length
      ? db().selectFrom('products').selectAll().where('id', 'in', productIds).where('deleted_at', 'is', null).where('status', '=', 'active').execute()
      : Promise.resolve([]),
    variantIds.length ? db().selectFrom('product_variants').selectAll().where('id', 'in', variantIds).where('is_active', '=', 1).execute() : Promise.resolve([]),
    comboIds.length && (await settings.bool('combo_enabled'))
      ? db().selectFrom('combo_offers').selectAll().where('id', 'in', comboIds).where('is_active', '=', 1).where('deleted_at', 'is', null).execute()
      : Promise.resolve([]),
  ]);
  const comboItems = combos.length
    ? await db()
        .selectFrom('combo_items as ci')
        .innerJoin('products as p', 'p.id', 'ci.product_id')
        .select(['ci.combo_id', 'ci.product_id', 'ci.quantity', 'p.name', 'p.stock', 'p.price', 'p.sale_price', 'p.status', 'p.deleted_at', 'p.cost_price', 'p.category_id'])
        .where('ci.combo_id', 'in', combos.map((c) => c.id))
        .execute()
    : [];
  const images = await mainImages([...productIds, ...comboItems.map((c) => c.product_id)]);
  const pMap = new Map(products.map((p) => [p.id, p]));
  const vMap = new Map(variants.map((v) => [v.id, v]));
  const cMap = new Map(combos.map((c) => [c.id, c]));

  // Merge duplicate lines
  const merged = new Map<string, CartInput>();
  for (const it of items) {
    const key = it.comboId ? `c${it.comboId}` : `p${it.productId}-${it.variantId ?? 0}`;
    const prev = merged.get(key);
    merged.set(key, { ...it, qty: (prev?.qty ?? 0) + it.qty });
  }

  // Track stock consumed across lines (same product in a combo and as a single item).
  const stockUse = new Map<number, number>();

  for (const [key, it] of merged) {
    const qty = Math.max(1, Math.min(Math.floor(it.qty), maxQtySetting));
    if (it.comboId) {
      const combo = cMap.get(it.comboId);
      const now = Date.now();
      if (!combo || (combo.starts_at && new Date(combo.starts_at).getTime() > now) || (combo.ends_at && new Date(combo.ends_at).getTime() < now)) {
        errors.push('A combo offer in your cart is no longer available');
        lines.push(emptyLine(key, 'combo', { comboId: it.comboId, name: combo?.name ?? 'Combo offer', qty, error: 'Unavailable' }));
        continue;
      }
      const parts = comboItems.filter((c) => c.combo_id === combo.id);
      let maxQty = maxQtySetting;
      let error: string | undefined;
      let regular = 0;
      let cost = 0;
      for (const part of parts) {
        if (part.status !== 'active' || part.deleted_at) { error = 'Unavailable'; continue; }
        maxQty = Math.min(maxQty, Math.floor(part.stock / part.quantity));
        regular += Number(part.price) * part.quantity;
        cost += Number(part.cost_price ?? 0) * part.quantity;
      }
      if (!parts.length) error = 'Unavailable';
      if (!error && qty > maxQty) error = maxQty <= 0 ? 'Out of stock' : `Only ${maxQty} available`;
      if (!error) for (const part of parts) stockUse.set(part.product_id, (stockUse.get(part.product_id) ?? 0) + part.quantity * qty);
      if (error) errors.push(`${combo.name}: ${error}`);
      lines.push({
        key, type: 'combo', productId: null, variantId: null, comboId: combo.id,
        name: combo.name, slug: combo.slug, image: combo.image ?? (parts[0] ? images.get(parts[0].product_id) ?? null : null), sku: null, size: null, color: null,
        unitPrice: Number(combo.price), regularPrice: round(regular), costPrice: round(cost), qty, lineTotal: error ? 0 : round(Number(combo.price) * qty), maxQty: Math.max(0, maxQty),
        freeDelivery: false, categoryId: parts[0]?.category_id ?? null, flashSaleId: null,
        comboItems: parts.map((p) => ({ productId: p.product_id, qty: p.quantity, name: p.name })), error,
      });
      continue;
    }

    const p = it.productId ? pMap.get(it.productId) : undefined;
    if (!p) {
      errors.push('A product in your cart is no longer available');
      lines.push(emptyLine(key, 'product', { productId: it.productId ?? null, name: 'Unavailable product', qty, error: 'Unavailable' }));
      continue;
    }
    const v = it.variantId ? vMap.get(it.variantId) : null;
    let error: string | undefined;
    if (it.variantId && (!v || v.product_id !== p.id)) error = 'Selected option is no longer available';
    if (!v && p.size_required) error = 'Please select a size';
    const stock = v ? v.stock : p.stock;
    const used = stockUse.get(p.id) ?? 0;
    const f = flash.get(p.id);
    let maxQty = Math.min(maxQtySetting, stock - (v ? 0 : used));
    if (f?.remaining != null) maxQty = Math.min(maxQty, f.remaining);
    if (!error && qty > maxQty) error = maxQty <= 0 ? 'Out of stock' : `Only ${maxQty} available`;
    if (!error && !v) stockUse.set(p.id, used + qty);
    const unit = effectivePrice(p, flash, v);
    if (error) errors.push(`${p.name}: ${error}`);
    lines.push({
      key, type: 'product', productId: p.id, variantId: v?.id ?? null, comboId: null,
      name: p.name, slug: p.slug, image: images.get(p.id) ?? null, sku: v?.sku ?? p.sku, size: v?.size ?? null, color: v?.color ?? null,
      unitPrice: unit, regularPrice: Number(v?.price ?? p.price), costPrice: p.cost_price != null ? Number(p.cost_price) : null,
      qty, lineTotal: error ? 0 : round(unit * qty), maxQty: Math.max(0, maxQty),
      freeDelivery: Boolean(p.free_delivery), categoryId: p.category_id, flashSaleId: f?.flashSaleId ?? null, error,
    });
  }

  const valid = lines.filter((l) => !l.error);
  const subtotal = round(valid.reduce((s, l) => s + l.lineTotal, 0));
  const itemCount = valid.reduce((s, l) => s + l.qty, 0);

  // Coupon
  let discount = 0;
  let coupon: Quote['coupon'] = null;
  let couponError: string | null = null;
  if (opts.couponCode) {
    const result = await applyCoupon(opts.couponCode, valid, subtotal, opts.phone ?? null);
    if ('error' in result) couponError = result.error;
    else { discount = result.discount; coupon = { id: result.coupon.id, code: result.coupon.code, description: result.coupon.description }; }
  }

  const delivery = await deliveryCharge({ district: opts.district ?? null, subtotal, lines: valid });
  const total = round(Math.max(0, subtotal - discount) + (delivery.charge ?? 0));
  return {
    lines, itemCount, subtotal, discount, deliveryCharge: valid.length ? delivery.charge : 0, deliveryOptions: delivery.options, freeDelivery: delivery.free,
    total, coupon, couponError, errors,
  };
}

function emptyLine(key: string, type: 'product' | 'combo', partial: Partial<QuoteLine>): QuoteLine {
  return {
    key, type, productId: null, variantId: null, comboId: null, name: '', slug: null, image: null, sku: null, size: null, color: null,
    unitPrice: 0, regularPrice: 0, costPrice: null, qty: 1, lineTotal: 0, maxQty: 0, freeDelivery: false, categoryId: null, flashSaleId: null, ...partial,
  };
}

// ---------------------------------------------------------------- delivery

export async function deliveryCharge(input: { district: string | null; subtotal: number; lines: QuoteLine[] }): Promise<{ charge: number | null; free: boolean; options: { insideDhaka: number; outsideDhaka: number } }> {
  const inside = await settings.num('delivery_inside_dhaka');
  const outside = await settings.num('delivery_outside_dhaka');
  const options = { insideDhaka: inside, outsideDhaka: outside };
  const freeMin = await settings.num('free_delivery_min_order');
  const allFree = input.lines.length > 0 && input.lines.every((l) => l.freeDelivery);
  if (allFree || (freeMin > 0 && input.subtotal >= freeMin)) return { charge: 0, free: true, options };

  const rules = await db().selectFrom('delivery_rules').selectAll().where('is_active', '=', 1).orderBy('priority', 'desc').orderBy('id').execute();
  const district = input.district?.trim().toLowerCase() ?? null;
  for (const rule of rules) {
    const matchesDistrict = !rule.district || (district !== null && rule.district.toLowerCase() === district);
    if (rule.type === 'min_order_free' && matchesDistrict && rule.min_order != null && input.subtotal >= Number(rule.min_order)) {
      return { charge: 0, free: true, options };
    }
  }
  if (!district) return { charge: null, free: false, options };
  for (const rule of rules) {
    if (rule.type === 'district' && rule.district && rule.district.toLowerCase() === district) return { charge: Number(rule.charge), free: Number(rule.charge) === 0, options };
  }
  const flat = rules.find((r) => r.type === 'flat');
  if (flat) return { charge: Number(flat.charge), free: Number(flat.charge) === 0, options };
  const dhaka = (await settings.get<string[]>('dhaka_districts')) ?? ['Dhaka'];
  const isInside = dhaka.some((d) => d.toLowerCase() === district);
  return { charge: isInside ? inside : outside, free: false, options };
}

// ---------------------------------------------------------------- coupons

export async function applyCoupon(code: string, lines: QuoteLine[], subtotal: number, phone: string | null): Promise<{ coupon: Coupon; discount: number } | { error: string }> {
  if (!(await settings.bool('coupons_enabled'))) return { error: 'Coupons are currently disabled' };
  const coupon = await db().selectFrom('coupons').selectAll().where('code', '=', code.trim().toUpperCase()).where('deleted_at', 'is', null).executeTakeFirst();
  if (!coupon || !coupon.is_active) return { error: 'কুপন কোডটি সঠিক নয়' };
  const now = Date.now();
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) return { error: 'This coupon is not active yet' };
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < now) return { error: 'কুপনের মেয়াদ শেষ হয়ে গেছে' };
  if (coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit) return { error: 'This coupon has reached its usage limit' };
  if (phone && coupon.per_customer_limit != null) {
    const used = await db().selectFrom('coupon_usage').select((eb) => eb.fn.countAll<number>().as('n')).where('coupon_id', '=', coupon.id).where('phone', '=', phone).executeTakeFirst();
    if (Number(used?.n ?? 0) >= coupon.per_customer_limit) return { error: 'You have already used this coupon' };
  }
  let eligible = subtotal;
  if (coupon.applies_to === 'products') {
    const ids = json.parse<number[]>(coupon.product_ids, []);
    eligible = lines.filter((l) => l.productId && ids.includes(l.productId)).reduce((s, l) => s + l.lineTotal, 0);
  } else if (coupon.applies_to === 'categories') {
    const ids = json.parse<number[]>(coupon.category_ids, []);
    eligible = lines.filter((l) => l.categoryId && ids.includes(l.categoryId)).reduce((s, l) => s + l.lineTotal, 0);
  }
  if (eligible <= 0) return { error: 'This coupon does not apply to the items in your cart' };
  if (subtotal < Number(coupon.min_order)) return { error: `সর্বনিম্ন ৳${Number(coupon.min_order)} অর্ডারে কুপন প্রযোজ্য` };
  let discount = coupon.type === 'percent' ? (eligible * Number(coupon.value)) / 100 : Number(coupon.value);
  if (coupon.max_discount != null) discount = Math.min(discount, Number(coupon.max_discount));
  discount = Math.round(Math.min(discount, eligible));
  return { coupon, discount };
}
