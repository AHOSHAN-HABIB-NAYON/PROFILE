# Probaho (প্রবাহ) — Smart Payments & Services

A mobile-first payment/service web app that behaves like a native fintech app
(SPA navigation, PWA, dark mode) on a plain **Core PHP 8 + MySQL** backend that
runs on ordinary shared hosting. No Composer, no Node build step.

| | |
|---|---|
| Login methods | **Manual** (email/phone + password), **Google**, **Passkey (WebAuthn)**. There is no Binance login. |
| Payments | Wallet (deposit / withdraw / transfer / service payment), **Binance Pay** (payment method only), QR pay |
| Notifications | In-app center, **Web Push** (VAPID, aes128gcm), **SMTP email** (10 templates) |
| Support | AI assistant grounded in an admin-editable knowledge base + Telegram / WhatsApp human support |
| Admin | `/v2admin` with its own login, roles, 2FA. Nearly everything is editable without touching code. |

## Requirements

- PHP **8.0+** with `pdo_mysql`, `openssl`, `curl`, `mbstring`, `gd`, `fileinfo`
- MySQL 5.7+ / MariaDB 10.3+ (utf8mb4)
- Apache or LiteSpeed with `mod_rewrite` (nginx config below)
- **HTTPS** in production — required by browsers for Passkeys, Push and PWA install

## Install (shared hosting)

1. Upload the contents of this folder to your web root (or a sub-folder — the app detects its base path).
2. Create an empty MySQL database + user.
3. Make `config/`, `storage/` (and its `cache/`, `logs/`) and `uploads/` writable by PHP.
4. Open `https://your-domain/install`, enter the database details and the first super-admin.
   The installer imports `database/database.sql`, generates the encryption key and VAPID keys,
   and writes `config/config.local.php`. After that `/install` is disabled.
5. Log in at `https://your-domain/v2admin/login` and configure:
   **SMTP**, **Support** (Telegram/WhatsApp), **Binance Pay**, **Settings → Authentication**
   (Google Client ID/Secret), **Settings → AI**, **PWA**, **Security**.

Manual install alternative: import `database/database.sql`, copy `config/config.sample.php`
to `config/config.local.php` and fill it in, then open `/v2admin/login` — when no admin exists,
that page lets you create the first super-admin.

### nginx

```nginx
root /var/www/probaho;
index index.php;
location ~ ^/(config|core|includes|pages|database|storage)(/|$) { deny all; }
location ~ /\. { deny all; }
location = /manifest.json { rewrite ^ /index.php last; }
location ~ \.php$ {
    if ($uri != /index.php) { return 403; }
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    fastcgi_pass unix:/run/php/php-fpm.sock;
}
location ^~ /uploads/ { location ~ \.(php|phtml|phar)$ { deny all; } }
location / { try_files $uri /index.php$is_args$args; }
location = /sw.js { add_header Cache-Control "no-cache"; }
```

## Configuration notes

- **Google login:** create an OAuth client (Web) in Google Cloud Console. Authorized redirect URI:
  `https://your-domain/auth/google/callback`.
- **Passkeys:** the relying-party ID is your host name; the site must be served over HTTPS
  (`localhost` works for development). Only the credential public key, ID and counter are stored.
- **Binance Pay:**
  - *Manual mode* (default) — users pay to your Binance Pay ID and submit the Binance Order ID;
    admins approve in **/v2admin/binance**.
  - *API mode* — enter the merchant API key + secret. Orders are created server-side, users pay
    via QR/checkout, and the webhook `https://your-domain/payment/binance-pay/webhook` (signature
    verified with Binance's certificate) plus status polling settle them automatically.
- **AI assistant:** works out of the box in *built-in* mode (keyword retrieval over the knowledge
  base, FAQ, services, products, payment methods and live support settings). Choose
  *Anthropic Claude* (default model `claude-opus-5-5`, with server-side refusal fallback enabled) or any
  *OpenAI-compatible* endpoint for generated answers; the key is stored encrypted and never sent to the
  browser. Answers are always grounded in the same site knowledge.
- **Secrets** (SMTP password, API keys, VAPID private key, TOTP secrets) are encrypted with
  libsodium using `app_key` from `config/config.local.php`. Back that file up — losing the key
  makes stored secrets unreadable.
- **Errors** are never shown to users (a friendly Bengali message is shown instead). Details go to
  `storage/logs/`.

## Project structure

```
index.php            Front controller + route table (clean URLs, no .php)
.htaccess            Rewrites, folder protection, caching
sw.js                Service worker (offline page, asset cache, push, notification click)
manifest.json        Static fallback; the live manifest is generated from Admin → PWA
config/              config.php (defaults) + config.local.php (written by installer)
core/                Framework classes: DB, Auth, AdminAuth, WebAuthn, Cbor, WebPush, Mailer,
                     BinancePay, Google, AI, Wallet, Notify, Upload, Captcha, Totp, RateLimit ...
includes/            Layout, shells (public/app/admin), widgets, email templates, installer,
                     manifest/robots/sitemap generators
pages/               User-facing pages (rendered as full HTML or SPA fragments)
api/                 JSON endpoints for the user app (/api/{module}/{action})
auth/google.php      Google OAuth redirect + callback
payment/             Binance Pay webhook
v2admin/             Admin router, CRUD/settings engine (lib.php), pages/ and api/
assets/              css/, js/ (app.js, admin.js, vendor QR libs), images/, icons/
database/database.sql  Schema + seed data (utf8mb4)
storage/             logs/, cache/ (sessions, Binance cert cache) — not web-accessible
uploads/             User/admin uploads (images re-encoded; script execution disabled)
```

## How the "SPA" works

Every page is a normal PHP page, so direct URLs and SEO work. `assets/js/app.js` intercepts internal
links, fetches the same URL with an `X-SPA: 1` header and swaps only `#app-content` (the shell —
header, sidebar, bottom nav, chat widget — stays mounted). It uses `pushState`/`popstate`, a short
page cache, hover/touch prefetch and idle prefetch of the main navigation. When the shell changes
(e.g. after login) the server returns the new shell in the same response, so there is still no full reload.
