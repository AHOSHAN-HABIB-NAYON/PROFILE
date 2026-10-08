# Deployment

## Environments

| | Development | Staging | Production |
|---|---|---|---|
| `NODE_ENV` | development | staging | production |
| Secrets | `.env` (dev defaults allowed) | environment secrets | environment secrets / secret manager |
| Database | local MySQL/MariaDB | separate DB | managed MySQL 8 with backups |
| Redis | optional | recommended | required for >1 API node |
| Emails | logged to console | real SMTP (test inbox) | real SMTP |
| Android | debug APK (`app.quizwar.bd.debug`) | internal testing track | production track |

`NODE_ENV=staging|production` refuses to start without real `JWT_SECRET` and
`ADMIN_JWT_SECRET` (≥ 32 chars, different from each other) and requires an `https://`
`PUBLIC_API_URL`. All variables are documented in [`.env.example`](../.env.example).
**Never commit `.env` files, keystores, `google-services.json` or service-account JSON.**

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_SECRET / ADMIN_JWT_SECRET
npx web-push generate-vapid-keys                                                  # VAPID keys for web push
```

## Recommended topology

```
quizwar.app        → nginx: web PWA (apps/web/dist), /v2admin (apps/admin/dist),
                     /.well-known/assetlinks.json and crawler requests for /u/* → API
api.quizwar.app    → nginx → API (REST + WebSocket), /media
```

The Android app's WebView runs on `https://quizwar.app` (Capacitor `server.hostname`) and
calls the API at `https://api.quizwar.app` — the API must not share the Capacitor hostname.

## Docker (single server)

```bash
cd quiz-war
cp .env.example .env    # fill production values (see table below)
npm ci && npm run build -w @quizwar/web -w @quizwar/admin   # static builds for nginx
cd deploy
MYSQL_PASSWORD=… MYSQL_ROOT_PASSWORD=… docker compose up -d --build
docker compose exec api node dist/scripts/create-admin.js   # with ADMIN_EMAIL set → first Super Admin
```

Put TLS certificates (e.g. from Let's Encrypt/certbot) in `deploy/certs/` (`fullchain.pem`,
`privkey.pem`) or point `TLS_CERT_DIR` at them.

Production `.env` essentials:

```
NODE_ENV=production
PUBLIC_API_URL=https://api.quizwar.app
PUBLIC_WEB_URL=https://quizwar.app
CORS_ORIGINS=https://quizwar.app
TRUST_PROXY=true
JWT_SECRET=…            ADMIN_JWT_SECRET=…
GOOGLE_CLIENT_ID=<web client id>.apps.googleusercontent.com
GOOGLE_EXTRA_AUDIENCES=<android client id(s)>
WEBAUTHN_RP_ID=quizwar.app
WEBAUTHN_ORIGIN=https://quizwar.app,android:apk-key-hash:<see android-release.md>
ANDROID_PACKAGE_NAME=app.quizwar.bd
ANDROID_SHA256_CERT_FINGERPRINTS=<Play app signing SHA-256>,<upload key SHA-256>
SMTP_URL=smtps://user:pass@smtp.provider.com:465
VAPID_PUBLIC_KEY=…  VAPID_PRIVATE_KEY=…
FCM_SERVICE_ACCOUNT_JSON={"type":"service_account",…}
STORAGE_PUBLIC_URL=https://api.quizwar.app/media
```

Build the web app with `VITE_PUBLIC_WEB_URL=https://quizwar.app` and (if the API is on another
origin) `VITE_API_URL=https://api.quizwar.app`; see `apps/web/.env.production.example`.

## Without Docker

```bash
npm ci && npm run build
NODE_ENV=production node apps/server/dist/scripts/migrate.js
NODE_ENV=production node apps/server/dist/index.js     # behind systemd/pm2 + nginx
```

## Operations

- Health: `GET /health` (liveness), `GET /health/ready` (DB reachable).
- Logs: structured JSON (pino). Authorization headers, cookies, passwords and tokens are redacted.
- Graceful shutdown on SIGTERM: live matches are aborted cleanly (no rewards), sockets closed.
- Background jobs (idempotent): battle-request expiry sweep, settings refresh, season
  rollover (close + rewards + soft reset + next season), cleanup, evening streak reminders.
- Maintenance mode / force update / login methods: Admin Panel → App settings (no deploy needed).
- Scaling beyond one node: see [architecture.md](architecture.md#scaling-path).

## Google sign-in setup

1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID **Web application**;
   authorised JavaScript origins: `https://quizwar.app` (+ dev `http://localhost:5173`).
   This id is `GOOGLE_CLIENT_ID` (also used by the Android plugin as `webClientId`).
2. Create an **Android** OAuth client for package `app.quizwar.bd` with the SHA-1 of the
   Play app-signing certificate and of the upload/debug keys. Add its id to `GOOGLE_EXTRA_AUDIENCES`.

## Push notifications

- Web: VAPID keys (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`); players opt in from Settings.
- Android: create a Firebase project, add the Android app, download `google-services.json`
  into `apps/android/app/` **on the build machine only** (git-ignored), and set
  `FCM_SERVICE_ACCOUNT_JSON` on the server (service account with "Firebase Cloud Messaging API Admin").
