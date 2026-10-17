# FilePilot

A fast, offline-first Android file manager built with Kotlin, Jetpack Compose and Material 3.

<img src="branding/filepilot-logo-512.png" width="96" alt="FilePilot logo">

- **Min SDK** 24 (Android 7.0) · **Target / compile SDK** 36
- **Architecture** MVVM: Compose UI → ViewModels → repositories (`data/`) → Android storage APIs
- **No internet permission**, no backend, no accounts, no analytics or ads

## Features

| Area | What works |
| --- | --- |
| Launch | System splash (core-splashscreen) handing off to a ~1 s animated intro (logo scale/fade, light sweep, wordmark). Skipped when system animations are off. |
| Permissions | Onboarding that explains access levels before anything is requested; status & recovery screen; re-checked on every resume; permanently-denied permissions send you to Settings instead of re-prompting. |
| Storage | Real totals from `StorageStatsManager` / `StatFs`; internal storage and removable SD/USB volumes. |
| Browsing | List/grid, sort by name/date/size/type (asc/desc), back/forward history, breadcrumbs, pull-to-refresh, in-folder filter, hidden files toggle, scroll position kept when returning from a preview. |
| Sources | `java.io.File` with full access, **SAF** folders picked with the system picker (document URIs, no paths assumed), and **MediaStore** for categories, search and media-only access. |
| Operations | Open, open with, share (Sharesheet), copy, move, rename, new folder, delete (confirmed), multi-select, select/deselect all, favorites, details. Long operations run in the background with real progress and cancel. |
| Previews | Images (pinch/double-tap zoom, swipe), video (Media3 ExoPlayer), audio (play/pause, seek, ±10 s, metadata/art), text (wrap toggle, line numbers, binary detection), PDF (built-in `PdfRenderer`, pinch zoom). Other types open in installed apps, with a friendly message when none can. |
| Archives | ZIP browsing, extract all / folder / selection, ZIP creation. Zip-Slip protection (absolute paths and `..` rejected, canonical path check), free-space checks, never overwrites. |
| Tools | Search by name/extension with category filters and history; Large files; duplicate finder (size+type, optional SHA-256); empty-folder finder; cleanup suggestions; operation history. |
| Settings | Theme (light default / dark / system), default view & sort, show extensions, show hidden, storage access, favorites, clear search history, version info, privacy policy, licenses, Android app settings. |

### Storage strategy by Android version

| Android | Full access | Without full access |
| --- | --- | --- |
| 7 – 10 (API 24–29) | `READ/WRITE_EXTERNAL_STORAGE` runtime permission (`requestLegacyExternalStorage` on 10). SD card writes require adding the card as a picked folder (Android limitation). | Picked folders (SAF). |
| 11 – 12L (API 30–32) | `MANAGE_EXTERNAL_STORAGE` via the system "All files access" page. | `READ_EXTERNAL_STORAGE` → read-only media; picked folders. |
| 13+ (API 33–36) | `MANAGE_EXTERNAL_STORAGE`. | `READ_MEDIA_IMAGES/VIDEO/AUDIO` → read-only media (on 14+, "selected photos only" is supported via `READ_MEDIA_VISUAL_USER_SELECTED`); picked folders. |

`Android/data` and `Android/obb` are never accessed. Media-only items are read-only (open, share, copy, favorite).

> **Google Play note:** `MANAGE_EXTERNAL_STORAGE` is allowed for file managers, but Play requires you to complete the *All files access* declaration in Play Console when publishing.

### Known limitations (first release)

- No recycle bin: deletes are permanent after a confirmation dialog.
- Only ZIP/JAR archives open in-app; RAR, 7z, TAR etc. are handed to other apps. Encrypted ZIPs aren't supported.
- Password-protected PDFs open in other apps.
- Picked-folder (SAF) moves are copy-then-delete, so they're slower than same-volume moves on local storage.
- UI text is English only.

## Build

Requirements: Android Studio (Narwhal or newer) or JDK 17 + Android SDK with platform 36.

```bash
cd FilePilot
./gradlew testDebugUnitTest   # unit tests
./gradlew assembleDebug        # debug APK → app/build/outputs/apk/debug/app-debug.apk
```

Install on a connected device:

```bash
./gradlew installDebug
# or
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Every push touching `FilePilot/` also builds on GitHub Actions (`.github/workflows/filepilot-android.yml`); the debug APK, release APK/AAB and lint report are attached to each run as downloadable artifacts.

## Release signing and AAB

1. Create a keystore once (keep it and its passwords safe — you need them for every update):

   ```bash
   keytool -genkeypair -v -keystore filepilot-release.jks -alias filepilot \
     -keyalg RSA -keysize 4096 -validity 10000
   ```

2. Create `FilePilot/keystore.properties` (ignored by git):

   ```properties
   storeFile=/absolute/path/to/filepilot-release.jks
   storePassword=...
   keyAlias=filepilot
   keyPassword=...
   ```

   Or set the environment variables `FILEPILOT_STORE_FILE`, `FILEPILOT_STORE_PASSWORD`, `FILEPILOT_KEY_ALIAS`, `FILEPILOT_KEY_PASSWORD`.

3. Build:

   ```bash
   ./gradlew bundleRelease     # app/build/outputs/bundle/release/app-release.aab  (upload to Play)
   ./gradlew assembleRelease   # app/build/outputs/apk/release/app-release.apk     (sideload)
   ```

Without signing values the release build is produced unsigned. Release builds are minified and resource-shrunk with R8.

## Project layout

```
app/src/main/java/com/filepilot/app/
  FilePilotApp.kt, AppContainer.kt, MainActivity.kt   app entry, manual DI
  core/model, core/util                               FileItem, Location, types, sorting, formatting
  permissions/                                        access state + request flow
  data/                                               LocalStore (DataStore), files (local/SAF/MediaStore),
                                                      ops (copy/move/delete/zip/extract), archive, storage, tools
  actions/                                            intents for open/share
  ui/                                                 theme, components, navigation, one package per screen
app/src/main/res/                                     adaptive icon, splash, themes
branding/                                             logo SVG + 512 px PNG
```
