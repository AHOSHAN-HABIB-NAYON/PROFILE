# Installation and deployment

## 1. Requirements

- PHP **8.1 or newer** with `pdo_mysql`, `mbstring`, `openssl`, `json`, `sodium` and `curl`. `gd` is recommended for image compression and `bcmath` for faster decimal maths (a pure-PHP fallback is included).
- MySQL **8.0+** or MariaDB **10.6+** (InnoDB, `utf8mb4`).
- HTTPS certificate for `bd.oryzenx.com` (required for secure cookies, Google sign-in and Android App Links).
- Cron access (one entry, every minute).
- Composer, or a release package that already contains `vendor/`.

## 2. Folder layout on the server

Point the domain's **document root at `oryzenx/public`**. Everything else (`app/`, `config/`, `storage/`, `vendor/`) must stay outside the web root.

On shared hosting where the document root can't be changed, upload `public/` contents into `public_html/` and the rest one level above it. Then edit the `require` path in `public_html/index.php`. The root `.htaccess` and `storage/.htaccess` deny direct access as a safety net, but this layout is still not recommended.

## 3. Install

1. Upload the code and run `composer install --no-dev --optimize-autoloader`.
2. Create an empty database and a user with full rights on it only.
3. Make `config/`, `storage/` (and its subfolders) and `public/uploads/` writable by PHP.
4. Open `https://bd.oryzenx.com/install`. The installer:
   - checks the requirements;
   - writes a one-time **install key** to `storage/install.key` (read it over SSH/FTP; this stops strangers from finishing your install);
   - asks for database details, site URL, the **first super-admin** (name, email, your own strong password) and optional SMTP details;
   - creates the tables, reference data (roles, permissions, assets SOL/ETH/XRP/SUI/ZEC/PEPE, payment methods), writes `config/config.php` with a random `app_key`, and creates `storage/installed.lock`.
5. After success, the installer refuses to run again. Make `config/` read-only (`chmod 550 config; chmod 440 config/config.php`).
6. Sign in at `/v2admin` and complete **Settings**: support email, SMTP (send a test email), market data provider, Google client IDs, FCM.

No default admin account or password exists.

## 4. Cron (required)

```
* * * * * /usr/bin/php /home/USER/oryzenx/bin/cron.php >/dev/null 2>&1
```

Tasks and their own intervals: `market_refresh` (price polling), `email_queue` (send + retries), `portfolio_snapshots`, `portfolio_threshold` alerts, `reminders` (every N days, default 5, off by default), `salary_records` (monthly records), `cleanup` (expired sessions, tokens, old logs). Run one manually: `php bin/cron.php email_queue`. Admin → System health shows the last run of each task.

**Shared hosting limits:** if cron can only run every 5 or 15 minutes, prices and emails update at that pace. The dashboards show "last updated" times and mark stale prices, so users are never shown old prices as live.

## 5. Email (SMTP)

Admin → Settings → Email. Enter host, port, encryption (TLS 587 / SSL 465), username, password and the From address on your domain. Use **Send test email** and check that it arrives. "Accepted by SMTP server" in the email log means the server took it; it does not prove inbox delivery. Set up SPF, DKIM and DMARC for the sending domain.

## 6. Market data

Default provider: CoinGecko (free tier works without a key; a key raises limits). Binance public prices are the alternative. **Simulated** prices exist for demos only and are labelled everywhere. When the provider fails, the last good price stays visible with a "stale" warning.

## 7. Backups

- Admin → Backups → **Create backup** writes `storage/backups/oryzenx-YYYYMMDD-HHMMSS-xxxx.sql.gz` (database only).
- Also back up `storage/private` (identity documents, avatars) and `public/uploads` (logos) with your host's file backup.
- Copy backups off the server regularly.

### Restore

```bash
php bin/restore.php storage/backups/oryzenx-....sql.gz --confirm
```

This **replaces all data**. Take a fresh backup first.

## 8. Recovery: reinstalling or moving servers

1. Install the same code version on the new server (steps 1–3).
2. Copy the old `config/config.php` (it holds the `app_key`; without the same key, the encrypted SMTP/API/FCM secrets cannot be decrypted and must be re-entered). Update the database credentials in it.
3. Create the empty database, then run `php bin/restore.php <backup> --confirm` and `php bin/migrate.php` (applies any newer migrations).
4. Copy `storage/private` and `public/uploads`.
5. Create `storage/installed.lock` (an empty file) so `/install` stays locked.
6. Add the cron entry and check Admin → System health.

Lost admin access: run `php bin/migrate.php` to confirm the database is reachable. Then reset the password from the login page ("Forgot password", needs working SMTP). Without SMTP, set a new hash directly in the database: `UPDATE users SET password_hash = '<output of php -r "echo password_hash(\"NewLongPass123\", PASSWORD_DEFAULT);">' WHERE email = 'you@example.com';`

## 9. Hardening checklist

- `debug => false`, `demo_mode => false` in `config/config.php`.
- HTTPS only; HSTS is sent automatically when the request is HTTPS.
- `trust_proxy => true` only behind a reverse proxy/CDN that sets `X-Forwarded-*`.
- Keep PHP and MySQL updated; run `composer update phpmailer/phpmailer` periodically.
- Review Admin → Audit log and login history regularly.

## 10. Troubleshooting

| Symptom | Check |
|---|---|
| Blank page / 500 | `storage/logs/app-*.log`; PHP version; `vendor/` present |
| "Prices stale" everywhere | Cron running? Admin → Market data → test provider; host blocks outbound HTTPS? |
| Emails stay "queued" | Cron `email_queue` task; SMTP test in settings; email log error text |
| Google sign-in fails | Client ID added in Settings; HTTPS; Android SHA-1 registered in Google Cloud |
| Push not delivered | FCM service account JSON + project ID set; app built with `google-services.json`; user allowed notifications |
| 419 / CSRF errors | Site URL matches the domain users open; cookies not blocked; clock correct |
