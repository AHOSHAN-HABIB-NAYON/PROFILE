import crypto from 'node:crypto';
import { sql } from 'kysely';
import sharp from 'sharp';
import { cache } from '../core/cache.js';
import { processImage } from '../services/images.js';
import { db } from './index.js';

/**
 * DEVELOPMENT / DEMO DATA ONLY — run with `node server/dist/cli.js seed-demo`.
 * Never executed by the installer or the updater. Product artwork is
 * generated as SVG and pushed through the real image pipeline.
 */

type Art = 'earbuds' | 'watch' | 'backpack' | 'sneaker' | 'headphones' | 'tshirt' | 'lipstick' | 'toy' | 'bottle' | 'lamp' | 'book' | 'phone';

function art(kind: Art, bg: [string, string], accent: string): string {
  const shapes: Record<Art, string> = {
    earbuds: `<rect x="300" y="360" width="424" height="330" rx="120" fill="#fff" stroke="#e7e2dd" stroke-width="8"/><rect x="330" y="470" width="364" height="10" rx="5" fill="#ece6e0"/><g transform="translate(360 200)"><rect width="110" height="190" rx="55" fill="#fff" stroke="#e7e2dd" stroke-width="8"/><rect x="38" y="150" width="34" height="140" rx="17" fill="#fff" stroke="#e7e2dd" stroke-width="8"/></g><g transform="translate(560 220)"><rect width="110" height="190" rx="55" fill="#fff" stroke="#e7e2dd" stroke-width="8"/><rect x="38" y="150" width="34" height="140" rx="17" fill="#fff" stroke="#e7e2dd" stroke-width="8"/></g>`,
    watch: `<rect x="422" y="150" width="180" height="220" rx="40" fill="#2b2b2e"/><rect x="422" y="650" width="180" height="220" rx="40" fill="#2b2b2e"/><rect x="352" y="330" width="320" height="360" rx="90" fill="#1c1c1f"/><rect x="382" y="360" width="260" height="300" rx="70" fill="#0b0b0c"/><circle cx="512" cy="510" r="90" fill="none" stroke="${accent}" stroke-width="18"/><text x="512" y="525" text-anchor="middle" font-family="Arial" font-weight="700" font-size="54" fill="#fff">10:09</text>`,
    backpack: `<rect x="300" y="250" width="424" height="560" rx="150" fill="#232427"/><rect x="360" y="520" width="304" height="230" rx="60" fill="#2f3034"/><rect x="420" y="170" width="184" height="120" rx="60" fill="none" stroke="#232427" stroke-width="34"/><rect x="480" y="580" width="64" height="12" rx="6" fill="${accent}"/>`,
    sneaker: `<path d="M200 640 C260 520 360 470 440 470 L560 420 C620 400 650 470 700 500 L820 560 C870 590 860 660 820 670 L240 690 C200 690 190 660 200 640 Z" fill="#fff" stroke="#2a2a2a" stroke-width="10"/><rect x="200" y="660" width="660" height="50" rx="25" fill="#2a2a2a"/><path d="M470 480 L520 560 M520 460 L570 540 M570 445 L620 520" stroke="${accent}" stroke-width="14" stroke-linecap="round"/>`,
    headphones: `<path d="M300 560 V470 A212 212 0 0 1 724 470 V560" fill="none" stroke="#1f1f22" stroke-width="46" stroke-linecap="round"/><rect x="250" y="520" width="130" height="220" rx="60" fill="#1f1f22"/><rect x="644" y="520" width="130" height="220" rx="60" fill="#1f1f22"/><rect x="280" y="560" width="70" height="140" rx="35" fill="${accent}" opacity=".85"/><rect x="674" y="560" width="70" height="140" rx="35" fill="${accent}" opacity=".85"/>`,
    tshirt: `<path d="M360 220 L440 180 C470 230 554 230 584 180 L664 220 L800 330 L720 420 L664 380 L664 820 L360 820 L360 380 L304 420 L224 330 Z" fill="${accent}"/><path d="M440 180 C470 230 554 230 584 180" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="10"/>`,
    lipstick: `<rect x="400" y="520" width="224" height="330" rx="24" fill="#1b1b1b"/><rect x="420" y="430" width="184" height="110" rx="14" fill="#c9a36b"/><path d="M440 430 L440 250 C440 220 470 200 584 190 L584 430 Z" fill="${accent}"/>`,
    toy: `<rect x="250" y="470" width="524" height="170" rx="60" fill="${accent}"/><path d="M360 470 L420 360 L620 360 L690 470 Z" fill="${accent}" opacity=".85"/><rect x="440" y="380" width="80" height="80" rx="14" fill="#dff3ff"/><rect x="540" y="380" width="80" height="80" rx="14" fill="#dff3ff"/><circle cx="370" cy="660" r="70" fill="#2a2a2a"/><circle cx="660" cy="660" r="70" fill="#2a2a2a"/><circle cx="370" cy="660" r="28" fill="#ddd"/><circle cx="660" cy="660" r="28" fill="#ddd"/>`,
    bottle: `<rect x="420" y="160" width="184" height="90" rx="20" fill="#2a2a2a"/><rect x="380" y="240" width="264" height="600" rx="90" fill="#2e2f33"/><rect x="380" y="430" width="264" height="120" fill="${accent}"/>`,
    lamp: `<path d="M360 260 L664 260 L740 520 L284 520 Z" fill="${accent}"/><rect x="496" y="520" width="32" height="260" fill="#b08b5b"/><rect x="400" y="780" width="224" height="40" rx="20" fill="#8a6a44"/>`,
    book: `<rect x="300" y="220" width="424" height="580" rx="24" fill="${accent}"/><rect x="330" y="250" width="30" height="520" fill="#fff" opacity=".4"/><rect x="420" y="330" width="240" height="30" rx="15" fill="#fff" opacity=".85"/><rect x="420" y="390" width="180" height="22" rx="11" fill="#fff" opacity=".6"/>`,
    phone: `<rect x="372" y="160" width="280" height="700" rx="60" fill="#1c1c1f"/><rect x="392" y="190" width="240" height="640" rx="42" fill="url(#screen)"/><circle cx="512" cy="220" r="10" fill="#333"/>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient><linearGradient id="screen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d8cff"/><stop offset="1" stop-color="${accent}"/></linearGradient><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#000" flood-opacity=".18"/></filter></defs><rect width="1024" height="1024" fill="url(#bg)"/><ellipse cx="512" cy="880" rx="300" ry="40" fill="#000" opacity=".08"/><g filter="url(#s)">${shapes[kind]}</g></svg>`;
}

function banner(bg: [string, string], kind: Art): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="700" viewBox="0 0 1600 700"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs><rect width="1600" height="700" fill="url(#g)"/><circle cx="1250" cy="350" r="300" fill="#fff" opacity=".25"/><g transform="translate(830 -40) scale(.78)">${art(kind, ['#ffffff00', '#ffffff00'], '#F26B3A').replace(/<svg[^>]*>|<\/svg>/g, '').replace(/<rect width="1024" height="1024"[^>]*\/>/, '')}</g></svg>`;
}

async function image(svg: string, folder: string) {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return (await processImage(png, folder, 80)).path;
}

export async function seedDemo(): Promise<void> {
  const d = db();
  const existing = await d.selectFrom('products').select(sql<number>`COUNT(*)`.as('n')).executeTakeFirst();
  if (Number(existing?.n) > 0) throw new Error('Products already exist — demo data is only for empty development stores');

  const cats = Object.fromEntries((await d.selectFrom('categories').select(['id', 'slug']).execute()).map((c) => [c.slug, c.id]));
  const brandIds: Record<string, number> = {};
  for (const b of ['Samsung', 'Apple', 'Xiaomi', 'Nike', 'Adidas', 'Soundcore']) {
    const r = await d.insertInto('brands').values({ name: b, slug: b.toLowerCase(), is_active: 1 }).executeTakeFirstOrThrow();
    brandIds[b] = Number(r.insertId);
  }

  const products: Array<{ name: string; cat: string; brand?: string; price: number; sale?: number; stock: number; art: Art; bg: [string, string]; accent: string; free?: boolean; featured?: boolean; sizes?: string[]; colors?: Array<[string, string]>; desc: string; specs: Array<[string, string]> }> = [
    { name: 'Wireless Earbuds Pro', cat: 'electronics', brand: 'Soundcore', price: 2950, sale: 1999, stock: 42, art: 'earbuds', bg: ['#f6efe8', '#ead9c9'], accent: '#F26B3A', featured: true, colors: [['White', '#ffffff'], ['Black', '#1f1f1f'], ['Blue', '#3346c6'], ['Pink', '#f48ea8']], desc: 'উন্নত মানের সাউন্ড কোয়ালিটি এবং অ্যাক্টিভ নয়েজ ক্যান্সেলেশন সুবিধা নিয়ে আসছে এই ওয়্যারলেস ইয়ারবাডস। দৈনন্দিন ব্যবহার ও অফিস, গেমিং বা মিউজিকের জন্য পারফেক্ট।', specs: [['Battery', '30 hours with case'], ['Bluetooth', '5.3'], ['Water resistance', 'IPX5'], ['Warranty', '6 months']] },
    { name: 'Smart Watch X1', cat: 'electronics', brand: 'Xiaomi', price: 4850, sale: 3499, stock: 18, art: 'watch', bg: ['#eef0f3', '#d9dde4'], accent: '#F26B3A', featured: true, colors: [['Black', '#111111'], ['Silver', '#c8c8c8']], desc: 'AMOLED ডিসপ্লে, হার্ট রেট ও স্লিপ ট্র্যাকিং, ১০০+ স্পোর্টস মোড এবং ৭ দিনের ব্যাটারি লাইফ।', specs: [['Display', '1.43" AMOLED'], ['Battery', '7 days'], ['Water resistance', '5 ATM']] },
    { name: 'Travel Backpack', cat: 'fashion', price: 1990, sale: 1499, stock: 7, art: 'backpack', bg: ['#f1ece6', '#dfd4c8'], accent: '#F26B3A', free: true, desc: 'ল্যাপটপ কম্পার্টমেন্টসহ ওয়াটার-রেজিস্ট্যান্ট ট্রাভেল ব্যাকপ্যাক। অফিস, ভার্সিটি ও ট্রাভেলের জন্য আদর্শ।', specs: [['Capacity', '28 L'], ['Laptop', 'Up to 15.6"'], ['Material', 'Water-resistant polyester']] },
    { name: 'Urban Runner Sneakers', cat: 'fashion', brand: 'Nike', price: 3800, sale: 2990, stock: 30, art: 'sneaker', bg: ['#f4f1ee', '#e3ddd6'], accent: '#F26B3A', featured: true, sizes: ['39', '40', '41', '42', '43', '44'], desc: 'হালকা ওজনের আরামদায়ক স্নিকার্স — প্রতিদিনের হাঁটা ও রানিংয়ের জন্য।', specs: [['Upper', 'Breathable mesh'], ['Sole', 'EVA foam']] },
    { name: 'Studio Headphones', cat: 'electronics', brand: 'Soundcore', price: 5200, sale: 3990, stock: 12, art: 'headphones', bg: ['#f3efe9', '#e2d8cc'], accent: '#F26B3A', desc: 'ডিপ বেস ও ৪০ ঘণ্টা ব্যাটারিসহ ওভার-ইয়ার ওয়্যারলেস হেডফোন।', specs: [['Battery', '40 hours'], ['Driver', '40 mm']] },
    { name: 'Premium Cotton T-Shirt', cat: 'fashion', brand: 'Adidas', price: 890, sale: 650, stock: 80, art: 'tshirt', bg: ['#f7f2ec', '#ecdfd2'], accent: '#274b8f', sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: [['Navy', '#274b8f']], desc: '১০০% কটন, আরামদায়ক ও টেকসই প্রিমিয়াম টি-শার্ট।', specs: [['Fabric', '100% cotton, 180 GSM'], ['Fit', 'Regular']] },
    { name: 'Matte Lipstick Set', cat: 'beauty', price: 1200, sale: 899, stock: 5, art: 'lipstick', bg: ['#fbeff0', '#f2d7da'], accent: '#c2334d', free: true, desc: 'দীর্ঘস্থায়ী ম্যাট ফিনিশ লিপস্টিক — ৩টি শেড একসাথে।', specs: [['Shades', '3'], ['Finish', 'Matte']] },
    { name: 'Remote Control Car', cat: 'toys-games', price: 2200, sale: 1750, stock: 25, art: 'toy', bg: ['#eef6fb', '#d6e9f5'], accent: '#f2a93b', desc: 'রিচার্জেবল ব্যাটারিসহ হাই-স্পিড রিমোট কন্ট্রোল কার।', specs: [['Range', '30 m'], ['Battery', 'Rechargeable']] },
    { name: 'Insulated Steel Bottle', cat: 'sports-outdoor', price: 950, sale: 690, stock: 60, art: 'bottle', bg: ['#f2efec', '#e0d9d1'], accent: '#F26B3A', free: true, desc: '১২ ঘণ্টা ঠান্ডা ও ৬ ঘণ্টা গরম রাখে — লিক-প্রুফ স্টিল বোতল।', specs: [['Capacity', '750 ml'], ['Material', 'Stainless steel']] },
    { name: 'Nordic Table Lamp', cat: 'home-living', price: 2400, stock: 14, art: 'lamp', bg: ['#f6efe6', '#eadbc6'], accent: '#e9a23b', desc: 'উষ্ণ আলো ও কাঠের বেসসহ মিনিমাল টেবিল ল্যাম্প।', specs: [['Bulb', 'E27 LED included'], ['Height', '45 cm']] },
    { name: 'Productivity Planner', cat: 'books-stationery', price: 450, sale: 390, stock: 100, art: 'book', bg: ['#f1f3ee', '#dfe5d6'], accent: '#3c7a5a', desc: 'দৈনিক ও সাপ্তাহিক প্ল্যানিং-এর জন্য হার্ডকভার প্ল্যানার।', specs: [['Pages', '240'], ['Size', 'A5']] },
    { name: 'Galaxy A55 Smartphone', cat: 'electronics', brand: 'Samsung', price: 42999, sale: 39999, stock: 9, art: 'phone', bg: ['#eef0f6', '#d8dcea'], accent: '#8a5cf6', featured: true, desc: '৬.৬" সুপার AMOLED ডিসপ্লে, ৫০ MP ক্যামেরা এবং ৫০০০ mAh ব্যাটারি।', specs: [['RAM/ROM', '8/256 GB'], ['Battery', '5000 mAh'], ['Warranty', '1 year official']] },
  ];

  const ids: number[] = [];
  for (const [i, p] of products.entries()) {
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const variants = [...(p.sizes ?? []).map((s) => ({ size: s, color: p.colors?.[0]?.[0] ?? null, hex: p.colors?.[0]?.[1] ?? null })), ...(!p.sizes ? (p.colors ?? []).map(([c, h]) => ({ size: null, color: c, hex: h })) : [])];
    const perVariant = variants.length ? Math.max(1, Math.floor(p.stock / variants.length)) : 0;
    const r = await d.insertInto('products').values({
      name: p.name, slug, sku: `SG-${1000 + i}`, category_id: cats[p.cat] ?? null, brand_id: p.brand ? brandIds[p.brand]! : null, price: p.price, sale_price: p.sale ?? null,
      cost_price: Math.round((p.sale ?? p.price) * 0.62), stock: variants.length ? perVariant * variants.length : p.stock, low_stock_threshold: 10, weight: 0.5,
      short_description: p.desc.slice(0, 120), description: `<p>${p.desc}</p><ul><li>১০০% অরিজিনাল পণ্য</li><li>ক্যাশ অন ডেলিভারি</li><li>৭ দিনের রিপ্লেসমেন্ট সুবিধা</li></ul>`,
      specifications: JSON.stringify(p.specs.map(([label, value]) => ({ label, value }))), has_variants: variants.length ? 1 : 0, size_required: p.sizes ? 1 : 0, status: 'active',
      is_featured: p.featured ? 1 : 0, is_flash_sale: 0, is_combo: 0, free_delivery: p.free ? 1 : 0, cod_available: 1,
      seo_title: null, seo_description: null, seo_keywords: `${p.name}, buy ${p.name} in Bangladesh`, meta_image: null, social_image: null,
    }).executeTakeFirstOrThrow();
    const id = Number(r.insertId);
    ids.push(id);
    const main = await image(art(p.art, p.bg, p.accent), 'products');
    const alt = await image(art(p.art, [p.bg[1], p.bg[0]], p.accent), 'products');
    await d.insertInto('product_images').values([{ product_id: id, path: main, sort_order: 0, is_main: 1, alt: p.name, width: 1024, height: 1024 }, { product_id: id, path: alt, sort_order: 1, is_main: 0, alt: p.name, width: 1024, height: 1024 }]).execute();
    for (const [vi, v] of variants.entries()) {
      await d.insertInto('product_variants').values({ product_id: id, sku: `SG-${1000 + i}-${vi + 1}`, size: v.size, color: v.color, color_hex: v.hex, price: null, sale_price: null, stock: perVariant, is_active: 1, sort_order: vi }).execute();
    }
    await d.updateTable('products').set({ sold_count: 5 + ((i * 37) % 120), view_count: 40 + ((i * 91) % 900), rating_avg: 4 + ((i % 9) / 10), rating_count: 12 + i * 7 } as never).where('id', '=', id).execute();
    await d.insertInto('product_reviews').values({ product_id: id, customer_name: ['রাকিব', 'সুমাইয়া', 'তানভীর', 'নুসরাত'][i % 4]!, rating: 5, comment: 'পণ্যটি খুব ভালো, সময়মতো ডেলিভারি পেয়েছি। ধন্যবাদ!', is_approved: 1 }).execute();
  }

  // Banners
  const banners: Array<[string, string, [string, string], Art, string]> = [
    ['Premium Home Essentials', 'Make your home more beautiful & comfortable', ['#FFD8BF', '#F7A072'], 'lamp', 'home-living'],
    ['Sound that moves you', 'Up to 35% off on audio', ['#E9E4FF', '#B9A8F5'], 'headphones', 'electronics'],
    ['Step up your style', 'New sneakers every week', ['#DDF3E8', '#9FD8BD'], 'sneaker', 'fashion'],
  ];
  for (const [i, [title, subtitle, bg, kind, cat]] of banners.entries()) {
    const img = await image(banner(bg, kind), 'banners');
    await d.insertInto('banners').values({ title, subtitle, button_text: 'Shop Now', image: img, link_type: 'category', link_value: cat, sort_order: i, is_active: 1 }).execute();
  }

  // Flash sale (live for 3 days)
  const fs = await d.insertInto('flash_sales').values({ title: 'Flash Sale', starts_at: new Date(Date.now() - 3600_000), ends_at: new Date(Date.now() + 3 * 86400_000), is_active: 1 }).executeTakeFirstOrThrow();
  for (const [idx, price] of [[0, 1799], [1, 3299], [2, 1399], [4, 3690]] as const) {
    await d.insertInto('flash_sale_items').values({ flash_sale_id: Number(fs.insertId), product_id: ids[idx]!, sale_price: price, stock_limit: 20 }).execute();
    await d.updateTable('products').set({ is_flash_sale: 1 }).where('id', '=', ids[idx]!).execute();
  }

  // Combo
  const combo = await d.insertInto('combo_offers').values({ name: 'Work & Travel Combo', slug: 'work-travel-combo', description: 'Earbuds + Backpack + Steel Bottle — save more together!', price: 3690, is_active: 1, sort_order: 0 }).executeTakeFirstOrThrow();
  for (const idx of [0, 2, 8]) await d.insertInto('combo_items').values({ combo_id: Number(combo.insertId), product_id: ids[idx]!, quantity: 1 }).execute();

  // Coupon
  await d.insertInto('coupons').values({ code: 'WELCOME10', description: 'প্রথম অর্ডারে ১০% ছাড় (সর্বোচ্চ ৳৫০০)', type: 'percent', value: 10, min_order: 1000, max_discount: 500, applies_to: 'all', product_ids: '[]', category_ids: '[]', is_active: 1, highlight_on_home: 1, per_customer_limit: 1 }).execute();

  // A few historical orders so the dashboard has data (demo only)
  const statuses = ['delivered', 'delivered', 'delivered', 'confirmed', 'new', 'cancelled', 'returned', 'in_transit', 'delivered', 'pending'];
  const names = ['রহিম উদ্দিন', 'Karim Hasan', 'Nusrat Jahan', 'Tanvir Ahmed', 'Sumaiya Akter', 'Rakib Hossain'];
  const districts: Array<[string, string]> = [['Dhaka', 'Dhanmondi'], ['Dhaka', 'Mirpur'], ['Chittagong', 'Kotwali'], ['Sylhet', 'Sylhet Sadar'], ['Rajshahi', 'Boalia'], ['Gazipur', 'Gazipur Sadar']];
  for (let n = 0; n < 36; n++) {
    const created = new Date(Date.now() - ((n * 19) % 30) * 86400_000 - (n % 7) * 3600_000);
    const pi = n % ids.length;
    const p = products[pi]!;
    const qty = 1 + (n % 2);
    const unit = p.sale ?? p.price;
    const [district, upazila] = districts[n % districts.length]!;
    const delivery = district === 'Dhaka' ? 70 : 130;
    const phone = `017${String(10000000 + ((n * 7919) % 89999999)).padStart(8, '0')}`;
    await d.insertInto('customers').values({ phone, name: names[n % names.length]!, district, upazila, address: `House ${n + 1}, Road ${(n % 9) + 1}`, is_blocked: 0, total_orders: 1, first_order_at: created, last_order_at: created })
      .onDuplicateKeyUpdate({ total_orders: sql`total_orders + 1` }).execute();
    const cust = await d.selectFrom('customers').select('id').where('phone', '=', phone).executeTakeFirstOrThrow();
    const status = statuses[n % statuses.length]!;
    const o = await d.insertInto('orders').values({
      order_no: `SGDEMO${String(n + 1).padStart(4, '0')}`, public_token: crypto.randomBytes(32).toString('base64url'), customer_id: cust.id, customer_name: names[n % names.length]!, phone,
      district, upazila, address: `House ${n + 1}, Road ${(n % 9) + 1}`, note: null, status, subtotal: unit * qty, discount: 0, delivery_charge: delivery, total: unit * qty + delivery,
      coupon_id: null, coupon_code: null, item_count: qty, ip: `103.${n}.1.${n}`, device_hash: null, user_agent: 'demo', device_info: '{}', risk_score: n % 11 === 0 ? 45 : 5, risk_level: n % 11 === 0 ? 'MEDIUM' : 'LOW', risk_reasons: '[]', source: 'demo', created_at: created,
      delivered_at: status === 'delivered' ? created : null,
    }).executeTakeFirstOrThrow();
    await d.insertInto('order_items').values({ order_id: Number(o.insertId), product_id: ids[pi]!, variant_id: null, combo_id: null, name: p.name, sku: null, size: p.sizes?.[0] ?? null, color: null, image: null, unit_price: unit, cost_price: Math.round(unit * 0.62), quantity: qty, line_total: unit * qty }).execute();
    await d.insertInto('order_status_history').values({ order_id: Number(o.insertId), from_status: null, to_status: status, note: 'Demo order', admin_id: null, created_at: created }).execute();
    if (status === 'delivered') await d.updateTable('customers').set({ delivered_orders: sql`delivered_orders + 1`, total_spent: sql`total_spent + ${unit * qty + delivery}` }).where('id', '=', cust.id).execute();
  }
  for (let n = 0; n < 400; n++) {
    await d.insertInto('analytics_events').values({ event: ['page_view', 'page_view', 'view_item', 'view_item', 'add_to_cart', 'begin_checkout'][n % 6]!, session_id: `demo${n % 90}`, product_id: n % 3 === 0 ? null : ids[n % ids.length]!, created_at: new Date(Date.now() - ((n * 13) % 30) * 86400_000) }).execute();
  }
  await cache.del('');
}
