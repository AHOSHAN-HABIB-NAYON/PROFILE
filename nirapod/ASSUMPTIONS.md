# ASSUMPTIONS

Every assumption made instead of asking. Safest option chosen where the spec was ambiguous. IDs are stable.

| ID | Assumption | Why / how to change |
|---|---|---|
| A-001 | The product lives in `nirapod/` inside this repository, next to the existing personal profile site (`index.html`), which is left untouched. | The repository already hosts a GitHub Pages site. Move `nirapod/` to its own repo any time; nothing references the parent. |
| A-002 | Android app is **Flutter** (not native Kotlin). | Spec allows either; one codebase, strong SVG/animation support, fast iteration. |
| A-003 | Package name `app.nirapod.family`; public domain placeholders `nirapod.app`, `api.nirapod.app`. | Change in `android/app/build.gradle.kts`, `Env.apiBaseUrl`, seed `play_store_url`. Package name cannot change after first Play upload. |
| A-004 | App libraries: Riverpod (state), go_router (navigation), dio (HTTP), flutter_secure_storage (Keystore), flutter_svg, timezone + flutter_timezone, flutter_displaymode, connectivity_plus. | Mainstream, maintained, no tracking. |
| A-005 | `targetSdk = 36`, `minSdk = 26`. | Play's target-API rule requires the recent level for new apps and updates; re-check the Play Console requirement before each release. |
| A-006 | Phase 0 manifest declares only INTERNET and ACCESS_NETWORK_STATE. Location, foreground service, notification, vibrate and boot permissions are added in the phase that uses them. | Request nothing before it is needed. The allow-list check runs on the merged manifest in CI. |
| A-007 | Language flags: en = GB, bn = BD, hi = IN, ur = PK, ar = SA, es = ES, id = ID, ms = MY. | Editable in `shared/i18n/languages.json`. English could use a globe instead if preferred. |
| A-008 | The brand name stays "Nirapod" (Latin) in every language, including Bengali. | Matches the wordmark; a Bengali brand name would mix scripts with the logo. |
| A-009 | English is the default language even when the phone is set to a supported language. | Spec: "English is the default everywhere". Users switch with the selector. |
| A-010 | Server seed enables only en and bn; hi, ur, ar, es, id, ms stay disabled until a native speaker reviews them. `node scripts/seed.js --all-languages` enables all for testing. | Spec requires native review before a language is enabled. |
| A-011 | hi, ur, ar, es, id, ms currently contain the spec's greeting strings and the sheet title only. Any screen missing a key renders entirely in English (no mixing). | Spec: others fall back to English per string but never mix two languages on one screen. |
| A-012 | Child accounts are users with `auth_provider = 'device'` (no email/password), bound to one device session. | Spec lists email/google; children log in with a code. |
| A-013 | Family Plus "6+ children, 10+ members" is seeded as 6 and 10 (admin can raise); "unlimited places" is `NULL`. | Editable in admin without an app update. |
| A-014 | Plan prices (USD, BDT, SAR, MYR) are placeholders. | Real prices are set in admin and Play Console. |
| A-015 | Emergency numbers are seeded for common expat countries with `verified_at = NULL`. Each must be checked before release. | Never hardcoded in the app; admin-editable table. |
| A-016 | Noto fonts (Sans, Sans Bengali, Sans Arabic, Nastaliq Urdu, Sans Devanagari; OFL) are bundled as variable fonts. | No runtime font download, so no third-party request. |
| A-017 | IANA tzdata 2026e (`zone.tab`, `iso3166.tab`) copied from the system tz database into `shared/tz/`. | Update by copying newer files; the app's conversion data comes from `package:timezone`, the server's from Node's ICU. |
| A-018 | Local development and tests used MariaDB 10.11; CI uses MySQL 8.0. | Both are available on Hostinger; migrations avoid engine-specific features (CHECK needs MySQL >= 8.0.16). |
| A-019 | Admin panel is served at `/admin` and the landing page at `/` by the same Express server. | Spec: "served by the same server". |
| A-020 | Language change is shown as a 250 ms fade-in of the new language (Phase 0). | A true cross-fade needs a snapshot of the old frame; revisit with the language sheet in Phase 1. |
| A-021 | No manual shader warm-up step. | Flutter's Impeller renderer (default on Android) compiles shaders ahead of time. |
| A-022 | The existing GitHub Pages workflow publishes the whole repository on pushes to `main`, which will include `nirapod/` source (no secrets). | Restrict the Pages `path` if that is not wanted. |
| A-023 | Release signing comes from `android/key.properties` or CI secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Without them the CI bundle is debug-signed and must not be uploaded. | Play App Signing recommended. |
| A-024 | The five team roles ran one after another in a single session (allowed by the spec when parallel agents are not used). | QA review notes are in `docs/handoffs/phase-0.md`. A truly independent reviewer is still recommended before release. |
| A-025 | The Android SDK could not be downloaded in the build sandbox (network policy), so the app bundle is built only in GitHub Actions. Analyzer and all Flutter tests ran locally. | See the Phase 0 summary. |
