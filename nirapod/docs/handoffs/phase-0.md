# Phase 0 handoffs

Roles ran one after another in one session (ASSUMPTIONS A-024). Each handoff: task, files, how to test, open risks.

## 1. Lead Architect -> all
- **Task:** contracts before code; phase split; traceability.
- **Files:** `docs/CONTRACTS/*`, `ASSUMPTIONS.md`, `DECISIONS.md`, `TRACEABILITY.md`.
- **Test:** `cd tools && node check-all.mjs`; `cd server && npm test` (contracts.test.js).
- **Risks:** OpenAPI request/response bodies for Phases 2-8 are outline-level and will be detailed per phase.

## 2. Backend Engineer -> QA
- **Task:** server skeleton, config, logging, errors, health, app-config, migrations, seed, tz utils, admin DB isolation.
- **Files:** `server/src/**`, `server/migrations/*`, `server/scripts/*`, `server/test/*`, `tools/sql/admin-grants.sql`.
- **Test:** `npm test` (needs `nirapod_test` DB). Smoke: `npm run migrate && npm run seed && npm start`.
- **Risks:** MariaDB used locally, MySQL 8 in CI; mysql2 JSON decoding differs by setup (`db/json.js` handles both).

## 3. UI/UX and Design Engineer -> Android, QA
- **Task:** tokens, AA text variants, icon set and pipeline, flags, fonts, i18n files, icon sheet, admin/landing shells.
- **Files:** `docs/CONTRACTS/design-tokens.json`, `shared/icons/**`, `shared/i18n/*`, `tools/*.mjs`, `docs/ui-board/icon-sheet.html`, `admin/public/*`, `landing/public/*`.
- **Test:** `node tools/check-all.mjs`; open the icon sheet.
- **Risks:** brand vs. AA contrast conflict resolved in D-004 (needs product owner sign-off).

## 4. Android Engineer -> QA
- **Task:** Flutter project, theme, i18n runtime (no mixing), tz, motion, display mode, API client, state views, nav skeleton.
- **Files:** `app/lib/**`, `app/android/**`, `app/pubspec.yaml`.
- **Test:** `flutter analyze && flutter test`.
- **Risks:** AAB build only verified in CI (A-025). R8 minify is on; any missing keep-rules will show in CI.

## 5. QA and Security Reviewer: sign-off notes
- Reviewed against ABSOLUTE RULES: no extra permissions (CI check on merged manifest), AD_ID removed, no ad/analytics
  SDKs in `pubspec.yaml` or `package.json`, backups disabled, cleartext traffic disabled, location tables unreachable
  by the admin DB user, logs scrubbed.
- Found and fixed during review: (1) a race where a second 401 after a finished refresh would refresh again with a
  rotated token; (2) brand colors failing WCAG AA for text; (3) JSON settings parsed twice on MariaDB.
- **Phase 0 sign-off:** granted; first CI run green (AAB built, merged manifest permissions ok).
