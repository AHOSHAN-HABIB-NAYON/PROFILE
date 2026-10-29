# Deploy Nirapod server on Hostinger (Node.js app, no VPS)

Domain: **family-track.webtecit.com** · API: `https://family-track.webtecit.com/api/v1`

## 1. Database (hPanel → Databases → MySQL)
1. Create a database (e.g. `u123_nirapod`) and a user with a strong password. Note host, name, user, password.
2. (Recommended, later) create a second user for the admin panel with `tools/sql/admin-grants.sql`.

## 2. Subdomain
hPanel → Domains → Subdomains → create `family-track` on `webtecit.com`. Enable SSL (free) for it.

## 3. Upload the server
1. Download `nirapod-server.zip` (GitHub → Actions → latest "Nirapod CI" run → Artifacts → `nirapod-server`). Upload it as is; do not unzip it first. It has `package.json` at its root (Express app).
2. hPanel → Websites → **Node.js** → Create application:
   - Node version: **22** (or 20)
   - Application root: e.g. `nirapod` (a folder in your home directory)
   - Application URL: `family-track.webtecit.com`
   - Startup file: `server/src/index.js` (if the app still shows 503, use `server/start.cjs`)
3. File Manager → open the application root → upload the zip → Extract here.
4. Back in the Node.js app page → **Run NPM install**.

## 4. Environment variables (Node.js app page → Environment variables)
| Name | Value |
|---|---|
| NODE_ENV | production |
| PUBLIC_BASE_URL | https://family-track.webtecit.com |
| DB_HOST | (from step 1, often `localhost`) |
| DB_NAME / DB_USER / DB_PASSWORD | (from step 1) |
| DB_ADMIN_USER / DB_ADMIN_PASSWORD | admin DB user (or, until created, the same user as above) |
| JWT_ACCESS_SECRET | a long random string (48+ characters) |
| MASTER_KEY | another long random string |
| UPLOAD_DIR | `/home/<you>/nirapod-uploads` (outside the app folder, so updates keep photos) |
| SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / MAIL_FROM | Hostinger email account (e.g. smtp.hostinger.com, 465, SMTP_SECURE=true) |
| GOOGLE_OAUTH_CLIENT_IDS | Google sign-in client id (optional at first) |
| GOOGLE_PLACES_API_KEY | Places API key (optional; can also be set in the admin panel) |
| ADMIN_SETUP_KEY | a random 12+ character key, only to create the first admin (remove after) |

Start (or restart) the app. On first start it **creates all tables and default settings automatically**.
Check: open `https://family-track.webtecit.com/api/v1/health` → `{"status":"ok","db":"ok",...}`.

## 4b. Admin panel (first time)
1. Open `https://family-track.webtecit.com/admin/` → "Create the first admin": enter the ADMIN_SETUP_KEY, your name, email and a strong password.
2. Sign in → My profile → set up two-factor sign-in (Google Authenticator) → enter the code.
3. Delete ADMIN_SETUP_KEY from the environment variables and restart.
4. API keys page: paste the Firebase service account JSON + Firebase Android ids, Play service account JSON, RTDN token, Places key.
   AI assistant page: OpenAI key and model. App settings page: support emails, legal email, WhatsApp number, versions.
   (Only the Google Maps key is not here: it is built into the app, see the MAPS_API_KEY GitHub secret.)

## 5. Scheduled jobs
The server runs its jobs (offline detection every minute, history cleanup) while it is running. If Hostinger
stops idle apps, add a cron job (hPanel → Advanced → Cron Jobs) every 5 minutes:
`cd ~/nirapod && /opt/alt/alt-nodejs22/root/usr/bin/node server/scripts/run-jobs.js` (adjust the node path shown
on the Node.js app page).

## 6. Notes
- WebSockets may not be available on shared Node.js hosting; the app then refreshes family locations every 30 s.
- Email DNS (SPF, DKIM, DMARC) for webtecit.com: enable in hPanel → Emails → your domain → DNS settings.
- Updating: upload the new zip, extract over the old files, Run NPM install, restart.
