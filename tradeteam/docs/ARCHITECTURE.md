# Architecture

## 1. System overview

```
                         ┌──────────────────────────── Node.js process(es) ─────────────────────────────┐
 Browser / PWA           │                                                                               │
 ┌─────────────┐  HTTPS  │  Express ── /api/* ── routes → services → MySQL (mysql2 pool)                  │
 │ Next.js app │ ───────►│     │                                  └──► Redis (cache, sessions, limits)   │
 │ (React)     │         │     └── everything else → Next.js request handler (same port)                 │
 │             │   WSS   │                                                                               │
 │ socket.io   │ ◄──────►│  WebSocket gateway (Socket.IO, MessagePack) ◄── Redis Pub/Sub ◄──┐            │
 └─────────────┘         │                                                                  │            │
                         │  Market-data hub (leader) ── provider WS/REST ── normalise ──────┤            │
                         │  Matching engine (single writer) ── settle in MySQL tx ──────────┤            │
                         │  Workers (BullMQ): email, push · reconciler · portfolio snapshots─┘           │
                         └───────────────────────────────────────────────────────────────────────────────┘
```

One process can run every role (the default, ideal for a single VPS or Node.js host). Roles can be
split with `RUN_MARKET_DATA`, `RUN_ENGINE`, `RUN_WORKERS` for horizontal scaling; all cross-process
communication goes through Redis.

* **Business logic lives in services** (`modules/*/…service.ts`, `trading/engine.ts`, `wallets/ledger.ts`);
  routes only parse/validate input (zod) and call services.
* **Money is never a JS number.** `decimal.js` (40 significant digits, round-down) for every
  calculation, `DECIMAL(36,18)` in MySQL, decimal strings on the wire.

## 2. Database (MySQL / MariaDB, InnoDB, utf8mb4)

Migrations: `apps/api/src/database/migrations`, applied by `migrator.ts` under a `GET_LOCK` so only
one instance migrates; applied versions + checksums are stored in `schema_migrations`.

| Domain | Tables |
| --- | --- |
| Identity | `users`, `user_profiles`, `admin_users`, `admin_roles`, `admin_permissions`, `admin_role_permissions` |
| Sessions & credentials | `user_sessions` (hashed tokens, idle/absolute expiry, MFA timestamp), `user_devices`, `passkeys`, `two_factor_auth` (encrypted secret, last used step), `backup_codes` (hashed), `email_tokens` (hashed code + link token) |
| Security | `login_attempts`, `security_events`, `audit_logs` |
| Notifications | `notifications`, `push_subscriptions` |
| Catalogue | `assets`, `networks` (deposit mode, encrypted xpub, confirmations, limits), `markets` (tick/step, min/max, engine, provider, status, `sync_locked`), `favorites`, `fees` |
| Market data | `candles` (PK market/interval/open_time), `market_ticks`, `order_book` (level snapshot) |
| Trading | `orders` (locked_remaining, trigger condition, external id, `UNIQUE(user_id, client_order_id)` for idempotency), `trades` (`UNIQUE(market_id, external_ref)`), `order_fills` (incl. realised P&L) |
| Money | `wallets`, `balances` (`CHECK available >= 0`, `CHECK locked >= 0`), `ledger_entries` (append-only, enforced by triggers), `wallet_addresses`, `deposits` (`UNIQUE(network, txid, output_index)`), `withdrawals`, `transactions`, `cost_basis`, `portfolio_snapshots` |
| System | `system_settings` (typed, secrets AES-256-GCM encrypted), `schema_migrations` |

## 3. Authentication & security

* **Passwords:** Argon2id (m=64 MiB, t=3, p=1), rehash-on-login, timing-equalised unknown-user path,
  policy (≥10 chars, mixed case, digit).
* **Sessions:** 256-bit random token in an `HttpOnly`, `Secure` (on HTTPS, `__Host-` prefix),
  `SameSite=Lax` (admin: `Strict`) cookie. Only the SHA-256 is stored. Redis caches resolved sessions
  (5 min) and is invalidated on revocation; idle expiry slides at most once a minute. Tokens rotate on
  login, password change, 2FA changes. Revocation also disconnects that session's WebSockets.
* **CSRF:** SameSite + Origin check (production) + double-submit token (`tt_csrf` cookie ↔
  `X-CSRF-Token` header) on every unsafe method.
* **Brute force:** Redis rate limiters per IP / account / principal; account lockout after N failures;
  generic error messages; no account enumeration on register/forgot-password.
* **2FA:** RFC 6238 TOTP with replay protection (atomic last-step), 10 single-use backup codes.
* **Passkeys:** SimpleWebAuthn; single-use server challenges in Redis bound to the principal;
  multiple named passkeys per account with device info, revocation, counter updates; usernameless
  login counts as a strong factor.
* **Google:** server-side OAuth code flow with state + PKCE + nonce, or GIS ID-token POST; ID token
  verified server-side. Linking rules prevent duplicates and pre-hijacking (unverified local accounts
  lose their password when claimed by the verified Google owner).
* **Step-up:** withdrawals, transfers and credential removal require a passkey/TOTP verification in
  the last 5–10 minutes (session `mfa_at`).
* **Admin:** separate principal type, cookie and session lifetime; second factor mandatory before
  any admin API works; RBAC permissions; optional IP/CIDR allowlist; every mutation is audit-logged
  with before/after data.
* **Secrets:** environment or `storage/runtime.env` (0600) only; database-stored secrets encrypted
  with AES-256-GCM + per-field AAD; nothing secret is ever sent to the browser (`/api/config/public`
  exposes an explicit allowlist).
* **Headers:** Helmet CSP (no third-party scripts except Google Identity), HSTS on HTTPS,
  frame-ancestors none, nosniff, strict referrer policy. Uploads are validated by magic bytes.
* **SQL injection:** every query uses placeholders; dynamic fragments are built from constants only.

## 4. Real-time architecture

```
Provider WS ─► Market-data hub ─► CandleAggregator ─► Redis PUBLISH tt:md:<channel> ─► Gateway(s) ─► clients
                     │                                        ▲
                     └─► Redis snapshots (md:tickers, md:book:*, md:candle:*:*, md:trades:*)
Matching engine ──────────────────────────────────────────────┘ (internal markets publish the same events)
```

* **Channels** (`packages/shared/src/events.ts`): `ticker:SYM`, `trades:SYM`, `book:SYM`,
  `candles:SYM:INTERVAL`. Symbols are dynamic and validated against the market registry.
* **Gateway:** one Socket.IO connection per tab, MessagePack framing, per-message deflate above a
  threshold, per-socket channel cap. Joins rooms per channel; subscribes to the Redis channel only
  while it has local members; sends the latest snapshot immediately on subscribe.
* **Interest → upstream:** gateways keep `md:interest:<instance>` sets (TTL-refreshed) and publish
  `md:ctl`; the hub (leader-elected via Redis) subscribes upstream only to streams someone watches,
  multiplexing up to 200 streams per provider connection, and releases them after a grace period.
* **Tickers for thousands of markets:** one `!miniTicker@arr` stream; the hub updates a Redis hash,
  sends one batched `tt:tickers` message to API instances (in-memory lists for search/sort), and
  per-symbol events only for watched `ticker:` channels. Clients subscribe only to rows that are
  actually rendered in the virtualised list.
* **Latency:** trades/candles are micro-batched in a 25 ms window (book updates are forwarded
  immediately). Clients measure RTT and server clock offset (`time:sync`).
* **Resilience:** exponential-backoff reconnects with full resubscription on both the provider and
  client side, proactive reconnect before Binance's 24 h limit, stale-connection watchdog,
  duplicate/out-of-order filtering (trade ids, candle open times, book update ids).
* **Private events** (`order:*`, `balance:updated`, `trade:new`, `notification:new`) go to the per-user
  room from any process through `tt:user`.

## 5. Market data

`MarketDataProvider` (`modules/market-data/provider.ts`) abstracts REST + streaming. Implemented:

* **Binance** (`binance.ts`): exchangeInfo (all spot symbols, tick/step/notional filters), 24h tickers,
  klines, depth, trades; combined streams with dynamic SUBSCRIBE/UNSUBSCRIBE respecting the 5 msg/s
  control limit.
* **Internal**: markets created in the admin panel; data produced by the matching engine.

**Metadata sync** (`markets/sync.ts`) runs on the leader every N minutes: upserts every asset and
pair, detects new listings, marks disappeared pairs `delisted` (and re-lists them if they return),
never overwrites admin-edited limits (`sync_locked`) and refuses to delist everything if the provider
returns an empty list.

**Candles** (`market-data/aggregator.ts`): the current candle is updated on every live trade for the
lowest latency and reconciled with the provider's kline stream, which carries the last included trade
id — trades with ids ≤ that are ignored, so aggregation is exact and duplicate-safe. New candles open
automatically at interval boundaries; closed candles are persisted. History comes from the provider
REST API behind Redis caching (immutable pages cached for an hour), with a DB fallback.

## 6. Trading

**Order entry** (`orders.service.ts`): validates market status, tick/step, min/max quantity and
notional, TIF rules; computes the funds to lock (sell: base qty; limit buy: qty × price; market buy:
total, or qty × reference × 1.05 buffer); in one transaction locks the balance row, inserts the order
(`clientOrderId` idempotency) and moves available → locked with a ledger entry.

**Internal engine** (`engine.ts`): one in-memory book per market (price levels in sorted arrays,
FIFO queues). Commands for a market run strictly sequentially. For each order:

1. `planMatch` (pure) computes fills without mutating the book (price-time priority, limit crossing,
   quote budget for market buys, FOK pre-check, self-trade prevention by cancelling the resting order).
2. Settlement in **one DB transaction**: lock all involved balance rows in a deterministic order,
   insert trades + fills, move funds (buyer: locked quote → base minus fee; seller: locked base →
   quote minus fee), write ledger entries, update cost basis / realised P&L, update maker and taker
   orders, release price-improvement and leftover locks.
3. Only after COMMIT is the plan applied to memory and events published. A failed settlement rolls
   back entirely and rejects the order with its funds released.

Stop/TP/SL orders wait in a trigger list and are executed when the last traded price crosses the
trigger. On startup the engine rebuilds books from open orders and resumes orders that were accepted
but not processed. Other processes send commands via a Redis Stream consumer group.

**External execution** (`external.ts`): funds are locked internally, then the order is placed on the
exchange with `clientOrderId = tt_<id>` (idempotent). A reconciliation loop pulls the exchange's
authoritative order status and trade list and settles each fill exactly once
(`UNIQUE(market_id, external_ref)`); terminal states release remaining locks; uncertain submissions
(timeouts/5xx) are resolved by reconciliation rather than retried blindly. Without API keys, orders on
provider markets are rejected with a clear message — no simulated fills.

## 7. Wallets

* **Ledger:** `BalanceSession` is the only code that mutates balances; it row-locks, checks
  non-negativity (also enforced by CHECK constraints), writes the new values and an immutable ledger
  row with deltas and resulting balances. An integration test reconciles `SUM(ledger)` with balances.
* **Deposits:** addresses derived from an EVM **xpub** (index = user id; no private keys on the server)
  or a static address + per-user memo. Deposits arrive via an HMAC-SHA256-signed, replay-protected
  webhook from your chain watcher/custody (or are recorded by an admin), are idempotent on
  `(network, txid, output_index)` and are credited exactly once when confirmations reach the network
  requirement.
* **Withdrawals:** step-up verification, address validation (regex, EVM checksum, memo), daily limit,
  fee, lock amount + fee, admin review → approve → processing → complete with txid (or reject with
  refund). Signing/broadcast happens in your custody system; the platform never holds keys.

## 8. One-time installer

* Enabled only while `storage/install.lock` is absent; requires the setup token from the server log.
* Steps: requirements → database (created if needed) → administrator (+ optional TOTP) → application
  → services (market data, SMTP, Google, WebSocket, exchange keys) → install.
* Install: create DB, refuse if the DB already contains an installation, generate secrets
  (session, AES key, webhook key, VAPID), run migrations, write settings (secrets encrypted), create
  the super admin, write `storage/runtime.env` (0600) atomically, create the lock with `O_EXCL`,
  then start all services **in-process** and verify the WebSocket gateway.
* Afterwards `/install` redirects to `/login` and every installer API returns 404. Updates only run
  pending migrations at startup (`AUTO_MIGRATE`) or via `npm run migrate` / the admin console.

## 9. Frontend

* Next.js App Router, TypeScript, Tailwind CSS v4 with CSS-variable design tokens for both themes.
* Mobile: sticky header, bottom tab bar (Home, Markets, Trade, Orders, Wallet), "More" menu, bottom
  sheets with swipe-to-dismiss, safe-area insets, sticky Buy/Sell controls, fullscreen chart.
  Desktop: sidebar + top bar + multi-panel trading workspace.
* **Granular rendering:** WebSocket data lands in keyed external stores; each component subscribes
  to one key via `useSyncExternalStore`, so a BTC tick re-renders only BTC price cells. The chart is
  updated imperatively (`series.update`) — no React render per tick.
* React Query for REST data; private WS events patch/invalidate exactly the affected queries.
* No secrets in the bundle; CSRF token handled transparently by `lib/api.ts`.
