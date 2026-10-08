# NovaShop — Core PHP E-commerce (Bangladesh, COD, app-like)

A mobile-first, Bengali-first e-commerce store built with **Core PHP 8.1+, MySQL (utf8mb4), HTML5, CSS and vanilla JavaScript** — no framework, no Node server. It runs on **Hostinger shared hosting** (Apache or LiteSpeed) and feels like a single-page app: after the first load only the main content area changes, while the header, sidebar, bottom navigation and WhatsApp button stay mounted.

Customers order without an account (Cash on Delivery). Admins get a full, mobile-friendly dashboard.

---

## Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Project tree](#project-tree)
4. [Installation on Hostinger](#installation-on-hostinger-step-by-step)
5. [Values you must replace](#values-you-must-replace)
6. [Local development](#local-development)
7. [Courier integrations — what each API supports](#courier-integrations)
8. [Security notes](#security-notes)
9. [Testing checklist](#testing-checklist)

---

## Features

**Storefront** — home (banner slider, categories, flash sale with countdown, featured, combo, free-delivery, popular, latest, coupon highlight, support CTA; all orderable/limitable from admin) · category & product listing with filters and SEO-friendly pagination · instant search suggestions · product page (gallery, video, size/colour variants with per-variant stock & price, "সাইজ নির্বাচন করুন" enforcement, quantity, add to cart / এখনই অর্ডার করুন, delivery & COD info, share buttons, specs, features, lazy related products) · AJAX cart (browser-stored, server-priced) · coupons · checkout (পূর্ণ নাম, ফোন নাম্বার, জেলা, পূর্ণ ঠিকানা, নোট) with live delivery charge (ঢাকার ভিতরে/বাইরে) · animated delivery-van order confirmation · WhatsApp order support with pre-filled message · my orders + order tracking · dark mode · installable PWA with offline page.

**App-like navigation** — `AppRouter` intercepts links and GET forms, uses the History API (back/forward/refresh/direct URLs all work), `PageCache` (LRU + TTL + version invalidation), `RequestManager` (de-duplication + `AbortController`), `TransitionManager` (fade/slide of `#app-main` only), `PrefetchManager` (hover/touch intent + idle prefetch of visible products, respects Save-Data). Any failure falls back to normal navigation.

**Admin** — dashboard KPIs & charts, products (editor with variants, instant image upload + compression + reorder, rich text, SEO, related products), categories (visual Font Awesome picker or uploaded icon), banners (auto-cropped, WebP), coupons, orders (filters, bulk status, edit before courier with server-side recalculation, history, print invoice, fraud/courier history, approximate IP location), customers, delivery charges, courier plugins & parcel sync, analytics (today/7d/30d/custom, funnel, top products/categories/districts), Pixel & tracking, plugin marketplace, settings (branding, theme colours, WhatsApp, home sections, texts, policy pages, SEO, PWA, maintenance), security (duplicate-order protection, IP blocks, alerts, sessions, admin users & roles, audit log), backup/restore, notifications, trash/recovery, image compressor, account password & TOTP 2FA, Google Sign-In.

---

## Architecture

```
Browser ──► .htaccess ──► index.php (front controller)
                            │  SecurityHeaders (nonce CSP) · Maintenance · Router
                            ├── app/config/routes.php   storefront pages  → app/controllers/*
                            ├── api/routes.php          JSON API (/api/*)  → api/*.php
                            └── admin/routes.php        admin (/admin/*)   → admin/controllers/*
Controllers ─► models (queries) + services (business logic) ─► View::page()
View::page() renders ONE template and returns either
   • a full HTML document (direct visit, crawler, no-JS), or
   • JSON {html, title, meta, jsonld, page, styles, scripts, nav, track} when the router sends `X-SPA: 1`.
```

* **Same template, two transports** → SEO and app navigation can never drift apart; every URL is server-renderable.
* **CSS per module** (`header.css`, `home.css`, `product.css`, `cart.css`, …). Shell CSS loads once; page CSS is loaded by the router the first time a page type is visited and then reused. Versioned with `?v=mtime` and cached for a year.
* **JS** — `core.js` (delegation, HTTP+CSRF, modal, toast, progress, page-module registry), `router.js`, `store.js` (cart, search, tracking bridge, PWA) and small page modules (`pages/*.js`) registered with `App.page(name, {mount})`. All listeners are delegated and bound once — nothing is re-bound after navigation.
* **Caching** — file cache (`storage/cache`) for settings and catalog queries, flushed + version-bumped on catalog changes so browsers drop stale page caches. No Redis needed.
* **Deferred work** — Meta CAPI calls, analytics counters and GeoIP lookups run after the response is flushed (`fastcgi_finish_request` / `litespeed_finish_request`).

---

## Project tree

```
ecommerce/
├── .htaccess                 clean URLs, HTTPS, security headers, caching, compression
├── .user.ini                 PHP upload limits for shared hosting
├── index.php                 front controller
├── sw.js                     service worker (asset cache + offline page)
├── config.example.php        → copy to config.php
├── README.md
├── app/
│   ├── bootstrap.php
│   ├── config/   app.php (statuses, districts, roles) · defaults.php (setting defaults) · routes.php
│   ├── core/     DB, Request, Response, Router, View, Session, Csrf, Cache, Crypto, RateLimiter,
│   │             HttpClient, Validator, Logger, ErrorHandler, Deferred, HttpException, ValidationException
│   ├── middleware/ Middleware (dispatcher), AdminAuth, SecurityHeaders, Maintenance
│   ├── models/   Setting, Product, Category, Order, Customer, Coupon, Banner, Notification
│   ├── services/ CartService, OrderService, FraudGuard, ImageService, HtmlSanitizer, Tracking,
│   │             PluginManager, Analytics, Seo, GeoIp, Backup, Totp, GoogleAuth, Audit, Trash, Listing
│   │   └── couriers/ CourierPluginInterface, AbstractCourier, CourierResult, CourierManager,
│   │                 BdCourier, SteadfastCourier, PathaoCourier, RedxCourier
│   ├── controllers/ Home, Product, Category, Search, Cart, Checkout, Order, Page, Seo
│   └── helpers/functions.php
├── api/          routes.php, products.php, cart.php, checkout.php, orders.php, analytics.php, courier.php
├── admin/
│   ├── routes.php
│   ├── controllers/ AdminController (base) + Auth, Dashboard, Product, Category, Banner, Coupon, Order,
│   │                Customer, Delivery, Courier, Analytics, Plugin, Settings, Security, Backup,
│   │                Notification, Trash, Tool
│   ├── views/    layouts/ (admin, auth) · pages/ · partials/
│   └── assets/   css/ (admin, admin-editor, print) · js/ (admin, editor, charts, orders)
├── views/        layouts/ (store, minimal) · components/ · pages/
├── public/
│   ├── assets/   css/ (base, header, sidebar, bottom-nav, footer, modal, product-card, home, product,
│   │             category, cart, checkout, order, profile) · js/ (core, router, store, pages/*) · icons/ · images/
│   └── uploads/  products/ banners/ categories/ site/ editor/   (PHP execution disabled)
├── storage/      cache/ logs/ backups/ tmp/                       (denied to the web)
└── database/     schema.sql · seed.sql
```

---

## Installation on Hostinger (step by step)

> Requirements: PHP **8.1 or newer** (8.2/8.3 recommended) with `pdo_mysql`, `gd` (WebP), `mbstring`, `curl`, `sodium`, `fileinfo`, `intl` (optional, improves slugs). MySQL 5.7+/8 or MariaDB 10.3+.

1. **Upload files** — hPanel → *File Manager* → open `public_html` (or a sub-folder). Upload the **contents** of the `ecommerce/` folder (zip it locally, upload, then *Extract*). `index.php`, `.htaccess` and `.user.ini` must sit directly in `public_html`. Show hidden files to confirm the dot-files were extracted.
2. **Create the database** — hPanel → *Databases → MySQL Databases*: create a database and user, give the user *All privileges*. Note the full names (e.g. `u123456789_shop`).
3. **Import the schema** — hPanel → *phpMyAdmin* → select the database → *Import* → `database/schema.sql`, then import `database/seed.sql` (icon library, plugin rows, sample catalog — delete the samples later from Admin → Products/Categories).
4. **Configure database credentials** — in File Manager copy `config.example.php` to `config.php` and edit `DB_HOST` (usually `localhost`), `DB_NAME`, `DB_USER`, `DB_PASS`.
5. **Configure base URL & secrets** — in `config.php` set `APP_URL` (e.g. `https://yourshop.com`), a random 64-char `APP_KEY` (`php -r "echo bin2hex(random_bytes(32));"` or any password generator) and a private `INSTALL_KEY`. Keep `APP_DEBUG` = `false`.
6. **Configure `.htaccess`** — works as-is in the domain root. If you install in a sub-folder (e.g. `/shop`), change `RewriteBase /` to `RewriteBase /shop/`. HTTPS redirect is built in — enable the free SSL in hPanel → *Security → SSL* first.
7. **Storage permissions** — folders `storage/cache`, `storage/logs`, `storage/backups`, `storage/tmp` and `public/uploads/*` must be writable (755 folders / 644 files is the Hostinger default and works because PHP runs as your user). Never make them 777.
8. **Login to admin** — open `https://yourshop.com/admin`. The first visit redirects to `/admin/setup`: enter your `INSTALL_KEY`, name, email and a strong password. The setup page disables itself once an admin exists. Then enable 2FA under the avatar menu → *Account & 2FA*.
9. **Configure the store** — Admin → *Settings*: store name, logo, favicon, colours, contact, social links, WhatsApp number (default `+8801757827996` — change it), home sections, texts and policy pages. Admin → *Delivery*: inside/outside Dhaka charges (defaults ৳70 / ৳130), inside-Dhaka districts, free delivery rules.
10. **Add courier credentials** — Admin → *Plugins* → Steadfast / Pathao / RedX → paste API credentials → *Save* → *Test connection*. For customer courier history / fraud check open *BD Courier* and paste your `api.bdcourier.com` token. Credentials are stored **encrypted** and are never sent to the browser.
11. **Add Meta Pixel** — Plugins → *Meta Pixel* → Pixel ID → enable. Plugins → *Meta Conversions API* → Access Token (+ Test Event Code while testing in Events Manager) → enable → *Test connection*. Admin → *Pixel & Tracking* lets you toggle each event for browser/server.
12. **Add Google tracking** — Plugins → *Google Tag Manager* (GTM-XXXX) and/or *Google Ads Conversion* (AW-… + label). Scripts load only when configured.
13. **Test checkout** — place an order from a phone: product → choose size → এখনই অর্ডার করুন → checkout → অর্ডার কনফার্ম করুন. Check the confirmation animation, the WhatsApp support message, the admin notification and the order in Admin → Orders. (Duplicate protection blocks a second order from the same phone/device/IP for 24 h by default — adjust in Admin → Security.)
14. **Test courier** — open the order → set status *Confirmed* → **কুরিয়ারে পাঠান** → review/edit name, phone, address, COD amount → send. The consignment ID, tracking code and status appear on the order; *Refresh status* or Courier → *Sync all statuses* pulls updates.
15. **Test production** — open a product link directly and refresh; use browser back/forward; check `https://yourshop.com/sitemap.xml` and `/robots.txt`; submit the sitemap in Google Search Console; run Lighthouse on mobile; verify Meta events in Events Manager → Test events; create a backup in Admin → Backup and download it.

**Upload size** — `.user.ini` raises `upload_max_filesize` to 10 MB. If Hostinger ignores it, set the same values in hPanel → *Advanced → PHP Configuration*.

---

## Values you must replace

| Where | Key | Notes |
|---|---|---|
| `config.php` | `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS` | from hPanel → MySQL Databases |
| `config.php` | `APP_URL` | `https://yourdomain.com` (no trailing slash) |
| `config.php` | `APP_KEY` | 64 random hex chars; changing it later makes saved API secrets unreadable |
| `config.php` | `INSTALL_KEY` | one-time key for `/admin/setup` |
| `config.php` | `COURIER_API_TOKEN` | optional fallback for BD Courier (placeholder `BDC_COURIER_API_TOKEN`); prefer Admin → Plugins |
| `config.php` | `META_PIXEL_ID`, `META_ACCESS_TOKEN`, `META_TEST_CODE`, `GOOGLE_TAG_ID`, `GOOGLE_CONVERSION_ID`, `GOOGLE_CONVERSION_LABEL`, `GOOGLE_CLIENT_ID` | optional fallbacks; admin settings override them |
| Admin → Settings | WhatsApp number, store info, logo, colours | stored in the database |

---

## Local development

```bash
cp config.example.php config.php   # set DB_* and APP_ENV=local
mysql -u root -e "CREATE DATABASE shop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mysql -u root shop < database/schema.sql && mysql -u root shop < database/seed.sql
php -d upload_max_filesize=10M -d post_max_size=40M -S localhost:8000 index.php
```

`index.php` mirrors the `.htaccess` rewrites when run under PHP's built-in server.

---

## Courier integrations

All couriers implement `CourierPluginInterface` (create order, status, tracking, fraud check, balance, cancel). Each plugin declares its **capabilities**; the admin UI only offers what the provider's API supports. Add a new courier by creating a class extending `AbstractCourier` and registering it in `CourierManager::CLASSES`.

| Plugin | Capabilities | API used |
|---|---|---|
| **BD Courier** (`api.bdcourier.com`) | Fraud / courier-history check | `POST /courier-check?phone=…` with `Authorization: Bearer <token>`; returns per-courier totals and success ratio. It is a lookup service — parcels are created through the delivery couriers below. Base URL is editable. |
| **Steadfast** | Create, status, tracking link, balance | Packzy merchant API v1 (`Api-Key` / `Secret-Key`) |
| **Pathao** | Create, status, tracking link | Aladdin API v1 (OAuth password grant; token cached encrypted). Needs Store ID; city/zone IDs optional |
| **RedX** | Create, status, tracking link | Open API v1.0.0-beta (`API-ACCESS-TOKEN`). Needs default delivery-area ID |

Courier statuses are normalised; *delivered* moves the order to Delivered, *returned/cancelled* to Returned (stock is returned automatically).

Provider APIs change from time to time — verify field names against your merchant panel docs before going live; each plugin's base URL is configurable without code changes.

---

## Security notes

* PDO prepared statements everywhere; output escaped with `e()`; rich HTML sanitised with a whitelist (`HtmlSanitizer`).
* CSRF: admin session token; storefront signed double-submit cookie + Origin check. Sessions are admin-only, `HttpOnly`, `SameSite`, `__Host-` prefixed on HTTPS, tracked in `admin_sessions` (revocable), 8 h idle timeout.
* Passwords use `password_hash()`/`password_verify()`; login throttling and lockout; optional TOTP 2FA; Google Sign-In only for existing admins.
* API secrets (courier, CAPI, 2FA seeds) are encrypted with libsodium using `APP_KEY` and never rendered to the browser.
* Uploads: size, extension, MIME (`finfo`) and real-image checks, dimension limits, random filenames, re-encoding (strips payloads/EXIF), PHP execution disabled in `public/uploads`, SVG blocked.
* Nonce-based Content-Security-Policy, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS on HTTPS.
* Production errors are logged privately to `storage/logs` and customers see a friendly Bengali message; JSON endpoints return `{"success":false,"message":"…"}`.
* Duplicate/fake order protection combines phone, anonymous device cookie and IP (each toggleable, because mobile carriers share IPs); repeated attempts raise alerts and can auto-block the IP for checkout only.
* Customer autofill is privacy-safe: previous details are returned only to a browser already linked to that customer by a signed, HttpOnly device cookie — typing someone else's phone number reveals nothing. Order confirmation details are shown only to the ordering device (or to someone with the order number **and** phone on the tracking page).
* IP geolocation shown to admins is **approximate** (network/ISP level) and never exposed publicly.

---

## Testing checklist

Verified during development (PHP 8.3 built-in server **and** Apache 2.4 with this `.htaccess`, MariaDB 10.11, Chromium at 390 px and 1366 px):

- Home → product → back → forward without full reloads (same JS context), direct URLs and refresh render server-side.
- Size required before add-to-cart; cart pricing, delivery zone (৳70/৳130), coupons; checkout validation; order placement, idempotency, confirmation animation, cart cleared.
- Duplicate order blocked (same IP/phone/device), privacy-safe autofill on the same device.
- AJAX failure → automatic normal navigation; JavaScript disabled → pages and GET forms still work.
- Admin: setup, login, SPA navigation through every section, product create with variants + image upload (4 MB JPEG → 256 KB/73 KB/38 KB WebP), category with icon picker, coupon, order status/edit/print, plugin save & test, backup, compressor, trash restore.
- Meta Pixel + GTM events fire with the same `event_id` as server CAPI; prefetched pages do not trigger server events; CAPI token never appears in HTML.
- Apache: `/app`, `/storage`, `/database`, `config.php`, `.user.ini`, `.git`, `README.md` return 403; PHP files under `/api` and `/admin/controllers` are not executable; static assets are cached for a year and HTML is gzip-compressed.
