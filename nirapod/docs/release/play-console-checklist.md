# Google Play release checklist (Nirapod)

## Before the first upload
- [ ] GitHub secrets set: `MAPS_API_KEY`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- [ ] CI is green; download `nirapod-release-aab` from the run.
- [ ] Server live: `https://family-track.webtecit.com/api/v1/health` returns `ok`.
- [ ] Admin panel (`/admin`): first super admin created, 2FA on, `ADMIN_SETUP_KEY` removed from the server settings.
- [ ] Admin → API keys: Firebase service account + Firebase Android ids, Play service account, RTDN token, Places key.
- [ ] Admin → AI assistant: OpenAI key, model, on; "Test connection" OK. Knowledge base has articles in English and Bengali.
- [ ] Admin → App settings: support emails, legal-request email, Play Store link, min/latest version.
- [ ] Admin → Emergency numbers checked for BD, SA, AE, MY, QA, KW, OM, IN, US, GB.

## Play Console
- [ ] App content → Privacy policy: `https://family-track.webtecit.com/privacy/`
- [ ] Account deletion URL: `https://family-track.webtecit.com/delete-account/`
- [ ] Data safety (see below), Ads: **No ads**. Target audience: 18+ account holders; children use a child code from a parent (Families policy reviewed).
- [ ] Permissions declaration: background location (core feature: family location sharing, visible notification, consent).
  Video: show the consent pages, the "Location sharing is on" notification and the pause button.
- [ ] Foreground service type `location` declaration (same video).
- [ ] Subscriptions: products `nirapod_premium`, `nirapod_family_plus` with base plans `monthly` and `yearly`; same ids in Admin → Plans → Prices.
- [ ] Real-time developer notifications: Pub/Sub push to `/api/v1/billing/play/rtdn?token=<RTDN token>`.
- [ ] Internal testing track first; then closed testing (12+ testers, 14 days) before production.

## Data safety answers
| Data | Collected | Shared | Purpose | Optional |
|---|---|---|---|---|
| Precise location | Yes | No (only with the user's own family inside the app) | App functionality | Users can pause sharing |
| Name, email | Yes | No | Account management | No |
| Photos (profile, chat images) | Yes | No | App functionality, support | Yes |
| App activity: support chat messages | Yes | No (OpenAI processes text as a service provider) | Customer support | Yes |
| Device id / diagnostics (model, app version, battery, location state) | Yes | No | App functionality, analytics of reliability | No |
- Data is encrypted in transit (HTTPS). Users can request deletion (in app and on the web).
- No data is sold. No advertising or third-party tracking SDKs.

## Every release
- [ ] Bump `APP_VERSION` / `versionCode`; add the changelog in Admin → Changelog.
- [ ] Raise Admin → App settings → latest version (prompt) and, only for breaking changes, min version (blocking).
