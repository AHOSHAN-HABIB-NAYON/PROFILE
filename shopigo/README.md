# ShopiGo

A production-grade, Bangladesh-focused **Cash-on-Delivery e-commerce platform**: mobile-app-style storefront, full admin panel, one-time web installer, signed versioned updates, multi-courier integration, fraud protection, analytics, SEO and PWA.

Customers order **without an account** (Home → Product → Cart → Checkout → COD → Confirmation). Everything a store owner needs is configurable from the admin panel — no code editing.

## Stack

| Layer | Technology |
|---|---|
| Server | Node.js 20+, Express 5, TypeScript (ESM) |
| Database | MySQL 8 / MariaDB 10.6+ via **Kysely** (type-safe query builder, in-process forward-only migrations) |
| Cache / rate limits | Redis (optional) with automatic in-memory fallback |
| Images | Sharp → AVIF + WebP (thumb / md / lg) + JPEG for social previews |
| Client | React 19, React Router 7 (code-split routes), TanStack Query, Zustand, Tailwind CSS 4 |
| Auth | Argon2id passwords, server-side sessions (HTTP-only SameSite=Strict cookies), CSRF double-submit, **passkeys (WebAuthn)**, TOTP 2FA |

## Project layout

```
shopigo/
├── app.js                 # launcher (cPanel/Passenger/PM2 startup file) — loads the active release
├── server/src/
│   ├── core/              # paths, env, crypto (AES-256-GCM), install state, cache, validation
│   ├── db/                # schema types, migrations/, idempotent defaults, demo seed (dev only)
│   ├── middleware/        # auth / permissions / CSRF, uploads
│   ├── modules/           # install, auth, store (public API), admin/*, seo
│   ├── services/          # pricing, orders, fraud, tracking (Meta CAPI / GA4 MP), backup, updater, …
│   ├── couriers/          # CourierAdapter interface + steadfast, pathao, redx, bdcourier, custom
│   ├── app.ts             # Express app (helmet CSP w/ nonces, rate limits, gates, SPA shell)
│   ├── index.ts           # boot (install detection, auto-migrate on code change, scheduler)
│   └── cli.ts             # migrate | health | relink | reset-admin | backup | maintenance | seed-demo
├── client/src/
│   ├── store/             # storefront pages & components
│   ├── admin/             # admin panel (sidebar on desktop, bottom nav on mobile)
│   ├── install/           # first-run installer wizard
│   └── lib/               # api client, cart, i18n (en/bn), tracking, PWA
├── client/public/sw.js    # service worker (app-shell + image + API caching, offline page)
├── scripts/               # build-update-package, generate-update-keys
├── android-twa/           # Trusted Web Activity config for a Play Store app
├── storage/  uploads/     # SHARED data — never part of a release, never overwritten
└── releases/<version>/    # created by the updater
```

## Quick start (development)

```bash
npm install
npm run build          # compiles server + builds client
npm start              # http://localhost:3000 → installer opens automatically
```

For hot reload: `npm run dev` (API on :3000) and `npm run dev:client` (Vite on :5173, proxies `/api`).

Demo data (development only, empty store required): `node server/dist/cli.js seed-demo`.

## Feature map

- **Installer** — requirements check, DB connection test, website + super-admin setup, secrets generation, migrations, defaults, `storage/install.lock`. Permanently disabled afterwards (`/install` shows "ShopiGo is already installed."); if the lock is lost, it is re-created from the database instead of re-installing.
- **Storefront** — banner slider, category icons (Font Awesome or uploaded), flash sale with countdown, combo offers, coupon highlight, free-delivery / best-selling / new / featured / recommended sections (each on/off, ordered, count, columns, per-page), search with suggestions, product gallery + zoom, mandatory size selection, reviews, wishlist, order tracking, contact page, floating WhatsApp, Bangla/English UI.
- **Checkout** — COD only, district → upazila/thana dropdowns (64 districts, Dhaka metro thanas), returning-customer autofill (full details only on the same device), server-side pricing, delivery rules, coupons, animated confirmation (courier van animation, then removed).
- **Orders** — status workflow (New → … → Delivered/Cancelled/Returned), edit before courier, stock restore on cancel/return, bulk actions, print invoice, WhatsApp/call, trash & restore, risk score, IP location, device info.
- **Couriers** — Steadfast, Pathao, RedX, BD Courier (customer success-ratio check) and a template-based Custom API; credentials encrypted server-side or supplied via `COURIER_<CODE>_<FIELD>` env vars; one-click send, status sync (manual + scheduled), API log, courier report.
- **Fraud protection** — IP/phone/device order limits, auto temporary → lifetime blocks, weighted risk score (address reuse, cancellation history, quantity, BD Courier ratio), LOW/MEDIUM/HIGH thresholds, admin alerts, block lists.
- **Analytics** — dashboard (Today…Year), sales/orders charts, funnel, best-selling, most viewed, categories, districts, gross profit.
- **Marketing & SEO** — Meta Pixel + Conversions API (event-id deduplication), GA4 / Google Ads, per-product SEO/OG/Twitter/JSON-LD rendered server-side, sitemaps, robots.txt.
- **System** — roles & permissions, audit log (old/new values), notifications (live via SSE), trash, backups (manual + scheduled, retention, restore with safety copy), updates (signed packages, rollback), maintenance mode, health page.

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for hosting, updates and security notes.
