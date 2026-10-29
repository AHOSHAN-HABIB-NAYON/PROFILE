# Phase 4: Places and safety

## What was built
- **Places**: list (home / school / coaching / custom), add/edit with pin drop on a satellite map, name, type,
  radius 100-300 m, which children it applies to, delete with confirmation. Free plan: 2 places, then the
  upsell card (server answers PLAN_LIMIT_REACHED).
- **Geofencing**: server-side, debounced (see D-014); Android geofences wake the phone for fresh points.
  Arrival/departure alerts with the place name go to every parent/guardian (bell + timeline + realtime).
- **SOS**: big red button on Child Home -> 5 s cancel countdown ring with haptics -> sending -> per-recipient
  delivery status (sent, delivered, seen, coming), emergency number from the `emergency_numbers` table
  ("Call 999"), "I am safe now". Adults see a full-screen red alert over any screen with "Open in Maps" and
  "I'm coming". Email to adults and emergency contacts with a map button. Shake-to-SOS from the background.
- **I arrived safely**: one tap; names the place the child is at.
- **Safe walk home**: child picks 10-60 min; destination = the Home place; ends by itself on arrival; one alert if
  late, one if stopped 10 min; parents see all walks (late / stopped highlighted); the phone sends every 20 s.
- **Child Home**: green "Location sharing is on", "You are here" mini map with nearby chips, three large buttons,
  Who can see me, Help, exit dialog (sharing keeps running).
- **Emergency contacts** (email only, max 5) and **Remember me** on login.

## Tests
- Server: 155 pass (`test/phase4.test.js`: geofence state machine, places + plan limit, arrival/departure alerts,
  SOS fan-out + email + status order + resolve, shake SOS with device key, emergency numbers, safe arrival,
  safe walk auto-finish, overdue/stopped once each, access control).
- App: 241 pass (`test/phase4/safety_test.dart`: child home, SOS countdown cancel/send/status/resolve,
  heading home, places upsell, remember me).

## Requirements coverage
| Requirement | Status |
|---|---|
| Places list + add with pin drop, name, radius 100-300 m, child selection | done |
| Geofencing with 2-3 point debounce, arrival/departure alerts | done (server); Android geofences: done (CI build) |
| Plan limit upsell for places | done |
| SOS big button, 5 s cancel countdown, sending state, per-recipient status | done |
| SOS shake-to-SOS (foreground service) | done (needs a real-phone check) |
| High-priority FCM for SOS | Phase 5 (realtime + email now) |
| Email to adults + emergency contacts with map link, no SMS | done |
| Emergency numbers from admin-editable table | done |
| I arrived safely (name, time, place) | done |
| Safe walk: start, live, auto-arrival, late / stopped alerts, parent + child views | done |
| Child home: status, mini map + nearby chips, 3 buttons, Who can see me | done |

## Manual checks on a phone
1. Parent: Home > Places > Add place at home (radius 150 m). Child walks out and back: two alerts.
2. Child: SOS > wait 5 s: parent phone shows the red screen; child sees "Seen" after the parent opens it.
3. Child: shake the phone hard 3 times (screen off): notification "Sending SOS in 5 seconds" with Cancel.
4. Child: Heading home 10 min, stay still: parent sees "Stopped for a while", then "Late".
