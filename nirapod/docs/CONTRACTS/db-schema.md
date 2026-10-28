# Database schema

MySQL 8.0.16+ or MariaDB 10.6+, `utf8mb4`, all times `DATETIME(3)` in UTC. Full DDL: `schema.sql` (generated).
Source of truth: `server/migrations/` (knex). Run `npm run migrate` then `npm run seed` in `server/`.

## Groups

| Group | Tables |
|---|---|
| Identity and auth | `users`, `sessions` (one per device; stable uuid = JWT `sid`, CURRENT refresh token hash, FCM token), `refresh_token_history` (retired refresh-token hashes for reuse detection; pruned after 30 days), `email_codes` (HMAC of the code, attempts, lock), `admin_users`, `agents` |
| Family | `families`, `family_members` (role, overseas flag, adult `sharing_status`, daily summary), `consents`, `child_devices`, `join_codes`, `invites`, `emergency_contacts` |
| **Location (no admin access)** | `locations`, `places` (radius CHECK 100-300 m), `trips`, `timeline_events`, `nearby_cache`, `sos_events` |
| SOS delivery | `sos_deliveries` (per recipient: queued, sent, delivered, seen, responded, failed) |
| Plans and billing | `plans`, `plan_prices` (per currency and country, Play product ids), `subscriptions` (per family), `redeem_codes` (hash + encrypted code), `redemptions` (unique per code = single use), `grants` |
| Support and AI | `support_tickets`, `chat_conversations` (flags: urgent, suspicious, priority, legal hold), `chat_messages` (internal notes), `chat_attachments` (`purged_at`), `kb_articles`, `ai_settings` (encrypted key), `ai_usage` |
| Config and content | `app_settings` (key/JSON), `emergency_numbers` (by country), `changelog` |
| Operations and rights | `audit_logs`, `notifications`, `email_logs`, `abuse_reports`, `data_requests`, `job_runs` |

## Rules

- `users` has no phone column: no phone number is collected.
- Children: `auth_provider = 'device'`, no email or password; the session is bound to `child_devices.device_id`.
- Plan limits are read from `plans` (+ per-family overrides later) and enforced in the API, never only in the app.
- Deleting a user cascades to sessions, codes, memberships, consents, locations, notifications; chat rows are purged by the retention jobs (7 days).
- The admin MySQL user is granted every table EXCEPT the location group (`tools/sql/admin-grants.sql`); `refresh_token_history` is DELETE-only.
- Refresh rotation: `/auth/refresh` moves the old hash to `refresh_token_history`. A hash found there (a replayed, rotated token) revokes every session with the same `rotation_family`.
- No table stores an IP address. Codes (email and family codes) are never logged; email codes are stored only as an HMAC.
- Profile photos are files under `UPLOAD_DIR/avatars/` (random uuid names); `users.avatar_url` / `avatar_thumb_url` hold `/media/avatars/<uuid>.jpg` (or a Google `https://` URL), made absolute with `PUBLIC_BASE_URL` in API responses.
