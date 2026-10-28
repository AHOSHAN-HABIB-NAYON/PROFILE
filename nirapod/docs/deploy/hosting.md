# Hosting: Hostinger first, VPS later

## Hostinger (shared / Cloud plans with Node.js)

1. Create a MySQL database and two users: the app user (all privileges on the database) and the admin user
   (run `tools/sql/admin-grants.sql`, replacing the database name and password).
2. Upload `nirapod/server`, `nirapod/admin`, `nirapod/landing`, `nirapod/shared` keeping the folder layout
   (the server serves `../admin/public`, `../landing/public` and `../shared/web`).
3. Node.js app: entry `server/src/index.js`, Node 20+. Set environment variables from `server/.env.example`
   (`NODE_ENV=production`, `TRUST_PROXY=true`). Production refuses to start without `JWT_ACCESS_SECRET`,
   `MASTER_KEY`, `DB_PASSWORD`, `DB_ADMIN_USER`, `DB_ADMIN_PASSWORD`.
4. `npm ci --omit=dev && npm run migrate && npm run seed`.
5. Enable SSL for the domain; the app forces HTTPS and sends HSTS in production.

Limits on shared hosting: long-lived WebSocket connections may be cut by the proxy, and cron may be limited to
the hPanel cron UI. Until the VPS move, the app falls back to FCM pushes and polling for live updates, and
scheduled jobs run from hPanel cron calling `node scripts/run-jobs.js` (added in Phase 3).

## VPS upgrade path (recommended before launch)

- Ubuntu LTS, Node 22 under systemd (or PM2), NGINX reverse proxy with `proxy_set_header Upgrade` /
  `Connection "upgrade"` for `/socket.io`, Let's Encrypt certificates.
- Socket.IO with sticky sessions (or the Redis adapter) when running more than one Node process.
- Jobs in-process with node-cron, or system cron. Job status is written to `job_runs` and shown in admin system health.
- MySQL 8 with encrypted, rotated daily backups (Phase 9 runbook); InnoDB data-at-rest encryption enabled.
