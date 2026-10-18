# Roadmap and phase status

Legend: ✅ done and tested · 🟡 partial · ⏳ not started · ⛔ blocked / not feasible on-device

| Phase | Scope | Status |
|---|---|---|
| 1 | Repository setup, architecture, Material 3 UI, file picker, dashboard | ✅ |
| 2 | ZIP/GitHub/folder import, APK inspection, backups, project explorer | ✅ |
| 3 | Code editor, resource editor, project search, diff viewer | ✅ |
| 4 | Visual layout editor, component insertion, click actions, feature generators | ✅ generated code compiled by CI (3 project styles) |
| 5 | Icon, name, theme, font, splash, transition and Lottie branding | ✅ compiled by CI |
| 6 | Cloud build (GitHub Actions), logs, artifacts, keystores, signing, install | ✅ (GitHub API flow tested against a fake server; real runs need your token) |
| 7 | APK manifest/image modification and re-signing | ✅ for version, label and raster images; ⛔ resources/code (needs Apktool worker) |
| 8 | AI assistant, secure patch application, validation | ✅ provider calls tested against a local fake server; no key is shipped |
| 9 | Tests, performance, accessibility, release packaging | 🟡 tests run in CI on every push; release signing and UI tests pending |

## Known gaps

* No on-device Gradle builds (⛔ by design, see SECURITY_AND_LIMITATIONS.md). Builds run on GitHub Actions.
* Release signing in CI needs repository secrets that the owner must add.
* Apktool/JADX workflows (decoding resources, Smali edits) need a separate build worker, which is not included.
* Compose layouts cannot be edited visually. The visual editor works on XML layouts, and Compose screens are generated as code.
* The AI assistant only sees files you share, and its fixes are confirmed only by a build.
