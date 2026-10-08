# API reference (summary)

Base: `/api/v1`. JSON in/out. Errors: `{ "error": { "code": "…", "message": "…" } }`.
Auth: `Authorization: Bearer <accessToken>`. Clients send `X-Client-Platform: web|android`.

## Auth
`POST /auth/register` · `POST /auth/login` · `POST /auth/google {idToken}` ·
`POST /auth/passkey/login/options` · `POST /auth/passkey/login/verify` ·
`POST /auth/passkey/register/options` · `POST /auth/passkey/register/verify` · `GET/DELETE /auth/passkeys[/:id]` ·
`POST /auth/refresh` · `POST /auth/logout` · `POST /auth/logout-all` · `GET /auth/sessions` · `DELETE /auth/sessions/:id` ·
`GET /auth/login-history` · `POST /auth/verify-email` · `POST /auth/resend-verification` ·
`POST /auth/forgot-password` · `POST /auth/reset-password` · `POST /auth/change-password` · `DELETE /auth/account`

## Player
`GET /me` · `PATCH /me` · `POST /me/onboarding` · `PATCH /me/preferences` · `POST|DELETE /me/avatar` ·
`GET /me/stats` · `GET /me/matches` · `GET /me/achievements` · `GET /me/seasons` · `GET /me/power-ups` ·
`GET /me/rewards/daily` · `POST /me/rewards/daily/claim` · `GET /matches/:id/review` · `GET /matches/:id/result` ·
`GET /users/:uid` (public) · `GET /users/search?uid=` · `POST /reports` ·
`GET /notifications` · `POST /notifications/read` · `POST /push/register` · `POST /push/unregister` ·
`GET /shop` · `POST /shop/purchase` · `POST /shop/equip`

## Social & game
`GET /friends` · `GET|POST /friends/requests` · `POST /friends/requests/:id/accept|reject` · `DELETE /friends/requests/:id` ·
`DELETE /friends/:userId` · `GET|POST /blocks` · `DELETE /blocks/:userId` ·
`GET|POST /battles/requests` · `POST /battles/requests/:id/accept|decline` · `DELETE /battles/requests/:id` · `GET /online` ·
`GET|POST /squads` · `GET|PATCH /squads/:id` · `POST /squads/:id/join|invite|logo` · `POST /squads/leave` ·
`GET /squads/invites` · `POST /squads/invites/:id/accept|decline` · `PATCH|DELETE /squads/:id/members/:userId` ·
`GET /categories` · `GET /leaderboards/:scope?page&pageSize&categoryId` (global, weekly, monthly, season, category, squad, friends, daily) ·
`GET /seasons/current` · `GET /daily` · `GET /config` (public)

## Realtime (Socket.IO, `auth: { token }`)
Client → server (all acknowledged `{ ok, … } | { ok:false, code, message }`):
`presence:set`, `mm:join {mode, ranked, categoryId}`, `mm:leave`, `mm:accept_ai {level}`, `ai:start`, `solo:start`,
`room:create`, `room:join`, `room:ready`, `room:start`, `room:leave`, `match:resume`, `match:answer`, `match:powerup`,
`match:forfeit`, `time:sync`.

Server → client: `presence:count`, `presence:update`, `mm:status|found|ai_offer|timeout`, `battle:request|update`,
`room:state`, `match:countdown|question|answered|reveal|player|end`, `notification:new`, `account:update`,
`server:announcement`. Types: `packages/shared/src/events.ts`.

## Admin (`/api/v1/admin`, separate tokens)
auth (`login`, `refresh`, `logout`, `me`), `dashboard`, `users` (+ `/:id`, `/matches`, `/logins`, `/moderate`, `/reset`),
`questions` (CRUD, `/duplicate`, `/active`, `/import`, `/export`, `/image`), `categories` (CRUD, `/reorder`),
`matches` (`/live`, list, `/:id`, `/:id/abort`), `reports` (list, `/:id`, `/:id/resolve`), `settings`
(`/game/:section`, `/app`), `announcements`, `achievements`, `seasons` (+ `/:id/end`), `shop`, `admins`, `roles`
(+ `/:id/permissions`), `audit`. Each route requires a specific permission (see `002_reference_data.sql`).

Public pages: `GET /u/:uid` (SEO/Open Graph share page), `GET /.well-known/assetlinks.json`, `GET /health`, `GET /health/ready`.
