export interface PublicSettings {
  site_name: string;
  site_tagline: string;
  site_url: string;
  currency: string;
  currency_symbol: string;
  timezone: string;
  language: 'bn' | 'en';
  logo: string;
  favicon: string;
  app_icon: string;
  og_image: string;
  primary_color: string;
  contact_phone: string;
  contact_email: string;
  contact_address: string;
  facebook_url: string;
  instagram_url: string;
  youtube_url: string;
  map_embed_url: string;
  business_hours: string;
  meta_title: string;
  meta_description: string;
  delivery_inside_dhaka: number;
  delivery_outside_dhaka: number;
  dhaka_districts: string[];
  free_delivery_min_order: number;
  delivery_time_inside: string;
  delivery_time_outside: string;
  cod_enabled: boolean;
  cod_note: string;
  max_order_quantity: number;
  coupons_enabled: boolean;
  flash_sale_enabled: boolean;
  combo_enabled: boolean;
  products_per_page: number;
  show_stock: boolean;
  reviews_enabled: boolean;
  meta_pixel_id: string;
  ga4_measurement_id: string;
  google_tag_id: string;
  google_ads_conversion_id: string;
  google_ads_conversion_label: string;
  whatsapp_enabled: boolean;
  whatsapp_number: string;
  whatsapp_greeting: string;
  whatsapp_default_message: string;
  whatsapp_order_message: string;
  pwa_enabled: boolean;
  pwa_short_name: string;
  pwa_theme_color: string;
  maintenance_title: string;
  maintenance_message: string;
}

export interface CategoryLite { id: number; parent_id: number | null; name: string; slug: string; icon_type: 'fa' | 'image' | 'none'; icon_value: string | null; image: string | null; product_count?: number; description?: string | null }

export interface Bootstrap { settings: PublicSettings; categories: CategoryLite[]; pages: Array<{ slug: string; title: string }> }

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

export interface Variant { id: number; sku: string | null; size: string | null; color: string | null; colorHex: string | null; stock: number; price: number; regularPrice: number }

export interface ProductDetail extends Omit<ProductCard, 'image' | 'flash'> {
  sku: string | null;
  lowStock: boolean;
  shortDescription: string | null;
  description: string | null;
  specifications: Array<{ label: string; value: string }>;
  codAvailable: boolean;
  weight: number | null;
  images: Array<{ id: number; path: string; width: number | null; height: number | null; alt: string | null }>;
  category: { id: number; name: string; slug: string } | null;
  brand: { id: number; name: string; slug: string; logo: string | null } | null;
  variants: Variant[];
  flash: { endsAt: string; remaining: number | null; title: string } | null;
  related: ProductCard[];
}

export interface Combo { id: number; name: string; slug: string; description: string | null; image: string | null; price: number; regularPrice: number; savings: number; available: boolean; endsAt: string | null; items: Array<ProductCard & { quantity: number }> }

export interface Banner { id: number; title: string | null; subtitle: string | null; button_text: string | null; image: string; mobile_image: string | null; link_type: 'none' | 'url' | 'product' | 'category'; link_value: string | null }

export interface HomeSection {
  key: string;
  title: string;
  subtitle: string | null;
  columns: number;
  limit: number;
  perPage: number;
  products?: ProductCard[];
  combos?: Combo[];
  coupons?: Array<{ code: string; description: string | null; type: 'percent' | 'fixed'; value: number; min_order: number; expires_at: string | null }>;
  endsAt?: string;
}

export interface QuoteLine {
  key: string;
  type: 'product' | 'combo';
  productId: number | null;
  variantId: number | null;
  comboId: number | null;
  name: string;
  slug: string | null;
  image: string | null;
  size: string | null;
  color: string | null;
  unitPrice: number;
  regularPrice: number;
  qty: number;
  lineTotal: number;
  maxQty: number;
  freeDelivery: boolean;
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

export interface District { name: string; bn: string; division: string; upazilas: Array<{ name: string; bn: string }> }
