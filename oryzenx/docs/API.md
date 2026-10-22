# OryzenX API reference

Generated from `routes/*.php`. All JSON responses use `{"ok": true, "data": …, "meta"?: …}` or `{"ok": false, "error": {"code", "message", "fields"?}}`.

Money and quantities are sent and returned as **decimal strings** (never floats). Timestamps are UTC (`YYYY-MM-DD HH:MM:SS`); the business timezone is returned by `GET /api/app/config`.

## Authentication

- **Web apps**: session cookie `oryx_sid` + `X-CSRF-Token` header on every write (token returned by `/api/me` and login).
- **Android**: send `client: "android"` on login/register/Google sign-in; the response contains a `token`. Send `Authorization: Bearer <token>`. CSRF does not apply to bearer requests.
- **Re-authentication**: sensitive admin writes return HTTP **428** `reauth_required` when the password was not confirmed in the last 10 minutes. Call `POST /api/auth/reauth {password}` and retry.
- Rate limits return HTTP **429** with `Retry-After`.

Legend: 🔓 public · 🔑 signed in · ✅ signed in + email verified · 🛡 admin permission (named) · ⚠ needs recent re-auth

## Web pages

| Method | Path | Access |
|---|---|---|
| GET | `/` | 🔓 |
| GET | `/{page}` | 🔓 |
| GET | `/robots.txt` | 🔓 |
| GET | `/sitemap.xml` | 🔓 |
| GET | `/.well-known/assetlinks.json` | 🔓 |
| GET | `/health` | 🔓 |
| GET | `/verify-email` | 🔓 |
| GET | `/reset-password` | 🔓 |
| GET | `/app` | 🔓 |
| GET | `/app/{any}` | 🔓 |
| GET | `/v2admin` | 🔓 (app shell; data needs admin) |
| GET | `/v2admin/{any}` | 🔓 |
| GET | `/install` | 🔓 |
| POST | `/install/test-db` | 🔓 |
| POST | `/install/run` | 🔓 |

## User API

| Method | Path | Access |
|---|---|---|
| GET | `/api/app/config` | 🔓 |
| GET | `/api/i18n/{locale}` | 🔓 |
| POST | `/api/support` | 🔓 |
| POST | `/api/auth/register` | 🔓 |
| POST | `/api/auth/login` | 🔓 |
| POST | `/api/auth/google` | 🔓 |
| POST | `/api/auth/forgot-password` | 🔓 |
| POST | `/api/auth/reset-password` | 🔓 |
| POST | `/api/auth/logout` | 🔑 |
| POST | `/api/auth/verify-email` | 🔑 |
| POST | `/api/auth/resend-verification` | 🔑 |
| POST | `/api/auth/reauth` | 🔑 |
| GET | `/api/me` | 🔑 |
| GET | `/api/me/profile` | 🔑 |
| PUT | `/api/me/profile` | 🔑 |
| PUT | `/api/me/preferences` | 🔑 |
| POST | `/api/me/avatar` | 🔑 |
| GET | `/api/me/avatar` | 🔑 |
| POST | `/api/me/password` | 🔑 |
| GET | `/api/me/sessions` | 🔑 |
| DELETE | `/api/me/sessions/{id}` | 🔑 |
| POST | `/api/me/sessions/revoke-others` | 🔑 |
| GET | `/api/me/notification-preferences` | 🔑 |
| PUT | `/api/me/notification-preferences` | 🔑 |
| GET | `/api/notifications` | 🔑 |
| POST | `/api/notifications/read` | 🔑 |
| POST | `/api/push-tokens` | 🔑 |
| POST | `/api/push-tokens/remove` | 🔑 |
| GET | `/api/verification` | 🔑 |
| POST | `/api/verification` | ✅ |
| POST | `/api/support/app` | 🔑 |
| GET | `/api/dashboard` | ✅ |
| GET | `/api/portfolio` | ✅ |
| GET | `/api/assets` | ✅ |
| GET | `/api/assets/{id}` | ✅ |
| GET | `/api/assets/{id}/ohlc` | ✅ |
| GET | `/api/trading/monitor` | ✅ |
| GET | `/api/trades` | ✅ |
| GET | `/api/trades/{id}` | ✅ |
| GET | `/api/transactions` | ✅ |
| GET | `/api/transactions/export` | ✅ |
| GET | `/api/transactions/{id}` | ✅ |
| GET | `/api/loans` | ✅ |
| GET | `/api/loans/{id}` | ✅ |
| GET | `/api/salary` | ✅ |
| GET | `/api/payment-methods` | ✅ |
| GET | `/api/payment-details` | ✅ |
| POST | `/api/payment-details` | ✅ |
| POST | `/api/payment-details/{id}/primary` | ✅ |
| DELETE | `/api/payment-details/{id}` | ✅ |

## Admin API

| Method | Path | Access |
|---|---|---|
| GET | `/api/admin/dashboard` | 🛡 `dashboard.view` |
| GET | `/api/admin/users` | 🛡 `users.view` |
| GET | `/api/admin/users/lookup` | 🛡 `users.view` |
| GET | `/api/admin/users/{id}` | 🛡 `users.view` |
| PUT | `/api/admin/users/{id}` | 🛡 `users.manage` |
| POST | `/api/admin/users/{id}/status` | 🛡 `users.suspend` ⚠ |
| POST | `/api/admin/users/{id}/roles` | 🛡 `roles.manage` ⚠ |
| PUT | `/api/admin/users/{id}/notification-preferences` | 🛡 `users.manage` |
| POST | `/api/admin/users/{id}/resend-verification` | 🛡 `users.manage` |
| GET | `/api/admin/users/{id}/reconciliation` | 🛡 `allocation.view` |
| GET | `/api/admin/users/{id}/payment-details` | 🛡 `salary.view` |
| POST | `/api/admin/users/{id}/payment-details/{method}/reveal` | 🛡 `salary.manage` ⚠ |
| GET | `/api/admin/roles` | 🛡 `roles.manage` |
| POST | `/api/admin/roles` | 🛡 `roles.manage` ⚠ |
| PUT | `/api/admin/roles/{id}` | 🛡 `roles.manage` ⚠ |
| DELETE | `/api/admin/roles/{id}` | 🛡 `roles.manage` ⚠ |
| GET | `/api/admin/verifications` | 🛡 `verification.view` |
| POST | `/api/admin/verifications/{id}/review` | 🛡 `verification.review` |
| GET | `/api/admin/verifications/{id}/document/{side}` | 🛡 `verification.view` |
| GET | `/api/admin/investments` | 🛡 `finance.view` |
| POST | `/api/admin/investments` | 🛡 `finance.investments` |
| POST | `/api/admin/investments/{id}/reverse` | 🛡 `finance.investments` ⚠ |
| PUT | `/api/admin/investments/{id}/notes` | 🛡 `finance.investments` |
| POST | `/api/admin/investments/{id}/archive` | 🛡 `finance.investments` |
| GET | `/api/admin/investment-sales` | 🛡 `finance.view` |
| POST | `/api/admin/investment-sales` | 🛡 `finance.investments` |
| POST | `/api/admin/investment-sales/{id}/reverse` | 🛡 `finance.investments` ⚠ |
| GET | `/api/admin/trades` | 🛡 `finance.view` |
| POST | `/api/admin/trades` | 🛡 `finance.trades` |
| POST | `/api/admin/trades/{id}/close` | 🛡 `finance.trades` |
| POST | `/api/admin/trades/{id}/reverse` | 🛡 `finance.trades` ⚠ |
| PUT | `/api/admin/trades/{id}/notes` | 🛡 `finance.trades` |
| GET | `/api/admin/trading-monitor` | 🛡 `finance.view` |
| GET | `/api/admin/ledger` | 🛡 `finance.view` |
| GET | `/api/admin/ledger/export` | 🛡 `finance.export` |
| GET | `/api/admin/ledger/{id}` | 🛡 `finance.view` |
| POST | `/api/admin/ledger/movements` | 🛡 `finance.ledger` |
| POST | `/api/admin/ledger/{id}/reverse` | 🛡 `finance.ledger` ⚠ |
| GET | `/api/admin/loans` | 🛡 `finance.view` |
| POST | `/api/admin/loans` | 🛡 `finance.loans` |
| GET | `/api/admin/loans/{id}` | 🛡 `finance.view` |
| POST | `/api/admin/loans/{id}/repayments` | 🛡 `finance.loans` |
| POST | `/api/admin/loans/{id}/charges` | 🛡 `finance.loans` |
| POST | `/api/admin/loans/{id}/reverse` | 🛡 `finance.loans` ⚠ |
| POST | `/api/admin/loan-events/{id}/reverse` | 🛡 `finance.loans` ⚠ |
| GET | `/api/admin/allocation/rules` | 🛡 `allocation.view` |
| PUT | `/api/admin/allocation/rules` | 🛡 `allocation.configure` ⚠ |
| GET | `/api/admin/allocation/preview` | 🛡 `allocation.view` |
| POST | `/api/admin/allocation/run` | 🛡 `allocation.run` ⚠ |
| GET | `/api/admin/allocation/history` | 🛡 `allocation.view` |
| POST | `/api/admin/allocation/{id}/reverse` | 🛡 `allocation.run` ⚠ |
| GET | `/api/admin/reconciliation` | 🛡 `allocation.view` |
| GET | `/api/admin/salary/schedules` | 🛡 `salary.view` |
| POST | `/api/admin/salary/schedules` | 🛡 `salary.manage` |
| GET | `/api/admin/salary/records` | 🛡 `salary.view` |
| GET | `/api/admin/salary/records/export` | 🛡 `salary.view`, `finance.export` |
| POST | `/api/admin/salary/generate` | 🛡 `salary.manage` |
| PUT | `/api/admin/salary/records/{id}` | 🛡 `salary.manage` |
| GET | `/api/admin/payment-methods` | 🛡 `salary.view` |
| PUT | `/api/admin/payment-methods/{id}` | 🛡 `payment_methods.manage` |
| POST | `/api/admin/payment-methods/{id}/logo` | 🛡 `payment_methods.manage` |
| GET | `/api/admin/assets` | 🛡 `finance.view` |
| POST | `/api/admin/assets` | 🛡 `market.manage` |
| PUT | `/api/admin/assets/{id}` | 🛡 `market.manage` |
| POST | `/api/admin/assets/{id}/logo` | 🛡 `market.manage` |
| POST | `/api/admin/market/refresh` | 🛡 `market.manage` |
| GET | `/api/admin/email-queue` | 🛡 `notifications.email` |
| GET | `/api/admin/email-queue/{id}/logs` | 🛡 `notifications.email` |
| POST | `/api/admin/email-queue/{id}/retry` | 🛡 `notifications.email` |
| POST | `/api/admin/email-queue/{id}/cancel` | 🛡 `notifications.email` |
| POST | `/api/admin/email-queue/process` | 🛡 `notifications.email` |
| POST | `/api/admin/email/test` | 🛡 `notifications.email` |
| GET | `/api/admin/push-logs` | 🛡 `notifications.push` |
| POST | `/api/admin/push/test` | 🛡 `notifications.push` |
| GET | `/api/admin/support` | 🛡 `support.view` |
| PUT | `/api/admin/support/{id}` | 🛡 `support.manage` |
| GET | `/api/admin/settings` | 🛡 `settings.view` |
| PUT | `/api/admin/settings/general` | 🛡 `settings.manage` |
| PUT | `/api/admin/settings/integrations` | 🛡 `settings.integrations` ⚠ |
| GET | `/api/admin/content/landing` | 🛡 `content.manage` |
| PUT | `/api/admin/content/landing` | 🛡 `content.manage` |
| GET | `/api/admin/content/translations` | 🛡 `content.manage` |
| PUT | `/api/admin/content/translations` | 🛡 `content.manage` |
| GET | `/api/admin/audit` | 🛡 `audit.view` |
| GET | `/api/admin/security/logins` | 🛡 `audit.view` |
| GET | `/api/admin/system/health` | 🛡 `system.health` |
| POST | `/api/admin/system/tasks` | 🛡 `system.health` |
| GET | `/api/admin/system/backups` | 🛡 `system.backup` |
| POST | `/api/admin/system/backups` | 🛡 `system.backup` ⚠ |
| GET | `/api/admin/system/backups/{file}` | 🛡 `system.backup` ⚠ |
| DELETE | `/api/admin/system/backups/{file}` | 🛡 `system.backup` ⚠ |
