# Premium Direct-Order Shop (Core PHP + MySQL)

Mobile-first, Bengali-first, Cash-on-Delivery e-commerce. No customer accounts — customers go
Home → Product → Cart → Checkout → COD → Confirm. The admin panel controls everything.

## Requirements
PHP 8.1+ (pdo_mysql, curl, gd with WebP, mbstring, fileinfo), MySQL 5.7+/MariaDB 10.3+, Apache with
`mod_rewrite` (shared hosting is fine). Cron is **not** required.

## Install
1. Upload the contents of this folder to your web root (e.g. `public_html/`).
2. Make `storage/`, `uploads/` and the root folder writable (for `.env`).
3. Open your domain → the **Installation Wizard** runs (server check → database → admin → shop info).
4. The wizard writes `.env`, creates all tables (utf8mb4_unicode_ci) and locks itself (`storage/installed.lock`).
5. Log in at `/admin/login`.

Local development: `php -S 127.0.0.1:8000 server.php` (mimics the `.htaccess` rules).

## Structure
```
config/      app config (reads .env)          core/        DB, Router, Request/Response, Session, CSRF, Auth,
controllers/ storefront + Admin/ controllers                ImageProcessor, HtmlSanitizer, RateLimiter …
api/         JSON endpoints (cart, checkout, search, tracking)
models/      Product, Category, Combo, Banner, Order
services/    Cart, Order, Coupon, Delivery, Stock, IpGuard, Fraud, BDCourier, Meta CAPI, GeoIp,
             Analytics, Notifier, Trash, Seo, CourierManager + Couriers/ (drivers)
routes/      web.php, api.php, admin.php      views/       layouts, components, pages (storefront)
admin/views/ admin templates                  assets/      css, js modules, icons, self-hosted Font Awesome 4.7
pwa/sw.js    service worker source            database/    schema.sql
storage/     cache + logs (web-blocked)       uploads/     images (scripts never execute here)
```

## How the "app-like" navigation works
Every URL is rendered server-side (SEO, direct links, refresh all work). `assets/js/router.js` intercepts
links, fetches the same URL with `X-SPA: 1`, receives `{html, title, meta}` and swaps only `<main id="app">`,
using `pushState`/`popstate` for Back/Forward. Pages are cached in memory (LRU + TTL), prefetched on
hover/touch, and every page module gets an `AbortSignal` so its listeners are removed on navigation.

## Security highlights
PDO prepared statements everywhere · CSRF on every POST · Secure/HttpOnly/SameSite cookies · bcrypt admin
passwords, login rate-limit, session fingerprint + idle timeout · server-side price/stock/coupon/delivery
recalculation · order creation in one transaction with row locks + guarded stock decrement (tested with
10 concurrent orders for 3 units → exactly 3 succeed) · idempotency key against double-click orders ·
upload MIME/dimension validation and re-encoding · whitelist HTML sanitizer for descriptions · strict CSP
(no inline scripts) and security headers · `.env`, source and storage folders blocked by `.htaccess` ·
API keys/tokens are write-only in the admin UI and never sent to the browser or written to logs ·
customers only ever see Bengali messages, never raw PHP/SQL errors.

## Integrations — what to verify with your own credentials
These call real external APIs server-side, but could not be tested live from the development sandbox:
- **BDCourier** (`services/BDCourierService.php`): endpoint is configurable in Settings → ফ্রড চেক; the
  response parser accepts the common `courierData.{courier}` / `summary` shapes. Run one check with your
  key and confirm the numbers match the BDCourier dashboard.
- **Steadfast, Pathao, RedX** drivers follow their published merchant APIs. Use **কানেকশন টেস্ট** first.
- **Paperfly, eCourier, Sundarban, Carrybee**: credential storage exists, but no API driver yet — add a class
  implementing `CourierDriver` in `services/Couriers/` and register it in `CourierManager::REGISTRY`.
- **Meta CAPI / Pixel** and **Google Tag**: use the Test Event Code and Meta's Events Manager to verify.
- **IP location** uses ipwho.is (looked up on demand from the admin order page, cached on the order).
