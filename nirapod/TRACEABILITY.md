# TRACEABILITY

Maps each requirement of the spec to code, tests and status: **not started**, **done** (implemented, manual or pending check) or **verified** (automated test passes).

| ID | Area | Requirement | Code | Tests / check | Status |
|---|---|---|---|---|---|
| P0-01 | Phase 0 | Repo structure: app, server, admin, landing | app/, server/, admin/, landing/, shared/, tools/ | CI jobs | **verified** |
| P0-02 | Phase 0 | /docs/CONTRACTS: OpenAPI | docs/CONTRACTS/openapi.yaml | server/test/contracts.test.js | **verified** |
| P0-03 | Phase 0 | /docs/CONTRACTS: DB schema | server/migrations/20261028_0001_initial_schema.js, docs/CONTRACTS/schema.sql, db-schema.md | server/test/schema.test.js | **verified** |
| P0-04 | Phase 0 | /docs/CONTRACTS: i18n key list | docs/CONTRACTS/i18n-keys.json | tools/check-i18n.mjs, app/test/i18n_test.dart | **verified** |
| P0-05 | Phase 0 | /docs/CONTRACTS: design tokens | docs/CONTRACTS/design-tokens.json -> tokens.g.dart, tokens.css | check-all (drift), contrast_test.dart | **verified** |
| P0-06 | Phase 0 | /docs/CONTRACTS: WebSocket event formats | docs/CONTRACTS/websocket-events.md | manual review (implemented Phase 2/7) | **done** |
| P0-07 | Phase 0 | NAVIGATION_MAP.md, every button has action + destination | docs/CONTRACTS/navigation.json -> NAVIGATION_MAP.md, app/lib/nav/routes.g.dart | gen-nav.mjs validation, app/test/nav_test.dart | **verified** |
| P0-08 | Phase 0 | CI builds the Android app bundle and runs tests | .github/workflows/nirapod-ci.yml | first CI run on push (AAB cannot build in sandbox, A-025) | **done** |
| P0-09 | Phase 0 | Env/config management | server/src/config.js, server/.env.example, app/lib/core/config/env.dart | server/test/config.test.js | **verified** |
| P0-10 | Phase 0 | DB migrations and seed data | server/migrations, server/src/db/seed*.js, scripts/ | schema.test.js (rollback, idempotent seed) | **verified** |
| P0-11 | Phase 0 | Design tokens and theming (light default, dark equal, 250 ms cross-fade, remembered) | app/lib/core/theme/* | contrast_test.dart, nav_test.dart (remembered dark) | **verified** |
| P0-12 | Phase 0 | SVG icon pipeline (24dp, 1.75 stroke, round caps, filled variants, SVGO, icon sheet) | shared/icons, tools/build-icons.mjs, docs/ui-board/icon-sheet.html | build-icons rule check, source_rules_test.dart | **verified** |
| P0-13 | Phase 0 | MIT SVG flag set | tools/build-flags.mjs, app/assets/flags (lipis/flag-icons, MIT) | source_rules_test.dart | **verified** |
| P0-14 | Phase 0 | Motion utilities (time-based, reduce-motion, press scale, high refresh rate) | app/lib/core/motion/* | source_rules_test.dart (no frame counts); device profiling pending | **done** |
| P0-15 | Phase 0 | i18n scaffolding with RTL and all 8 language files | shared/i18n/*, app/lib/core/i18n/* | i18n_test.dart, nav_test.dart (Arabic RTL), widgets_test.dart (RTL bar) | **verified** |
| P0-16 | Phase 0 | Time zone utilities (IANA, zone.tab, formatting) | server/src/tz, app/lib/core/tz | server/test/tz.test.js, app/test/tz_test.dart | **verified** |
| P0-17 | Phase 0 | Navigation skeleton | app/lib/nav/* | nav_test.dart (every path opens, tabs switch) | **verified** |
| P0-18 | Phase 0 | TRACEABILITY.md | this file | phase summary | **done** |
| P0-19 | Phase 0 | API client with token refresh | app/lib/core/net/* | api_client_test.dart | **verified** |
| P0-20 | Phase 0 | Error/empty/loading component set (all 8 required states) | app/lib/core/state/* | widgets_test.dart (3 sizes x light/dark x en/bn, 200% text) | **verified** |
| P0-21 | Phase 0 | Logging without PII | server/src/logger.js, app/lib/core/log/log.dart | server/test/logger.test.js, app/test/log_test.dart | **verified** |
| P0-22 | Phase 0 | Health endpoint | server/src/routes/health.js | server/test/api.test.js | **verified** |
| P0-23 | Phase 0 | README with setup | README.md | manual | **done** |
| AR-01 | Absolute rules | No hidden app, covert tracking, call/SMS/contacts, audio, accessibility abuse, ad SDKs, data selling | manifest (no such permissions), AD_ID removed | check-permissions.mjs (CI, merged manifest) | **done** |
| AR-02 | Absolute rules | Admins/support/AI never see location | admin DB user without location grants (D-003) | schema.test.js (grants + admin code scan) | **verified** |
| AR-03 | Absolute rules | Never show old/estimated position as live | app/lib/core/trust/trust.dart | trust_test.dart | **verified** |
| AR-04 | Absolute rules | Only PERMISSIONS list | tools/check-permissions.mjs | CI | **done** |
| ST-01 | Stack | Node + Express + MySQL, helmet, CORS allow-list, rate limit, versioning, error codes, migrations, seed | server/ | api.test.js | **verified** |
| ST-02 | Stack | JWT short access + rotating refresh, bcrypt, parameterized queries, input validation | sessions table + contract | Phase 1 | **not started** |
| ST-03 | Stack | Socket.IO realtime, FCM, SMTP email, SPF/DKIM/DMARC doc | contracts only | Phase 2/5 | **not started** |
| ST-04 | Stack | Maps SDK, Geofencing, Places API (New), Maps 3D | - | Phase 2/4 | **not started** |
| ST-05 | Stack | Scheduled jobs + status in admin | job_runs table | Phase 3+ | **not started** |
| ST-06 | Stack | All required DB tables and users fields | initial migration | schema.test.js | **verified** |
| ST-07 | Stack | Hostinger compatible; VPS upgrade path documented | docs/deploy/hosting.md | manual | **done** |
| ST-08 | Stack | Optional Crashlytics only, no other analytics | no SDK added | manual | **done** |
| DS-01 | Design | Tokens light/dark/shared exact values; red only for SOS/danger | design-tokens.json | contrast_test.dart | **verified** |
| DS-02 | Design | Noto typography, 5-step scale, min 14sp, Bengali line heights | app_theme.dart, assets/fonts | widgets_test.dart (bn, 200%) | **done** |
| DS-03 | Design | 4/8 grid, 20dp padding, radii, 44dp header buttons, 48dp targets | tokens + AppButton | widgets_test.dart (48dp) | **done** |
| DS-04 | Design | Component set (top bar, bottom nav, cards, buttons, chips, sheets, dialogs, toasts, banners, inputs, skeletons, avatars, empty states) | bottom nav, buttons, banners, skeletons, state views done | rest in Phase 1-2 | **done** |
| DS-05 | Design | Layouts verified at 360x800, 412x915, 320x640 | test helpers | widgets_test.dart | **verified** |
| DS-06 | Design | Motion list (theme morph, sheet, bell, nav morph, press, page, pulse, greeting, check, shimmer, logo, confetti, SOS ring) | nav morph, press, page, shimmer done; bell/badge math in motion.dart | others Phase 1-4 | **done** |
| DS-07 | Design | Smooth 60-144 Hz, highest refresh rate, reduce motion, frame budget, profiling report | display_mode.dart, Motion.of | device profiling not possible in sandbox | **done** |
| DS-08 | Design | Accessibility: AA contrast, 200% text, TalkBack labels, RTL, not color alone | contrast + a11y strings + Semantics | contrast_test, widgets_test | **done** |
| LO-01 | Localization | 8 languages, English default, en+bn full, no mixing, admin enable/disable | shared/i18n, EnabledLanguages, app_settings.languages_enabled | i18n_test.dart, check-i18n.mjs | **verified** |
| LO-02 | Localization | Malay separate from Indonesian; Malaysian phrasing | ms.json, id.json | i18n_test.dart, check-i18n.mjs | **verified** |
| LO-03 | Localization | Language selector only in the 5 places | navigation.json | gen-nav.mjs, nav_test.dart | **verified** |
| LO-04 | Localization | Pill (36dp) and 44dp flag button, Language bottom sheet with 56dp rows | - | Phase 1/2 | **not started** |
| LO-05 | Localization | Arabic/Urdu RTL mirroring incl. chevrons; code cells keep LTR digits | Directionality, directionalIcons, numerals.dart | nav_test.dart, widgets_test.dart | **done** |
| LO-06 | Localization | Greeting strings per language | shared/i18n/*.json | i18n_test.dart (exact spec text) | **verified** |
| NV-01 | Navigation | Adult 5 tabs; child has no bottom bar | adult_shell.dart, navigation.json | nav_test.dart | **verified** |
| NV-02 | Navigation | Required states on every screen | state_views.dart | widgets_test.dart | **verified** |
| TL-01 | Trust labels | Live <2 min, Recent 2-15, Stale >15, Unavailable with reason; exact time; accuracy circle | trust.dart, trust_label.dart | trust_test.dart, widgets_test.dart; accuracy circle Phase 2 | **done** |
| P1 | Phase 1 | Start, welcome, permission pages, role choice, auth, profile setup, child onboarding, child code | contracts + placeholders | - | **not started** |
| P2 | Phase 2 | Home header, profile row, profile page, logout/exit, family, consent, home body, map, member page, request update, overseas mode | contracts + placeholders | - | **not started** |
| P3 | Phase 3 | Background location, adaptive frequency, history, retention, offline and battery alerts | tables | - | **not started** |
| P4 | Phase 4 | Places/geofencing, SOS, safe arrival, safe walk, child home | tables | - | **not started** |
| P5 | Phase 5 | FCM channels, alerts list, email templates, campaigns | tables | - | **not started** |
| P6 | Phase 6 | Plans, premium tab, Play Billing, redeem, grants, gifts, support banner, landing page | tables + seed | - | **not started** |
| P7 | Phase 7 | Rating, force update, settings, data rights | app-config endpoint (min/latest version) | api.test.js (app-config) | **not started** |
| P7B | Phase 7B | Live chat AI first + human takeover, retention, safety policy | tables | - | **not started** |
| P8 | Phase 8 | Admin panel | shell + DB isolation | schema.test.js | **not started** |
| BE-01 | Backend API | GET /app-config | server/src/routes/app-config.js | api.test.js | **verified** |
| BE-02 | Backend API | Auth, me, family, location, places, SOS, notifications, plans, redeem, chat, admin endpoints | openapi.yaml (contract) | Phase 1-8 | **not started** |
| SP-01 | Security | Secrets only in env; production refuses to start without them | config.js | config.test.js | **verified** |
| SP-02 | Security | Tokens in Android Keystore; no app backups | token_store.dart, AndroidManifest (allowBackup=false, extraction rules) | manual | **done** |
| SP-03 | Security | HTTPS only | FORCE_HTTPS (forced in production), HSTS, usesCleartextTraffic=false | config.test.js, source_rules_test.dart (no http://) | **verified** |
| SP-04 | Security | Encrypted daily DB backups, uploads validation, 2FA, CSRF, audit logs | audit_logs table | Phase 8/9 | **not started** |
| EC-01 | Edge cases | UTC/Etc fallback, multi-zone confirm, DST, date line, 12/24 h, VPN/travel trust zone, midnight rollover | tz utils | tz.test.js, tz_test.dart | **verified** |
| EC-02 | Edge cases | Long/RTL/emoji names, no photo, upload failures, denied camera, unsupported device language, resume after days, manual zone while auto ON, weak GPS | fontFallback, languageFor fallback | Phase 1-3 | **not started** |
| P9 | Phase 9 | Testing and release pack | - | - | **not started** |

Totals: 34 verified, 18 done, 18 not started (later phases).
