# AppFix Studio — APK Repair & Editor

A native Android app (Kotlin, Jetpack Compose, Material 3) for inspecting, repairing and customising
Android apps **you own or are authorised to modify**.

> This folder is a self-contained Android Studio project. The repository root also hosts an unrelated
> static profile website, which is left untouched.

## What works today

| Area | Status |
|---|---|
| Import APKs with the system file picker; the original is kept read-only and SHA-256 hashed | ✅ |
| APK report: package, versions, SDK levels, permissions, components, native ABIs, frameworks (Flutter, React Native, Unity, Xamarin, Cordova/Capacitor), resources, decoded binary manifest | ✅ |
| Signature schemes (v1/v2/v3/v3.1), signer certificates, verification with Google's apksig | ✅ |
| Import source projects from ZIP, GitHub (branch/tag/commit, optional one-time token), device folders, or the bundled sample | ✅ |
| Safe extraction: path traversal, symlinks, zip bombs, encrypted archives, executables | ✅ |
| Project detection: native Android (Kotlin/Java, Compose/XML), Flutter, React Native, Expo, Capacitor, Cordova, Unity, Xamarin, KMP | ✅ |
| Repair center: static analysis with confirmed / likely / suggestion findings, and diff-reviewed auto-fixes | ✅ |
| Crash-log and build-log analysis, mapped to project files | ✅ |
| Backups (create / restore / delete) and change history with undo for every change | ✅ |
| Code editor (sora-editor, own highlighters for Kotlin/Java/XML/Gradle/JSON), find & replace across the project, diff viewer | ✅ |
| String / colour / dimension resource editor with validation | ✅ |
| Visual editor for XML layouts: insert, move, remove and edit components; click actions (toast, URL, share, open screen, dialog) | ✅ |
| Feature generators: About, Contact, Privacy, Help, Settings, Onboarding (Kotlin+XML, Java+XML, Compose) | ✅ compiled by CI |
| Branding: launcher icon (all densities, adaptive + monochrome), app name, theme colours, fonts, splash screen, screen transitions, Lottie | ✅ compiled by CI |
| Cloud builds on GitHub Actions in your own private repository, with live steps, logs, cancel, artifact download and cleanup | ✅ |
| Signing: create PKCS12 keystores (never overwritten), sign v1/v2/v3 with apksig, verify, install, share | ✅ |
| APK modification: version name/code, app name and raster images, rebuilt and re-signed | ✅ checked by CI with aapt2 + apksigner |
| AI assistant: reviewed context, unified-diff patches checked against your files, apply/reject, re-analysis | ✅ ([details](docs/AI_ASSISTANT.md)) |
| Apktool/JADX resource and code changes to APKs | ⛔ needs a build worker (documented, not included) |

Nothing in the UI simulates success. Builds run for real on GitHub Actions. AI patches are labelled
"not verified" until a build passes.

## Requirements

| Tool | Version |
|---|---|
| JDK | 17 or newer (CI uses Temurin 17) |
| Gradle | 8.14.3 via the included wrapper |
| Android Gradle Plugin | 8.11.1 |
| Kotlin | 2.2.0 (KSP 2.2.0-2.0.2) |
| Android SDK | Platform 36, Build-Tools 36.0.0 |
| Device | Android 7.0 (API 24) to Android 16 (API 36) |

All dependency versions are pinned in [`gradle/libs.versions.toml`](gradle/libs.versions.toml).

## Build and run

```bash
cd appfix-studio
./gradlew :app:assembleDebug          # APK in app/build/outputs/apk/debug/
./gradlew :core:test                  # JVM unit tests for the engine
./gradlew :app:testDebugUnitTest      # Robolectric tests: imports, signing, UI navigation, accessibility
./gradlew :app:assembleRelease        # R8-minified release (unsigned unless APPFIX_RELEASE_* are set)
./gradlew :app:lintDebug              # Android lint
./gradlew -p sample-project assembleDebug   # build the sample fixture app
```

Open the `appfix-studio` folder (not the repository root) in Android Studio.

Optional: run the APK parser tests against real files

```bash
APPFIX_SAMPLE_APK=$PWD/sample-project/app/build/outputs/apk/debug/app-debug.apk \
APPFIX_FRAMEWORK_JAR=$ANDROID_HOME/platforms/android-36/android.jar \
./gradlew :core:test
```

## Continuous integration

[`.github/workflows/appfix-studio.yml`](../.github/workflows/appfix-studio.yml) runs on every push and pull
request that touches `appfix-studio/`. It:

1. builds `sample-project` with Gradle (a real Android build) and verifies it with `apksigner`;
2. runs the core tests against that APK and the platform `android.jar`. These tests also write three
   projects modified by every generator and branding tool (Kotlin+XML, Java+XML, Compose), plus a modified
   copy of the sample APK;
3. builds those three generated projects with Gradle;
4. runs the app unit tests (Robolectric imports and apksig signing, including signing the modified APK);
5. checks the modified, re-signed APK with `apksigner verify`, `aapt2 dump badging` (new version and label)
   and `zipalign -c`;
6. runs Android lint, plus Robolectric UI tests that walk every tab, import the sample and open the
   assistant. These tests also check that every clickable element has a label and a large enough touch target;
7. assembles the debug APK and the R8-minified release APK;
8. installs both on **API 24 and API 35 emulators**, launches them, taps through the main screens and
   imports the sample project, and fails on any crash.

Tagged releases (`appfix-studio-v*`) are built and signed with the owner's secrets. See [docs/RELEASE.md](docs/RELEASE.md).

No secrets, keystores or API keys are stored in the repository.

## Project layout

```
appfix-studio/
├── app/              Android app (Compose UI, persistence, Android integrations)
├── core/             Pure Kotlin engine with unit tests
├── sample-project/   Small Kotlin + XML app used as a test fixture and bundled sample
└── docs/             Architecture, security & limitations, roadmap
```

* [Architecture](docs/ARCHITECTURE.md)
* [Security and compatibility limitations](docs/SECURITY_AND_LIMITATIONS.md)
* [AI assistant, patch rules and proxy contract](docs/AI_ASSISTANT.md)
* [Release packaging and signing](docs/RELEASE.md)
* [Roadmap and phase status](docs/ROADMAP.md)

## Legal

Only modify apps you own or have permission to change. AppFix Studio does not bypass signatures,
licences, integrity checks or other security controls.
