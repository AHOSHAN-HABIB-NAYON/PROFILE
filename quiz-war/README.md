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
