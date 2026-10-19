# Security Policy — NAYON Browser

## Supported versions

Only the latest build from the default branch is supported while the project is pre-release.

## Reporting a vulnerability

Please report security issues privately through **GitHub Security Advisories**
(repository → Security → Report a vulnerability). Do not open public issues for
vulnerabilities. Include the build version (Settings → About), device/Android version,
steps to reproduce and the impact.

_A dedicated security contact address has not been published yet; one will be added here
once it exists._

## Security model (current — Stage 2)

| Area | Current behaviour |
|---|---|
| Permissions | `INTERNET` (load pages) and `ACCESS_NETWORK_STATE` (tell "offline" from "site not found"). No runtime permissions. |
| Network | Only requests the user's pages make, plus a one-time icon download from each home-page shortcut's own site. No telemetry. WebView metrics collection opted out in the manifest. |
| WebView | File and content access off, mixed content blocked, Safe Browsing on when supported, certificate errors are never bypassed, third-party cookies blocked, pop-up windows disabled, geolocation off, website camera/mic requests denied (Stage 3 adds prompts), no JavaScript bridges. |
| Address bar | Only `http`/`https` are loaded; `javascript:`, `file:`, `content:` and other schemes typed by the user are treated as searches. |
| External apps | Non-web links (`intent:`, `mailto:` …) open other apps only after a user tap; intents are stripped of explicit components and selectors. |
| Stored data | Settings (DataStore), history, bookmarks and saved normal tabs (Room) in app-private storage; WebView cookies, cache and site data. |
| Private tabs | Never written to history or saved tabs, no disk cache; cookies/storage go to a separate WebView profile that is deleted when the last private tab closes, where the device's WebView supports profiles. |
| Cleartext HTTP | Allowed because users may open http sites; such pages show "Not secure". |
| Backup | `allowBackup=false`; data-extraction rules exclude all app data from cloud backup and device transfer. |
| Third-party SDKs | None for analytics, ads, crash reporting or tracking. |
| Exported components | Only the launcher activity. |
| Release builds | R8 minification and resource shrinking enabled. |
| Secrets | No API keys or secrets in source. Release signing material comes from CI secrets or local environment variables and is git-ignored. The only committed key is `app/debug.keystore`, a public debug-only key for test builds. |

## Planned controls (later stages)

These are design commitments, not implemented features. Status is tracked in `FEATURES_STATUS.md`.

- **WebView hardening:** file/content URL access disabled, no universal file access from
  file URLs, mixed content blocked, Safe Browsing enabled, no JavaScript bridges exposed to
  arbitrary web pages, per-site permission prompts.
- **Password vault:** credentials encrypted with an AES-GCM key held in the Android Keystore
  (hardware-backed where available), optional biometric/device-credential gate via
  `BiometricPrompt`, no plaintext storage, never logged, clipboard cleared after a short timeout
  where Android allows. No custom cryptography.
- **Sync (optional):** only with explicit opt-in, TLS in transit, documented server-side storage
  and a deletion workflow. End-to-end encryption will not be claimed without a reviewed design.
- **Payments:** only official provider SDKs, tokenised flows and server-side verification; no
  card data handled by the app.

## Sensitive-data handling rules for contributors

- Never log URLs from private tabs, credentials, cookies or form data.
- Never add analytics or crash-reporting SDKs without updating the privacy policy and getting
  explicit user consent.
- Never commit keystores, passwords, OAuth client secrets or API keys.
- Request permissions only at the moment a feature needs them, with an explanation.

## Scripts NAYON runs in pages

NAYON exposes no JavaScript interface to web pages. It runs three small read-only or
compatibility scripts, none of which read page content or send anything anywhere:

- At full screen: reads the video's width and height (to pick landscape or portrait), and
  resumes a video inside the full-screen element that paused during the switch.
- At page start (all sites): makes `screen.orientation.lock()` report success instead of
  failing, because WebView does not support it and video players stall on the failure.
  NAYON rotates full-screen video itself.

## Passwords (Stage 3)

- Saved usernames and passwords are encrypted with AES-256-GCM. The key is created inside the
  Android Keystore and never leaves it, so a copy of the database file cannot be decrypted.
- Viewing passwords requires fingerprint, face or the screen lock. Copied passwords are marked
  sensitive so Android hides them from clipboard previews.
- Sign-in detection uses WebView's message channel (WebMessageListener). The site origin used
  for saving comes from WebView itself, not from the page. Only https pages in normal tabs are
  considered, and only the top frame.
- Saved passwords are filled only after you tap "Sign in as …", and only if the tab is still on
  the same origin. "Delete all passwords" also destroys the Keystore key.
- A page can see that NAYON's message channel exists, and could send a fake sign-in message;
  the worst result is a "Save password?" prompt for that same site, which you can decline.

## Website permissions (Stage 3)

- Camera, microphone, location and protected content are denied unless you allow the site.
  Decisions are stored per origin (scheme + host + port). Private tabs never store decisions.
- Android's own permission is requested only after you allow a site, and only for what it asked.

