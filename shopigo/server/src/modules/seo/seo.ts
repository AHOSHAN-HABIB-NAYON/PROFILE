import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { cache } from '../../core/cache.js';
import { CLIENT_DIST } from '../../core/paths.js';
import { isInstalledSync } from '../../core/state.js';
import { db } from '../../db/index.js';
import { activeFlashMap, effectivePrice } from '../../services/catalog.js';
import { escapeHtml } from '../../services/html.js';
import { imageUrl } from '../../services/images.js';
import { settings } from '../../services/settings.js';

export const seoRouter = Router();

function siteUrl(req: Request, configured: string): string {
  return (configured || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

function xml(body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}

const xmlEscape = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

seoRouter.get('/robots.txt', async (req, res) => {
  res.type('text/plain');
  if (!isInstalledSync()) { res.send('User-agent: *\nDisallow: /\n'); return; }
  const base = siteUrl(req, await settings.str('site_url'));
  const extra = await settings.str('robots_extra');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', 'Disallow: /install', 'Disallow: /cart', 'Disallow: /checkout', 'Disallow: /order/', 'Disallow: /track', '', extra, `Sitemap: ${base}/sitemap.xml`, ''].join('\n'));
});

seoRouter.get('/sitemap.xml', async (req, res) => {
  if (!isInstalledSync()) { res.status(404).end(); return; }
  const base = siteUrl(req, await settings.str('site_url'));
  const now = new Date().toISOString();
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600');
  res.send(xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['pages', 'categories', 'products'].map((s) => `<sitemap><loc>${base}/sitemap-${s}.xml</loc><lastmod>${now}</lastmod></sitemap>`).join('')}</sitemapindex>`));
});

seoRouter.get('/sitemap-:kind.xml', async (req, res) => {
  if (!isInstalledSync()) { res.status(404).end(); return; }
  const base = siteUrl(req, await settings.str('site_url'));
  const kind = req.params.kind;
  const body = await cache.remember(`seo:sitemap:${kind}:${base}`, 3600, async () => {
    const urls: Array<{ loc: string; lastmod?: Date; image?: string | null; priority?: string }> = [];
    if (kind === 'pages') {
      urls.push({ loc: `${base}/`, priority: '1.0' }, { loc: `${base}/categories`, priority: '0.8' }, { loc: `${base}/contact`, priority: '0.5' }, { loc: `${base}/combos`, priority: '0.6' });
      for (const p of await db().selectFrom('pages').select(['slug', 'updated_at']).where('is_active', '=', 1).execute()) urls.push({ loc: `${base}/page/${p.slug}`, lastmod: p.updated_at, priority: '0.3' });
    } else if (kind === 'categories') {
      for (const c of await db().selectFrom('categories').select(['slug', 'updated_at']).where('is_active', '=', 1).where('deleted_at', 'is', null).execute()) urls.push({ loc: `${base}/category/${c.slug}`, lastmod: c.updated_at, priority: '0.7' });
    } else if (kind === 'products') {
      const rows = await db().selectFrom('products as p').select(['p.slug', 'p.updated_at'])
        .select((eb) => eb.selectFrom('product_images as i').select('i.path').whereRef('i.product_id', '=', 'p.id').orderBy('i.is_main', 'desc').orderBy('i.sort_order').limit(1).as('image'))
        .where('p.status', '=', 'active').where('p.deleted_at', 'is', null).orderBy('p.id', 'desc').limit(45000).execute();
      for (const p of rows) urls.push({ loc: `${base}/product/${p.slug}`, lastmod: p.updated_at, image: p.image ? `${base}${imageUrl(p.image, 'lg', 'jpg')}` : null, priority: '0.9' });
    } else {
      return null;
    }
    return xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls
      .map((u) => `<url><loc>${xmlEscape(encodeURI(decodeURI(u.loc)))}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : ''}${u.priority ? `<priority>${u.priority}</priority>` : ''}${u.image ? `<image:image><image:loc>${xmlEscape(u.image)}</image:loc></image:image>` : ''}</url>`)
      .join('')}</urlset>`);
  });
  if (!body) { res.status(404).end(); return; }
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(body);
});

seoRouter.get('/manifest.webmanifest', async (_req, res) => {
  const s = isInstalledSync() ? await settings.public() : {};
  const icon = (s.app_icon as string) || (s.favicon as string);
  const icons = icon
    ? [192, 512].map((n) => ({ src: `/uploads/${icon}-${n}.png`, sizes: `${n}x${n}`, type: 'image/png', purpose: 'any maskable' }))
    : [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }];
  res.type('application/manifest+json').set('Cache-Control', 'public, max-age=600').json({
    name: (s.site_name as string) || 'ShopiGo',
    short_name: (s.pwa_short_name as string) || (s.site_name as string) || 'ShopiGo',
    description: (s.meta_description as string) || 'Online shopping with Cash on Delivery',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: (s.pwa_background_color as string) || '#FBF5EF',
    theme_color: (s.pwa_theme_color as string) || '#F26B3A',
    lang: (s.language as string) || 'bn',
    categories: ['shopping'],
    icons,
    shortcuts: [
      { name: 'Categories', url: '/categories', icons: icons.slice(0, 1) },
      { name: 'Cart', url: '/cart', icons: icons.slice(0, 1) },
      { name: 'Track order', url: '/track', icons: icons.slice(0, 1) },
    ],
  });
});

/** Digital Asset Links for the Android Trusted Web Activity wrapper. */
seoRouter.get('/.well-known/assetlinks.json', async (_req, res) => {
  if (!isInstalledSync()) { res.json([]); return; }
  const pkg = (await settings.get<string>('android_package')) as string;
  const fp = (await settings.get<string>('android_sha256_fingerprint')) as string;
  res.json(pkg && fp ? [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: fp.split(',').map((f) => f.trim()) } }] : []);
});

// ------------------------------------------------------------ HTML shell with per-route meta
let template: string | null = null;
function shell(): string {
  if (template && process.env.NODE_ENV === 'production') return template;
  const file = path.join(CLIENT_DIST, 'index.html');
  template = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '<!doctype html><html><head><meta charset="utf-8"><title>ShopiGo</title></head><body><div id="root"></div><p style="font-family:sans-serif;padding:2rem">Storefront build missing — run <code>npm run build</code>.</p></body></html>';
  return template;
}

interface Meta { title: string; description: string; canonical: string; image: string | null; type: string; keywords?: string | null; jsonLd: unknown[]; noindex?: boolean; status: number }

async function metaFor(req: Request): Promise<Meta> {
  const s = await settings.public();
  const base = siteUrl(req, String(s.site_url ?? ''));
  const siteName = String(s.site_name || 'ShopiGo');
  const url = `${base}${req.path === '/' ? '/' : req.path.replace(/\/+$/, '')}`;
  const defaults: Meta = {
    title: String(s.meta_title || siteName), description: String(s.meta_description || ''), canonical: url,
    image: s.og_image ? `${base}${imageUrl(String(s.og_image), 'lg', 'jpg')}` : null, type: 'website', keywords: String(s.meta_keywords || ''), jsonLd: [], status: 200,
  };
  const p = req.path;
  const titled = (t: string) => `${t} | ${siteName}`;
  const org = { '@context': 'https://schema.org', '@type': 'Organization', name: siteName, url: base, logo: s.logo ? `${base}/uploads/${s.logo}-logo.png` : undefined, sameAs: [s.facebook_url, s.instagram_url, s.youtube_url].filter(Boolean), contactPoint: s.contact_phone ? { '@type': 'ContactPoint', telephone: s.contact_phone, contactType: 'customer service', areaServed: 'BD' } : undefined };

  if (p === '/' || p === '') {
    const seo = await db().selectFrom('seo_settings').selectAll().where('page_key', '=', 'home').executeTakeFirst();
    return {
      ...defaults, title: seo?.title || defaults.title, description: seo?.description || defaults.description, keywords: seo?.keywords || defaults.keywords,
      image: seo?.og_image ? `${base}${imageUrl(seo.og_image, 'lg', 'jpg')}` : defaults.image,
      jsonLd: [org, { '@context': 'https://schema.org', '@type': 'WebSite', name: siteName, url: base, potentialAction: { '@type': 'SearchAction', target: `${base}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' } }],
    };
  }
  let m: RegExpExecArray | null;
  if ((m = /^\/product\/([^/]+)$/.exec(p))) {
    const slug = decodeURIComponent(m[1]!);
    const prod = await db().selectFrom('products').selectAll().where('slug', '=', slug).where('status', '=', 'active').where('deleted_at', 'is', null).executeTakeFirst();
    if (!prod) return { ...defaults, title: titled('Product not found'), noindex: true, status: 404 };
    const [images, cat, brand, flash] = await Promise.all([
      db().selectFrom('product_images').select('path').where('product_id', '=', prod.id).orderBy('is_main', 'desc').orderBy('sort_order').limit(5).execute(),
      prod.category_id ? db().selectFrom('categories').select(['name', 'slug']).where('id', '=', prod.category_id).executeTakeFirst() : null,
      prod.brand_id ? db().selectFrom('brands').select('name').where('id', '=', prod.brand_id).executeTakeFirst() : null,
      activeFlashMap(),
    ]);
    const price = effectivePrice(prod, flash);
    const social = prod.social_image || prod.meta_image || images[0]?.path || null;
    const desc = prod.seo_description || prod.short_description || (prod.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || defaults.description;
    const productLd = {
      '@context': 'https://schema.org', '@type': 'Product', name: prod.name, sku: prod.sku ?? undefined, description: desc,
      image: images.map((i) => `${base}${imageUrl(i.path, 'lg', 'jpg')}`), brand: brand ? { '@type': 'Brand', name: brand.name } : undefined,
      aggregateRating: prod.rating_count > 0 ? { '@type': 'AggregateRating', ratingValue: Number(prod.rating_avg).toFixed(1), reviewCount: prod.rating_count } : undefined,
      offers: {
        '@type': 'Offer', url, priceCurrency: String(s.currency || 'BDT'), price: price.toFixed(2), itemCondition: 'https://schema.org/NewCondition',
        availability: prod.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        priceValidUntil: flash.get(prod.id)?.endsAt?.slice(0, 10) ?? undefined,
        shippingDetails: { '@type': 'OfferShippingDetails', shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'BD' }, shippingRate: { '@type': 'MonetaryAmount', value: prod.free_delivery ? 0 : Number(s.delivery_inside_dhaka ?? 70), currency: 'BDT' } },
        seller: { '@type': 'Organization', name: siteName },
      },
    };
    const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/` }, ...(cat ? [{ '@type': 'ListItem', position: 2, name: cat.name, item: `${base}/category/${cat.slug}` }] : []), { '@type': 'ListItem', position: cat ? 3 : 2, name: prod.name, item: url }] };
    return { ...defaults, title: prod.seo_title || titled(prod.name), description: desc, keywords: prod.seo_keywords || defaults.keywords, image: social ? `${base}${imageUrl(social, 'lg', 'jpg')}` : defaults.image, type: 'product', jsonLd: [productLd, crumbs] };
  }
  if ((m = /^\/category\/([^/]+)$/.exec(p))) {
    const c = await db().selectFrom('categories').selectAll().where('slug', '=', decodeURIComponent(m[1]!)).where('deleted_at', 'is', null).executeTakeFirst();
    if (!c) return { ...defaults, title: titled('Category not found'), noindex: true, status: 404 };
    return { ...defaults, title: c.seo_title || titled(c.name), description: c.seo_description || c.description || `${c.name} — ${defaults.description}`, image: c.image ? `${base}${imageUrl(c.image, 'lg', 'jpg')}` : defaults.image, jsonLd: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: c.name, url }] };
  }
  if ((m = /^\/page\/([^/]+)$/.exec(p))) {
    const pg = await db().selectFrom('pages').selectAll().where('slug', '=', decodeURIComponent(m[1]!)).where('is_active', '=', 1).executeTakeFirst();
    if (!pg) return { ...defaults, title: titled('Page not found'), noindex: true, status: 404 };
    return { ...defaults, title: pg.seo_title || titled(pg.title), description: pg.seo_description || (pg.content ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) };
  }
  if ((m = /^\/combo\/([^/]+)$/.exec(p))) {
    const c = await db().selectFrom('combo_offers').selectAll().where('slug', '=', decodeURIComponent(m[1]!)).where('deleted_at', 'is', null).executeTakeFirst();
    if (!c) return { ...defaults, noindex: true, status: 404 };
    return { ...defaults, title: titled(c.name), description: c.description || defaults.description, image: c.image ? `${base}${imageUrl(c.image, 'lg', 'jpg')}` : defaults.image };
  }
  const named: Record<string, [string, string]> = { '/categories': ['categories', 'Categories'], '/search': ['search', 'Search'], '/cart': ['cart', 'Cart'], '/checkout': ['checkout', 'Checkout'], '/contact': ['contact', 'Contact us'], '/combos': ['combos', 'Combo Offers'], '/track': ['track', 'Track order'], '/flash-sale': ['flash', 'Flash Sale'] };
  const hit = named[p];
  if (hit) {
    const seo = await db().selectFrom('seo_settings').selectAll().where('page_key', '=', hit[0]).executeTakeFirst();
    return { ...defaults, title: seo?.title || titled(hit[1]), description: seo?.description || defaults.description, noindex: ['/cart', '/checkout', '/track', '/search'].includes(p) };
  }
  if (p.startsWith('/order/') || p.startsWith('/admin') || p.startsWith('/install')) return { ...defaults, title: p.startsWith('/admin') ? `Admin | ${siteName}` : titled('Order'), noindex: true };
  return { ...defaults, title: siteName, noindex: true, status: 404 };
}

export async function renderShell(req: Request, res: Response, nonce: string): Promise<void> {
  let html = shell();
  let status = 200;
  if (isInstalledSync()) {
    const key = `seo:html:${req.path}`;
    const cached = await cache.get<{ head: string; status: number; boot: string }>(key);
    let head: string;
    let boot: string;
    if (cached) ({ head, status, boot } = cached);
    else {
      const m = await metaFor(req);
      const s = await settings.public();
      const fav = s.favicon ? `/uploads/${s.favicon}-32.png` : '/icons/favicon.png';
      const touch = s.app_icon || s.favicon ? `/uploads/${s.app_icon || s.favicon}-180.png` : '/icons/icon-192.png';
      head = [
        `<title>${escapeHtml(m.title)}</title>`,
        `<meta name="description" content="${escapeHtml(m.description)}">`,
        m.keywords ? `<meta name="keywords" content="${escapeHtml(m.keywords)}">` : '',
        `<link rel="canonical" href="${escapeHtml(m.canonical)}">`,
        m.noindex ? '<meta name="robots" content="noindex,nofollow">' : '<meta name="robots" content="index,follow,max-image-preview:large">',
        `<meta property="og:site_name" content="${escapeHtml(String(s.site_name ?? 'ShopiGo'))}">`,
        `<meta property="og:type" content="${m.type}">`,
        `<meta property="og:title" content="${escapeHtml(m.title)}">`,
        `<meta property="og:description" content="${escapeHtml(m.description)}">`,
        `<meta property="og:url" content="${escapeHtml(m.canonical)}">`,
        m.image ? `<meta property="og:image" content="${escapeHtml(m.image)}"><meta property="og:image:width" content="1200"><meta name="twitter:image" content="${escapeHtml(m.image)}">` : '',
        `<meta property="og:locale" content="${s.language === 'en' ? 'en_US' : 'bn_BD'}">`,
        `<meta name="twitter:card" content="${m.image ? 'summary_large_image' : 'summary'}">`,
        `<meta name="twitter:title" content="${escapeHtml(m.title)}">`,
        `<meta name="twitter:description" content="${escapeHtml(m.description)}">`,
        `<meta name="theme-color" content="${escapeHtml(String(s.pwa_theme_color || '#F26B3A'))}">`,
        `<link rel="icon" href="${fav}" sizes="32x32"><link rel="apple-touch-icon" href="${touch}">`,
        ...m.jsonLd.map((ld) => `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`),
      ].filter(Boolean).join('\n    ');
      boot = JSON.stringify({ settings: s }).replace(/</g, '\\u003c');
      status = m.status;
      await cache.set(key, { head, status, boot }, 60);
    }
    html = html.replace(/<title>[\s\S]*?<\/title>/, '').replace('<!--app-head-->', head).replace('<!--app-boot-->', `<script nonce="${nonce}">window.__SG_BOOT__=${boot}</script>`);
  } else {
    html = html.replace('<!--app-head-->', '<title>Install ShopiGo</title><meta name="robots" content="noindex">').replace('<!--app-boot-->', '');
  }
  html = html.replace(/<script type="module"/g, `<script nonce="${nonce}" type="module"`);
  res.status(status).set('Cache-Control', 'no-cache').type('html').send(html);
}
