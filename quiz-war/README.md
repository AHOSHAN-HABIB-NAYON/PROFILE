# ⚔️ QUIZ WAR: Bangladesh

Realtime multiplayer quiz game for Bangladesh — **Web (PWA) + Android + Admin Panel** on one
Node.js/TypeScript backend with MySQL (and optional Redis).

> 1 VS 1 · Duo 2 VS 2 · Squad rooms (3v3/4v4) · AI opponents · Solo / Survival / Speed Round ·
> Daily Challenge · XP, coins, streaks, achievements · Leagues & seasons · 8 leaderboards ·
> Friends via UID / QR · Battle requests · War Rooms · Squads · Push notifications.

## Repository layout

```
quiz-war/
├─ apps/
│  ├─ server/        Fastify REST API + Socket.IO realtime + game engine (TypeScript)
│  │  └─ src/
│  │     ├─ game/            server-authoritative engine, bots, MySQL persistence
│  │     ├─ modules/         auth, users, social, squads, matchmaking, progression,
│  │     │                   leaderboard, daily, notifications, uploads, shop, admin …
│  │     ├─ realtime/        Socket.IO gateway (validated, rate-limited events)
│  │     ├─ routes/          REST routes (player API, admin API, public pages)
│  │     └─ scripts/         migrate, dev seed, create-admin
│  ├─ web/           React PWA (game client) + Capacitor config for Android
│  ├─ admin/         React Admin Panel served at /v2admin
│  └─ android/       Capacitor Android project (Gradle) — signing via keystore.properties
├─ packages/
│  ├─ shared/        types, socket contract, game rules (scoring, levels, Elo, leagues), settings schema
│  └─ ui/            brand design tokens shared by game + admin
├─ database/
│  ├─ migrations/    SQL schema + reference data (categories, RBAC, achievements, shop)
│  └─ seed/          development-only sample questions
├─ deploy/           Dockerfile companions: docker-compose, nginx, backup script
└─ docs/             architecture, deployment, android-release, security, backup, testing, api
```

## Quick start (development)

Requirements: Node 20.11+ (22 recommended), MySQL 8 / MariaDB 10.6+. Redis optional.

```bash
cd quiz-war
npm install
cp .env.example .env           # set DATABASE_URL; JWT secrets are optional in development
mysql -u root -e "CREATE DATABASE quizwar CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
npm run db:migrate
npm run db:seed                # DEV ONLY: 52 sample Bangla/English questions
ADMIN_EMAIL=you@example.com npm run admin:create   # prints a generated password once

npm run dev:server             # http://localhost:4000
npm run dev:web                # http://localhost:5173  (proxies /api and /socket.io)
npm run dev:admin              # http://localhost:5174/v2admin
```

Emails (verification / reset) are printed to the server log until `SMTP_URL` is set.
Google sign-in appears once `GOOGLE_CLIENT_ID` is configured.

## Tests

```bash
npm test          # shared rules, game engine, matchmaking, and HTTP API against MySQL
npm run typecheck
npm run build
```

The API suite uses `TEST_DATABASE_URL` (default `mysql://quizwar:devpass@localhost:3306/quizwar_test`)
and resets that database on every run. It is skipped automatically if MySQL is unreachable.
See [docs/testing.md](docs/testing.md).

## Documentation

- [Architecture](docs/architecture.md) — components, realtime engine, data model, scaling path
- [Deployment](docs/deployment.md) — environments, Docker, nginx, TLS, Redis, CDN
- [Android release](docs/android-release.md) — build, App Links, passkeys, **signing key custody**
- [Security](docs/security.md) — auth, anti-cheat, API hardening, privacy
- [Backup & restore](docs/backup.md)
- [Testing](docs/testing.md) and [API reference](docs/api.md)

## Production checklist

Status legend: ✅ implemented and verified in this repo (tests / live run) · 🔧 implemented, needs your
credentials or a device to verify · 📋 owner action.

| Item | Status |
|---|---|
| Web app, PWA (manifest, service worker, offline shell, install, update prompt) | ✅ |
| Email/password login, verification, reset, lockout, sessions, logout-all | ✅ (emails need `SMTP_URL` 🔧) |
| Google login | 🔧 code + server verification done; needs OAuth client ids |
| Passkeys (web) | 🔧 implemented; verify on HTTPS domain with `WEBAUTHN_RP_ID` |
| Passkeys (Android WebView via Credential Manager) | 🔧 needs device + assetlinks fingerprints |
| UID, QR show/scan, public profile, deep links | ✅ web · 🔧 Android App Links need fingerprints |
| Friends, blocks, online presence, Available for Battle | ✅ |
| Battle requests (expiry, duplicates, limits) → War Room → 1 VS 1 | ✅ (two-browser E2E run) |
| Duo 2v2 matchmaking, 3v3/4v4 squad War Rooms | ✅ engine + matchmaking tests |
| AI opponents (4 levels, fallback, first-match beginner AI) | ✅ |
| Server-authoritative timer/answers/score/winner/rewards, anti-cheat flags | ✅ |
| Disconnect grace, reconnect + resume, forfeit | ✅ engine tests · 🔧 verify on real mobile network |
| XP, coins, streaks, daily reward, achievements, shop | ✅ |
| Leagues, ranked Elo + anti-boosting, seasons, 8 leaderboards | ✅ |
| Solo, Survival, Speed Round, Daily Challenge, review + Practice Mistakes | ✅ |
| Profile image compression (client + server WebP pipeline) | ✅ |
| In-app notifications | ✅ · Push: 🔧 needs VAPID keys / Firebase |
| Admin panel, RBAC, audit log, reports, moderation, settings | ✅ (browser run + API tests) |
| Android project, icons, splash, signing config, versioning | ✅ configured · 🔧 build runs in CI (SDK not available in the dev sandbox) |
| Signed AAB | 🔧 add signing secrets (docs/android-release.md) |
| Privacy Policy, Terms, Community Guidelines, account deletion | ✅ (review the legal text with a lawyer 📋) |
| Database backup + restore procedure | ✅ documented + compose job · 📋 off-site copy |
| Question bank | 📋 import your production questions (dev seed is for development only) |
