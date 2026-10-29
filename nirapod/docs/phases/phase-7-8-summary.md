# Phases 7, 7B, 8: summary

## Phase 7 (settings, data rights, updates)
- Server: `POST /me/data-export` (email link, one-time, 7 days, file deleted after download), `POST /me/delete` (password or "DELETE"),
  web deletion `POST /account-deletion-requests` + `POST /account-deletion/confirm` (email link, 24 h), `GET /help/articles`.
  Cascade: owner with another adult hands the family over; the last adult deletes the family and its children's accounts.
- App: Settings tab (no map or language rows), Download my data, Delete account, Help/FAQ (admin articles, built-in fallback),
  update gate (blocking below `min_version`, dismissible prompt below `latest_version`), Play In-App Review after 7 days and 3 sessions.

## Phase 7B (live chat)
- AI first (OpenAI, key encrypted in `ai_settings`), answers only from the knowledge base + safe account summary (no location).
- Redaction of emails, phones, codes, tokens and coordinates both ways; prompt-injection wrapping.
- Urgent keywords (EN, BN, Banglish, HI/UR, AR, MS/ID, ES) show the emergency numbers first and alert admins (email + panel sound).
- Hand-off to a person on request, payments/refund/deletion/abuse, frustration, or unsure twice. Legal requests get the legal email.
- Agent join shows "Connected, Agent: <name>" with the agent's photo; hand back to AI; internal notes never reach the user.
- Inactivity: warning in chat + email after 5 min, close after 5 more. Closed chats vanish for the user; deleted 7 days later
  (images 7 days after upload) unless legal hold.

## Phase 8 (admin panel at /admin)
- First super admin via `ADMIN_SETUP_KEY`; email + password + TOTP 2FA (writes need 2FA); 12 h sessions; lockout after 5 failures.
- Roles: super admin (all), support (chat, users, content), finance (plans, codes, grants). Every write is audit-logged with the admin's name.
- Pages: dashboard, live chat inbox, users (suspend, delete, emails, devices, grants, per-family limits), plans and prices,
  redeem codes + CSV, grants, campaigns, KB, canned replies, changelog, emergency numbers, app settings, API keys, AI, tickets,
  abuse, data requests, admins, audit, health, profile (2FA, agent name/photo, password).
- No admin endpoint reads location tables (test-enforced); in production the admin DB user has no grants on them.
