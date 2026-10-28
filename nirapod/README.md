# Nirapod: Live Family Locator

Android family-safety app (Flutter), its Node.js backend, an admin panel and a single-page landing site.
Parents see where their family is, get alerts when loved ones arrive or leave, and receive SOS instantly.
Nothing is hidden: the child always knows sharing is on, and live location and SOS are never behind a paywall.

**Status:** Phase 0 (foundation). See `docs/phases/phase-0-summary.md`.

## Layout

```
nirapod/
  app/        Flutter Android app (lib/core: theme, i18n, tz, motion, net, state; lib/nav: router + bottom bar)
  server/     Node.js + Express + MySQL API, migrations, seed, tests
  admin/      Admin panel (served at /admin by the server)
  landing/    Landing page (served at / by the server)
  shared/     Source data used everywhere: i18n strings, IANA tz tables, SVG icons, web tokens
  tools/      Generators and checks (tokens, icons, flags, navigation, i18n, permissions)
  docs/       CONTRACTS (API, DB, i18n, tokens, WebSocket, NAVIGATION_MAP), deploy, phases, handoffs, ui-board
  ASSUMPTIONS.md  DECISIONS.md  TRACEABILITY.md
```

## Setup

Requirements: Node 22, MySQL 8 (or MariaDB 10.6+), Flutter 3.47 stable, Java 17, Android SDK (API 36).

### Server

```bash
cd nirapod/server
```

```bash
cp .env.example .env   # then set DB_* and secrets
```

```bash
npm ci && npm run migrate && npm run seed && npm start
```

Check: `curl http://localhost:3000/api/v1/health`. Tests need a database `nirapod_test` reachable with the
`DB_*` variables (defaults: user `nirapod`, password `nirapod`):

```bash
npm test
```

### App

```bash
cd nirapod/app && flutter pub get && flutter test
```

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1
```

Release bundle (signing: `android/key.properties`, see ASSUMPTIONS A-023):

```bash
flutter build appbundle --release
```

### Tools (after editing anything in docs/CONTRACTS or shared/)

```bash
cd nirapod/tools && npm ci
```

```bash
npm run tokens && npm run nav && npm run icons && npm run flags && npm run sync && npm run check
```

## CI

`.github/workflows/nirapod-ci.yml`: contract checks, server tests on MySQL 8, Flutter analyze + tests, release
app bundle build, and a permission check of the merged release manifest. The bundle is uploaded as an artifact.

## Hosting

Hostinger first, VPS upgrade path for WebSockets and cron: `docs/deploy/hosting.md`.
