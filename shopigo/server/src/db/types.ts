import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTs = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
/** JSON stored in a LONGTEXT column (MariaDB-compatible), serialised by the app. */
type Json = string | null;
type Bool = ColumnType<number, number | boolean | undefined, number | boolean>;

export interface InstallationTable {
  id: number;
  installation_id: string;
  status: string;
  version: string;
  site_url: string;
  installed_at: Timestamp;
}

export interface SystemSettingsTable {
  key: string;
  value: Json;
  updated_at: Generated<Date>;
}

export interface SiteSettingsTable {
  key: string;
  group: string;
  value: Json;
  is_secret: Bool;
  updated_at: Generated<Date>;
}

export interface SeoSettingsTable {
  id: Generated<number>;
  page_key: string;
  title: string | null;
  description: string | null;
  keywords: string | null;
  og_image: string | null;
  updated_at: Generated<Date>;
}

export interface RolesTable {
  id: Generated<number>;
  name: string;
  slug: string;
  is_system: Bool;
  created_at: Generated<Date>;
}

export interface PermissionsTable {
  id: Generated<number>;
  slug: string;
  name: string;
  group: string;
}

export interface RolePermissionsTable {
  role_id: number;
  permission_id: number;
}

export interface AdminsTable {
  id: Generated<number>;
  role_id: number;
  name: string;
  email: string;
  phone: string | null;
  password_hash: string;
  totp_secret: string | null;
  totp_enabled: Bool;
  status: ColumnType<string, string | undefined, string>;
  failed_attempts: Generated<number>;
  locked_until: NullableTs;
  last_login_at: NullableTs;
  last_login_ip: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AdminSessionsTable {
  id: Generated<number>;
  admin_id: number;
  token_hash: string;
  ip: string | null;
  user_agent: string | null;
  mfa_pending: Bool;
  auth_method: string;
  created_at: Generated<Date>;
  last_seen_at: Timestamp;
  expires_at: Timestamp;
  revoked_at: NullableTs;
}

export interface AdminPasskeysTable {
  id: Generated<number>;
  admin_id: number;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: Json;
  device_type: string | null;
  backed_up: Bool;
  name: string;
  created_at: Generated<Date>;
  last_used_at: NullableTs;
}

export interface CustomersTable {
  id: Generated<number>;
  phone: string;
  name: string;
  email: string | null;
  district: string | null;
  upazila: string | null;
  address: string | null;
  total_orders: Generated<number>;
  delivered_orders: Generated<number>;
  cancelled_orders: Generated<number>;
  returned_orders: Generated<number>;
  total_spent: Generated<number>;
  is_blocked: Bool;
  notes: string | null;
  first_order_at: NullableTs;
  last_order_at: NullableTs;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AddressesTable {
  id: Generated<number>;
  customer_id: number;
  name: string;
  phone: string;
  district: string;
  upazila: string;
  address: string;
  device_hash: string | null;
  last_used_at: Timestamp;
}

export interface CategoriesTable {
  id: Generated<number>;
  parent_id: number | null;
  name: string;
  slug: string;
  description: string | null;
  icon_type: ColumnType<string, string | undefined, string>;
  icon_value: string | null;
  image: string | null;
  sort_order: Generated<number>;
  is_active: Bool;
  show_on_home: Bool;
  seo_title: string | null;
  seo_description: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: NullableTs;
}

export interface BrandsTable {
  id: Generated<number>;
  name: string;
  slug: string;
  logo: string | null;
  is_active: Bool;
  sort_order: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: NullableTs;
}

export interface ProductsTable {
  id: Generated<number>;
  category_id: number | null;
  subcategory_id: number | null;
  brand_id: number | null;
  name: string;
  slug: string;
  sku: string | null;
  price: number;
  sale_price: number | null;
  cost_price: number | null;
  stock: number;
  low_stock_threshold: number;
  weight: number | null;
  short_description: string | null;
  description: string | null;
  specifications: Json;
  has_variants: Bool;
  size_required: Bool;
  status: ColumnType<string, string | undefined, string>;
  is_featured: Bool;
  is_flash_sale: Bool;
  is_combo: Bool;
  free_delivery: Bool;
  cod_available: Bool;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  meta_image: string | null;
  social_image: string | null;
  rating_avg: Generated<number>;
  rating_count: Generated<number>;
  view_count: Generated<number>;
  sold_count: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: NullableTs;
}

export interface ProductImagesTable {
  id: Generated<number>;
  product_id: number;
  path: string;
  width: number | null;
  height: number | null;
  alt: string | null;
  sort_order: Generated<number>;
  is_main: Bool;
  created_at: Generated<Date>;
}

export interface ProductVariantsTable {
  id: Generated<number>;
  product_id: number;
  sku: string | null;
  size: string | null;
  color: string | null;
  color_hex: string | null;
  price: number | null;
  sale_price: number | null;
  stock: number;
  is_active: Bool;
  sort_order: Generated<number>;
}

export interface ProductReviewsTable {
  id: Generated<number>;
  product_id: number;
  customer_name: string;
  phone: string | null;
  rating: number;
  comment: string | null;
  is_approved: Bool;
  created_at: Generated<Date>;
}

export interface OrderStatusesTable {
  code: string;
  label: string;
  label_bn: string | null;
  color: string;
  sort_order: number;
  is_final: Bool;
}

export interface OrdersTable {
  id: Generated<number>;
  order_no: string;
  public_token: string;
  customer_id: number | null;
  customer_name: string;
  phone: string;
  district: string;
  upazila: string;
  address: string;
  note: string | null;
  status: string;
  payment_method: ColumnType<string, string | undefined, string>;
  subtotal: number;
  discount: number;
  delivery_charge: number;
  total: number;
  coupon_id: number | null;
  coupon_code: string | null;
  item_count: number;
  ip: string | null;
  ip_location: string | null;
  device_hash: string | null;
  user_agent: string | null;
  device_info: Json;
  risk_score: Generated<number>;
  risk_level: ColumnType<string, string | undefined, string>;
  risk_reasons: Json;
  courier_id: number | null;
  consignment_id: string | null;
  tracking_code: string | null;
  courier_status: string | null;
  admin_note: string | null;
  source: string | null;
  confirmed_at: NullableTs;
  delivered_at: NullableTs;
  cancelled_at: NullableTs;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: NullableTs;
}

export interface OrderItemsTable {
  id: Generated<number>;
  order_id: number;
  product_id: number | null;
  variant_id: number | null;
  combo_id: number | null;
  name: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  image: string | null;
  unit_price: number;
  cost_price: number | null;
  quantity: number;
  line_total: number;
}

export interface OrderStatusHistoryTable {
  id: Generated<number>;
  order_id: number;
  from_status: string | null;
  to_status: string;
  note: string | null;
  admin_id: number | null;
  created_at: Generated<Date>;
}

export interface CouponsTable {
  id: Generated<number>;
  code: string;
  description: string | null;
  type: string;
  value: number;
  min_order: Generated<number>;
  max_discount: number | null;
  starts_at: NullableTs;
  expires_at: NullableTs;
  usage_limit: number | null;
  per_customer_limit: number | null;
  used_count: Generated<number>;
  applies_to: ColumnType<string, string | undefined, string>;
  product_ids: Json;
  category_ids: Json;
  is_active: Bool;
  highlight_on_home: Bool;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: NullableTs;
}

export interface CouponUsageTable {
  id: Generated<number>;
  coupon_id: number;
  order_id: number;
  phone: string;
  discount: number;
  created_at: Generated<Date>;
}

export interface BannersTable {
  id: Generated<number>;
  title: string | null;
  subtitle: string | null;
  button_text: string | null;
  image: string;
  mobile_image: string | null;
  link_type: ColumnType<string, string | undefined, string>;
  link_value: string | null;
  starts_at: NullableTs;
  ends_at: NullableTs;
  sort_order: Generated<number>;
  is_active: Bool;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: NullableTs;
}

export interface FlashSalesTable {
  id: Generated<number>;
  title: string;
  starts_at: Timestamp;
  ends_at: Timestamp;
  is_active: Bool;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface FlashSaleItemsTable {
  id: Generated<number>;
  flash_sale_id: number;
  product_id: number;
  sale_price: number;
  stock_limit: number | null;
  sold_count: Generated<number>;
}

export interface ComboOffersTable {
  id: Generated<number>;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  price: number;
  is_active: Bool;
  starts_at: NullableTs;
  ends_at: NullableTs;
  sort_order: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: NullableTs;
}

export interface ComboItemsTable {
  id: Generated<number>;
  combo_id: number;
  product_id: number;
  quantity: number;
}

export interface HomeSectionsTable {
  id: Generated<number>;
  section_key: string;
  title: string;
  subtitle: string | null;
  is_enabled: Bool;
  sort_order: number;
  product_limit: number;
  grid_columns: number;
  per_page: number;
  config: Json;
}

export interface DeliveryRulesTable {
  id: Generated<number>;
  name: string;
  type: string;
  district: string | null;
  charge: number;
  min_order: number | null;
  priority: Generated<number>;
  is_active: Bool;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CouriersTable {
  id: Generated<number>;
  code: string;
  name: string;
  driver: string;
  is_enabled: Bool;
  is_default: Bool;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CourierCredentialsTable {
  id: Generated<number>;
  courier_id: number;
  credentials: string;
  updated_at: Generated<Date>;
}

export interface CourierShipmentsTable {
  id: Generated<number>;
  order_id: number;
  courier_id: number;
  consignment_id: string | null;
  tracking_code: string | null;
  status: string;
  cod_amount: number;
  request_payload: Json;
  response_payload: Json;
  error: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface FraudEventsTable {
  id: Generated<number>;
  type: string;
  ip: string | null;
  phone: string | null;
  device_hash: string | null;
  order_id: number | null;
  risk_score: number;
  risk_level: string;
  reasons: Json;
  action: string;
  created_at: Generated<Date>;
}

export interface BlockListTable {
  id: Generated<number>;
  value: string;
  reason: string | null;
  attempts: Generated<number>;
  expires_at: NullableTs;
  created_by: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AnalyticsEventsTable {
  id: Generated<number>;
  event: string;
  session_id: string | null;
  device_hash: string | null;
  product_id: number | null;
  category_id: number | null;
  value: number | null;
  meta: Json;
  ip: string | null;
  created_at: Generated<Date>;
}

export interface NotificationsTable {
  id: Generated<number>;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  data: Json;
  is_read: Bool;
  created_at: Generated<Date>;
}

export interface AuditLogsTable {
  id: Generated<number>;
  admin_id: number | null;
  admin_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  old_value: Json;
  new_value: Json;
  ip: string | null;
  user_agent: string | null;
  created_at: Generated<Date>;
}

export interface TrashTable {
  id: Generated<number>;
  entity_type: string;
  entity_id: number;
  title: string;
  snapshot: Json;
  deleted_by: number | null;
  deleted_at: Generated<Date>;
}

export interface PagesTable {
  id: Generated<number>;
  slug: string;
  title: string;
  content: string | null;
  seo_title: string | null;
  seo_description: string | null;
  is_active: Bool;
  show_in_footer: Bool;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UpdateHistoryTable {
  id: Generated<number>;
  from_version: string;
  to_version: string;
  status: string;
  log: string | null;
  backup_file: string | null;
  admin_id: number | null;
  started_at: Generated<Date>;
  finished_at: NullableTs;
}

export interface BackupsTable {
  id: Generated<number>;
  type: string;
  file: string;
  size: number;
  status: string;
  note: string | null;
  created_by: number | null;
  created_at: Generated<Date>;
}

export interface MediaTable {
  id: Generated<number>;
  path: string;
  folder: string;
  original_name: string | null;
  mime: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  created_at: Generated<Date>;
}

export interface DB {
  installation: InstallationTable;
  system_settings: SystemSettingsTable;
  site_settings: SiteSettingsTable;
  seo_settings: SeoSettingsTable;
  roles: RolesTable;
  permissions: PermissionsTable;
  role_permissions: RolePermissionsTable;
  admins: AdminsTable;
  admin_sessions: AdminSessionsTable;
  admin_passkeys: AdminPasskeysTable;
  customers: CustomersTable;
  addresses: AddressesTable;
  categories: CategoriesTable;
  brands: BrandsTable;
  products: ProductsTable;
  product_images: ProductImagesTable;
  product_variants: ProductVariantsTable;
  product_reviews: ProductReviewsTable;
  order_statuses: OrderStatusesTable;
  orders: OrdersTable;
  order_items: OrderItemsTable;
  order_status_history: OrderStatusHistoryTable;
  coupons: CouponsTable;
  coupon_usage: CouponUsageTable;
  banners: BannersTable;
  flash_sales: FlashSalesTable;
  flash_sale_items: FlashSaleItemsTable;
  combo_offers: ComboOffersTable;
  combo_items: ComboItemsTable;
  home_sections: HomeSectionsTable;
  delivery_rules: DeliveryRulesTable;
  couriers: CouriersTable;
  courier_credentials: CourierCredentialsTable;
  courier_shipments: CourierShipmentsTable;
  fraud_events: FraudEventsTable;
  blocked_ips: BlockListTable;
  blocked_devices: BlockListTable;
  blocked_phones: BlockListTable;
  analytics_events: AnalyticsEventsTable;
  notifications: NotificationsTable;
  audit_logs: AuditLogsTable;
  trash: TrashTable;
  pages: PagesTable;
  update_history: UpdateHistoryTable;
  backups: BackupsTable;
  media: MediaTable;
}

export type Product = Selectable<ProductsTable>;
export type NewProduct = Insertable<ProductsTable>;
export type ProductUpdate = Updateable<ProductsTable>;
export type Order = Selectable<OrdersTable>;
export type Admin = Selectable<AdminsTable>;
export type Category = Selectable<CategoriesTable>;
export type Coupon = Selectable<CouponsTable>;
