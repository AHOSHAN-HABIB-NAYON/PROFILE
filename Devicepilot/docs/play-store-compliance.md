# Google Play Console — Compliance Guide for Devicepilot

Use this checklist when you create the store listing and fill in the App content section.

## 1. App identity
| Field | Value |
|---|---|
| App name | Devicepilot – Smart Device Manager & Optimizer |
| Package | `com.webtecit.devicepilot` |
| Category | Tools |
| Developer | MD AHOSHAN HABIB NAYON (WebTec IT) |
| Website | https://webtecit.com |
| Target SDK | 36 · Min SDK 24 |
| Ads | No |
| In-app purchases | No |

## 2. Privacy policy URL
Play requires a public URL. Publish `docs/privacy-policy.md` on your website (for example `https://webtecit.com/devicepilot/privacy-policy`) and paste that URL in **App content › Privacy policy**. The same text is shown inside the app.

## 3. Data safety form
| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **No** |
| Is all user data encrypted in transit? | Not applicable (no data collected). The speed test uses HTTPS. |
| Do you provide a way for users to request that their data is deleted? | Not applicable — data stays on the device; uninstalling deletes it. |

Reasoning: Google defines "collect" as transmitting data off the device. Devicepilot processes device information, file metadata, app usage and charging history **only on the device**. The speed test and public-IP lookup send no user data; Cloudflare only sees the connection itself, as with any network request the user starts.

## 4. Permissions and their justification
| Permission | Type | Why it is needed |
|---|---|---|
| `INTERNET` | normal | User-started speed test and public IP lookup |
| `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE` | normal | Connection type, Wi-Fi signal and link speed |
| `POST_NOTIFICATIONS` | runtime | Optional charging / overheating / storage alerts |
| `VIBRATE` | normal | Vibration hardware test |
| `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO` | runtime | Storage analyzer, large-file finder, duplicate photo/video finder |
| `READ_MEDIA_AUDIO` | runtime | Storage analyzer (audio category), duplicate audio |
| `READ_MEDIA_VISUAL_USER_SELECTED` | runtime | Android 14 partial photo access support |
| `READ_EXTERNAL_STORAGE` (max SDK 32), `WRITE_EXTERNAL_STORAGE` (max SDK 28) | runtime | Same features on older Android versions |
| `PACKAGE_USAGE_STATS` | special access, user-enabled | Optional app sizes and most-used apps |

**Photo and video permissions declaration.** Because the app requests `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO`, Play Console asks for a declaration. Describe the core use: *"Devicepilot is a storage manager. It scans the user's photos and videos to show how much space they use, list large files and find byte-identical duplicates so the user can delete them. Broad access is required because the photo picker cannot measure or compare the whole library."* If Google rejects this, the media features can be moved to the system photo picker in a later version.

**Not requested** (avoid policy reviews): `MANAGE_EXTERNAL_STORAGE`, `QUERY_ALL_PACKAGES` (package visibility uses a `<queries>` launcher filter), Accessibility Service, location, camera, microphone, contacts, phone, SMS.

`PACKAGE_USAGE_STATS` is not on Google's restricted list, but reviewers may ask about it; it is optional, explained in the app, and granted by the user in system settings.

## 5. Content rating
Complete the IARC questionnaire as a utility: no violence, no user-generated content, no user interaction, no location sharing, no purchases → typically **Everyone / PEGI 3**.

## 6. Target audience
13+ (general audience). The app is not designed for children.

## 7. Store listing claims — stay accurate
Google rejects misleading "booster/cleaner" claims. Do **not** say: "boost RAM", "cool CPU", "increase speed by X%", "kill apps", "clean other apps' cache". Suggested short description:

> See your phone's real health, battery, storage and hardware — honest readings, no fake boosts.

Suggested full description opening:

> Devicepilot shows what your phone really reports: battery health and temperature, memory, storage, performance and network. Find large and duplicate files, clean old APKs and temporary files you choose, test your touchscreen, display, speaker and sensors, and follow clear step-by-step tips. No ads, no tracking, works offline.

## 8. Release steps
1. In Android Studio: **Build › Generate Signed App Bundle** → create an upload keystore (keep it safe, never commit it).
2. Enrol in **Play App Signing**.
3. Upload `app-release.aab` to the **Internal testing** track first, test on several devices (Samsung, Xiaomi, Pixel), then promote to closed/production.
4. New personal developer accounts must run a closed test with at least 12 testers for 14 days before production access.

## 9. Feature graphic and icon
- High-res icon: `docs/playstore_icon_512.png` (512×512).
- Feature graphic (1024×500) and phone screenshots must be captured from a real device or emulator.
