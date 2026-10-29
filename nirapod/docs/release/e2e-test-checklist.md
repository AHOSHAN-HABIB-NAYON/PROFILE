# Final end-to-end test checklist

Use two phones (parent + child) and, for overseas, a third account with time zone Asia/Riyadh.

## Start and auth
- [ ] First launch: splash → Welcome (language pill) → 3 permission pages (real dialogs, Not now works) → Who are you?
- [ ] Register (rules, 18+ checkbox) → 6-digit email code → Profile setup (photo, country, time zone auto) → Home
- [ ] Google sign-up → 18+ sheet → Profile setup → Home; existing Google account → Home
- [ ] Wrong password 5 times → 15-minute lock; Forgot password (email, code, new password, done)
- [ ] Remember me off → next start asks to log in; Change password signs out the other phone

## Family and location
- [ ] Parent creates the family and the child code; child joins, background + battery + consent pages, "You're all set"
- [ ] Child home: green sharing status, map, SOS, I arrived safely, Heading home, Who can see me
- [ ] Parent Home: member cards with trust labels (Live / Recent / Stale), battery, local time; Map: satellite, layers, 3D,
      nearby places, recenter, follow, show everyone; History timeline + routes
- [ ] Invite an adult (guardian, overseas): sharing stays pending until they agree; pause works
- [ ] Request update now → child sees the notice; offline 15 min → parent alert; battery 20% / 5% alerts
- [ ] Reboot the child phone → tracking resumes; 24 h later the route is complete

## Safety
- [ ] Places: add home/school (pin, radius, child); arrive/leave alerts (no alert on the first point)
- [ ] SOS: 5-s countdown + cancel; push (loud) + email to adults and emergency contacts; delivery ticks; resolve
- [ ] Shake SOS from the child notification; Safe walk: on-time arrival, late alert, stopped-too-long alert

## Notifications, premium, support
- [ ] Bell badge + swing; Alerts filters; per-type push and email toggles respected
- [ ] Free limits enforced (3rd place → upsell); trial once; Play purchase verified; redeem code + gift banner
- [ ] WhatsApp payment banner only in the chosen countries; logos strip when switched on
- [ ] Live chat: AI answer; "Talk to a person" → admin hears the alert → Join → "Connected, Agent: name" with photo;
      urgent words show emergency numbers; inactivity warning (chat + email) then auto-close; rating
- [ ] Download my data email link works once; Delete account (app and web link) removes the account

## Admin
- [ ] First admin via setup key, 2FA required, roles (support cannot open settings; finance cannot open chats)
- [ ] Grant package (reused payment reference warning), revoke, codes + CSV, campaigns, KB, changelog on the landing page
- [ ] Force update: min_version above the app → blocking screen; latest_version above → dismissible prompt
- [ ] No admin page shows any location, route or place

## Languages and accessibility
- [ ] Language selector only on Welcome, login/register/verify/forgot pages and the Home headers
- [ ] Bengali full; Arabic and Urdu mirror (RTL); no clipped buttons at 200% text size; TalkBack labels
- [ ] Dark mode on every screen including the map
