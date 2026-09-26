# Premium Aura — project memory

"Premium Aura · Vip Acess Only" (the subtitle's spelling is intentional): a mobile-first web app and PWA.
Users pick a **range** (country + app, e.g. "IQ WS") and **Get Number**, which gives them an
admin-imported phone number. Provider APIs are polled, and OTP codes that arrive for that number show up
instantly on the user's Number List and on the OTP page. Around this: wallet, withdrawals, premium plans
(TRC20 / Binance), news, notifications and a full admin panel.

The owner deploys it on **Hostinger Node.js hosting** (panel.oryzenx.com) by uploading a zip.
They speak **Bangla**: reply in Bangla, keep explanations simple and step-by-step (hPanel paths, which
field gets what), and after each change send a fresh zip.

## Stack
- Node ≥ 18, Express 5, **MySQL 8 or MariaDB** (Hostinger uses MariaDB), mysql2 pool with UTC.
- Frontend: vanilla ES-module SPA (`public/assets/js`), History API, Socket.IO, and a 5 s polling fallback.
  Admin is a separate module set in `admin/js` (`kit.js` has listPage, formSheet, fieldsHtml).
- CSS: `public/assets/css/app.css` (design tokens on `:root`, light + dark). Font: Poppins.
- Entry point: root `server.js` requires `server/app.js`. The server always starts, even when loaded via `require()`.

## Commands
- `npm start` runs the server. `npm run migrate` applies migrations.
- `npm test` runs `node --test tests/acceptance.test.js` against a **running installed server** on
  :3000 (admin@example.com / Admin12345), with MySQL up. Start the server with
  `GOOGLE_OAUTH_MOCK=http://127.0.0.1:4599` (the Google test uses a mock). Run the suite once per server
  start: the login rate limiters remember earlier runs. All tests must pass before shipping (37 at last count).
- Zip for the owner: `git archive --format=zip --prefix=premium-aura/ HEAD:premium-aura -o premium-aura.zip`.

## Conventions and rules (keep these)
- **Schema changes go only in `database/migrations/NNNN_*.sql`** (applied on boot, in order; 0009 is
  the latest). Never edit `schema.sql` for new columns. The SQL must work on MariaDB too:
  `TIME_TRUNCATE_FRACTIONAL` is MySQL-only.
- **CSP forbids inline scripts.** Put JS in files. `fit.js` is loaded in `<head>` of index/auth.
- When static assets change in a user-visible way, **bump `VERSION` in `public/service-worker.js`**.
  Otherwise installed PWAs keep the old CSS.
- Money is DECIMAL strings with BigInt math (`utils/money.js`). Never use floats.
- Secrets are AES-256-GCM (`utils/crypto.js`), keyed by `ENCRYPTION_KEY` (or `SESSION_SECRET`).
  Provider credentials, the SMTP password and the Google client secret are **write-only**: never sent to
  the browser. Never commit `.env` or real keys. The owner has pasted keys in chat before: tell them to
  rotate, and never write them into the repo.
- Uploads are validated by magic bytes, re-encoded with sharp, and **also stored in the DB**
  (`file_uploads.data`) because Hostinger wipes the disk on redeploy.
- Allocation is race-safe: `FOR UPDATE SKIP LOCKED` plus a unique `active_resource_id`.
- Users see numbers **masked** (`2119••••5905`). Only admins see full numbers and provider names.
  **Never show a provider's name to users.** A provider name used as the sender becomes "SMS".
- Full SMS bodies are never stored, only the extracted code. The last raw API response lives in memory
  only (admin "Load last API response").
- Demo/test OTP generator events are **admin-only**. Don't make fake OTPs or fake engagement look real
  to users: the owner asked, and it was declined. Keep that stance.

## Key behaviour (where to look)
- Provider polling: `server/services/poller.js` and `server/providers/*` (GenericHttpProvider does field
  mapping). Field names are matched loosely (`destinationNumber` equals `destination_number`). Codes are
  extracted from the message text (e.g. `282-366` becomes `282366`). HTTP 429 backs off (Retry-After, else
  30 s up to 5 min). Invalid records are explained in the logs.
- Ingest: `server/services/events.js`. A number is matched exactly, then by its last 8 digits
  (`serial_tail`). Unimported numbers become public OTPs when `otp_public_feed` is on (the default). The
  country is guessed from the calling code (`utils/dialCodes.js`).
- Access: `server/controllers/accessController.js`. Unused numbers auto-return after
  `assignment_timeout_minutes` (10) and show as "Return". Used ones are retired. `services.show_plus`
  formats numbers with or without "+" for display only.
- Replacing a range's numbers: `importer.clearService` / import `replace=1`. Numbers in use are retired
  rather than deleted.
- Limits: free 50/hour and 200/day. Plans are speed-only: 7 d 100/500, 15 d 150/1000, 30 d 200/1500,
  1 y 500/5000 (`services/quota.js`).
- Auth: email verification, optional admin approval (Pending page with WhatsApp contact, emails to the
  admins), Google OAuth (`googleAuthController.js`), TOTP 2FA with recovery codes, email-code recovery
  (turns 2FA off), and admin "Reset 2FA".
- Notifications are admin-originated only and deleted after 24 h.
- Phones: `public/assets/js/fit.js` zooms the page to a 390 px design so DPI and system font size
  don't change the look.

## Owner's taste (design)
Clean, thin fonts (weights already lowered one step), wide boxes with little side padding on phones, no
overlapping elements, Live-Activity-style rows (flag, app logo, name/number, big tap-to-copy code,
live "x sec ago"). Show "Available / Not Available", never stock counts to users.

## Possible next steps discussed
- Web Push notifications for OTPs.
- `/.well-known/assetlinks.json`, a "Download App" button and a privacy policy page, for a TWA APK built
  with PWABuilder. Play Store has policy risk for this kind of app, so sideloading the APK is recommended.
- 2oo9 Cloud provider: needs the owner's key and their API docs (auth scheme unknown).
