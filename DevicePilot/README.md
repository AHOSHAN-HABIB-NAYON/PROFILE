# DevicePilot — Smart Device Manager

Native Android app (Kotlin, Jetpack Compose, Material 3) for monitoring and managing an Android device using only official Android APIs.

**Developer:** MD. AHOSHAN HABIB NAYON · **Website:** https://webtecit.com/

| | |
|---|---|
| Min SDK | 24 (Android 7.0) |
| Target / compile SDK | 36 |
| Architecture | MVVM + repositories, Kotlin Coroutines/Flow, DataStore, WorkManager, Navigation Compose |
| Language | English |
| Backend | None — works fully offline |

## Features

| Area | What it does | Source of data |
|---|---|---|
| Device details | Device name, model, chipset, RAM, storage, display (resolution, Hz, size), battery (health, cycles, capacity, charging watts), SIM slots and carriers, IMEI (Android 9 and older; `*#06#` shortcut on newer), last boot time and uptime, kernel, build info, sensors | `Build`, `Settings.Global`, `TelephonyManager`/`SubscriptionManager`, `SystemClock`, `Display`, battery broadcast, sysfs where readable |
| Online device info | Optional "Check online": official marketing name from Google Play's public device catalog, and a link to full specs in the browser | `storage.googleapis.com/play_public/supported_devices.csv` |
| Hardware | CPU clusters (e.g. 1 × 3.30 GHz), chipset marketing name, GPU (OpenGL renderer), cameras (MP, aperture, focal length, OIS, flash, max video), rated battery capacity | sysfs cpufreq, `Build.SOC_MODEL`, EGL/GLES, Camera2, system power profile |
| Running apps | Apps with active foreground services and recently active apps; close background process, internet on/off, Force stop and background restriction shortcuts | `UsageStatsManager.queryEvents`, `ActivityManager.killBackgroundProcesses` |
| Permission setup | Shown after onboarding: asks for notifications, Usage Access, install permission and VPN one after another ("Grant all") | system dialogs / settings screens |
| Home | Device identity, RAM, storage, battery temperature, thermal status, CPU, today's data, transparent health score, quick actions | `ActivityManager`, `StatFs`, battery broadcast, `PowerManager`, `NetworkStatsManager` |
| Apps | Search / filter / sort installed apps, details, open, App info, notification / battery / background-data shortcuts, share store link | `PackageManager`, `UsageStatsManager`, `StorageStatsManager` |
| Install | Pick an APK (Storage Access Framework), inspect package, version, SDK, signer SHA-256, permissions, conflicts; install through `PackageInstaller` with Android's confirmation; result verified with `PackageManager` | `PackageInstaller` |
| Uninstall | Single or multi-select; each app goes through Android's own confirmation, one at a time; removal is verified afterwards | `ACTION_DELETE` + verification |
| APK files | Add APKs via the system picker, install, share (FileProvider copy), delete (with confirmation) | `DocumentsContract` |
| Network | Wi-Fi / mobile totals and per-app usage for today, 7 days, 30 days or billing cycle | `NetworkStatsManager` (needs Usage Access) |
| Firewall | Per-app Wi-Fi / mobile blocking with a local `VpnService` | see below |
| Temperature | Battery temperature, Android thermal status + headroom, session trend chart, readable thermal zones | battery broadcast, `PowerManager`, `/sys/class/thermal` |
| Battery | Level, state, voltage, current, charge counter, technology, health, cycle count (Android 14+) | `BatteryManager` |
| Storage | Usage, pressure, category sizes, user-picked large-file review | `StatFs`, `StorageStatsManager` |
| RAM & Clean up | Memory, CPU cores/frequencies, recent app usage; clean-up clears only DevicePilot's own cache and reports exactly that | `ActivityManager`, sysfs |
| Optimize | Real checks with status: OK / Suggestion / Needs your action / Unsupported, each with a settings shortcut | all of the above |
| Speed Up Guide | Developer options steps, 0.5x animation settings (current values shown), animated comparison, tips | `Settings.Global` (read-only) |
| Alerts | Optional battery temperature, thermal, storage, data-threshold and firewall-interruption notifications (WorkManager, 15 min) | — |

### How the firewall works

* Only apps the user blocks are added to the VPN with `addAllowedApplication`; every other app keeps using the normal network and is untouched.
* Packets from blocked apps are dropped on the device. TCP connection attempts get an immediate RST so apps fail fast instead of hanging.
* No traffic is forwarded, logged or inspected, and nothing is sent to a server.
* Wi-Fi and mobile rules: the service watches the underlying (non-VPN) networks and rebuilds the allow-list when the active transport changes. Ethernet uses the Wi-Fi rule.
* DevicePilot's own package is always inside the tunnel (it needs no internet). This keeps the allow-list from being empty, because an empty allow-list would route **all** apps into the VPN.
* Android allows only one VPN at a time; if another VPN starts, the firewall is paused and (optionally) a notification is shown.

### Platform limits (shown in the app as well)

* Overall CPU usage cannot be read on Android 8+; core frequencies are shown when the kernel exposes them.
* Thermal status needs Android 10+. CPU/GPU sensors are shown only when `/sys/class/thermal` is readable; nothing is guessed and root is never used.
* Regular apps cannot force-stop other apps, change their permissions, or enable Developer options / animation scales. DevicePilot opens the right settings screens instead.
* Battery health percentage and lifespan are not shown because Android does not provide a reliable value to apps.

## Developer attribution protection

The developer name, website and photo (`res/raw/developer_photo.webp`) are verified at start-up against fixed SHA-256 digests (`brand/Attribution.kt`); if they are changed in a modified APK the app shows a "Modified copy" screen instead of running. Release builds are also obfuscated by R8.

For stronger protection, pin your release signing certificate so copies re-signed by someone else refuse to run:

```bash
keytool -list -v -keystore devicepilot-release.jks -alias devicepilot   # copy the SHA-256 value
./gradlew assembleRelease -PexpectedSignerSha256=AB12...   # hex, colons removed
```

No client-side check can stop every determined attacker, but together these make silent re-branding much harder.

## Build

Requirements: JDK 17, Android SDK with platform 36 (Android Studio Narwhal or newer works).

```bash
cd DevicePilot
./gradlew testDebugUnitTest          # unit tests
./gradlew assembleDebug              # app/build/outputs/apk/debug/app-debug.apk
./gradlew connectedDebugAndroidTest  # instrumented tests (device/emulator attached)
```

The GitHub Actions workflow `.github/workflows/devicepilot-android.yml` runs unit tests, builds the debug APK and release bundle, then runs the instrumented tests on an API 34 emulator. The debug APK is uploaded as the `DevicePilot-debug-apk` artifact of each run.

CI also uploads `DevicePilot-release-apk`: the R8-optimized build with baseline profiles. It is much smoother than the debug APK (debug Compose builds are not optimized). Without a release keystore it is signed with the debug key, so it installs for testing but must not be uploaded to Play.

The debug build uses the application id `com.webtecit.devicepilot.debug`, so it can be installed next to a release build.

## Signed release APK / App Bundle

1. Create a keystore once (keep it and its passwords safe — losing it means you cannot update the app):
   ```bash
   keytool -genkeypair -v -keystore devicepilot-release.jks -alias devicepilot \
     -keyalg RSA -keysize 4096 -validity 10000
   ```
2. Provide the signing values as environment variables (they are never stored in the repo):
   ```bash
   export DP_KEYSTORE_PATH=/absolute/path/devicepilot-release.jks
   export DP_KEYSTORE_PASSWORD=...
   export DP_KEY_ALIAS=devicepilot
   export DP_KEY_PASSWORD=...
   ```
3. Build:
   ```bash
   ./gradlew assembleRelease   # app/build/outputs/apk/release/app-release.apk
   ./gradlew bundleRelease     # app/build/outputs/bundle/release/app-release.aab (upload this to Play)
   ```
   Without the variables the release outputs are unsigned. In Android Studio you can also use *Build › Generate Signed App Bundle / APK*.
4. For Play, enrol in Play App Signing and upload the `.aab`.

## Permissions

| Permission | Why | When requested |
|---|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE` | VPN interface for the firewall; showing connection status | install time (normal) |
| `PACKAGE_USAGE_STATS` (Usage Access) | app usage, network and storage statistics | user enables it in system settings from the screen that needs it |
| `QUERY_ALL_PACKAGES` | the Apps manager lists every installed app so the user can review and uninstall it | install time; needs a Play declaration |
| `REQUEST_INSTALL_PACKAGES` | APK installer (Android always shows its confirmation) | user enables "Install unknown apps" for DevicePilot when installing |
| `REQUEST_DELETE_PACKAGES` | opening Android's uninstall confirmation | install time (normal) |
| `READ_PHONE_STATE` | SIM state / carrier names on Device details (and IMEI on Android 9 and older) | permission setup or the Device details page; optional |
| `KILL_BACKGROUND_PROCESSES` | "Close" on Running apps (Android's official request to close cached processes) | install time (normal) |
| `POST_NOTIFICATIONS` | optional alerts (Android 13+) | only when the user turns an alert on |
| VPN consent | firewall | Android's VPN dialog when the firewall is turned on |

No location, contacts, camera, microphone or broad storage permission is requested. Files are only opened through the system document picker.

## Google Play readiness notes

* `QUERY_ALL_PACKAGES` and `REQUEST_INSTALL_PACKAGES` are restricted permissions: fill in the Play Console declarations (app management / device management use case) or remove the feature from the Play build.
* VpnService use must be disclosed (on-device firewall, no traffic leaves through the VPN). Prominent disclosure is shown on the Firewall screen before the system VPN dialog.
* The app makes no claims about freed RAM, cleaned storage or speed gains.
* Data safety: no data collected or shared (see `PRIVACY_POLICY.md`). Play approval is never guaranteed — review the current policies before submitting.

## Project structure

```
app/src/main/java/com/webtecit/devicepilot/
  domain/      pure logic (formatting, temperature, health score, firewall rules, optimization, periods) — unit tested
  data/        repositories: settings (DataStore), device monitor, apps, usage/network stats, APK inspector, installer
  firewall/    VpnService, packet tools (TCP RST), state, controller
  work/        notifications + WorkManager monitor
  system/      safe intents for Android settings screens
  ui/          Compose screens, theme, shared components
```
