# OryzenX Investment Monitor

Account monitoring platform for **bd.oryzenx.com**: users see their balances, crypto holdings (live prices), trades, profit and loss, loans, salary payments and notifications. Administrators record the transactions, manage users and configure the platform.

OryzenX **monitors and records**. It does not execute trades, hold custody or move money.

| Part | Where | Tech |
|---|---|---|
| Public website (English default, Bangla) | `/` and `/privacy`, `/terms`, `/risk` | PHP views, vanilla CSS/JS |
| User web app | `/app` | Single-page app, same JSON API |
| Admin panel | `/v2admin` | Single-page app, role-based permissions |
| Backend + API | `app/`, `routes/` | Core PHP 8.1+, MySQL 8 / MariaDB 10.6+ (InnoDB, utf8mb4, DECIMAL) |
| Android app | `android/` | Kotlin + Jetpack Compose (native, no WebView) |
| Scheduler | `bin/cron.php` | Run every minute from cron |

## Quick links

- [Installation and deployment](docs/INSTALL.md): shared hosting or VPS, cron, backups, recovery
- [Android app](docs/ANDROID.md): build, signing, Firebase push, App Links
- [API reference](docs/API.md)
- [Accounting rules](docs/ACCOUNTING.md): how every number is calculated
- [External credentials still required](docs/CREDENTIALS.md)
- [Test report](docs/TEST_REPORT.md): what was tested and what was not

## Development

```bash
composer install
cp config/config.example.php config/config.php   # or open /install in the browser
php bin/migrate.php
php -S 127.0.0.1:8080 -t public public/router.php
```

Tests need a MySQL/MariaDB database (default `oryzenx_test`; override with `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`). They drop and recreate that database, so never point them at real data.

```bash
vendor/bin/phpunit
```

GitHub Actions (`.github/workflows/oryzenx-ci.yml`) runs the PHP tests on PHP 8.1 and 8.3 with MySQL 8. It also builds the Android APKs and publishes them as the `oryzenx-android-apks` artifact.

## Security notes

- No default administrator. The installer creates the first super admin with the password you choose, then locks itself.
- `config/config.php`, keystores, `google-services.json` and uploads are git-ignored. Never commit secrets.
- SMTP password, market API key and FCM service account are encrypted in the database and masked in the admin panel.
- Demo data (`bin/seed-demo.php`) only works with `demo_mode => true` and is labelled "Demo" everywhere.

> **Repository note:** `.github/workflows/static.yml` (already in this repository) publishes the whole repository to GitHub Pages when `main` changes. After this code is merged to `main`, the OryzenX source becomes publicly readable there. No secrets are in the source, but you may want to limit that workflow.
