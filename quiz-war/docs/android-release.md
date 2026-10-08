# Android release & Google Play

The Android app is the web client packaged with **Capacitor 7** (`apps/android`, generated
from `apps/web/capacitor.config.ts`). Package / application id: **`app.quizwar.bd`**
(debug builds use `app.quizwar.bd.debug`).

## Build

```bash
cd quiz-war/apps/web
cp .env.production.example .env.production   # VITE_API_URL=https://api.quizwar.app …
npm run build && npx cap sync android        # copies dist/ + plugins into apps/android
cd ../android
./gradlew assembleDebug                      # debug APK
QW_VERSION_CODE=12 QW_VERSION_NAME=1.2.0 ./gradlew bundleRelease   # signed AAB (needs signing config)
# → app/build/outputs/bundle/release/app-release.aab
```

Requirements: JDK 21, Android SDK (compileSdk/targetSdk 35, minSdk 23) — Android Studio
installs both. `npx cap open android` opens the project in Android Studio.

CI: `.github/workflows/quizwar-ci.yml` builds a debug APK on every push and a signed AAB
when the signing secrets exist (see below). Trigger it manually with a `version_code`.

### Versioning
- `versionCode` (integer) **must increase for every upload** to Play. Pass `QW_VERSION_CODE`
  (CI uses the run number by default) or `-PqwVersionCode=…`.
- `versionName` is the human-readable version (`QW_VERSION_NAME`).
- Server-side force update: Admin → App settings → *Minimum Android versionCode* + *Force update*.

### Icons & splash
`npm run icons` (in `apps/web`) regenerates PWA icons, Android legacy/round/adaptive
launcher icons, splash screens and the 512×512 Play listing icon (`apps/android/play-store/`)
from `public/icons/logo.svg` / `logo-foreground.svg`.

## Release signing — keep the upload key safe

Google Play uses **Play App Signing**: Google holds the *app signing key*; you sign uploads
with your own **upload key**. If the upload key is lost or leaked, it can be reset through
Play Console support, but it is slow and disruptive — protect it.

1. **Create the upload keystore once, on a trusted machine, outside the repository:**
   ```bash
   keytool -genkeypair -v -keystore ~/secure/quizwar-upload.jks -alias quizwar-upload \
     -keyalg RSA -keysize 4096 -validity 10000
   ```
   Use a long random password (password manager). Record the alias.
2. **Never commit it.** `*.jks`, `*.keystore`, `keystore.properties` and `google-services.json`
   are git-ignored at the repo and Android level. Check `git status` before every commit.
3. **Local signing:** copy `apps/android/keystore.properties.example` →
   `apps/android/keystore.properties` (git-ignored) and fill in the absolute path + passwords.
4. **CI signing (GitHub):** Settings → Secrets and variables → Actions:
   - `QW_UPLOAD_KEYSTORE_BASE64` = `base64 -w0 quizwar-upload.jks`
   - `QW_KEYSTORE_PASSWORD`, `QW_KEY_ALIAS`, `QW_KEY_PASSWORD`
   The workflow decodes it to the runner temp dir, signs, and deletes it.
5. **Back up the keystore + passwords** in at least two places you control, e.g.
   (a) your password manager as an attachment, and (b) an encrypted offline copy
   (`gpg -c quizwar-upload.jks` on an external drive kept somewhere safe). Write down who has
   access. Test restoring the backup once.
6. **Rotation / compromise:** if the upload key leaks, revoke CI secrets immediately and
   request an upload key reset in Play Console → Setup → App integrity.
7. Get the certificate fingerprints for App Links / Google sign-in / passkeys:
   ```bash
   keytool -list -v -keystore ~/secure/quizwar-upload.jks -alias quizwar-upload   # upload key SHA-1 / SHA-256
   ```
   and Play Console → Setup → App integrity → *App signing key certificate* (SHA-1/SHA-256).

## Deep links / App Links

- Verified links: `https://quizwar.app/u/<UID>`, `/war-room/<id>`, `/squads/<id>`, `/battle…`
  (manifest placeholder `appLinkHost`, override with `QW_APP_LINK_HOST`).
- The API serves `https://quizwar.app/.well-known/assetlinks.json` from
  `ANDROID_PACKAGE_NAME` + `ANDROID_SHA256_CERT_FINGERPRINTS` (include **both** the Play app
  signing SHA-256 and the upload key SHA-256). nginx forwards that path to the API.
- Custom scheme fallback: `quizwar://u/QW-XXXXXX`.
- QR codes contain only the public profile URL, so they open the app when installed and the
  web profile otherwise.

## Passkeys on Android

`MainActivity` enables WebView WebAuthn (`WEB_AUTHENTICATION_SUPPORT_FOR_APP`) when the
device's WebView supports it, so the same "Continue with Passkey" code works in the app via
Android Credential Manager. Requirements:
- `WEBAUTHN_RP_ID=quizwar.app`
- `assetlinks.json` includes `delegate_permission/common.get_login_creds` (already emitted)
- `WEBAUTHN_ORIGIN` includes the app origin `android:apk-key-hash:<hash>` where `<hash>` is the
  base64url (no padding) SHA-256 of the **app signing** certificate:
  ```bash
  echo <SHA256 hex with colons removed> | xxd -r -p | base64 | tr '+/' '-_' | tr -d '='
  ```
On devices without WebView WebAuthn support the passkey button is hidden; email and Google
login remain available.

## Google Play checklist

- [ ] App content: privacy policy URL `https://quizwar.app/legal/privacy`
- [ ] Account deletion: in-app (Settings → Delete account) **and** a web URL for the Data
      safety form: `https://quizwar.app/settings` (sign in → Delete account); support email
- [ ] Data safety form (see below)
- [ ] Target audience 13+; no ads declared (unless enabled later); no gambling
- [ ] Content rating questionnaire (trivia game, user-generated usernames/photos with reporting & blocking)
- [ ] Store listing: 512×512 icon (`apps/android/play-store/icon-512.png`), feature graphic 1024×500, phone screenshots
- [ ] Upload AAB to *Internal testing* first; test login (email, Google, passkey), push, QR, deep links
- [ ] Increase `versionCode` for every upload

### Data safety summary
| Data | Collected | Purpose | Shared |
|---|---|---|---|
| Email address | yes (email/Google login) | account management | no |
| User IDs (UID, Google subject) | yes | account | no |
| Name/username, photos (optional) | yes | app functionality (public profile) | no |
| App interactions, in-game activity | yes | app functionality, fraud prevention | no |
| Device or other IDs (push token) | yes, if notifications enabled | notifications | no (sent to FCM for delivery) |
| Crash/diagnostics | server logs only | security | no |
Data is encrypted in transit (HTTPS). Users can request deletion in-app.
