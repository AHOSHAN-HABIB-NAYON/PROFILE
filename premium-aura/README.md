# Premium Aura — Vip Acess Only

A production-style, mobile-first VIP access platform: **authorized resource allocation**, a **live OTP / test-event feed**, **wallet & withdrawals**, **premium plans with TRC20 / Binance Pay**, **news**, **notifications**, **2FA**, a full **admin panel**, a **10-step installer** and **PWA** support.

- **Backend:** Node.js 18+ · Express 5 · MySQL 8 (mysql2, prepared statements) · Socket.IO
- **Frontend:** HTML5 + CSS3 + vanilla JS (ES modules), Fetch/History-API SPA, Chart.js, Font Awesome, flag-icons
- **No build step.** Runs on any VPS or shared Node host.

## Quick start

```bash
cd premium-aura
npm install --omit=dev        # sharp (image compression) is optional
npm start                     # PORT defaults to 3000
```

Open `http://your-host:3000` → you are redirected to **/install**:

1. System requirements · 2. MySQL credentials (DB is created if missing) · 3. Create tables · 4. Admin account ·
5. Site name · 6. Subtitle · 7. Logo (also used as PWA icon) · 8. SMTP (optional) · 9. PWA settings · 10. Finish

Finishing writes `.env` (DB + generated `SESSION_SECRET`/`ENCRYPTION_KEY`) and `install/installed.lock`; `/install` is then disabled and you land on the login page. Set `INSTALL_TOKEN` in the environment to require `/install?token=…` on public servers.

Manual setup instead: copy `.env.example` to `.env`, fill it in, run `npm run migrate`, create the lock file.

## Project structure

```
premium-aura/
├── server/
│   ├── app.js              # entrypoint: security headers, installer gate, sessions, Socket.IO, workers
│   ├── config/             # env, paths, MySQL pool
│   ├── controllers/        # auth, user, access, events, finance, news, profile, public/SEO, installer, admin/*
│   ├── middleware/         # auth/admin guards, CSRF, maintenance, rate limiters, error handler
│   ├── models/             # settings, users, wallet ledger, notifications, audit log
│   ├── providers/          # ApiProviderInterface + Generic/TelerouteX/ThirdWave/Lamix/EnterpriseSMS/2oo9
│   ├── routes/             # /api, /api/admin, /install, HTML pages
│   ├── services/           # poller, demo generator, events, quota, importer, mailer, 2FA, uploads, scheduler
│   └── utils/              # money (exact decimals), validation, crypto, migrate/seed, escaping
├── public/                 # SPA shell, auth screens, CSS, JS pages, manifest.json, service-worker.js
├── admin/js/               # admin page modules (served only to admins)
├── database/schema.sql     # MySQL 8 schema (31 tables, FKs, unique keys, indexes, DECIMAL money)
├── database/migrations/    # incremental migrations (applied on boot / `npm run migrate`)
├── install/                # installer UI + lock file
├── uploads/ logs/          # runtime data (git-ignored)
└── tests/acceptance.test.js
```

## Key behaviours

| Area | How it works |
|---|---|
| **Resources** | Admin imports CSV/XLSX (`country,service,resource,status`); PDF is archived only. *Get Number* allocates one row with `SELECT … FOR UPDATE SKIP LOCKED`; a unique index on active assignments makes double assignment impossible. |
| **Limits** | Server-side only: request interval (default 1 s), hourly (default 50), daily, plus free/premium quota. Exceeding the quota returns an upgrade prompt. Per-user overrides in Admin → Users. |
| **Events** | Providers are polled every 5 s (per provider). Records are normalised, **only accepted when the number matches an admin-authorized resource**, de-duplicated by `(provider_id, external_id)` + SHA-256 hash, and only the extracted code is stored — never the message body. Matching user gets the reward (default $0.01). |
| **Demo generator** | Admin-only, 1/2/5 events per second (default 2). Stored in `demo_event_logs`, always shown with a **DEMO** badge, never credits wallets. |
| **Live feed** | Socket.IO push with slide-in animation + sound; automatic fallback to 5 s AJAX polling. 30 per page, AJAX pagination. Events expire after 1/6/12/24/48 h (default 24). |
| **Money** | `DECIMAL` columns, string/BigInt arithmetic in JS, locked ledger rows, every change recorded in `wallet_transactions`. Withdrawals (min $50) hold funds immediately and refund on rejection. |
| **API credentials** | Referenced by `.env` variable name (e.g. `THIRDWAVE_API_KEY`) or stored AES-256-GCM encrypted. Write-only in the UI; never sent to the browser. |
| **Security** | Helmet CSP (no inline scripts), synchronizer CSRF tokens, bcrypt (cost 12), session regeneration, lockout after 5 failed logins, TOTP 2FA + single-use recovery codes, upload magic-byte validation + re-encoding, sanitised news HTML, audit log, no stack traces in production. |
| **SEO** | Public `/news/:slug` pages with meta title/description, canonical, Open Graph, Twitter card, JSON-LD; `robots.txt` and `sitemap.xml`. |
| **PWA** | Dynamic `manifest.json` (admin-editable name, colors, icon from uploaded logo), service worker with offline page. |

### Adding an API provider

Most providers need no code: Admin → API Management → *Add provider* (URL, auth type, query/headers, records path) and map fields (`message.code → code`). For quirks, create `server/providers/MyProvider.js` extending `GenericHttpProvider` (override `connect/fetch/normalize/validate/healthCheck`) and register it in `server/providers/index.js`.

## Tests

With an installed instance running:

```bash
BASE_URL=http://localhost:3000 ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='…' npm test
```

28 end-to-end checks: installer lock, auth/verification/reset, CSRF, SQL-injection & XSS handling, CSV/XLSX import, allocation & rate limits, provider polling/dedup/health/auto-poll (with a local mock provider), demo generator rate, pagination, expiry, payments with screenshot upload, withdrawals, news likes/SEO, notifications, profile/password, 2FA, SMTP secrecy, maintenance, suspension/audit, PWA and headers.

## Deployment notes

- Run behind Nginx/Caddy with HTTPS; set `APP_URL=https://…` (enables Secure cookies + HSTS) and `TRUST_PROXY=1`. Proxy WebSocket upgrades for `/socket.io/`.
- Use a process manager (`pm2 start server.js --name premium-aura`). For multiple instances set `DISABLE_WORKERS=true` on all but one.
- Back up MySQL and `uploads/`. Never commit `.env`.
