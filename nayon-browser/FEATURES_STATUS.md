# NAYON Browser — Feature Status

Status values: **Implemented**, **Partial**, **Planned**, **Unsupported**.
"Testing evidence" lists only checks that actually run. CI = `.github/workflows/nayon-android.yml`.

_Last updated: Stage 1 (foundation)._

## Stage 1 — Foundation

| Feature | Status | Technical limitation | Required configuration | Testing evidence |
|---|---|---|---|---|
| Gradle project, version catalog, wrapper | Implemented | — | JDK 17, Android SDK 36 | CI `assembleDebug`, `assembleRelease`, `bundleRelease` |
| Adaptive launcher icon (incl. themed/monochrome) | Implemented | Monochrome layer used on Android 13+ | — | Built by CI (AAPT) |
| Splash screen (light & dark) | Implemented | Uses `core-splashscreen`; held only until settings load, no artificial delay | — | Manual check on device pending |
| Light / Dark / System modes | Implemented | — | — | `ThemeResolutionTest`, `AppearanceScreenTest` |
| AMOLED black mode | Implemented | Applies to every colour family | — | `ThemeContrastTest.amoledUsesTrueBlackSurfaces` |
| Scheduled light/dark | Implemented | Switches while app is visible (checked each minute); no background job | — | `ThemeResolutionTest` (wrap past midnight, same-day, AMOLED at night) |
| Colour themes: Aurora, Obsidian, Emerald, Cyber Neon, Warm Minimal | Implemented | — | — | `ThemeContrastTest` (WCAG AA ≥ 4.5:1 on all text roles, all brightnesses) |
| Device colours (Material You) | Implemented | Android 12+ only; hidden on older devices | — | Not unit-testable (wallpaper-dependent) |
| Theme persistence across restarts | Implemented | Local DataStore; excluded from backup | — | `DataStoreAppearanceRepositoryTest` |
| Instant theme switching (no restart) | Implemented | — | — | `AppearanceScreenTest.homeScreenRendersInEveryThemeAndBrightness` |
| System bar icons follow app theme | Implemented | — | — | Manual check on device pending |
| Central typography / spacing / shapes | Implemented | Font scaling respected (all sizes in sp) | — | Code review; lint in CI |
| Responsive layout (max content width, adaptive grids) | Implemented | — | — | Manual check on device pending |
| Reusable components (rows, cards, dialogs, state views, scaffold) | Implemented | — | — | Used by all screens; `AppearanceScreenTest` |
| About page with developer attribution | Implemented | Website opens in an external app until the engine exists | — | Manual |
| Privacy policy draft (in-app + `PRIVACY_POLICY.md`) | Implemented (draft) | Not a final legal document | Legal review before release | — |
| Open-source licences page | Implemented | Hand-maintained list | Update with dependencies | — |

## Planned — later stages

| Feature | Status | Technical limitation | Required configuration | Testing evidence |
|---|---|---|---|---|
| Web browsing (address bar, search, navigation, progress) | Planned (Stage 2) | Android System WebView feature set | — | — |
| Multiple tabs, tab switcher, private tabs | Planned (Stage 2) | Background tabs will be hibernated to limit memory | — | — |
| Search engine manager (Google, Bing, DuckDuckGo, custom) | Planned (Stage 2) | Search *suggestions* need each provider's suggest endpoint | — | — |
| Bookmarks, folders, history, reading list | Planned (Stage 2) | — | — | — |
| Desktop-site toggle | Planned (Stage 2) | User-agent + viewport override; some sites still detect mobile | — | — |
| Downloads manager | Planned (Stage 3) | Pause/resume controlled by Android `DownloadManager` | — | — |
| Cookies / site data / permissions / pop-up blocking | Planned (Stage 3) | — | — | — |
| Private browsing | Planned (Stage 3) | Not anonymity: network, ISP and sites can still identify users | — | — |
| Encrypted password vault + biometric lock | Planned (Stage 3) | Keystore-backed; no custom crypto | — | — |
| Android Autofill service | Planned (Stage 3) — Partial expected | User must choose NAYON as autofill provider | — | — |
| Voice search | Planned (Stage 2) | Needs an on-device speech recogniser | — | — |
| Google Sign-In | Planned (Stage 4) | — | Google Cloud project + OAuth client ID | — |
| Cloud sync | Planned (Stage 4) | Needs a backend; sign-in alone is not sync | Backend hosting, auth rules, deletion flow | — |
| Passkeys | Planned (Stage 4) — Partial expected | Depends on WebView WebAuthn support per version; per-site testing | — | — |
| PWA / web apps | Planned (Stage 4) — Partial | WebAPK install is Chrome-only; NAYON will add home-screen shortcuts that open a standalone window | — | — |
| Tracking protection / ad blocking | Planned (Stage 4) — Partial | Needs a maintained filter list and licence review | Filter list source | — |
| Page translation | Planned (Stage 4) | Needs a provider (e.g. ML Kit on-device or cloud API) | Provider credentials if cloud | — |
| Language selection | Planned | Strings are already externalised in `strings.xml` | Translations | — |
| Payments | Planned — disabled by default | Only official provider SDKs with server verification; Google Play Billing for digital goods | Provider account, backend | — |
| News / suggested content | Planned — off by default | Needs a content source | Content provider | — |
| Chrome Web Store extensions | **Unsupported** | WebView has no extension runtime | — | — |
| Alternative: built-in, sandboxed add-ons (reader mode, user CSS, force-dark pages) | Planned (Stage 4) | Limited to what the app implements itself | — | — |
| Guaranteed 120 fps web rendering | **Unsupported** | App UI follows display refresh rate; web content is rendered by WebView | — | — |
| Universal DRM / background playback | **Unsupported** | Depends on WebView, site and licence | — | — |
