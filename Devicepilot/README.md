# Devicepilot – Smart Device Manager & Optimizer

A native Android utility app built with Kotlin, Jetpack Compose and Material 3.
Developer: **MD AHOSHAN HABIB NAYON** · WebTec IT · https://webtecit.com

Devicepilot shows only real values from Android APIs. When a phone does not expose a value, the app labels it
*Not Supported*, *Not Available*, *Permission Required* or *Restricted by Android* instead of inventing one.
Calculated values are marked *(est.)*.

## Features
| Area | What it does |
|---|---|
| Onboarding | Welcome, features, privacy agreement, optional permissions (shown once, stored in DataStore) |
| Dashboard | Device model/Android version, health score ring, RAM/storage meters, quick actions, performance and battery overview, light/dark toggle |
| Device Health | 0–100 score with a documented method, battery health/temperature/voltage/cycle count, RAM, storage, CPU and thermal status |
| Performance Monitor | Live graphs (CPU load estimate, RAM, battery temperature, network), per-core frequencies, pause/resume, 1/2/5 s refresh |
| Speed Up | RAM Boost (real memory info + guidance), Phone Cooling (temperature, thermal status, causes), Smart Clean, recommendations |
| Storage Analyzer | Totals, categories, large files, exact duplicates (SHA-256), junk cleaner (old APKs, temp files, empty folders, own cache) — deletes only after confirmation |
| Phone Details | Device, software, processor, memory, display, battery, cameras, sensors, network; copy, share, export TXT/PDF |
| Battery & Charging | Live current/voltage/power, time-to-full from Android, charging history in Room |
| Hardware Tests | Touch, display, dead pixel, speaker, vibration, flashlight, accelerometer, gyroscope, proximity, light, compass |
| Network | Status, Wi-Fi details, user-started speed test & ping, live traffic, local/public IP |
| App Manager | Launchable apps, search/sort, sizes (usage access), permissions, open/app info/uninstall |
| Display, Tips, Settings | Refresh rates & HDR, step-by-step tips with Settings shortcuts, theme/monitoring/storage/notification settings, legal docs, about |

Background: a 15-minute WorkManager job (optional) records charging data and posts overheating / low-storage / full-charge alerts. A manifest receiver for power connect/disconnect records charging sessions.

## Tech stack
Kotlin 2.2 · AGP 8.13 · Compose BOM 2025.10 · Material 3 · Navigation Compose · Hilt · Room · DataStore · WorkManager · Coroutines/Flow · compileSdk/targetSdk 36 · minSdk 24.

## Project structure
```
app/src/main/java/com/webtecit/devicepilot/
  DevicepilotApp.kt, MainActivity.kt
  core/common          Reading (measured/estimated/unavailable), formatters, system intents
  core/designsystem    theme (light/dark), reusable components and charts
  core/navigation      routes, NavHost, bottom navigation
  core/permissions     runtime permission state helpers
  data/local           DataStore settings, Room database
  data/repository      battery, system, network, speed test, storage scan, apps, device info, reports
  data/system          notifications, power receiver, monitor worker
  di                   Hilt modules
  domain/model         data models
  domain/usecase       health score calculator
  feature/*            onboarding, dashboard, health, performance, cleaner, storage, deviceinfo,
                       battery, diagnostics, network, appmanager, tips, tools, settings
```

## Build
Open the `Devicepilot` folder in Android Studio (Ladybug or newer, JDK 17+) and run the `app` configuration, or:

```bash
./gradlew assembleDebug
```

```bash
./gradlew testDebugUnitTest lintDebug
```

Release bundle for Google Play (configure your own signing key first):

```bash
./gradlew bundleRelease
```

Instrumented tests (needs a device or emulator):

```bash
./gradlew connectedDebugAndroidTest
```

## Platform limits handled honestly
- **CPU usage**: Android 8+ blocks `/proc/stat`; the app shows an estimate from core frequencies or "Restricted".
- **CPU temperature**: read from thermal zones only when the device allows it; otherwise battery temperature is shown and labelled.
- **Battery cycle count**: Android 14+ and only where the manufacturer reports it.
- **Charging current**: some OEMs report mA instead of µA; such values are marked as estimates.
- **Other apps' cache / memory**: not accessible to any app; the app links to system settings instead.
- **Documents/APKs on Android 13+**: not visible via MediaStore; the user picks a folder (Storage Access Framework). No `MANAGE_EXTERNAL_STORAGE`.
- **Wi-Fi name**: hidden without location permission, which the app does not request.

## Play Store
See [`docs/play-store-compliance.md`](docs/play-store-compliance.md) and the legal documents in [`docs/`](docs).
