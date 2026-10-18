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

## Security model (current — Stage 1)

| Area | Current behaviour |
|---|---|
| Permissions | None requested. |
| Network | The app has no `INTERNET` permission and makes no network requests. |
| Stored data | Appearance preferences only, in app-private DataStore. |
| Backup | `allowBackup=false`; data-extraction rules exclude all app data from cloud backup and device transfer. |
| Third-party SDKs | None for analytics, ads, crash reporting or tracking. |
| Exported components | Only the launcher activity. |
| Release builds | R8 minification and resource shrinking enabled. |
| Secrets | No API keys or secrets in source. Signing material comes from CI secrets or local environment variables and is git-ignored. |

## Planned controls (later stages)

These are design commitments, not implemented features. Status is tracked in `FEATURES_STATUS.md`.

- **WebView hardening:** file/content URL access disabled, no universal file access from
  file URLs, mixed content blocked, Safe Browsing enabled, no JavaScript bridges exposed to
  arbitrary web pages, per-site permission prompts.
- **Password vault:** credentials encrypted with an AES-GCM key held in the Android Keystore
  (hardware-backed where available), optional biometric/device-credential gate via
  `BiometricPrompt`, no plaintext storage, never logged, clipboard cleared after a short timeout
  where Android allows. No custom cryptography.
- **Private browsing:** no history or session persistence for private tabs; cookies and storage
  cleared when the last private tab closes. This does not provide anonymity.
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
