# AppFix Studio — APK Repair & Editor

A native Android app (Kotlin, Jetpack Compose, Material 3) for inspecting, repairing and customising
Android apps **you own or are authorised to modify**.

> This folder is a self-contained Android Studio project. The repository root also hosts an unrelated
> static profile website, which is left untouched.

## What works today

| Area | Status |
|---|---|
| Import APKs with the system file picker; original kept read-only, SHA-256 hashed | ✅ |
| APK report: package, versions, SDK levels, permissions, components, native ABIs, frameworks (Flutter, React Native, Unity, Xamarin, Cordova/Capacitor), resources, decoded binary manifest | ✅ |
| Signature schemes (v1/v2/v3/v3.1), signer certificates, cryptographic verification with Google's apksig | ✅ |
| "What can be changed" assessment per APK, explaining unsupported cases | ✅ |
| Import source projects from ZIP, GitHub (branch/tag/commit, optional one-time token), device folders, or the bundled sample | ✅ |
| Safe extraction: path traversal, symlinks, zip bombs, encrypted archives, executables | ✅ |
| Project detection: native Android (Kotlin/Java, Compose/XML), Flutter, React Native, Expo, Capacitor, Cordova, Unity, Xamarin, KMP | ✅ |
| Repair center: static analysis with confirmed / likely / suggestion findings and diff-reviewed auto-fixes | ✅ |
| Crash-log analysis (logcat, ANR, native) mapped to project files, with fixes where deterministic | ✅ |
| Build-log analysis (Kotlin, Java, AAPT2, manifest merger, dependency, Gradle/JDK errors) | ✅ |
| Backups (create / restore / delete) and change history with undo | ✅ |
| File explorer and viewer with line numbers (decodes binary XML and resources.arsc inside APKs) | ✅ |
| Code editor, visual layout editor, branding studio, builds, AI assistant | ⏳ see [roadmap](docs/ROADMAP.md) |

Nothing in the UI simulates success: there is no build button until a real build backend exists.

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
./gradlew :app:testDebugUnitTest      # Robolectric tests for imports and repairs
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
request that touches `appfix-studio/`:

1. builds `sample-project` with Gradle (a real Android build),
2. verifies the sample APK with `apksigner`,
3. runs the core tests, including inspection of that freshly built APK and the platform `android.jar`,
4. runs app unit tests and Android lint,
5. assembles the AppFix Studio debug APK and uploads APKs and reports as artifacts.

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
* [Roadmap and phase status](docs/ROADMAP.md)

## Legal

Only modify apps you own or have permission to change. AppFix Studio does not bypass signatures,
licences, integrity checks or other security controls.
