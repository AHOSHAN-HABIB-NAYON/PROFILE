# Phase 1 summary: start, welcome, permissions, role, auth, profile

Built by 5 agents in parallel (Backend, Android auth+profile, Android onboarding, Design, QA), merged by the Lead.

## Delivered
- **Backend:** register, email verification (6 digits, 10 min, 5 tries then 15 min lock, resend after 30 s, max 5/h),
  login with 15 min lock after 5 failures, Google sign-in with 18+ consent, child join by 6-character code (24 h,
  single use, device bound), rotating refresh tokens with reuse detection, forgot/reset without account enumeration,
  logout, sessions list and remote sign-out, /me, profile update (IANA/ISO validated), photo upload (re-encoded
  512 + 128, metadata stripped), families, child code with plan limit, invites, consents, GeoIP hint, en+bn emails.
- **Onboarding:** splash with session restore, Welcome with the animated logo, 3 permission pages with code-drawn
  animated demos and the real system dialogs, "Who are you?", child background-location disclosure, battery guide,
  consent screen, "You're all set" with confetti.
- **Auth + profile:** login per role, register with strength meter, verify, forgot flow, Google sheet, child code,
  profile setup with photo pipeline (crop, 512 px, <= 200 KB, metadata stripped), country/zone detection and pickers,
  travel watcher, child code screen, sessions screen, legal pages in the in-app browser.
- **Design:** new logo system (pin with family), adaptive vector launcher icon with monochrome layer, native splash
  light/dark (Android 12+ and older), AnimatedLogo, SplashBrand, ConfettiBurst, role and welcome illustrations,
  brand board in docs/ui-board/.
- **QA:** Phase 0 audit (17 findings); 13 fixed in D-013, 4 minor recorded. Acceptance tests are on the QA branch
  and are not merged yet (they need adapting to the real backend test helpers).

## Tests
Server 112 passed. App 218 passed, analyzer clean. Contract checks pass (303 i18n keys).

## Open items
- Native time-zone-change broadcast hook (currently checked on resume and every 5 min).
- Phone brand detection for the battery guide (always "Others" now).
- Failed photo uploads are kept in memory only.
- Bengali email templates and all non-en/bn languages need native review.
- Device profiling of animations (60/120 Hz) on real phones.
