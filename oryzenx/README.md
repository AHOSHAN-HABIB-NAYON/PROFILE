# Oryzenx — Web Development Service Platform

Core PHP 8.1+ · MySQL/MariaDB (utf8mb4) · Vanilla JS. No framework, no Node.js backend, shared-hosting friendly.

## Install (Hostinger / cPanel / any Apache or LiteSpeed host)

1. Upload the contents of this `oryzenx/` folder to `public_html/` (or a subfolder — sub-folder installs work too).
2. Create an empty MySQL database + user in your hosting panel.
3. Make these folders writable (775): `app/config`, `storage/` (and its sub-folders), `assets/uploads/`.
4. Open `https://your-domain/install`, enter the database credentials and (optionally) an admin account.
   - The installer creates the schema (`database/schema.sql`), seeds 30 services, payment methods, sample posts, team, FAQ and slider, writes `app/config/config.php` (with a random `app_key`) and then disables itself.
   - If you skip the admin fields, **the first account that registers becomes the administrator**. Once an admin exists, registration never creates another admin.
5. Log in → **Admin → Settings** and fill in: Payment methods (bKash number, TRC20/BEP20 addresses, Binance Pay ID/QR), SMTP, Google login, AI key, logo/app icon.

Production defaults: `display_errors` off, errors logged to `storage/logs/` and visible in **Admin → Logs**; visitors only see friendly Bengali/English messages. Set `'debug' => true` in `config.php` only while troubleshooting.

## Integrations

| Feature | Where | Notes |
|---|---|---|
| SMTP (e.g. `smtp.hostinger.com`, 465, SSL) | Settings → SMTP | Built-in client, **Send test email** button. Needed for verification, password reset, login codes, 2FA recovery, payment emails. |
| Google login | Settings → Google login | The page shows the exact **Authorized redirect URI** (`https://your-domain/auth/google/callback`) to paste into Google Cloud Console. |
| AI assistant | Settings → AI | OpenAI or any OpenAI-compatible API. Key is stored encrypted and only used server-side. Without a key the bot answers from site data (services, prices, payments, FAQ, contact). Per-user limit per 10 minutes. **Test AI** button. |
| reCAPTCHA v2 | Settings → Security | Login, register, contact, forgot password. |
| Web Push | Settings → Notifications | VAPID keys are generated automatically; pure-PHP encryption (no Composer). Requires HTTPS. |
| Passkeys / 2FA | Profile → Security | WebAuthn passkeys (requires HTTPS), TOTP 2FA with QR + 8 recovery codes, email login verification, session management, login history. |
| Region/city analytics | Settings → Analytics | Off by default (sends IPs to ip-api.com). Country comes from Cloudflare when present. IPs are never stored. |

Payment methods with no number/address/link/QR are hidden automatically (e.g. Binance Pay left empty). The bundled bKash/USDT/Binance icons are simple placeholders — upload the official logos per method in **Admin → Payment methods** where you are permitted to use them.

## Architecture

```
index.php            front controller (all clean URLs via .htaccess)
.htaccess            rewrites, blocks app/ views/ storage/ database/, caching headers
app/bootstrap.php    config, error handling, autoload
app/routes.php       every route (public, auth, profile, payment, API, admin)
app/core/            DB (PDO), Router, Auth, Session, Csrf, Settings, Lang, View, Upload, ImageTool,
                     Mailer (SMTP), WebPush, WebAuthn (+CBOR), Totp, Sanitizer, Analytics, RateLimit…
app/controllers/     public, auth, profile, payment, AI, admin (incl. definition-driven CRUD)
app/services/        Assistant (AI), Content (shared queries)
app/lang/            bn.php / en.php
views/               layouts, partials, components, pages, admin
assets/css/          base, components, layout, chat + one file per module (home, services, news, …, admin)
assets/js/           app.js (SPA engine & UI), admin.js, webauthn.js, sw-core.js
database/            schema.sql, seed.php
storage/             cache, logs, sessions, private uploads (payment screenshots, attachments)
```

**SPA navigation:** internal links are fetched with `X-SPA: 1`; the server returns only the `<main>` HTML plus title/meta/CSS list as JSON. Header, sidebar, bottom nav, footer and chat stay mounted. Pages are cached, prefetched on hover/touch, back/forward restore scroll, and every URL also works as a normal full page load (SEO + direct links).

**Security:** PDO prepared statements everywhere, bcrypt (cost 12), CSRF on every POST, HttpOnly/SameSite/Secure cookies, DB-backed revocable sessions, login lockout, rate limits, allow-list HTML sanitizer for the editor, uploads re-encoded with GD (strips payloads) and executed-script blocking in `assets/uploads/`, private files served only to owner/admin, secrets encrypted with AES-256-GCM.
