# NAYON Browser

**One Browser. Your Digital World.**

A modern, privacy-respecting Android browser written in Kotlin with Jetpack Compose.

- Developer: **MD. AHOSHAN HABIB NAYON**
- Website: <https://webtecit.com>
- Package: `com.webtecit.nayon` (debug builds: `com.webtecit.nayon.debug`)

> **Current stage: 2 — Browser engine.** NAYON Browser now browses the web with Android System
> WebView: address bar with search, six search engines plus custom, tabs and private tabs, tab
> switcher, bookmarks, history, downloads, desktop site, voice search, full-screen video and error
> pages — on top of the Stage 1 design system and themes.
> See [FEATURES_STATUS.md](FEATURES_STATUS.md) for the exact state of every feature.

## Requirements

| Tool | Version |
|---|---|
| JDK | 17 (Gradle toolchain) |
| Android SDK | Platform 36, Build-Tools 36.0.0 |
| Gradle | 8.14.3 via the included wrapper |
| Android Gradle Plugin | 8.11.1 |
| Kotlin | 2.2.0 |
| Android Studio | Narwhal (2025.1) or newer |
| Device / emulator | Android 7.0 (API 24) or newer |

## Build & run

### Android Studio
1. **File → Open** and choose the `nayon-browser/` folder (not the repository root).
2. Let Gradle sync, pick the `app` configuration and press **Run**.

### Command line
```bash
cd nayon-browser
./gradlew assembleDebug            # app/build/outputs/apk/debug/app-debug.apk
./gradlew installDebug             # install on a connected device / emulator
./gradlew testDebugUnitTest        # unit + Robolectric UI tests
./gradlew lintDebug                # Android lint
./gradlew assembleRelease bundleRelease   # minified release APK + AAB
```
Without signing variables the release APK is produced **unsigned**
(`app-release-unsigned.apk`) and cannot be installed until signed.

## Project structure

```
nayon-browser/
├── app/src/main/java/com/webtecit/nayon/
│   ├── NayonApp.kt, MainActivity.kt, NayonViewModels.kt
│   ├── core/designsystem/theme/      palettes, typography, spacing, NayonTheme
│   ├── core/designsystem/component/  reusable UI components
│   ├── data/settings/                DataStore-backed appearance repository
│   ├── navigation/                   NavHost and routes
│   ├── core/browser/                 URL/search resolution, search engines
│   ├── data/browser/                 Room database: history, bookmarks, saved tabs
│   └── feature/                      browser, tabs, bookmarks, history, settings, appearance, about
├── app/src/test/                     unit + Robolectric Compose tests
├── docs/ARCHITECTURE.md              architecture & feasibility assessment
├── FEATURES_STATUS.md · SECURITY.md · PRIVACY_POLICY.md
└── gradle/libs.versions.toml         all dependency versions
```

## Design system

- **Typography** (`Type.kt`): page headings 24sp, section headings 20sp, body 16sp,
  secondary 14sp, supporting 12sp, buttons 14sp. All in `sp`, so Android font scaling applies.
- **Spacing / radius / icon sizes** (`Dimens.kt`): a 4dp scale, 48dp minimum touch targets,
  content capped at 640dp wide for tablets and landscape.
- **Colour** (`Palettes.kt`): each theme family has a hand-tuned light and dark palette; AMOLED
  is derived from the dark palette with true-black surfaces. All text roles are tested for
  WCAG AA contrast.

## GitHub workflow

`.github/workflows/nayon-android.yml` (at the repository root) runs on every push or pull
request that touches `nayon-browser/`, and can be run manually:

1. Unit and Robolectric UI tests
2. Android lint
3. Debug APK
4. Release APK + App Bundle (signed if secrets exist)
5. Uploads `nayon-browser-apks` and `nayon-browser-reports` as run artifacts

Each successful push also publishes the debug APK as a direct download (no sign-in needed):
<https://github.com/AHOSHAN-HABIB-NAYON/PROFILE/releases/download/nayon-browser-latest/NAYON-Browser.apk>

Debug builds are signed with the committed `app/debug.keystore` (a public, debug-only key with
password `android`) so each new test build installs over the previous one. It is never used for releases.

## Signing a release build (secrets management)

Never commit keystores or passwords. `.gitignore` excludes `*.jks`, `*.keystore` and
`keystore.properties`.

Create a keystore once, locally:
```bash
keytool -genkeypair -v -keystore nayon-release.jks -alias nayon \
        -keyalg RSA -keysize 4096 -validity 10000
```

**GitHub Actions** — add these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `NAYON_KEYSTORE_BASE64` | `base64 -w0 nayon-release.jks` |
| `NAYON_KEYSTORE_PASSWORD` | keystore password |
| `NAYON_KEY_ALIAS` | key alias (e.g. `nayon`) |
| `NAYON_KEY_PASSWORD` | key password |

**Locally** — export the same values as environment variables (`NAYON_KEYSTORE_PATH` pointing
at the `.jks` file instead of the base64 secret) and run `./gradlew assembleRelease bundleRelease`.

For Google Play, enrol in Play App Signing and upload the AAB.

## Testing

| Test | What it proves |
|---|---|
| `ThemeResolutionTest` | System/Light/Dark/AMOLED/Scheduled resolve correctly, incl. schedules crossing midnight |
| `ThemeContrastTest` | Every built-in theme × brightness meets WCAG AA 4.5:1 on text roles; AMOLED is true black |
| `DataStoreAppearanceRepositoryTest` | Settings persist, invalid stored values fall back safely, times are clamped |
| `AppearanceScreenTest` (Robolectric) | Mode/theme selection works, schedule options appear only when relevant, selection is exposed to accessibility, the new-tab page renders in every theme |
| `UrlResolverTest` | Addresses vs searches, unsafe schemes never loaded, search engines, custom-engine validation, desktop user agent |
| `BrowsingRepositoryTest` (Robolectric + Room) | History recording/merging/search/delete, unique bookmarks, saved tabs, day grouping |

Manual checks still required on real devices: browsing on many sites, downloads, uploads,
full-screen video, splash screen, landscape, large font sizes, TalkBack, and 60/90/120 Hz displays.

## Current limitations

- Website requests for camera, microphone and location are denied until Stage 3 adds prompts.
- Private-tab cookie isolation needs a WebView version with multi-profile support; older devices are told on the private page.
- Downloads are handled by Android's download manager; there is no in-app downloads page yet.
- Bookmark folders, import/export and the password manager are not built yet.
- Material You colours need Android 12+; the option is hidden on older versions.
- Scheduled theme switches while the app is open; it does not run in the background.
- See [FEATURES_STATUS.md](FEATURES_STATUS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
  for engine limitations (no Chrome extensions, no WebAPK PWAs, no guaranteed 120 fps web content).
