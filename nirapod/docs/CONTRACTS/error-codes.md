# Error codes

Source of truth: `server/src/errors.js` (a server test checks this file lists every code).

Shape: `{ "error": { "code", "message", "requestId", "details"? } }`. The app maps codes to plain-language messages (`err.*` keys) and never shows raw server text for auth errors.

| Code | HTTP | Default message |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Some fields are invalid. |
| `BAD_REQUEST` | 400 | The request could not be understood. |
| `AUTH_REQUIRED` | 401 | Please log in. |
| `AUTH_INVALID_CREDENTIALS` | 401 | Email or password is incorrect. |
| `AUTH_TOKEN_EXPIRED` | 401 | Your session has expired. |
| `AUTH_REFRESH_INVALID` | 401 | Your session has ended. Please log in again. |
| `AUTH_LOCKED` | 423 | Too many attempts. Try again later. |
| `AUTH_EMAIL_NOT_VERIFIED` | 403 | Please verify your email first. |
| `FORBIDDEN` | 403 | You do not have access to this. |
| `CONSENT_REQUIRED` | 403 | This person has not agreed to share their location. |
| `NOT_FOUND` | 404 | Not found. |
| `CONFLICT` | 409 | This already exists. |
| `CODE_INVALID` | 400 | The code is not valid. |
| `CODE_EXPIRED` | 410 | The code has expired. |
| `PLAN_LIMIT_REACHED` | 402 | Your plan limit has been reached. |
| `PAYLOAD_TOO_LARGE` | 413 | The file is too large. |
| `UNSUPPORTED_MEDIA` | 415 | This file type is not supported. |
| `RATE_LIMITED` | 429 | Too many requests. Please wait and try again. |
| `UPGRADE_REQUIRED` | 426 | Please update the app. |
| `FEATURE_DISABLED` | 503 | This feature is turned off right now. |
| `SERVICE_UNAVAILABLE` | 503 | The service is temporarily unavailable. |
| `INTERNAL` | 500 | Something went wrong on our side. |
