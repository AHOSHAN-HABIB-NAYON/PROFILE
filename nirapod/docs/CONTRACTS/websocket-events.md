# WebSocket events (Socket.IO)

Namespace `/rt`, path `/socket.io`. Implemented from Phase 2 (map live updates) and Phase 7B (chat).
FCM carries the same events when the app is in the background.

## Connection

- Client connects with `auth: { token: <access JWT> }`. Expired token -> `connect_error` with `{ code: "AUTH_TOKEN_EXPIRED" }`; the client refreshes and reconnects.
- The server joins the socket to rooms it is allowed in: `family:<familyId>` (members of that family, visibility rules applied per event), `user:<userId>`, `conv:<conversationId>` (chat owner), `admin:inbox` (agents only, admin socket on `/admin-rt`).
- Clients never choose rooms themselves.

## Envelope

Every event payload: `{ "v": 1, "id": "<uuid>", "at": "<ISO-8601 UTC>", "data": { ... } }`. `id` lets clients drop duplicates (socket + FCM).

## Server -> app

| Event | Room | data | Phase |
|---|---|---|---|
| `location.update` | family (only to viewers allowed by consent) | `{ member_id, point: LocationPoint, battery_pct, place_name? }` | 2 |
| `member.status` | family | `{ member_id, online, unavailable_reason? , last_update_at }` | 2/3 |
| `place.event` | family | `{ member_id, place_id, type: "arrival"|"departure" }` | 4 |
| `sos.started` | family | `{ sos_id, member_id, started_at, point? }` | 4 |
| `sos.delivery` | user (the SOS sender) | `{ sos_id, recipient, channel, status }` | 4 |
| `sos.resolved` | family | `{ sos_id, resolved_by }` | 4 |
| `trip.update` | family | `{ trip_id, member_id, status, expected_arrival_at }` | 4 |
| `update.requested` | user (child) | `{ by_name }` -> child shows "<name> requested your location" | 2 |
| `notification.new` | user | `{ notification_id, category, title_key, params }` | 5 |
| `chat.message` | conv | `{ message_id, sender_type, agent?: { name, photo_url }, body, image_url?, created_at }` | 7 |
| `chat.typing` | conv | `{ sender_type }` | 7 |
| `chat.agent_joined` | conv | `{ agent: { name, photo_url } }` -> "Connected, Agent: Nayon" | 7 |
| `chat.handed_back` | conv | `{}` -> "You are now chatting with Nirapod Assistant" | 7 |
| `chat.read` | conv | `{ up_to_message_id }` | 7 |
| `chat.closed` | conv | `{ closed_by }` -> client removes the whole conversation locally | 7 |
| `config.changed` | broadcast | `{ keys: [...] }` -> client re-fetches /app-config | 7 |

## App -> server

| Event | data | Ack |
|---|---|---|
| `chat.typing` | `{ conversation_id }` | none |
| `chat.read` | `{ conversation_id, up_to_message_id }` | `{ ok }` |
| `presence.ping` | `{}` (every 60 s while foreground) | `{ ok }` |

Location uploads always go through `POST /locations` (batched, offline queue), never the socket.

## Admin socket (`/admin-rt`)

`inbox.new_conversation`, `inbox.needs_human`, `inbox.urgent`, `inbox.user_replied`, `inbox.message`. Payloads contain
conversation ids, flags, language and plan only. **No coordinates, routes or place names ever.**
