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

### D-012 Phase 1 backend choices (from the Backend handoff)
- One session row per device for its whole life (`sid` in the JWT); old refresh hashes go to `refresh_token_history`
  (pruned after 30 days). Reuse of an old token, including two refreshes racing, revokes the whole rotation family.
- Child sessions are bound to `x-device-id`; a mismatch on refresh is rejected without revoking the session.
- Email/OTP and join codes are stored as HMAC keyed by MASTER_KEY (fallback: JWT secret outside production).
- The resend throttle lives in process memory (enough for one Hostinger instance; several instances need a shared store).
  Database-side limits are always enforced too.
- `max_members` counts adults only. Every adult, including the family creator, starts with sharing `pending`;
  children start `active`.
- Linking Google to an account whose email was never verified removes that account's password and sessions.
- HEIC uploads are rejected by the server (the bundled sharp cannot decode them); the app converts to JPEG first.
- Accepted spec trade-offs: register returns 409 for an existing email, and the login lockout shows that an account
  exists. Forgot and resend never reveal it.

### D-013 QA Phase 0 audit fixes (Lead)
- TRUST_PROXY defaults to true in production (HTTPS terminates at the proxy; otherwise redirect loops and one shared
  rate-limit IP).
- The log sanitizer normalises camelCase keys. Database errors log only code, errno and sqlState (SQL text carries
  values). Coordinate scrubbing also catches short pairs and `lat=` labels.
- Admin DB: no access to `email_codes` (`-- DENY:` line, test-enforced); `notifications` is readable only without
  `params` (which may hold place names).
- A client `x-request-id` is accepted only if it matches `[A-Za-z0-9._-]{1,64}`.
- App: tokens are cleared only when the server rejects the refresh token; offline keeps the session (a child phone
  must stay signed in). `x-device-id` is sent on every request.
- New token `inputBorder` (light #7F8F8A, dark #61766F) gives field outlines >= 3:1 (WCAG 1.4.11).
- AuthScaffold header grows with its text; the back label is translated.
- A saved language that admin later disables falls back to English.
- Exception to "never show Bengali when English is selected": the Language sheet lists each language by its
  native name (e.g. "বাংলা (Bengali)"), as the spec requires for that sheet.
- Not changed (minor, recorded): the public health endpoint shows version/uptime; CI actions are pinned by tag.

## D-014 Phase 4: geofencing, SOS delivery, safe walk
- Arrival/departure is decided on the server from uploaded points (2 agreeing points, 25 m exit margin,
  points worse than 150 m ignored, first state silent). Android geofences only wake the device for a 3-minute
  high-accuracy burst, so both paths give the same, debounced result and nothing depends on one OEM's geofencing.
- SOS: one open SOS per person; adults get realtime + email now, push (high-priority FCM) is added in Phase 5.
  Delivery status per recipient moves only forward: sent -> delivered -> seen -> responded. Emergency contacts get
  email only (no SMS). The map link goes only to recipients and is never logged.
- Shake-to-SOS runs in the visible foreground service (accelerometer, no permission); a 5 s notification with
  Cancel comes first; the device key is accepted on POST /sos (and POST /locations) only.
- Safe walk: status stays `active` until arrival/cancel; "overdue" and "stopped too long" are one-time alerts
  stored as timestamps, so a late child can still arrive and end the walk normally.
- place_presence joins LOCATION_TABLES (admin can never read it).
- String tables are read with AssetBundle.load + utf8: loadString moves files over 50 KB to an isolate,
  which never completes in widget tests (bn.json passed 50 KB).
- Remember me: keeps the email and lets Android autofill save the password; when off, the session ends on the
  next app start (the password is never stored by the app).
