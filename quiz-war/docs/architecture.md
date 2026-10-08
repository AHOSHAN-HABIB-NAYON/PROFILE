# Architecture

```
 Web PWA (React)  ─┐                         ┌─ MySQL 8 (source of truth)
 Android app      ─┼─ HTTPS REST /api/v1 ──► │
 (Capacitor)      ─┤                         │  Node.js (Fastify + Socket.IO)
 Admin panel      ─┘─ WSS /socket.io ──────► │  ├─ game engine (in-memory live matches)
   /v2admin                                  │  ├─ matchmaking / presence
                                             │  └─ jobs (seasons, reminders, cleanup)
                                             └─ Redis (optional): Socket.IO adapter, presence, rate limits
```

Web and Android are the same React code base. Android wraps the production build with
Capacitor and adds native plugins (push via FCM, ML Kit QR scanner, haptics, secure storage,
Google Credential Manager, splash, status bar, network, share). Both clients talk to the same
API, so an account works everywhere and all progress is shared.

## Server modules

| Module | Responsibility |
|---|---|
| `modules/auth` | email/password (scrypt), Google ID-token verification, WebAuthn passkeys, JWT access tokens, rotating refresh tokens with reuse detection, email verification/reset, sessions, login history, account deletion |
| `modules/users` | profiles, onboarding, avatar pipeline, public profiles, match history, review, stats |
| `modules/social` | friends, blocks, battle requests (expiry, duplicate + spam protection) |
| `modules/squads` | squads, roles (captain/officer/member), invites, squad XP |
| `modules/matchmaking` | Quick Battle queue: widening rating window, rematch cooldown, block lists, team balancing (snake draft), AI fallback |
| `modules/presence` | online/away/in-match/DND status, "Available for Battle", online count (Redis-backed when configured) |
| `modules/progression` | XP/levels, coins ledger, Elo rating + leagues, anti-boosting, daily streak, daily login rewards, achievements, squad XP — all inside DB transactions |
| `modules/leaderboard` | global / weekly / monthly / season / category / squad / friends / daily boards, paginated + cached; seasons with soft reset & rewards |
| `modules/daily` | one shared question set per Bangladesh calendar day, one attempt per player |
| `modules/notifications` | in-app notifications (stored + realtime), Web Push (VAPID), FCM HTTP v1 |
| `modules/questions` | question picker, admin CRUD, CSV/JSON import/export, categories |
| `modules/admin` | separate admin accounts, RBAC, audit log |
| `modules/settings` | every tunable value (timer, scoring, rewards, AI, matchmaking, disconnect grace, ranked, seasons…) stored per section in `settings`, validated with zod, cached |

## Realtime game engine (`apps/server/src/game/engine.ts`)

Server-authoritative. Clients only send *intents* (`room:ready`, `match:answer`,
`match:powerup`, `match:forfeit`); the server owns:

- match creation, team assignment, question selection and **per-match option shuffling**
- round start/end, **server timestamps and deadlines** (clients only render them, using a measured clock offset)
- answer validation (current question only, once per player, inside the deadline + small latency grace)
- score = base + linear speed bonus, × combo multiplier, × double score power-up
- winner (team score → more correct → faster average), XP, coins, rating, achievements

Lifecycle: `createMatch → (War Room: join/ready/hostStart) → startMatch (countdown) →
startRound → submitAnswer… → endRound (reveal) → … → endMatch → rewards → persist`.

Modes are data (`packages/shared/src/modes.ts`): teams × team size, synchronised or solo,
end-on-wrong, total time limit. 1v1, 2v2, 3v3, 4v4, solo, survival, speed and daily all run
through the same engine; tournaments/custom formats are new mode entries or a bracket service
that calls `createMatch`.

**Disconnects:** a dropped player is marked disconnected and gets a configurable grace
period (`disconnect.graceSec`). Reconnecting (`match:resume`) returns a full snapshot
(current question, remaining time, your answer, power-ups) and the match continues. If the
grace expires the player forfeits; if a whole team is gone the other team wins.

**AI:** bots are real engine players (negative ids, `match_type = 'ai'`, names prefixed 🤖,
never ranked). Each difficulty has admin-configurable accuracy and response-time ranges,
adjusted by question difficulty.

**Persistence:** state changes are synchronous in memory; DB writes run on an ordered
per-match promise chain (`matches`, `match_players`, `match_questions`, `match_answers`
with a UNIQUE key as a second duplicate guard, `match_events`, `question_stats`).

## Data model

See `database/migrations/001_schema.sql` (≈45 InnoDB tables, utf8mb4, FKs, unique keys,
indexes for every hot query). Highlights: `users` + `user_profiles`, `user_sessions`
(hashed refresh tokens), `passkeys`, `matches`/`match_*`, `ratings` + `season_ratings`,
`leaderboards` (period boards keyed `weekly:2026-W41` etc.), `user_rewards` (UNIQUE
`(user, source, source_key)` makes every reward idempotent), `coin_transactions` ledger,
`reports` + `moderation_actions`, `admin_*` RBAC + `admin_logs`, `settings`.

## Scaling path

1. **Single node** (default): everything in one process; works without Redis.
2. **Multiple API nodes**: set `REDIS_URL` → Socket.IO Redis adapter, shared presence
   count and shared rate limits. Use sticky sessions (nginx `ip_hash` / cookie affinity).
   Live matches are owned by the node that created them; with sticky sessions a player's
   socket reaches that node. For fully stateless routing, move matchmaking to one
   "game" node pool and route by match id — the engine's `Emitter`/`MatchPersistence`
   interfaces are the seams for that.
3. Uploads: swap `LocalStorage` for an S3/R2 implementation of `StorageProvider` and serve
   `/media` from a CDN.

## Future features (architecture hooks)

Tournaments (bracket service over `createMatch`), private/custom rooms (exist: War Room),
Squad Wars (squad-bound rooms exist; add squad-vs-squad matchmaking), referrals, sponsored
events and seasons (`rewards` table), more languages (`questions.language`), rewarded ads /
cosmetic purchases (`shop_items`, `coin_transactions`), WebRTC voice (separate signalling
namespace on Socket.IO).
