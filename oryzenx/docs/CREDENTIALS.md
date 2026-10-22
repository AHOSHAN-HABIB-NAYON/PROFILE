# External services and credentials still required

The code supports all of these, but **none were connected or tested with real accounts** during development. Each needs your own account and values.

| # | What | Where it goes | Needed for |
|---|---|---|---|
| 1 | Hosting with PHP 8.1+, MySQL 8/MariaDB 10.6+, cron, HTTPS for `bd.oryzenx.com` | Server | Everything |
| 2 | Database name, user, password | Web installer → `config/config.php` | Everything |
| 3 | SMTP host, port, username, password, From address (+ SPF/DKIM/DMARC DNS records) | Admin → Settings → Email | Verification, password reset, notifications, reminders |
| 4 | Market data: CoinGecko (works without a key; optional API key for higher limits) or Binance | Admin → Settings → Market data | Live prices and charts |
| 5 | Google OAuth client IDs (Web + Android with SHA-1) | Admin → Settings → Google | "Continue with Google" |
| 6 | Firebase project: `google-services.json` (app) + service-account JSON and project ID (server) | `android/app/` or CI secret; Admin → Settings → Push | Push notifications |
| 7 | Android release keystore + passwords | CI secrets (`ORYZENX_KEYSTORE_*`) or `keystore.properties` | Signed release APK/AAB |
| 8 | Release key SHA-256 fingerprint | Admin → Settings → Android | App Links (reset links open the app) |
| 9 | Google Play developer account | Play Console | Store publishing |
| 10 | Support email/phone/hours, legal entity details for the legal pages | Admin → Settings / Content | Footer, help, legal pages |
| 11 | Payment method logos (bKash, Nagad, Rocket, banks), with permission to use them | Admin → Payment methods | Salary payment details |

The legal page texts (privacy, terms, risk disclosure) are drafts. Have a lawyer review them for Bangladesh before launch.
