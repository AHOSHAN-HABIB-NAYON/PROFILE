# Deployment

## Requirements

* Linux host with **Node.js 20+** (22 LTS recommended)
* **MySQL 8.0.16+** or **MariaDB 10.6+** (InnoDB). The DB user needs rights to create the database
  (or create it yourself) and, for the ledger immutability triggers, `TRIGGER` (+ `SUPER` or
  `log_bin_trust_function_creators=1` when binary logging is on). Without it the migration records
  a warning and the application-level guarantees still apply.
* **Redis 6+** (persistence recommended: `appendonly yes`)
* A domain with **HTTPS** (required for secure cookies, passkeys, Google sign-in and PWA install)
* Outbound access to your market-data provider (e.g. `api.binance.com`, `stream.binance.com:9443`)

## Build

```bash
git clone … && cd tradeteam
npm ci
npm run build        # → apps/web/.next and apps/api/dist
```

## First start → installer

```bash
NODE_ENV=production PORT=3000 HOST=127.0.0.1 STORAGE_DIR=/var/lib/tradeteam node apps/api/dist/server.js
```

1. Open `https://your-domain` — every page redirects to **/install**.
2. Enter the setup token printed in the log (also at `$STORAGE_DIR/install-token.txt`).
3. Complete the wizard. The platform starts all services without a restart.
4. From now on `/install` redirects to `/login`. The installer never runs again; configuration is
   never reset and existing databases are never overwritten.

`STORAGE_DIR` holds `install.lock`, `runtime.env` (DB credentials + generated secrets, mode 0600) and
uploads. Keep it **outside** any web root, back it up, and never commit it.

## Process management

* **systemd:** `infrastructure/systemd/tradeteam.service` (hardened unit). `systemctl enable --now tradeteam`
* **PM2:** `pm2 start infrastructure/pm2/ecosystem.config.cjs && pm2 save && pm2 startup`

The process handles `SIGTERM` gracefully (drains the engine queue, persists candles, closes
connections).

## Reverse proxy & HTTPS

Use `infrastructure/nginx/tradeteam.conf`: TLS termination, HTTP→HTTPS, WebSocket upgrade on
`/socket.io/` with 1 h timeouts and no buffering, keep-alive upstream, long-lived caching of
`/_next/static`. Set `APP_URL=https://your-domain` (the installer does this) and keep
`TRUST_PROXY=loopback` when nginx runs on the same host so client IPs are correct.

Cloudflare/other CDNs: enable WebSockets and do not cache `/api/*` or `/socket.io/*`.

## Configuration reference

See `.env.example`. Environment variables override `storage/runtime.env`. Runtime settings (site,
auth, SMTP, OAuth, market data, fees, maintenance, IP allowlist, …) are edited in
**Admin → System settings** and propagate to all instances via Redis.

## Scaling

| Process | Flags | Instances |
| --- | --- | --- |
| Web/API + WebSocket | `RUN_ENGINE=false RUN_MARKET_DATA=false RUN_WORKERS=false` | N (behind a load balancer with sticky sessions *or* WebSocket-only transport) |
| Matching engine | `RUN_ENGINE=true SERVE_WEB=false` | **exactly 1** (single writer) |
| Market data | `RUN_MARKET_DATA=true` | ≥1 (Redis leader election; standby takes over) |
| Workers | `RUN_WORKERS=true` | ≥1 |

Give each instance a unique `INSTANCE_ID`. All instances share MySQL and Redis. API instances
forward engine commands through a Redis Stream; market data and private events fan out via Redis
Pub/Sub, so any gateway can serve any client.

## Logging & monitoring

* Structured JSON logs (pino) on stdout — ship with journald/Vector/Fluent Bit. Cookies,
  authorization headers and secrets are redacted.
* `GET /api/health` → 200/503 for load balancers.
* **Admin → System health:** DB/Redis latency, WebSocket connections/channels, provider connection
  and stream counts, engine state, queue depths, exchange balance reconciliation.
* Alert on: provider disconnected > 1 min, failed jobs, reconciliation differences, 5xx rate.

## Backups

* `scripts/backup.sh /backups` — consistent `mysqldump --single-transaction` (with triggers) +
  storage archive; run hourly via cron, copy off-site encrypted.
* Enable MySQL binary logs for point-in-time recovery; Redis holds only caches, sessions and queues
  (sessions are also in MySQL).
* Test restores regularly. **Never** restore a database without the matching `runtime.env`
  (`ENCRYPTION_KEY` decrypts 2FA secrets, SMTP/OAuth/exchange secrets and xpubs).

## Updating

```bash
scripts/backup.sh /backups
git pull && npm ci && npm run build
systemctl restart tradeteam        # pending migrations run automatically (AUTO_MIGRATE=true)
# or explicitly: npm run migrate
```

Migrations are append-only and versioned; applied ones are never re-run and existing data (users,
balances, transactions, settings) is preserved. **Admin → Version & migrations** shows state.

## Integrations checklist

* **Market data:** Binance works out of the box (public endpoints). Change REST/WS base URLs in
  settings for regional endpoints.
* **Exchange execution:** add API key/secret (trade permission, no withdrawal permission, IP-restricted)
  in Admin → System settings → Market data & API.
* **Deposits:** configure networks (xpub or static+memo) and point your chain watcher at
  `POST /api/webhooks/deposits` with header `X-Signature: t=<unix>,v1=<hex(HMAC_SHA256(WEBHOOK_SECRET, "<t>.<raw body>"))>`
  and body `{network, asset, address, memo?, txid, outputIndex, amount, confirmations}`; resend as
  confirmations grow — crediting is idempotent.
* **Withdrawals:** approve in the admin console, broadcast from custody, complete with the txid.
* **Google:** OAuth client (Web) with redirect URI `https://your-domain/api/auth/google/callback`.
* **SMTP:** any provider; test from Admin → System settings → Email.
