import type { Kysely } from 'kysely';
import { SETTINGS } from '../services/settings.js';
import type { DB } from './types.js';

/**
 * Idempotent default data. Safe to call on install AND after every update:
 * it only inserts rows that do not exist yet and never overwrites anything
 * the store owner has changed.
 */

export const PERMISSIONS: Array<[slug: string, name: string, group: string]> = [
  ['dashboard.view', 'View dashboard', 'Dashboard'],
  ['orders.view', 'View orders', 'Orders'],
  ['orders.manage', 'Create / edit / change order status', 'Orders'],
  ['orders.delete', 'Delete orders', 'Orders'],
  ['courier.send', 'Send orders to courier', 'Orders'],
  ['products.view', 'View products', 'Catalog'],
  ['products.manage', 'Manage products', 'Catalog'],
  ['catalog.manage', 'Manage categories & brands', 'Catalog'],
  ['marketing.manage', 'Manage banners, coupons, flash sales, combos & home sections', 'Marketing'],
  ['customers.view', 'View customers', 'Customers'],
  ['customers.manage', 'Manage customers', 'Customers'],
  ['couriers.manage', 'Manage courier integrations', 'Couriers'],
  ['fraud.manage', 'Manage fraud protection & blocks', 'Security'],
  ['analytics.view', 'View analytics & reports', 'Analytics'],
  ['settings.manage', 'Change site settings', 'Settings'],
  ['pages.manage', 'Manage content pages', 'Settings'],
  ['admins.manage', 'Manage administrators & roles', 'System'],
  ['system.manage', 'Backups, updates & maintenance', 'System'],
  ['trash.manage', 'Restore / permanently delete trash', 'System'],
  ['audit.view', 'View activity log', 'System'],
];

export const ROLES: Array<{ slug: string; name: string; permissions: string[] | '*' }> = [
  { slug: 'super_admin', name: 'Super Admin', permissions: '*' },
  {
    slug: 'admin',
    name: 'Administrator',
    permissions: PERMISSIONS.map((p) => p[0]).filter((p) => !['admins.manage', 'system.manage'].includes(p)),
  },
  {
    slug: 'manager',
    name: 'Store Manager',
    permissions: ['dashboard.view', 'orders.view', 'orders.manage', 'courier.send', 'products.view', 'products.manage', 'catalog.manage', 'marketing.manage', 'customers.view', 'analytics.view'],
  },
  { slug: 'order_staff', name: 'Order Staff', permissions: ['dashboard.view', 'orders.view', 'orders.manage', 'courier.send', 'customers.view', 'products.view'] },
];

export const ORDER_STATUSES = [
  { code: 'new', label: 'New', label_bn: 'নতুন', color: '#2563EB', sort_order: 1, is_final: 0 },
  { code: 'pending', label: 'Pending', label_bn: 'অপেক্ষমাণ', color: '#D97706', sort_order: 2, is_final: 0 },
  { code: 'confirmed', label: 'Confirmed', label_bn: 'নিশ্চিত', color: '#0D9488', sort_order: 3, is_final: 0 },
  { code: 'processing', label: 'Processing', label_bn: 'প্রক্রিয়াধীন', color: '#7C3AED', sort_order: 4, is_final: 0 },
  { code: 'courier_sent', label: 'Courier Sent', label_bn: 'কুরিয়ারে পাঠানো', color: '#0891B2', sort_order: 5, is_final: 0 },
  { code: 'in_transit', label: 'In Transit', label_bn: 'পথে আছে', color: '#4F46E5', sort_order: 6, is_final: 0 },
  { code: 'delivered', label: 'Delivered', label_bn: 'ডেলিভারি সম্পন্ন', color: '#16A34A', sort_order: 7, is_final: 1 },
  { code: 'cancelled', label: 'Cancelled', label_bn: 'বাতিল', color: '#DC2626', sort_order: 8, is_final: 1 },
  { code: 'returned', label: 'Returned', label_bn: 'ফেরত', color: '#9F1239', sort_order: 9, is_final: 1 },
];

export const HOME_SECTIONS = [
  { section_key: 'categories', title: 'Categories', subtitle: null, sort_order: 1, product_limit: 10, grid_columns: 5, per_page: 10 },
  { section_key: 'flash_sale', title: 'Flash Sale', subtitle: 'সীমিত সময়ের অফার', sort_order: 2, product_limit: 10, grid_columns: 3, per_page: 10 },
  { section_key: 'combo_offers', title: 'Combo Offers', subtitle: 'একসাথে কিনুন, বেশি সাশ্রয় করুন', sort_order: 3, product_limit: 6, grid_columns: 2, per_page: 6 },
  { section_key: 'free_delivery', title: 'Free Delivery', subtitle: 'ফ্রি ডেলিভারি পণ্য', sort_order: 4, product_limit: 8, grid_columns: 2, per_page: 8 },
  { section_key: 'coupon_highlight', title: 'Coupon', subtitle: null, sort_order: 5, product_limit: 1, grid_columns: 1, per_page: 1 },
  { section_key: 'best_selling', title: 'Best Selling', subtitle: null, sort_order: 6, product_limit: 8, grid_columns: 2, per_page: 8 },
  { section_key: 'new_arrivals', title: 'New Arrivals', subtitle: null, sort_order: 7, product_limit: 8, grid_columns: 2, per_page: 8 },
  { section_key: 'featured', title: 'Featured Products', subtitle: null, sort_order: 8, product_limit: 8, grid_columns: 2, per_page: 8 },
  { section_key: 'recommended', title: 'Recommended For You', subtitle: null, sort_order: 9, product_limit: 12, grid_columns: 2, per_page: 12 },
];

export const COURIERS = [
  { code: 'steadfast', name: 'Steadfast Courier', driver: 'steadfast' },
  { code: 'pathao', name: 'Pathao Courier', driver: 'pathao' },
  { code: 'redx', name: 'RedX', driver: 'redx' },
  { code: 'bdcourier', name: 'BD Courier', driver: 'bdcourier' },
  { code: 'custom', name: 'Custom Courier API', driver: 'custom' },
];

export const DEFAULT_CATEGORIES = [
  { name: 'Electronics', slug: 'electronics', icon_value: 'fa-solid fa-laptop' },
  { name: 'Fashion', slug: 'fashion', icon_value: 'fa-solid fa-shirt' },
  { name: 'Home & Living', slug: 'home-living', icon_value: 'fa-solid fa-couch' },
  { name: 'Beauty', slug: 'beauty', icon_value: 'fa-solid fa-spa' },
  { name: 'Sports & Outdoor', slug: 'sports-outdoor', icon_value: 'fa-solid fa-dumbbell' },
  { name: 'Toys & Games', slug: 'toys-games', icon_value: 'fa-solid fa-puzzle-piece' },
  { name: 'Books & Stationery', slug: 'books-stationery', icon_value: 'fa-solid fa-book' },
  { name: 'Automotive', slug: 'automotive', icon_value: 'fa-solid fa-car' },
];

const page = (slug: string, title: string, content: string) => ({ slug, title, content });
export const DEFAULT_PAGES = [
  page('about-us', 'About Us', '<p>আমরা সারা বাংলাদেশে ক্যাশ অন ডেলিভারিতে মানসম্মত পণ্য পৌঁছে দিই।</p>'),
  page('privacy-policy', 'Privacy Policy', '<p>We only collect the information needed to deliver your order (name, phone and address). We never sell your data.</p>'),
  page('terms-and-conditions', 'Terms & Conditions', '<p>By placing an order you agree to receive a confirmation call from our team.</p>'),
  page('return-policy', 'Return & Refund Policy', '<p>পণ্য হাতে পাওয়ার সময় চেক করে নিন। কোনো সমস্যা থাকলে ডেলিভারি ম্যানের সামনেই রিটার্ন করুন।</p>'),
  page('delivery-policy', 'Delivery Policy', '<p>ঢাকার ভিতরে ১–২ দিন, ঢাকার বাইরে ২–৫ দিনের মধ্যে ডেলিভারি।</p>'),
];

export async function seedDefaults(db: Kysely<DB>, opts: { categories?: boolean; overrides?: Record<string, unknown> } = {}): Promise<void> {
  // Permissions & roles
  for (const [slug, name, group] of PERMISSIONS) {
    await db.insertInto('permissions').values({ slug, name, group }).onDuplicateKeyUpdate({ name, group }).execute();
  }
  const perms = await db.selectFrom('permissions').select(['id', 'slug']).execute();
  for (const role of ROLES) {
    await db.insertInto('roles').values({ slug: role.slug, name: role.name, is_system: 1 }).onDuplicateKeyUpdate({ is_system: 1 }).execute();
    const r = await db.selectFrom('roles').select('id').where('slug', '=', role.slug).executeTakeFirstOrThrow();
    const wanted = role.permissions === '*' ? perms : perms.filter((p) => (role.permissions as string[]).includes(p.slug));
    const existing = await db.selectFrom('role_permissions').select('permission_id').where('role_id', '=', r.id).execute();
    // Only add grants on first creation of a role; never strip what an owner customised.
    if (existing.length === 0 || role.permissions === '*') {
      for (const p of wanted) {
        await db.insertInto('role_permissions').ignore().values({ role_id: r.id, permission_id: p.id }).execute();
      }
    }
  }

  for (const s of ORDER_STATUSES) {
    await db.insertInto('order_statuses').ignore().values(s).execute();
  }
  for (const s of HOME_SECTIONS) {
    await db.insertInto('home_sections').ignore().values({ ...s, is_enabled: 1, config: null }).execute();
  }
  for (const c of COURIERS) {
    await db.insertInto('couriers').ignore().values({ ...c, is_enabled: 0, is_default: 0 }).execute();
  }
  for (const p of DEFAULT_PAGES) {
    await db.insertInto('pages').ignore().values({ ...p, is_active: 1, show_in_footer: 1 }).execute();
  }
  for (const key of ['home', 'categories', 'search', 'cart', 'checkout', 'contact']) {
    await db.insertInto('seo_settings').ignore().values({ page_key: key }).execute();
  }

  // Settings: insert defaults (non-secret) only when missing.
  const overrides = opts.overrides ?? {};
  for (const def of SETTINGS) {
    if (def.secret) continue;
    const value = def.key in overrides ? overrides[def.key] : def.default;
    await db.insertInto('site_settings').ignore().values({ key: def.key, group: def.group, value: JSON.stringify(value), is_secret: 0 }).execute();
  }

  if (opts.categories) {
    const count = await db.selectFrom('categories').select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst();
    if (!count || Number(count.n) === 0) {
      let i = 0;
      for (const c of DEFAULT_CATEGORIES) {
        await db.insertInto('categories').ignore().values({ ...c, icon_type: 'fa', sort_order: i++, is_active: 1, show_on_home: 1 }).execute();
      }
    }
  }
}
