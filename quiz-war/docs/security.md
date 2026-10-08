# Security

## Authentication
- **Passwords:** scrypt (N=2¹⁵, r=8, p=1, 64-byte key, per-user salt), parameters stored with the
  hash for future upgrades. Unknown-email logins burn the same CPU time (no user enumeration).
- **Brute force:** per-IP route limits (10/min login/register, 5/15 min forgot-password) +
  per-account lockout (5 failures → 15 minutes). Admin accounts: 5 failures → 30 minutes.
- **Tokens:** short-lived JWT access tokens (15 min, HS256, issuer/audience checked) +
  opaque refresh tokens stored only as SHA-256 hashes. Every refresh **rotates** the token;
  replaying an old token outside a 15 s multi-tab grace window **revokes the session**
  (theft detection). Web: refresh token in an `HttpOnly; Secure; SameSite=Strict` cookie
  scoped to `/api/v1/auth`, plus a required `X-Requested-With` header (CSRF). Android:
  refresh token in Keystore-backed secure storage; app backups disabled.
- **Google:** ID tokens verified server-side (signature, issuer, expiry, audience). Accounts are
  linked by email only when Google asserts the email is verified.
- **Passkeys:** WebAuthn via @simplewebauthn/server, discoverable credentials, server-stored
  single-use challenges (5 min), origin + RP ID checks, signature counter updates.
- **Sessions:** list devices, revoke one, log out everywhere, login history (method, result, IP, UA).
- **Account deletion** erases email, login methods, passkeys, avatar, friends, notifications and
  squad membership; match rows stay anonymised.
- **Admins** are a separate table with a separate secret, audience and cookie; RBAC permissions are
  re-read every 30 s; every admin write is audit-logged with before/after values, IP and UA.
  Admin views mask player emails and never return password hashes, tokens or passkey keys.

## Anti-cheat (server-authoritative)
- The client never sends score, correctness, timing, winner or rewards — only intents.
- Correct answers are never sent before the reveal; option order is shuffled per match.
- Answers accepted only for the current question, once per player (in-memory check + DB UNIQUE key),
  only before the server deadline (+400 ms latency grace).
- Response time is measured on the server. Repeated correct answers faster than
  `match.minHumanResponseMs` flag the match (`impossible_speed:<user>`), visible in Admin → Matches → Flagged.
- Ranked anti-boosting: the same pair beyond `ranked.sameOpponentDailyLimit` ranked games in 24 h
  gets no rating change and the match is flagged `repeat_opponent`; matchmaking also enforces a
  rematch cooldown. AI matches are never ranked.
- Power-ups: inventory consumed atomically, per-match/per-item limits, cooldowns, one per question,
  disabled in ranked (configurable) and Daily Challenge.
- Economy: every coin change is a DB transaction with a `coin_transactions` ledger; one-time
  rewards are idempotent through `user_rewards (user, source, source_key)` UNIQUE.
- Socket events are schema-validated (zod) and rate-limited per socket (token bucket; abusive
  sockets are disconnected). One active match per player.
- No invasive device surveillance.

## API hardening
- Fastify + helmet headers, strict CORS allow-list, HSTS in production, global rate limit (Redis-backed
  when configured), body size limits, zod validation on every input.
- SQL: parameterised queries only (`?` placeholders, never string-concatenated input).
- Uploads: size limit, real image decode with sharp (not trusting MIME/extension), pixel-count limit,
  re-encode to WebP (strips EXIF/GPS), random file names, `/media` served with `nosniff` + restrictive CSP.
- XSS: React escapes output; the server-rendered share page HTML-escapes everything and JSON-LD
  escapes `<`. Recommended CSP for the web host is in `deploy/nginx.conf`.
- CSV export guards against spreadsheet formula injection.
- Errors: clients get `{ error: { code, message } }`; stack traces are only logged.
- Logs redact `authorization`, cookies, passwords and tokens.
- Maintenance mode and force-update gates for the player API and sockets.

## Secrets
Never in the repository or the frontend bundle: database credentials, JWT/admin secrets, OAuth client
secrets (none are needed — only public client ids), VAPID private key, FCM service account, upload
keystore. Frontend env vars (`VITE_*`) must contain public values only.

## Privacy
Collect the minimum (see `/legal/privacy`). Emails are never shown to other players. QR codes contain
only the public profile URL. Players can report and block; moderators act through the audited admin panel.
