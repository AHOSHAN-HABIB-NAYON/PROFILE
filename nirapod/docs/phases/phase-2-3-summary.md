# Phase 2 and 3 summary: Home, map, family, background location, history

Built by the Lead alone (no extra agents, to save usage).

## Phase 2 delivered
- **Server:** invites (email/code, 7 days, overseas flag, plan member limit), adult sharing consent (pending until
  accepted, pause, stop; a consent record per change), remove / leave / transfer ownership (owner must transfer
  first; removing a child revokes its device sessions), location upload, live view with consent-aware visibility
  (a child sees only itself; adults see children and only consenting adults), "Request update now" (2 min rate
  limit, children only), nearby places via Places API (New) cached per ~1 km grid cell for 24 h with daily and
  per-user caps and an admin switch (Google only receives the cell centre), misuse reports, Socket.IO realtime
  (server decides rooms; events go only to allowed viewers).
- **App:** Home header (logo + name; moon/sun theme toggle, language flag, bell with swing and badge pop), profile
  row (greeting and live local time from the saved zone, minute-aligned, flag + localized country, long-press
  tooltip, pulsing ring while sharing), consent card, overseas "Family status", map preview, quick actions, member
  cards (trust label with exact time, battery, online, each member's local time), empty states by role; Map tab
  (road map default (owner request; was satellite), layers sheet with type / 3D / nearby / places / trail / accuracy / labels remembered per
  device, recenter, reset north, follow member, show everyone, avatar markers, accuracy circles, dark style,
  nearby list with categories and distance); member page; family management; invite sheet with share; misuse
  report; profile page with Stay / Log out sheet; Exit dialog on Back at Home.

## Phase 3 delivered
- **Server:** device upload key (only valid for POST /locations, bound to the device, revoked with the device),
  state-only uploads (location off / permission removed), battery alerts at 20% and 5% (once per crossing,
  re-armed above 25%), location-off and permission-removed alerts, "Request update now" delivered in the next
  upload response, route by day in the member's zone limited by plan history, timeline with categories,
  scheduled jobs (offline after 15 min without updates, once until the next update; retention purge Free 3 /
  Premium 30 / Family Plus 90 days) recorded in job_runs, `scripts/run-jobs.js` for cron.
- **Android native service** (`android/.../tracking/`): foreground service type location with a permanent
  "Location sharing is on" notification, adaptive frequency (still 12 min, moving 90 s, safe-walk 20 s, slower on
  low battery or battery saver), weak-GPS filtering, SQLite offline queue (2000 points max), batch upload with
  exponential backoff, restart after reboot / app update, location on/off listener, "X requested your location"
  notification. Uses only the permissions in the spec; no wake lock; service and receiver not exported.
- **App:** starts sharing on child devices after onboarding; adults share only while the app is open and only
  when they agreed; Android time-zone broadcast feeds the travel watcher; History tab (Timeline with filters,
  Routes by member and day with the route drawn on the map, plan-limit upsell); network-only retry policy.

## Tests
Server 143 passed. App 236 passed, analyzer clean, contract checks pass (489 i18n keys).

## Not verified here
- The Kotlin service compiles only in CI (no Android SDK in the sandbox) and needs real-device checks: 24 h
  background run, reboot, Xiaomi/Oppo/Vivo/Samsung battery managers, Android 14/15 background-start rules.
- FCM push (Phase 5) will make "Request update now" instant; today it arrives with the next upload (up to 12 min
  when the phone is still).
- Google Maps needs `MAPS_API_KEY` (gradle property or env) and the server needs `GOOGLE_PLACES_API_KEY`.
