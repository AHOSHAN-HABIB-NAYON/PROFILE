# DevCraft Platform — Web Services, Portfolio, News & Digital Products

A production-ready **Core PHP 8 + MySQL** platform that feels like a React/Next.js mobile app:
AJAX + History-API navigation (no full page reloads), installable PWA, dark mode, Bangla/English,
web push, AI chatbot, live support chat and a mobile-first admin panel. It runs on normal shared hosting
(Apache + PHP + MySQL). No Node.js, Composer, Redis or WebSocket server is needed.

> The original static CV (`index.html`, `processor.png`) is untouched. Apache serves `index.php` first,
> so the CV stays reachable at `/index.html`.

---

## 1. Install (shared hosting, e.g. Hostinger / cPanel)

1. Upload all files to `public_html/` (or a sub-folder).
2. In your hosting panel, create a **MySQL database** (collation `utf8mb4_unicode_ci`) and a user with all privileges on it.
3. Make sure `config/`, `storage/` and `assets/uploads/` are writable by PHP (usually they already are).
4. Open `https://YOUR-DOMAIN.com/` and you'll be redirected to **/install**.
5. Open `config/install-key.txt` in the File Manager and paste the code. This proves you own the server.
6. Enter the database details, site name, site URL (`https://…`), default language and the admin account.
7. Done. The installer creates every table, seeds the services, categories, products and settings, writes
   `config/env.php` (credentials + a random encryption key), generates Web Push (VAPID) keys and locks itself.

**Recommended next steps** (Admin → Settings):

| What | Where |
|---|---|
| SMTP (default `smtp.hostinger.com`, port 465, SSL) + **Send test email** | Settings → SMTP / Email |
| bKash number, USDT TRC20/BEP20 addresses, Binance Pay ID/QR → **enable** each method | Settings → Payments |
| Logo, favicon, app icon, OG image, theme colors | Settings → General / Theme, or Media → *Set as…* |
| Google login: Client ID/Secret. Redirect URI: `https://YOUR-DOMAIN.com/auth/google/callback` | Settings → Google Login |
| OpenAI API key, model, prompt, rate limit + **Run test** | AI Assistant |
| Cron job (every 5 min, URL shown in Admin → Security → System) | hosting panel → Cron Jobs |
| Turn on HTTPS redirect (uncomment the block in `.htaccess`) | `.htaccess` |

Local development: `php -S localhost:8000 index.php`, then open `http://localhost:8000/install`.

> **First admin rule.** The installer creates the administrator. If no admin account exists at all
> (e.g. it was deleted), the next account that registers and **verifies its email** becomes admin.
> This step is serialized with a MySQL lock. After that, only an existing admin can grant roles.

---

## 2. Structure

```text
index.php            single front controller (all clean URLs land here)
.htaccess            clean URLs, blocks direct .php/internal folders, caching, compression, headers
sw.js                service worker (offline page, asset cache, public page cache, push)
config/              config.php (bootstrap), database.php (PDO), auth.php, security.php, mail.php
                     env.php + install-key.txt are generated (git-ignored)
core/                helpers, router, settings schema, i18n (+ lang/bn.php, lang/en.php), notify, push (VAPID),
                     webauthn (passkeys), totp (2FA), upload (GD compression), analytics, ai, google, seo, cron
includes/            app shell: header (design system CSS), navbar, sidebar, bottom-nav, footer, ai-chat, notifications
pages/               home, services, service-details, news, news-details, team, contact, profile, payment,
                     notifications, login, register, forgot-password, verify-email, maintenance, error, offline
admin/               _layout, _crud (generic CRUD engine), _charts (SVG charts) + one file per admin section
api/                 navigation (SPA JSON), auth, payment, notification, upload, ai, analytics, search, support, contact, admin
assets/js/           app.js (public runtime), admin.js (admin-only)
assets/icons/        PWA icons + default OG image
assets/uploads/      user uploads (script execution disabled)
database/            schema.sql, seed.php, install.php
storage/             logs, cache, sessions, private uploads (payment screenshots, attachments) — not web-accessible
```

`manifest.json`, `robots.txt` and `sitemap.xml` are generated from admin settings and the database, and served
at those exact URLs.

---

## 3. How the "SPA on PHP" works

* Every page is a PHP partial (`pages/*.php`, `admin/*.php`) that sets its title/meta via `meta()` and outputs
  its own scoped `<style data-css>` + markup.
* A direct visit renders the full document (header, sidebar, bottom nav, footer + page), which is SEO-friendly.
* Internal link clicks are intercepted by `app.js`. It fetches `/api/navigation?path=…` (JSON with html, title,
  meta), swaps only `<main>`, updates the URL with `pushState`, moves page CSS into `<head>` once and runs that
  page's init module. Back/forward use `popstate` with scroll restore.
* Public pages are cached in memory and `sessionStorage` (5 min, per user, dropped when the admin changes
  content via `content_version`). Links are prefetched on hover/touch and on good networks only (respects
  Save-Data / 2G). Private pages (profile, payment, admin) are never cached.
* All events use one delegated listener (`data-action="…"`), so no duplicate listeners build up between navigations.

---

## 4. Security summary

PDO prepared statements everywhere · CSRF token on every POST · output escaping · allow-list HTML sanitizer for
rich text · bcrypt (cost 12) · session regeneration on login, per-session revocation ("log out other devices") ·
HttpOnly/Secure/SameSite cookies · login lockout + rate limits (MySQL-backed) · reCAPTCHA v3 (optional) ·
2FA (TOTP + one-time recovery codes) · passkeys (WebAuthn, ES256/RS256) · email login codes / new-device verification ·
CSP with nonces + security headers · uploads checked by extension + MIME + decode, re-encoded, random names,
non-executable folder; payment screenshots stored privately and served only to the owner or staff ·
secrets (SMTP password, API keys, 2FA seeds, VAPID key) encrypted at rest (AES-256-GCM via OpenSSL) · role-based permissions
(admin, editor, support, user) · full admin audit log · friendly error pages (technical errors go only to
`storage/logs/php-error.log`).

---

## 5. Notes

* **Icons & fonts** load from cdnjs (Font Awesome 6) and Google Fonts (Noto Sans + Noto Sans Bengali).
* **Visitor location** (country / Bangladesh division / city) uses Cloudflare's geo headers when the site is
  behind Cloudflare (set `'behind_cloudflare' => true` in `config/env.php` so real client IPs are used too).
  Otherwise you can enable the opt-in ipapi.co lookup in Settings → Analytics.
* **Web Push** sends a payload-less "tickle" signed with VAPID. The service worker then fetches the newest
  notification, so no payload encryption library is needed.
* **Real-time** features (notifications, live chat) use adaptive polling that pauses while the tab is hidden.
* The included GitHub Pages workflow can only publish static files. Deploy this PHP app to PHP hosting.
