# TradeTeam — real-time trading platform

A full-stack, production-oriented trading platform built with **Node.js + TypeScript**:
Express API, Socket.IO real-time gateway, MySQL, Redis, and a Next.js (React) frontend that
behaves like a native mobile trading app and a professional desktop terminal. **Light mode is the
default**; a separately designed dark theme is one tap away and remembered per user.

> Nothing is simulated. Prices, candles, order books and trades come from the configured market-data
> provider (Binance, all spot pairs) or from the platform's own matching engine. Without provider
> connectivity the UI shows empty/"waiting" states — never invented data.

## What's inside

| Area | Highlights |
| --- | --- |
| **Markets** | Complete, dynamically synced asset & pair catalogue (thousands of pairs), new-listing and delisting detection, server-side search/sort/pagination, virtualised lists, per-user favourites, CoinGecko name/logo/market-cap enrichment |
| **Real-time** | Single multiplexed WebSocket per client (MessagePack), demand-driven upstream subscriptions, Redis Pub/Sub fan-out across instances, snapshots on subscribe, clock sync, reconnect + resubscribe, duplicate/out-of-order protection |
| **Charts** | TradingView Lightweight Charts, 1s–1W, incremental candle updates from live trades reconciled with provider klines, lazy history paging, MA / EMA / BOLL / VWAP / RSI / MACD, fullscreen |
| **Trading** | Market, limit, stop-market, stop-limit, take-profit, stop-loss; GTC/IOC/FOK; internal price-time matching engine with atomic settlement; external (exchange) execution with reconciliation |
| **Money** | Decimal-only math, `DECIMAL(36,18)` columns, row-locked balance changes, DB-enforced non-negative balances, append-only ledger (DB triggers), cost basis & realised/unrealised P&L |
| **Wallet** | Deposit addresses from xpub (no private keys on the server) or static address + memo, QR codes, HMAC-signed deposit webhook with confirmation tracking, withdrawals with step-up verification, admin review workflow, internal transfers |
| **Auth & security** | Argon2id, server-side sessions (hashed tokens, idle + absolute expiry, rotation), CSRF double-submit + Origin checks, rate limits, lockouts, TOTP 2FA + backup codes, passkeys (WebAuthn), Google OAuth with safe account linking, email verification & OTP login, device/session management, security events, encrypted secrets at rest |
| **Admin** | Separate console with mandatory 2FA/passkey, RBAC (super admin / admin / support), IP allowlist, audit log for every sensitive action, users, markets, assets, networks, orders, trades, deposits, withdrawals, fees, announcements, settings, maintenance, health, migrations |
| **Installer** | First visit opens a one-time wizard (requirements → DB → admin → app → services → install). Creates schema + secrets, then locks itself permanently; updates run migrations only |
| **PWA** | Manifest, icons, service worker (app shell only — API/WebSocket never cached, no offline trading), Web Push |

## Repository layout

```
tradeteam/
  apps/
    api/                    Node.js server (API, WebSocket, market data, engine, workers, installer)
      src/
        config/             env loading + validation, storage paths
        infrastructure/     db (mysql2), redis, queue (BullMQ), crypto, mailer, logger
        database/           migrator + versioned migrations
        http/               express app, middleware (auth, csrf, rate limit, validation, errors)
        websocket/          gateway (Socket.IO) + cross-process bus (Redis Pub/Sub)
        modules/
          auth/ users/ admin/ settings/ notifications/ install/ system/
          markets/          registry, metadata sync, REST routes
          market-data/      provider abstraction, Binance adapter, candle aggregator, hub
          trading/          order book, matching, engine, orders service, external execution, fees
          wallets/          ledger, balances, deposits, withdrawals, transfers
          portfolio/
      test/                 unit + integration tests (real MySQL + Redis)
    web/                    Next.js app (user app, admin console, installer, PWA)
  packages/shared/          types, WebSocket contract, decimal helpers, indicators
  infrastructure/           nginx, systemd, PM2 configs
  scripts/                  backup
  docs/                     ARCHITECTURE.md, DEPLOYMENT.md
```

## Quick start (development)

Requirements: Node.js ≥ 20, MySQL 8 / MariaDB 10.6+, Redis 6+.

```bash
cd tradeteam
npm install
npm run dev            # API + WebSocket + Next.js dev server on http://localhost:3000
```

Open http://localhost:3000 — you are redirected to **/install**. The setup token is printed in the
server log and stored in `storage/install-token.txt`. After installation the installer is gone for
good and the login page appears.

## Production

```bash
npm ci
npm run build          # builds apps/web (.next) and bundles apps/api (dist/)
npm start              # NODE_ENV=production node apps/api/dist/server.js
```

Put nginx (config in `infrastructure/nginx/`) in front for TLS and WebSocket upgrades, run the
process with systemd or PM2, and follow **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for HTTPS,
scaling, logging, backups and upgrades.

## Tests & quality

```bash
npm run lint           # ESLint (typescript-eslint, react-hooks)
npm run typecheck      # tsc --noEmit, strict mode, all packages
npm test               # vitest: shared, web and API suites
```

The API suite runs against a real MySQL/MariaDB and Redis (defaults: `tt`/`ttpass`@127.0.0.1,
Redis DB 15; override with `TEST_DB_*` / `TEST_REDIS_URL`). It covers matching & settlement,
concurrency (no negative balances), ledger reconciliation & immutability, order validation,
stop triggers, engine recovery, auth (registration, verification, lockout, TOTP, backup codes,
session revocation, data isolation), withdrawals with step-up, signed deposit webhooks, admin
RBAC + mandatory 2FA, the installer lock, migrations, the WebSocket gateway, and the Binance
adapter (normalisation, multiplexing, reconnect + resubscribe) against a local mock server.

## External services you connect

| Service | Needed for | Without it |
| --- | --- | --- |
| Market-data provider (Binance public API) | Live prices/candles/books for all provider pairs | Only internal markets have data |
| Exchange API keys (admin → settings) | Executing orders on provider markets | Provider markets are view-only; internal markets trade normally |
| SMTP | Verification codes, password resets, alerts | Email verification is disabled by the installer; emails are skipped with a warning |
| Google OAuth client | "Continue with Google" | Button hidden |
| Custody / chain watcher | Detecting deposits (signed webhook) and broadcasting withdrawals | Admins record deposits and complete withdrawals manually |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design of every subsystem.
