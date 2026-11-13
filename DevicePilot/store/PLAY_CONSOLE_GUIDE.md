# Publishing DevicePilot on Google Play — step by step

Upload the **Play edition** bundle (`DevicePilot-Play.aab`, application id `com.webtecit.devicepilot`).
The Full edition is for direct download only and must not be uploaded to Play.

## 1. Create your release key (once — keep it safe forever)

Losing this key or its passwords means you can never update the app.

**Android Studio:** Build › Generate Signed App Bundle / APK › Android App Bundle › Create new…
Save as `devicepilot-release.jks`, alias `devicepilot`, validity 25+ years.

**Or command line (JDK installed):**
```
keytool -genkeypair -v -keystore devicepilot-release.jks -alias devicepilot -keyalg RSA -keysize 4096 -validity 10000
```

## 2. Give the key to GitHub so CI builds an uploadable bundle

Convert the key file to text (base64):
- **Windows PowerShell:** `[Convert]::ToBase64String([IO.File]::ReadAllBytes("devicepilot-release.jks")) | Set-Clipboard`
- **macOS / Linux:** `base64 -w0 devicepilot-release.jks` (macOS: `base64 -i devicepilot-release.jks`)

In GitHub: repository **Settings › Secrets and variables › Actions › New repository secret**, add:

| Secret name | Value |
|---|---|
| `DP_KEYSTORE_BASE64` | the base64 text |
| `DP_KEYSTORE_PASSWORD` | keystore password |
| `DP_KEY_ALIAS` | `devicepilot` |
| `DP_KEY_PASSWORD` | key password |

The next CI run signs the release builds with your key. Download `DevicePilot-Play.aab` from the test release
(or the `DevicePilot-release-apk` artifact). The version code increases automatically with every CI run.

## 3. Create the app in Play Console
Play Console › Create app › name `DevicePilot: Device Manager`, App, Free, default language English.

## 4. App content (Policy › App content)

| Section | Answer |
|---|---|
| Privacy policy | https://ahoshan-habib-nayon.github.io/PROFILE/devicepilot-app/privacy.html |
| App access | All functionality is available without special access (no login) |
| Ads | No, the app does not contain ads |
| Content rating | Category **Utility, Productivity, Communication or Other**; answer **No** to violence, sexual content, language, drugs, gambling, user-generated content and sharing location → rated for everyone |
| Target audience | 13–15, 16–17 and 18+ (not designed for children; do not select ages under 13) |
| News app | No |
| Government app | No |
| Financial features | None |
| Health | None |
| Advertising ID | No — the app does not use the advertising ID |

### Data safety
- Does your app collect or share any of the required user data types? **No**
- Is all user data encrypted in transit? Not applicable (no data leaves the device). If the form insists, answer **Yes**: the optional device-list download uses HTTPS.
- Do you provide a way for users to request data deletion? Data is only on the device; uninstalling or clearing app data removes it.

Reason: everything is processed on the device; the only network request is an optional HTTPS download of Google's public device list, and no user data is sent.

### Sensitive permission declarations
**QUERY_ALL_PACKAGES** (Play Console asks for this):
> DevicePilot is a device manager. Its core feature is an apps manager that lists every installed app so the user can review app details, storage and background activity and uninstall apps. It also shows per-app cache size in the Cleaner and running apps. Querying only specific packages cannot provide a full list of installed apps.

Usage Access (`PACKAGE_USAGE_STATS`), `KILL_BACKGROUND_PROCESSES`, `WRITE_SETTINGS`, `REQUEST_DELETE_PACKAGES` and `POST_NOTIFICATIONS` do not need a separate declaration form.

## 5. Testing track (new personal developer accounts)
Google requires a **closed test with at least 12 testers for 14 days** before Production.
Testing › Closed testing › Create track › upload the `.aab` › add tester emails (a Google Group or email list) › share the opt-in link.

## 6. Production
After the 14-day test: Production › Create new release › upload the latest `.aab` › release notes › review › rollout.

## Checklist
- [ ] Release key created and backed up (2 places)
- [ ] 4 GitHub secrets added; CI run shows "Release signing enabled"
- [ ] Privacy policy URL opens on the web
- [ ] Store listing: name, descriptions, icon, feature graphic, ≥ 2 screenshots
- [ ] App content forms completed (privacy, ads, rating, audience, data safety, QUERY_ALL_PACKAGES)
- [ ] Closed test with 12 testers for 14 days
- [ ] Production release

Approval is decided by Google; following this guide keeps the risk low but cannot guarantee it.
