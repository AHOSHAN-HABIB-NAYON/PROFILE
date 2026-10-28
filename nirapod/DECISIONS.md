# DECISIONS

Design decisions and resolved disagreements between roles. Newest last.

### D-001 Contracts are machine-readable and generate code
Tokens (`design-tokens.json`), navigation (`navigation.json`), i18n keys (`i18n-keys.json`) and icons are sources.
`tools/` generates Dart, CSS and Markdown from them; `node tools/check-all.mjs` (CI) fails if any generated file is stale.
*Why:* contracts cannot drift from the app, and NAVIGATION_MAP.md is always the real route table.

### D-002 "No mixing" is enforced per screen
Each screen declares the i18n namespaces it uses. If the selected language lacks any key in those namespaces, the
whole screen renders in English; layout direction and numerals still follow the selected language.
*Disagreement:* UI wanted per-string fallback (spec text), QA pointed to "never mix two languages on one screen".
Lead chose per-screen fallback: it satisfies both lines.

### D-003 Admin cannot read location data, by construction
1. The admin panel uses a separate MySQL user (`DB_ADMIN_USER`) with no grants on `locations`, `places`, `trips`,
   `sos_events`, `timeline_events`, `nearby_cache` (`tools/sql/admin-grants.sql`). New tables are denied by default.
2. A test fails if admin code mentions a location table, and if the grants file grants one.
3. Production refuses to start without `DB_ADMIN_USER`.

### D-004 Accessible text colors next to the brand colors
Spec colors fail WCAG AA for normal-size text (white on `#059669` is 3.77:1; muted `#6B7C77` on `#F6F8F7` is 4.12:1).
Brand colors stay exactly as specified for icons, rings, indicators, map accents and large text. Text and filled
button labels use AA variants: light `primaryFill #047857` (5.48:1 with white), `mutedText #5B6C67`,
`warningText #B45309`, `successText #15803D`, `dangerText #B91C1C`; dark `primaryFill #10B981` with dark label,
`primaryText #34D399`. Tested in `app/test/contrast_test.dart`. Safest option: accessibility over exact hue.

### D-005 Two-layer log sanitizing
Server: pino redaction plus a deep sanitizer that drops any key that looks like PII or coordinates, plus a regex scrub
of free text (emails, coordinate pairs, bearer tokens, JWTs). Requests log only method, path (no query) and status;
never IPs or bodies. App: `Log.scrub` with the same patterns.

### D-006 Languages enabled by default
Only en and bn are enabled in the seed (see A-010). English cannot be disabled.

### D-007 Token model
Access JWT 15 minutes; opaque refresh token stored hashed (`sessions.refresh_token_hash`), rotated on every use;
reuse of an old token revokes the whole `rotation_family`. The app refreshes once for many concurrent 401s and
retries; a failed refresh clears tokens and returns to Login. Tokens live in the Android Keystore; app backups are
disabled so tokens never leave the device.

### D-008 Permission allow-list
CI fails on any permission outside the spec list. Two non-runtime permissions that Google libraries add are allowed:
`com.android.vending.BILLING` (Play Billing, Phase 6) and `com.google.android.c2dm.permission.RECEIVE` (FCM, Phase 5).
`com.google.android.gms.permission.AD_ID` is removed in the manifest (no ads or tracking).

### D-009 Location-bearing tables
`locations`, `places`, `trips`, `sos_events`, `timeline_events`, `nearby_cache` (constant `LOCATION_TABLES` in the
initial migration). `nearby_cache` is keyed by a coarse grid cell and never linked to a user, but is still kept away
from admin.

### D-010 Material icon font
`uses-material-design: true` stays so framework widgets never show missing-glyph boxes, but our code never uses
`Icons.*` (test-enforced). Every icon we draw is an SVG from `shared/icons`.

### D-011 Server stack details
Express 4, knex migrations (`server/migrations`), mysql2, zod config validation, helmet (CSP, no `x-powered-by`),
CORS allow-list on `/api` only, express-rate-limit (general + stricter auth limiter), node's built-in test runner.
