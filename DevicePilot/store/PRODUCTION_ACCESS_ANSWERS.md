# DevicePilot — Answers for Google Play production access

Use this after the closed test (at least 12 testers for 14 days). In Play Console go to
**Dashboard → Apply for production**. Copy each answer into the matching box.

Text in **[square brackets]** must be replaced with what really happened in your test. Google compares
these answers with the real test data, so never write numbers or feedback that did not happen.

---

## Part 1 — About your closed test

### How easy was it to recruit testers for your app?
Pick the honest option. Usually: **Neither easy nor difficult**.

### Describe the engagement you received from testers during your closed test
```
[12] testers installed DevicePilot from the closed testing track and kept it installed for the full 14 days. Testers used it on different phones and Android versions ([e.g. Samsung, Xiaomi, Realme; Android 11–15]). They mainly used Device details, Battery health, Boost, Cool down, the Cleaner and the Apps manager, and opened the app several times a week to check battery health and temperature.
```

### Provide a summary of the feedback that you received from testers. Include how you collected the feedback.
```
We collected feedback through a WhatsApp group with the testers, direct messages, and the private feedback option on Google Play. Testers said the app is clean, fast and easy to understand, and liked seeing real battery health, charge cycles and device details in one place. Suggestions were: [write the real suggestions, e.g. "the permissions page appeared every time the app opened", "wanted the phone's own name on the home screen", "big-file scan should not freeze"]. [Write any crash or bug a tester reported, or "No crashes were reported."]
```

---

## Part 2 — About your app

### Who is the intended audience of your app?
```
Adult Android users (18+) who want to understand and look after their phone: see real device details, check battery health and charge cycles, monitor temperature, free up memory and storage, and manage installed apps. No technical knowledge is needed.
```

### Describe how your app provides value to users
```
DevicePilot puts the phone's real information and the most useful maintenance tools in one private app. Users can see their model, chipset, RAM, storage, cameras and display; check battery health, cycles, capacity and charging power; watch battery temperature and Android's thermal status; close background apps with Boost or Cool down; find app cache and big files and remove only what they choose; and search, review and uninstall apps. Every value comes from official Android APIs, and when a phone does not report a value the app says so instead of guessing. There is no account, no ads, no analytics and no server, so no personal data leaves the phone.
```

### How many installs do you expect your app to have in your first year?
Pick: **0 – 10K** (a safe, realistic choice for a first app).

---

## Part 3 — Production readiness

### What changes did you make to your app based on what you learned during your closed test?
```
[Write only the real changes made after tester feedback. Examples of changes already made during development:]
- The app now always opens on Home; the permissions page is shown only once after install and stays available in Settings.
- The Home card shows the name the user gave the phone instead of the internal model code.
- Big-file and cache scans run in the background with a progress bar and a Cancel button, so the app never freezes.
- Clearer explanations on each permission and on the Cleaner, and a redesigned bottom menu and Settings page.
```

### How did you decide that your app is ready for production?
```
During the 14-day closed test, testers used every main feature on different phones and Android versions without crashes or ANRs in Play Console's Android vitals. All tester issues were fixed and checked again in new test builds. The app passes our automated unit tests and on-device UI tests on every build, the store listing, privacy policy, terms and data-safety form are complete, and the permissions it uses are explained in the app and declared in Play Console.
```

---

## Answers already given in App content (for reference)

| Form | Answer |
|---|---|
| Privacy policy | https://ahoshan-habib-nayon.github.io/PROFILE/devicepilot-app/privacy.html |
| Sign-in details (App access) | No — nothing is restricted, no login |
| Ads | No ads |
| Content rating | All Other App Types; every question **No** → Everyone / 3+ |
| Target audience | 18 and over only; does not appeal to children |
| Data safety | Does not collect or share user data |
| Advertising ID | No |
| Government / Financial / Health / News | None |
| Trader status | Yes (applies to this app) |
| Terms of Service | https://ahoshan-habib-nayon.github.io/PROFILE/devicepilot-app/terms.html |
| Store settings | Category Tools; tags Network connectivity, Privacy & security, Tools; email support.webtecit@gmail.com; website https://webtecit.com/ |
| QUERY_ALL_PACKAGES | Core purpose: Apps Manager lists every installed app (text below); usage **App functionality**; video link added |

QUERY_ALL_PACKAGES core purpose text:
```
DevicePilot is a device manager. Its core feature is the Apps Manager, which lists every installed app so the user can search, review details, storage and background activity, and uninstall apps. The Cleaner shows cache size for each installed app and Running apps shows which installed apps are active. These features need the full list of installed apps; querying specific packages cannot provide it.
```

## Tips for the 14-day test
- Ask testers to open the app every few days, not only once; Google looks at real engagement.
- Ask each tester for one or two lines of feedback and save the messages — you need them for Part 1.
- If you change anything after feedback, upload a new build to the closed track during the test; it shows Google the test was used.
- If production access is refused, Google says why; fix it, keep testing for 14 more days, and apply again.
