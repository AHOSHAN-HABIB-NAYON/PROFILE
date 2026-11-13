# FilePilot: Coding Pro

An offline Android file manager and developer toolkit by **Webtecit Apps**
(developer: MD AHOSHAN HABIB NAYON · https://webtecit.com · support.webtecit@gmail.com).

- Package: `com.webtecit.filepilot` (debug builds: `com.webtecit.filepilot.debug`)
- minSdk 24 (Android 7.0) · compileSdk / targetSdk 36
- Kotlin · Jetpack Compose · Material 3 · MVVM · Hilt · Room · DataStore · Paging 3 · Navigation Compose (type-safe routes) · Coroutines/Flow · Coil 3
- No backend, no account, no internet permission (Stage 1)

## Build status by stage

| Stage | Scope | Status |
| --- | --- | --- |
| 1 | Core file manager, permissions, navigation, file operations | Implemented |
| 2 | Home dashboard, categories, storage analyzer | Implemented |
| 3 | Code Studio, HTML Studio, offline website runner, responsive device preview | Implemented |
| 4 | APK information, HEX editor, SQLite viewer/editor, archives (ZIP/TAR/GZIP), terminal with root detection, text search, split/merge, font preview | Implemented (see limits) |
| 5 | Cleaner, duplicate finder (SHA-256), Recycle Bin | Implemented |
| 6 | Secure Folder (AES-256-GCM, Android Keystore), PIN, fingerprint, app lock | Implemented |
| 7 | PDF viewer, images to PDF, merge and compress PDF | Implemented |
| 8 | Legal pages, security notes | Pages written in `filepilot-app/`; publishing needs a merge to `main` |
| 8 | AdMob, Google Play Billing, Premium | **Not implemented** — needs your AdMob app/unit IDs and Play Console products |

### Known limits (honest list)

- APK toolkit reads APK/XAPK/APKS information and signatures. Editing AndroidManifest/smali, rebuilding, signing and zipalign are **not** implemented. Extracting installed apps needs `QUERY_ALL_PACKAGES`, a policy-restricted permission, so it was left out.
- Archives: ZIP, TAR, TAR.GZ and GZIP open in-app; RAR and 7z open in other apps. Password-protected archives aren't supported.
- Merged/compressed PDFs store pages as images (Android has no built-in PDF editing library).
- Long copies run while the app is open; there is no notification-based background service yet.
- Root explorer: the terminal uses `su` when available; there is no separate root file browser.

## Stage 1 features

- **Launch:** system splash (core-splashscreen) → animated brand splash → 7-page introduction (Skip / Next / Get started) → storage-access explanation → permission screen. Limited mode works without any permission.
- **Permissions:** "All files access" on Android 11+, classic storage permission on 7–10 (permanently-denied → app settings), SD card / USB / single folders through the system folder picker (persisted SAF grants). Re-checked on every resume; Settings → Permission manager shows and changes them later.
- **Storage:** internal storage, SD cards and USB drives with used/free space; granted folders; bookmarks.
- **Browser:** breadcrumbs, back to parent with remembered scroll position, list/grid, sort (name with natural numbers, size, date, type; ascending/descending; folders first), hidden files, file extensions, pull to refresh, search in the folder (debounced) or in all subfolders, multi-select / select all, Paging 3 over a sorted snapshot (tested with 10,000-file folders).
- **Operations:** copy, move (cut/paste), rename, batch rename (pattern with `{name}`, `{n}`, `{ext}`, find/replace, case, live preview and collision checks), delete (named confirmation), new folder, new file, share, open, open with, copy path, favorites, bookmarks, recent files.
- **Safety:** files are written to a hidden temporary name and renamed when complete; "Replace" keeps the old file until the new copy is finished; moves delete the source only after a complete copy; cancelling removes partly written files; copying a folder into itself is refused; conflicts are resolved up front (Replace / Keep both / Skip; folders merge). Progress, cancel and per-item error reports appear on every screen.
- **Details:** type, location, size, contents count and total size for folders, dates, access, image dimensions, audio/video duration, resolution, bitrate and tags; MD5, SHA-1 and SHA-256 with progress and cancel.
- **Compare:** two files by SHA-256, and line by line (Myers diff) for text files up to 2 MB.
- **Settings:** Light (default) / Dark / System theme, five accent colours, dynamic colour (Android 12+), animations, high refresh rate, hidden files, extensions, grid view, default sort, Files-tab start location, permission manager, contact support, report a problem, share app, About (developer profile, website, email, copy email, version and build).

## Architecture

```
app/src/main/java/com/webtecit/filepilot/
├── FilePilotApp.kt, MainActivity.kt, MainViewModel.kt
├── brand/                    developer details, website/email/share intents
├── core/
│   ├── common/               dispatchers & app scope (Hilt), formatters, UI events, clipboard
│   ├── designsystem/         theme (colours, type, shapes), shared components, dialogs
│   ├── storage/              FileItem, FileSystem interface, LocalFileSystem (paths),
│   │                         SafFileSystem (DocumentsContract), FileSystems router,
│   │                         StorageVolumes, file types, name rules, sorting, intents
│   ├── operations/           FileOperationManager (copy/move/delete engine), checksums,
│   │                         batch rename, line diff, clipboard
│   ├── database/             Room: favorites, bookmarks, recents, granted folders
│   ├── preferences/          DataStore settings, theme mirror for the splash
│   └── permissions/          storage access by Android version
├── data/                     repositories (library, granted folders), FileOpener
├── feature/                  splash, onboarding, permissions, home, files, browser,
│                             details, compare, library, settings, operations
└── navigation/               type-safe routes, root scaffold with bottom navigation
```

- **Two storage backends behind one interface.** Every item has an id: an absolute path for direct access, or `saf:` + a document URI for folders granted through the picker. The copy engine works across both (for example, internal storage → USB drive).
- **The operation engine lives outside screens** (an app-scoped coroutine), so copies continue while you browse, and its progress is a `StateFlow` shown on every screen. It is pure Kotlin over the `FileSystem` interface and is unit-tested on the JVM.
- **Paging 3** pages over the folder's sorted snapshot with placeholders. The list knows its full size, so fast scrolling and scroll restoration work in very large folders while only visible rows are built.
- **Performance:** listing uses one `stat` per file (NIO), sorting and filtering run on `Dispatchers.Default`, progress updates are throttled to 10 per second, lists use stable keys and content types, and image thumbnails come from Coil's memory cache. The high-refresh-rate option asks for the display's best mode at the current resolution; Android decides the actual rate and devices without 90/120 Hz stay at 60 Hz.

## Google Play policy notes

- **`MANAGE_EXTERNAL_STORAGE` (All files access)** is declared because file management is the app's core purpose, a use case Google Play permits. You must submit the *All files access* declaration in Play Console, with a short video of the core file-management flow. Approval is decided by Google and isn't guaranteed.
- No `READ_MEDIA_*` permissions are requested (Play's photo/video policy), and there is no `QUERY_ALL_PACKAGES` or `REQUEST_INSTALL_PACKAGES` yet. The APK toolkit (Stage 4) may need the latter; it will be raised before it is added.
- `Android/data` and `Android/obb` of other apps are not accessible on Android 11+; the app doesn't try to bypass this.
- Cloud backup is disabled; nothing leaves the device.
- Ads, billing and the legal pages (Stage 8) will update the Data safety answers and the privacy policy.

## Build and run

Requirements: JDK 17 and the Android SDK with platform 36 (or Android Studio).

```bash
cd FilePilot
./gradlew testDebugUnitTest          # unit tests
./gradlew assembleDebug              # app/build/outputs/apk/debug/app-debug.apk
./gradlew installDebug               # install on a connected device
./gradlew connectedDebugAndroidTest  # UI tests on a device/emulator
```

CI (`.github/workflows/filepilot-android.yml`) runs the unit tests, builds debug and release APKs and the App Bundle, runs the UI tests on an Android 14 emulator, and publishes a test build at
`https://github.com/AHOSHAN-HABIB-NAYON/PROFILE/releases/download/filepilot-test/FilePilot.apk`.

### Release signing

Release builds read the key from environment variables, so no secret is stored in the repository. In CI, add the secrets `FP_KEYSTORE_BASE64` (base64 of the `.jks`), `FP_KEYSTORE_PASSWORD`, `FP_KEY_ALIAS` and `FP_KEY_PASSWORD`. Without them the release build is signed with the debug key for testing only.

## Manual test checklist (Stage 1)

1. Fresh install: splash → introduction → Skip → explanation → Permissions → "Continue with limited access" → Home shows "Allow storage access".
2. Grant All files access from the banner, return: the banner disappears and quick-access folders appear.
3. Open Internal storage, create a folder and a file, rename them, then long-press to select both and delete (confirmation names the action).
4. Copy a large video to another folder; switch tabs while it copies; cancel one copy and confirm no partial file remains.
5. Paste into a folder that already has the same names: try Keep both, Replace and Skip.
6. Add an SD card or USB drive with "Add SD card, USB drive or folder", copy files to and from it.
7. Batch-rename several photos with `Trip_{n}`; try a pattern that collides and see the error.
8. Open Details on a file and compute SHA-256; compare two text files.
9. Settings: switch Dark/Light/System, an accent colour, hidden files, extensions, grid view, default sort.
10. Deny the storage permission twice on Android 7–10 and confirm "Allow" opens the app settings page.
