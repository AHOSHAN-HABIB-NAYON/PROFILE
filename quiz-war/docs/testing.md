# Testing

```bash
cd quiz-war
npm test            # all workspaces
npm test -w @quizwar/server
```

| Suite | File | Covers |
|---|---|---|
| Game rules | `packages/shared/test/rules.test.ts` | scoring, speed bonus, combo multiplier/tiers, double score, levels/XP curve, Elo, leagues, UID generation/normalisation, settings schema |
| Game engine | `apps/server/test/engine.test.ts` | **2 players answering simultaneously**, **4 players in Duo** (team scores, winner), stale/future/late answers, **duplicate answer submission**, timeouts & combo reset, **player disconnecting during a question**, **reconnecting and resuming**, forfeit after grace, match not destroyed on disconnect, **AI opponent**, survival, speed round time limit, power-ups (50/50, limits, ranked block, inventory, time boost), War Room ready/host start, one match per player |
| Matchmaking | `apps/server/test/matchmaking.test.ts` | rating pairing, widening window, blocked players, **AI fallback** offer + accept, first-match beginner AI, timeout, balanced 2v2 teams |
| HTTP API (MySQL) | `apps/server/test/api.test.ts` | register/login/validation, web cookie + CSRF header, login rate limit, account lockout, refresh rotation + reuse revocation, email verification + reset (session revocation, no enumeration), Google sign-in + forged token, sessions + logout-all + login history, account deletion; **UID** search & privacy (no email), friends request/accept/remove, auto-accept, block hiding; **battle requests** (unavailable target, duplicate, **expired request**, War Room creation); daily reward idempotency, shop coins, leaderboard pagination cap; upload validation (fake PNG rejected) + WebP pipeline; **admin permissions** (player token rejected, question manager limits, super admin ban revokes sessions, audit before/after, email masking), CSV import with row errors + export, settings validation |

The API suite needs MySQL/MariaDB (`TEST_DATABASE_URL`, default
`mysql://quizwar:devpass@localhost:3306/quizwar_test`); it drops and recreates all tables in that
database. CI (`.github/workflows/quizwar-ci.yml`) runs everything against MySQL 8.4.

## End-to-end smoke test
A Playwright script was used during development to drive two browsers through: register →
onboarding → UID search → challenge → battle-request toast → accept → War Room → ready →
5-question realtime match → result → review → rank/profile/battle pages → desktop dark mode → AI
match, and the Admin Panel (login, dashboard, players, questions CRUD, moderation, settings, dark mode).

## Manual device checks before a release
Android internal track: Google sign-in, passkey create + sign-in, push (battle request with app in
background), QR scanner, App Link from a shared profile URL, back button during a match (no accidental
exit), airplane-mode toggle mid-match (reconnect + resume), image upload from camera and gallery.
