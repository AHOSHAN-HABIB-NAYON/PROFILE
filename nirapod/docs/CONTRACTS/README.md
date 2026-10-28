# Contracts (written before feature code)

| Contract | File | Generated from it / checked by |
|---|---|---|
| REST API (OpenAPI 3.1) | `openapi.yaml` | `server/test/contracts.test.js` |
| Error codes | `error-codes.md` | source `server/src/errors.js`; contracts test |
| Database schema | `schema.sql`, `db-schema.md` | source `server/migrations/`; `server/test/schema.test.js` |
| i18n keys and screen namespaces | `i18n-keys.json` | `tools/check-i18n.mjs`, `app/test/i18n_test.dart` |
| Design tokens | `design-tokens.json` | `tools/gen-tokens.mjs` -> `app/lib/core/theme/tokens.g.dart`, `shared/web/tokens.css` |
| WebSocket events | `websocket-events.md` | implemented in Phase 2 and 7B |
| Navigation | `navigation.json` | `tools/gen-nav.mjs` -> `NAVIGATION_MAP.md`, `app/lib/nav/routes.g.dart` |

Change a contract first, regenerate (`cd tools && npm run tokens && npm run nav && npm run icons && npm run flags && npm run sync`),
then change code. CI fails if a generated file is out of date.
