# Phase 0 summary: Foundation

## What was built

- **Contracts first** (`docs/CONTRACTS/`): OpenAPI 3.1 for the whole product (57 paths, later phases marked
  `x-phase`), error codes, MySQL schema (41 tables incl. all 35 required), i18n keys with per-screen namespaces,
  design tokens, WebSocket events, and a machine-readable navigation contract that generates `NAVIGATION_MAP.md`
  (51 screens, 16 sheets/dialogs, every button with a destination).
- **Server** (`server/`): Express app with helmet/CSP, CORS allow-list, rate limits, request ids, `/api/v1`
  versioning, consistent error shape, `GET /health`, `GET /app-config`, zod-validated config, PII-free logging,
  knex migration for every table, idempotent seed (plans, prices, app settings, emergency numbers), time zone utils.
- **Location privacy by construction:** separate admin DB user with no grants on location tables, enforced by tests.
- **App** (`app/`): Flutter Android project (`app.nirapod.family`, min SDK 26, target 36), light/dark theme from
  tokens with AA-safe text colors, 8-language i18n with the no-mixing rule and RTL, IANA time zone utils
  (detection priority zone > locale > IP), motion utilities, high refresh rate request, API client with Keystore
  tokens and single-flight refresh, all 8 screen states, trust labels, adult bottom bar, router with every screen
  as a walkable placeholder.
- **Assets:** 57 custom SVG icons + 3 brand SVGs (house-style checked, SVGO), 249 country flags + 8 round language
  flags (MIT), bundled Noto variable fonts (OFL). Icon sheet: `docs/ui-board/icon-sheet.html`.
- **CI** (`.github/workflows/nirapod-ci.yml`): contract drift checks, server tests on MySQL 8, Flutter analyze and
  tests, release AAB build, permission check on the merged manifest.

## Test results (run in this session)

| Suite | Result |
|---|---|
| Server (`npm test`, MariaDB 10.11) | 33 passed, 0 failed |
| Flutter (`flutter test`) | 62 passed, 0 failed |
| Flutter analyzer | no issues |
| Contract checks (`node tools/check-all.mjs`) | all up to date, i18n rules ok, permissions ok |
| Live server smoke (health, app-config, /, /admin, tokens.css) | all 200 |

## Not verified here (and why)

- **Android app bundle build:** the sandbox network blocks the Android SDK download, so `flutter build appbundle`
  runs only in GitHub Actions. CI run 40737190846 built it successfully and the merged-manifest permission check passed. (A-025)
- **Animation profiling numbers (60 Hz and 120/144 Hz phones):** needs real devices. Phase 0 ships only the bottom
  bar morph, press scale, page fade and shimmer, all time-based and inside RepaintBoundary. Numbers will be measured
  and reported from Phase 1, when the animated screens exist.

## REQUIREMENTS COVERAGE (Phase 0)

| Requirement | Status |
|---|---|
| Repo structure (app, server, admin, landing) | verified |
| /docs/CONTRACTS: OpenAPI | verified |
| /docs/CONTRACTS: DB schema | verified |
| /docs/CONTRACTS: i18n key list | verified |
| /docs/CONTRACTS: design tokens | verified |
| /docs/CONTRACTS: WebSocket event formats | done |
| NAVIGATION_MAP.md | verified |
| CI builds the Android app bundle and runs tests | verified (CI run 40737190846: all 3 jobs green, AAB artifact uploaded) |
| Env/config management | verified |
| DB migrations and seed data | verified |
| Design tokens and theming | verified |
| SVG icon pipeline and motion utilities | verified (icons) / done (motion, device profiling pending) |
| i18n scaffolding with RTL and all 8 language files | verified |
| Time zone utilities (IANA, zone.tab mapping, formatting) | verified |
| Navigation skeleton | verified |
| TRACEABILITY.md | done |
| API client with token refresh | verified |
| Error/empty/loading component set | verified |
| Logging without PII | verified |
| Health endpoint | verified |
| README with setup | done |

No Phase 0 item is missing. Full mapping of the whole spec: `TRACEABILITY.md`.

## Manual test checklist

1. Push the branch and confirm all three CI jobs are green; download the `nirapod-release-aab` artifact.
2. `cd nirapod/server && npm ci && npm run migrate && npm run seed && npm start`, then open
   `http://localhost:3000/api/v1/health` (status ok, db ok), `/api/v1/app-config`, `/` and `/admin/`.
3. Run `npm run seed` a second time: no errors, no duplicate rows.
4. Install the debug app (`flutter run`): splash shows the logo for ~600 ms, then the Welcome placeholder.
5. Tap through placeholder buttons: every button opens its screen, sheet or a snackbar naming the system action.
6. Open `/home`: bottom bar shows Home, Map, History, Premium, Settings; the selected icon switches outline to filled
   and the indicator slides.
7. Set the system "Remove animations" option: transitions become plain fades.
8. In Android settings set font size to the largest: no clipped text on the placeholder screens.
9. Open `docs/ui-board/icon-sheet.html` in a browser: all icons in light and dark.
10. (Optional) Set `language` to `ar` in app storage or via a test build: layout mirrors right-to-left.

## Risks and open items for Phase 1

- Confirm the Play target API level in Play Console before the first upload.
- A native-speaker review is needed for hi, ur, ar, es, id, ms before they are enabled.
- Real prices and verified emergency numbers must be entered before release (A-014, A-015).
- The launcher icon is still the Flutter default (PNG mipmaps); it becomes a vector adaptive icon from the logo in Phase 1.
