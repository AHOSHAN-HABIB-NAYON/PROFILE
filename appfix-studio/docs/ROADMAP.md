# Roadmap and phase status

Legend: ✅ done and tested · 🟡 partial · ⏳ not started · ⛔ blocked / not feasible on-device

| Phase | Scope | Status |
|---|---|---|
| 1 | Repository setup, architecture, Material 3 UI, file picker, dashboard | ✅ |
| 2 | ZIP/GitHub/folder import, APK inspection, backups, project explorer | ✅ |
| 3 | Code editor, resource editor, project search UI, diff viewer | 🟡 diff viewer and search engine done; editor UI next |
| 4 | Visual layout editor, button/text insertion, About page and other generators | ⏳ (XML edit primitives exist in `core/xml`) |
| 5 | Icon, logo, splash, theme and animation editor | ⏳ |
| 6 | Build engine (CI / worker), logs, artifact validation, signing | 🟡 build-log analysis + APK validation done; backends not started |
| 7 | APK resource/manifest modification and re-signing | 🟡 binary XML writer done; re-signing UI not started |
| 8 | AI repair assistant, secure patch application, cloud build | 🟡 ChangeSet review/apply/undo pipeline ready for AI patches |
| 9 | Tests, performance, accessibility, release packaging | 🟡 tests run in CI for every push |

## Known gaps

* No on-device Gradle builds (⛔ by design — see SECURITY_AND_LIMITATIONS.md).
* No release signing in CI yet (needs repository secrets the owner must add).
* Apktool/JADX workflows require a build worker that does not exist yet.
* Compose (Kotlin) layouts cannot be edited visually; the visual editor will target XML layouts first.
