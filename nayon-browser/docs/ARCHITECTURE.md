# NAYON Browser — Architecture & Feasibility Assessment

_One Browser. Your Digital World._ — developed by MD. AHOSHAN HABIB NAYON · https://webtecit.com

This document is the Stage 1 assessment required before implementation. It records what
is technically achievable on Android, what each feature depends on, and the order in which
the browser will be built.

## 1. Platform decisions

| Area | Decision | Reason |
|---|---|---|
| Language / UI | Kotlin, Jetpack Compose, Material 3 | Modern, declarative, first-class on Android. |
| SDK levels | minSdk 24, targetSdk/compileSdk 36 | As requested. API 36 is the current Play requirement trajectory. |
| Build | Gradle 8.14.3 wrapper, AGP 8.11.1, Kotlin 2.2.0, version catalog | Reproducible from CLI, Android Studio and GitHub Actions. |
| DI | Small manual `AppContainer` | Avoids a framework until dependency count justifies Hilt/Koin. |
| Persistence | Preferences DataStore (settings); Room planned for history/bookmarks/downloads | Async, Flow-based, no main-thread I/O. |
| Navigation | Navigation Compose | Standard back stack, predictive back enabled. |

## 2. Browser engine — the key constraint

| Option | Verdict |
|---|---|
| **Android System WebView** | **Chosen.** Ships on every device, updated through Play, Chromium-based rendering, legal to embed. |
| GeckoView (Mozilla) | Viable alternative (MPL-2.0). Adds ~50–80 MB, separate update cadence. Kept as a documented fallback if WebView limits block a core feature. |
| Forking Chromium | Not feasible for this project: very large build infrastructure, long build times, security-patch burden. |

**What WebView does *not* provide** (and NAYON Browser therefore will not claim):

- Chrome Web Store extensions. WebView has no extension runtime.
- Full PWA installation (WebAPK minting is Chrome-only). We can offer pinned *shortcuts* that open a site in a standalone NAYON window.
- Desktop-Chromium feature parity (some Web APIs — e.g. WebUSB, Web Bluetooth, some Payment Request flows — are absent or restricted).
- Guaranteed 120 fps page rendering. The app UI follows the device refresh rate; web content is rendered by WebView.
- Built-in Safe Browsing UI parity with Chrome (WebView Safe Browsing is available and will be enabled, but the interstitials are WebView's).

## 3. Feature feasibility summary

| Feature | Feasible? | Notes / dependency |
|---|---|---|
| Light / Dark / AMOLED / System / Scheduled theme | Yes — **done (Stage 1)** | |
| 5 colour themes + Material You | Yes — **done (Stage 1)** | Material You needs Android 12+. |
| Tabs, private tabs, history, bookmarks | Yes | One WebView per active tab; background tabs hibernated to save memory. Private tabs use separate cookie handling and no history writes. |
| Downloads | Yes | `DownloadManager` (pause/resume is controlled by the system, not the app). |
| Cookies / site data / permissions | Yes | `CookieManager`, `WebStorage`, `WebChromeClient.onPermissionRequest`. |
| Encrypted password vault | Yes | Android Keystore-backed AES-GCM key; biometric gate via `BiometricPrompt`. No custom cryptography. |
| Android Autofill provider | Partial | Requires implementing an `AutofillService`; user must select NAYON as provider in system settings. |
| Passkeys | Partial | WebView passkey support depends on the WebView version and `androidx.webkit` WebAuthn support; must be tested per site. Credential Manager is used for the app's own sign-in. |
| Google Sign-In | Yes, with configuration | Needs a Google Cloud project and OAuth client ID for the release signing key. |
| Cloud sync | Requires a backend | Sign-in alone is not sync. Needs a hosted service (e.g. Firebase/own server) with auth rules and a deletion workflow. Not started until a backend is chosen. |
| End-to-end encrypted password sync | Not promised | Needs a reviewed key-management design. |
| Tracking protection / ad blocking | Partial | Possible via `shouldInterceptRequest` with a maintained filter list (e.g. EasyList, licence review required). Only shipped with a real list and updates. |
| Extensions | Unsupported (as Chrome extensions) | Alternative: a small, sandboxed set of built-in features (reader mode, dark-web-pages, user CSS) clearly labelled. |
| PWA | Partial | Manifest parsing + home-screen shortcuts via `ShortcutManagerCompat`. No WebAPK. |
| Payments | Deferred | Only via official provider SDKs with server-side verification; disabled until a provider is configured. Google Play Billing applies to digital goods. |
| Translation | Requires a provider | Needs an API (e.g. ML Kit on-device translation, or a paid cloud API). |
| Voice search | Yes | `RecognizerIntent` where a speech service exists on the device. |

## 4. Module / package structure

Single `:app` module for now, organised by layer so it can be split into Gradle modules later:

```
com.webtecit.nayon
├── NayonApp / AppContainer        – application + manual DI
├── MainActivity                   – splash, edge-to-edge, theme resolution
├── NayonViewModels                – ViewModel factory
├── core/designsystem
│   ├── theme                      – palettes, typography, spacing, shapes, NayonTheme
│   └── component                  – ScreenScaffold, rows, ThemeCard, logo, state views, dialogs
├── data/settings                  – AppearanceRepository (DataStore)
├── navigation                     – NavHost + routes
└── feature
    ├── home  settings  appearance  about
    └── (Stage 2+) browser, tabs, bookmarks, history, downloads, vault, privacy, sync
```

Planned Stage 2+ packages: `engine` (WebView wrapper, clients, settings hardening),
`data/tabs`, `data/history`, `data/bookmarks` (Room), `data/downloads`, `security/vault`.

## 5. Theme system

- `ThemeMode` (System, Light, Dark, AMOLED, Scheduled) + `ThemeFamily` (Aurora, Obsidian,
  Emerald, Cyber Neon, Warm Minimal, Device) are stored in DataStore.
- `resolveBrightness()` turns them into `Brightness` (Light, Dark, AMOLED). Scheduled mode
  re-evaluates at every minute boundary while the app is visible — no background work.
- `colorSchemeFor(family, brightness)` returns a full Material 3 `ColorScheme`; AMOLED is
  derived from each family's dark palette with true-black surfaces, so **AMOLED works with
  every accent family**.
- Every built-in palette is unit-tested for WCAG AA contrast (≥ 4.5:1) on text roles.
- System-bar icon colours follow the resolved theme, not just the device setting.
- Changes apply instantly; no restart.

## 6. Security defaults (applies to all stages)

- No permissions in Stage 1. `INTERNET` arrives with the engine in Stage 2.
- `allowBackup=false` and data-extraction rules exclude all app data from cloud backup/transfer.
- No analytics, ads, crash-reporting or tracking SDKs.
- Release builds are minified with R8; signing keys come from CI secrets / environment only.
- WebView (Stage 2) will keep secure defaults: file and content access off, no universal file
  access, mixed content blocked, Safe Browsing on, JavaScript interfaces not exposed to web pages.

## 7. Build stages

1. **Foundation** — this stage. ✅
2. Browser engine: WebView, address bar, search, tabs, bookmarks, history.
3. Storage & security: downloads, site data, private browsing, password vault, autofill.
4. Advanced: sign-in, sync backend, passkeys, PWA shortcuts, content blocking, payments (only if configured).
5. QA: device matrix, accessibility, performance, lifecycle.
6. Release: signed AAB, Play listing, final privacy policy.
