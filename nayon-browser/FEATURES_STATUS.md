# NAYON Browser — Feature Status

Status values: **Implemented**, **Partial**, **Planned**, **Unsupported**.
"Testing evidence" lists only checks that actually run. CI = `.github/workflows/nayon-android.yml`.

_Last updated: Stage 3 (storage & security)._

**Verification:** every push runs `.github/workflows/nayon-android.yml` (debug build, unit + Robolectric
UI tests, lint, minified release APK and AAB). Items marked "Manual" in the evidence column still need
checking by hand on a real device.

## Stage 1 — Foundation

| Feature | Status | Technical limitation | Required configuration | Testing evidence |
|---|---|---|---|---|
| Gradle project, version catalog, wrapper | Implemented | — | JDK 17, Android SDK 36 | CI `assembleDebug`, `assembleRelease`, `bundleRelease` |
| Adaptive launcher icon (incl. themed/monochrome) | Implemented | Monochrome layer used on Android 13+ | — | Built by CI (AAPT) |
| Splash screen (light & dark) | Implemented | Uses `core-splashscreen`; held only until settings load, no artificial delay | — | Manual check on device pending |
| Light / Dark / System modes | Implemented | — | — | `ThemeResolutionTest`, `AppearanceScreenTest` |
| AMOLED black mode | Implemented | Applies to every colour family | — | `ThemeContrastTest.amoledUsesTrueBlackSurfaces` |
| Scheduled light/dark | Implemented | Switches while app is visible (checked each minute); no background job | — | `ThemeResolutionTest` (wrap past midnight, same-day, AMOLED at night) |
| Colour themes: Aurora, Obsidian, Emerald, Cyber Neon, Warm Minimal | Implemented | — | — | `ThemeContrastTest` (WCAG AA ≥ 4.5:1 on all text roles, all brightnesses) |
| Device colours (Material You) | Implemented | Android 12+ only; hidden on older devices | — | Not unit-testable (wallpaper-dependent) |
| Theme persistence across restarts | Implemented | Local DataStore; excluded from backup | — | `DataStoreAppearanceRepositoryTest` |
| Instant theme switching (no restart) | Implemented | — | — | `AppearanceScreenTest.homeScreenRendersInEveryThemeAndBrightness` |
| System bar icons follow app theme | Implemented | — | — | Manual check on device pending |
| Central typography / spacing / shapes | Implemented | Font scaling respected (all sizes in sp) | — | Code review; lint in CI |
| Responsive layout (max content width, adaptive grids) | Implemented | — | — | Manual check on device pending |
| Reusable components (rows, cards, dialogs, state views, scaffold) | Implemented | — | — | Used by all screens; `AppearanceScreenTest` |
| About page with developer attribution | Implemented | Website opens in an external app until the engine exists | — | Manual |
| Privacy policy draft (in-app + `PRIVACY_POLICY.md`) | Implemented (draft) | Not a final legal document | Legal review before release | — |
| Open-source licences page | Implemented | Hand-maintained list | Update with dependencies | — |

## Stage 2 — Browser engine

| Feature | Status | Technical limitation | Required configuration | Testing evidence |
|---|---|---|---|---|
| Web page loading (Android System WebView) | Implemented | WebView feature set, not full desktop Chromium | — | Compiles in CI; manual device check pending |
| Address bar: URL vs search detection | Implemented | Only http/https load directly; other schemes are searched | — | `UrlResolverTest` |
| Search engines: Google, Bing, DuckDuckGo, Brave, Ecosia, Yahoo | Implemented | Public search URLs only; no search API | — | `UrlResolverTest` |
| Custom search engine | Implemented | Must be https and contain `%s` | — | `UrlResolverTest.customTemplateValidation` |
| Local suggestions (bookmarks + history) | Implemented | No online search suggestions (privacy) | — | Manual |
| Voice search | Implemented | Needs a speech recogniser on the device; button hidden otherwise | — | Manual |
| Back / forward / reload / stop / home, progress bar | Implemented | — | — | Manual |
| Secure / not-secure indicator | Implemented | Based on https and certificate errors | — | Manual |
| Multiple tabs, tab switcher with thumbnails | Implemented | Thumbnails captured when opening the switcher | — | Manual |
| Close / close all / duplicate tab | Implemented | — | — | Manual |
| Private tabs | Implemented | No history. Cookies/storage isolated only where WebView supports profiles (`MULTI_PROFILE`); otherwise shared with normal tabs and the private page says so | — | Manual |
| Restore normal tabs on start | Implemented (setting) | Restores URL and title, not back/forward history | — | `BrowsingRepositoryTest.savedTabsReplaceInOrder` |
| Background tab memory limit | Implemented | Max 4 live WebViews; older tabs reload when reopened | — | Code review |
| Bookmarks: add, remove, rename, search, open in new tab | Implemented | Folders and import/export not yet | — | `BrowsingRepositoryTest` |
| History: grouped by day, search, delete item, clear all | Implemented | Private tabs never recorded | — | `BrowsingRepositoryTest` |
| Clear browsing data (history, cookies & site data, cache) | Implemented | — | — | Manual |
| JavaScript on/off | Implemented | Global setting (per-site later) | — | Manual |
| Desktop site | Implemented | User-agent switch; some sites still detect mobile | — | `UrlResolverTest.desktopUserAgentRemovesMobileMarkers` |
| Downloads — NAYON download engine | Implemented | Up to 8 parallel connections with work stealing, real pause/resume (also after restart), retries, background service with progress notification. Single connection when the server doesn't support ranges. `data:` URLs saved; `blob:` not yet. Android 7–9 save into the app's own Downloads folder | — | Manual |
| File upload from web pages | Implemented | Uses the system file picker | — | Manual |
| Full-screen video | Implemented | Attached directly to the window; turns landscape for wide videos only; site controls stay usable; screen kept on; uses the notch area. Depends on the site and WebView | — | Manual |
| Chrome-style compact top toolbar (default) or top + bottom bars | Implemented | Setting: Toolbar layout | — | Manual |
| Auto-hide toolbars while scrolling | Implemented | Bars slide with the finger and the page is not resized mid-scroll; pages with their own inner scroll areas keep the bars | — | Manual |
| Pull to refresh | Implemented | Triggers only when the page is scrolled to the top; pages with inner scroll areas may trigger it early (can be turned off) | — | Manual |
| Site information sheet (connection, certificate, cookies, permissions, delete site data) | Implemented | Per-site cookie deletion clears the cookies the page can see | — | Manual |
| Animated tab switcher and tab transitions | Implemented | Chrome-style cards, tab search | — | Manual |
| Search panel (current page, most visited, recent searches) | Implemented | Recent searches are read from search-result pages in history; local only | — | `UrlResolverTest.recentSearchesAreReadFromResultPages` |
| Google Lens button | Implemented | Opens NAYON's own Lens camera (viewfinder, tap-to-focus, pinch zoom, flash, gallery). The photo is handed to the Google app's Lens; without the Google app, lens.google.com opens. Chrome's private direct link into Lens is reserved for Chrome | Google app (optional), camera permission | Manual |
| Google account button (home) | Implemented | Shows the Google account signed in on the web (photo, name, email); sign in, manage account, sign out and Google apps. No sync of passwords/bookmarks/history | — | Manual |
| AI Mode and Incognito buttons (home) | Implemented | AI Mode sends your question to Google AI Mode (google.com/search?udm=50) | — | Manual |
| Real site icons (favicons), high resolution | Implemented | Uses the site's declared apple-touch/manifest icons (checked once a week per site) | — | Manual |
| Home page: time-of-day sky scene, search, editable shortcuts, Quick access, Recent | Implemented | — | — | `newTabPageRendersInEveryThemeAndBrightness` |
| Downloads page (speed, time left, connections, pause/resume, type filters, date groups, thumbnails, storage use) | Implemented | — | — | Manual |
| Clear browsing data time range | Implemented | Only history can be limited by date; cookies and cache are cleared completely | — | Manual |
| Long-press menu for links and images (new tab, private tab, copy link/text, download, share, Lens) | Implemented | Uses WebView hit-testing; text long-press keeps the normal selection menu | — | Manual |
| Find in page | Implemented | — | — | Manual |
| Translate page | Implemented | Opens the page through Google Translate's website | — | Manual |
| Add to Home screen | Implemented | Needs a launcher that supports pinned shortcuts | — | Manual |
| Search suggestions from the search engine | Implemented (setting, on by default) | Typed text is sent to the selected engine; never in private tabs; not available for Yahoo/custom | — | `searchSuggestionsParseOpenSearchFormat` |
| Text size on websites | Implemented | WebView text zoom 50–200% | — | Manual |
| Swipe to close tabs, Undo close | Implemented | Undo keeps the last 10 closed tabs (address only) | — | Manual |
| Download complete notice with Open | Implemented | Opening APKs needs "Install unknown apps" permission for NAYON Browser | — | Manual |
| Optimized test build | Implemented | Test APKs are R8-optimized release builds signed with the shared test key | — | CI |
| Share page / copy link | Implemented | — | — | Manual |
| Open links from other apps; set as default browser | Implemented | User chooses default browser in Android settings | — | Manual |
| External app links (mailto:, tel:, intent:) | Implemented | Opened only after a user tap; fallback URL used when no app | — | Manual |
| Error pages (offline, not found, timeout, insecure, crashed) | Implemented | — | — | Manual |
| Website camera / microphone / location requests | Implemented (Stage 3) | See Stage 3 below | — | Manual |
| New logo (launcher, splash, in-app) | Implemented | — | — | Built by CI |
| Developer profile with photo (About, home page credit) | Implemented | — | — | Manual |

## Planned — later stages

| Feature | Status | Technical limitation | Required configuration | Testing evidence |
|---|---|---|---|---|
| Bookmark folders, reading list, import/export | Planned | — | — | — |
| Per-site settings, website permission prompts | Implemented (Stage 3) | See Stage 3 below | — | Manual |
| Encrypted password vault + biometric lock | Implemented (Stage 3) | See Stage 3 below | — | Manual |
| Android Autofill service (filling other apps) | Not implemented | NAYON fills its own web pages; it is not a system-wide autofill provider. Android's own autofill (e.g. Google Password Manager) keeps working inside NAYON pages | — | — |
| Google Sign-In | Planned (Stage 4) | — | Google Cloud project + OAuth client ID | — |
| Cloud sync | Planned (Stage 4) | Needs a backend; sign-in alone is not sync | Backend hosting, auth rules, deletion flow | — |
| Passkeys | Planned (Stage 4) — Partial expected | Depends on WebView WebAuthn support per version; per-site testing | — | — |
| PWA / web apps | Planned (Stage 4) — Partial | WebAPK install is Chrome-only; NAYON will add home-screen shortcuts that open a standalone window | — | — |
| Tracking protection / ad blocking | Planned (Stage 4) — Partial | Needs a maintained filter list and licence review | Filter list source | — |
| Page translation | Planned (Stage 4) | Needs a provider (e.g. ML Kit on-device or cloud API) | Provider credentials if cloud | — |
| Language selection | Planned | Strings are already externalised in `strings.xml` | Translations | — |
| Payments | Planned — disabled by default | Only official provider SDKs with server verification; Google Play Billing for digital goods | Provider account, backend | — |
| News / suggested content | Planned — off by default | Needs a content source | Content provider | — |
| Chrome Web Store extensions | **Unsupported** | WebView has no extension runtime | — | — |
| Alternative: built-in, sandboxed add-ons (reader mode, user CSS, force-dark pages) | Planned (Stage 4) | Limited to what the app implements itself | — | — |
| Guaranteed 120 fps web rendering | **Unsupported** | App UI follows display refresh rate; web content is rendered by WebView | — | — |
| Universal DRM / background playback | **Unsupported** | Depends on WebView, site and licence | — | — |

### v0.2.24 additions
| Feature | Status | Notes | Depends on | Tested |
|---|---|---|---|---|
| Remove suggestion from history (long-press in the search panel) | Implemented | Recent searches, history suggestions and most-visited sites | — | Manual |
| Text selection menu | Implemented | WebView's Copy / Cut / Paste / Select all / Share, plus NAYON's own Web search that opens results in a new NAYON tab | — | Manual |
| Chrome-style Back | Implemented | Page history checked live; sleeping tabs keep their history; a link-opened tab closes back to its parent; on the last page, press Back twice to leave | — | Manual |
| ⋮ menu as an in-window popup | Implemented | No separate dialog window, so it opens without stutter | — | Manual |
| Instant Undo for closed tabs | Implemented | The closed page stays alive (silenced) for 15 s, so Undo brings it back exactly as it was. Later restores use saved history (same page and scroll, may refetch) | — | Manual |
| Live background tabs | Implemented | Background tabs keep running instead of being paused. The number kept live depends on the phone's memory (2–9); when Android asks for memory, background tabs sleep with their history saved and wake in place. WebView itself still slows timers in hidden pages | — | Manual |

## Stage 3 — Storage & security
| Feature | Status | Notes | Depends on | Tested |
|---|---|---|---|---|
| Website permission prompts | Implemented | Camera, microphone, location and protected content. Chrome-style prompt: Allow while visiting / Allow this time / Don't allow, then Android's own permission dialog if needed. Private tabs never remember answers | Android permissions (asked only when a site needs them) | Manual |
| Site settings | Implemented | Settings → Site settings lists every remembered decision; change or reset per site, or reset all. Also in Site information (tap the icon in the address bar) | — | Manual |
| Password manager | Implemented | Settings → Passwords. Opening it needs fingerprint, face or screen lock. Search, show, copy (marked sensitive), open site, delete, delete all, "Never saved" list | Phone screen lock | Manual |
| Password encryption | Implemented | AES-256-GCM with a key in the Android Keystore (hardware-backed where available). Usernames and passwords are both encrypted. Stored only on this phone; never uploaded | — | Manual |
| Save password after sign-in | Implemented | Detects sign-in form submits on https pages (normal tabs only) through WebView's message channel; no Java object is exposed to pages. Save / Update / Never for this site / Not now | WebView with WEB_MESSAGE_LISTENER + DOCUMENT_START_SCRIPT (Android System WebView 86+) | Manual |
| Fill saved password | Implemented | On a sign-in page of a site with saved passwords, a "Sign in as …" bar appears; filling happens only when you tap it and only if the tab is still on the same site | Same as above | Manual |
| Passkeys / sync / export | Planned (Stage 4) | — | — | — |

### Autofill and passwords (v0.2.31)
| Feature | Status | Notes | Depends on | Tested |
|---|---|---|---|---|
| "Autofill and passwords" hub | Implemented | Settings → Autofill and passwords, laid out like Chrome: Password Manager, Payments, Contact info, Identity docs, Travel, Autofill settings | — | Manual |
| Payments: cards, IBANs, loyalty cards | Implemented | Encrypted (Android Keystore). Cards are offered on checkout forms ("Use Visa •••• 4242") after fingerprint / screen lock (can be turned off). "Save card?" after a checkout form is sent. The CVV is never saved | Screen lock to view | Manual |
| Contact info: addresses | Implemented | Offered on address / delivery forms; "Save address?" after such a form is sent | — | Manual |
| Identity docs, travel info, vehicles | Implemented (store & view) | Encrypted, behind fingerprint / screen lock; view, copy, edit. Not filled into web pages automatically | Screen lock | Manual |
| Autofill settings | Implemented | Switches for passwords, payments, card verification, addresses, and letting other Android autofill apps fill in NAYON; link to Android's autofill provider screen (Android 14+) | — | Manual |
| Passkeys | Not available | Android only lets approved browsers create/use passkeys for any website through WebView | Google allow-listing | — |

