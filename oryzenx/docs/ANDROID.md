# Android app

Native Kotlin + Jetpack Compose app (`android/`, package `com.oryzenx.app`, min Android 8.0 / API 26, target API 35). It uses the same JSON API as the web app, with bearer tokens stored in EncryptedSharedPreferences.

## Build with GitHub (no local setup needed)

Each push that changes `oryzenx/**` runs **OryzenX CI → Android build** (`.github/workflows/oryzenx-ci.yml`):

1. Open the repository → **Actions** → **OryzenX CI** → the latest run.
2. Download the **oryzenx-android-apks** artifact. It contains:
   - `app-debug.apk`: installable test build (package `com.oryzenx.app.debug`);
   - `app-release.apk` or `app-release-unsigned.apk`: the release build. It is signed only when the signing secrets below exist.

You can also start a build by hand: Actions → OryzenX CI → **Run workflow**.

### Repository secrets (Settings → Secrets and variables → Actions)

| Secret | Purpose |
|---|---|
| `ORYZENX_KEYSTORE_B64` | Release keystore, base64 (`base64 -w0 release.jks`) |
| `ORYZENX_KEYSTORE_PASSWORD`, `ORYZENX_KEY_ALIAS`, `ORYZENX_KEY_PASSWORD` | Keystore credentials |
| `ORYZENX_GOOGLE_SERVICES_JSON_B64` | Firebase `google-services.json`, base64, enables push |

Create a keystore once and keep it safe; you need the same key for every Play Store update:
```bash
keytool -genkeypair -v -keystore release.jks -alias oryzenx -keyalg RSA -keysize 4096 -validity 10000
```

## Build locally

Android Studio (latest stable) → open `oryzenx/android`, or:
```bash
cd oryzenx/android
./gradlew assembleDebug                                    # app/build/outputs/apk/debug
./gradlew assembleDebug -PoryzenxApiBaseUrl=http://10.0.2.2:8080   # emulator → local server
```
Release signing locally: create `android/keystore.properties` (git-ignored) with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.

## Server address

`gradle.properties` → `oryzenxApiBaseUrl=https://bd.oryzenx.com`. Release builds allow HTTPS only; debug builds also allow cleartext to `10.0.2.2`/`localhost` for development.

## Push notifications (Firebase Cloud Messaging)

1. Create a Firebase project and add two Android apps: `com.oryzenx.app` and `com.oryzenx.app.debug`.
2. Download `google-services.json` → `android/app/google-services.json` (git-ignored) or the CI secret above.
3. Firebase → Project settings → Service accounts → generate a private key (JSON). In **Admin → Settings → Push**, paste it with the project ID and enable push.
4. Without `google-services.json` the app still builds and works; push stays off and the notification settings screen says so.

## Google sign-in

1. Google Cloud Console → Credentials: create a **Web** OAuth client (its ID is used by the app as the server client ID) and an **Android** client with your package name and the SHA-1 of your signing key (debug and release).
2. Admin → Settings → Google: add the client IDs (comma-separated). The server checks the ID token audience against this list.

## App Links (password-reset links open the app)

Admin → Settings → Android: enter the package name and the **SHA-256** fingerprint of the release signing key (`keytool -list -v -keystore release.jks`). The server then serves `/.well-known/assetlinks.json`. For Play App Signing, use the SHA-256 shown in Play Console → App integrity.

## High refresh rate

The app requests the display's highest refresh rate at the current resolution (90/120/144 Hz panels), and Compose animations follow vsync. Android may still lower the rate for battery saving or thermal limits. This has **not** been measured on a physical 120 Hz device; see the test report.

## Publishing

Play Console needs: the signed release (AAB preferred: `./gradlew bundleRelease`), privacy policy URL `https://bd.oryzenx.com/privacy`, the Data safety form (account info, financial info displayed, identity documents uploaded for verification, device tokens for push), and screenshots.
