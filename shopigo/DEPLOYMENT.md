# Deploying ShopiGo

## 1. Requirements

- Node.js **20+** (22 LTS recommended) · npm
- MySQL 8+ or MariaDB 10.6+ — an **empty** database and a user with CREATE, ALTER, INDEX, REFERENCES, SELECT, INSERT, UPDATE, DELETE, DROP privileges
- ~512 MB RAM · PHP is **not** needed · Redis optional

## 2. Domain hosting (cPanel "Setup Node.js App" / Plesk / Passenger)

1. Upload the project (or `git clone`) into your application folder, e.g. `~/shopigo`.
2. In cPanel → **Setup Node.js App** → *Create application*:
   - Node.js version: 20+ · Application mode: Production
   - Application root: `shopigo` · Application URL: your domain
   - **Application startup file: `app.js`**
3. Click **Run NPM Install**, then in the app's terminal run `npm run build` (or upload a pre-built copy with `server/dist` and `client/dist`).
4. Create an empty database + user in **MySQL Databases**.
5. Open `https://your-domain.com/` — the **installer appears automatically**. Enter the database details (click *Test Database Connection*), website and admin details, then **Install ShopiGo**.
6. Done. The installer writes `.env` (0600) and `storage/install.lock`; it will never appear again.

Passenger restarts: set `SHOPIGO_RESTART_MODE=passenger` in the app's environment variables so the updater restarts the app by touching `tmp/restart.txt`.

> Optional hardening for a public server: set `INSTALL_TOKEN` in the hosting panel before the first visit — the installer will then require it.

## 3. VPS (PM2 + Nginx)

```bash
git clone … shopigo && cd shopigo
npm ci && npm run build
pm2 start app.js --name shopigo --time      # PM2 restarts it after updates (SHOPIGO_RESTART_MODE=exit, default)
pm2 save && pm2 startup
```

Nginx:

```nginx
server {
  server_name shop.example.com;
  client_max_body_size 50m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;              # live admin notifications (SSE)
  }
}
```

Keep `TRUST_PROXY=1` (default) when exactly one proxy is in front, so IP-based fraud rules see real client IPs. Serve over HTTPS (Let's Encrypt) — passkeys and secure cookies require it.

Optional: `REDIS_URL=redis://127.0.0.1:6379` for shared cache and rate limits (needed if you run several instances).

## 4. Directory safety

| Path | Owner | Touched by updates? |
|---|---|---|
| `.env` | installer | **never** (backed up before each update) |
| `storage/` (lock, backups, logs, update staging) | app | never |
| `uploads/` (optimised images) | app | never |
| `releases/<version>/` | updater | new directory per version |
| `storage/current-release` | updater | atomically switched (write + rename) |

`app.js` loads `releases/<storage/current-release>/server/dist/index.js`, falling back to the bundled code. Symlinks are not required (a `current` symlink is created only when supported).

## 5. Updates (Admin → System → Updates, Super Admin only)

1. **Check for Updates** (reads `update_feed_url`) → *Download & verify*, or **Upload package** (`.tar.gz`).
2. The package is verified: Ed25519 signature over `manifest.json`, SHA-256 of every file, no unlisted files, no symlinks / path traversal, and it may not contain `.env`, `storage/`, `uploads/`.
3. **Backup & Update**: DB + config backup → maintenance mode (admins still have access) → release unpacked to `releases/<v>` → `npm ci --omit=dev` only if the lockfile changed → **forward-only migrations** → health check of the new release on a random port → atomic switch → restart.
4. Any failure: database restored from the pre-update backup (if migrations ran), new release removed, maintenance off — the store keeps running the previous version.
5. **Rollback** (latest update): switches code back; data is kept (optionally restore the pre-update database — this discards changes made since).

Migrations never `DROP` tables or databases. Uploading new files manually also works: on boot, pending migrations are applied automatically after a safety backup.

### Publishing an update (vendor side)

```bash
npm run keys:update                  # once — keep keys/update-private.pem secret, ship server/update-public-key.pem
# bump "version" in package.json, add migrations to server/src/db/migrations (register in index.ts)
npm run build
npm run package:update -- --changelog "Added X" --changelog "Fixed Y" --min 1.0.0
# upload updates/shopigo-update-<v>.tar.gz and updates/latest.json to your HTTPS update server
```

Set the store's **Settings → Updates → Update feed URL** to `https://…/latest.json`. The public key can also be pasted in that settings page.

## 6. Backups

Admin → System → Backups: database (`.sql.gz`), configuration (`.env`, lock, settings) or full (DB + config, plus an uploads archive). Automatic backups: Settings → Backup (daily/weekly, hour, type, retention). Restores require the Super Admin password and typing `RESTORE`; a safety copy is taken first. CLI: `node server/dist/cli.js backup full`.

## 7. Recovery commands

```bash
node server/dist/cli.js reset-admin admin@example.com 'NewStr0ngPass'   # forgot password (signs everyone out)
node server/dist/cli.js relink                                        # recreate storage/install.lock from the DB
node server/dist/cli.js maintenance off
node server/dist/cli.js health
```

## 8. Security notes

- Secrets (`APP_SECRET`, `ENCRYPTION_KEY`) are generated at install; courier credentials, Meta CAPI token and GA4 API secret are AES-256-GCM encrypted in the database and never returned to any browser. Courier values can instead be supplied as env vars `COURIER_<CODE>_<FIELD>` (e.g. `COURIER_BDCOURIER_API_KEY`).
- Admin: Argon2id, account lockout, IP rate limiting, optional mandatory 2FA (TOTP or passkey), session management, audit log of every change.
- HTTP: Helmet with a nonce-based CSP, HSTS (production), SameSite=Strict HTTP-only cookies, CSRF tokens, JSON/body size limits, upload MIME + decode validation (SVG rejected), rich text sanitised with an allow-list.
- Customer data: order pages require an unguessable token; returning-customer autofill only reveals the saved address to the same device.

## 9. Android app (optional)

The storefront is a full PWA ("Install App" in the menu). For Google Play, wrap it as a Trusted Web Activity: see `android-twa/README.md`.
