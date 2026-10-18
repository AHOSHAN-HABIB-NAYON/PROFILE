# AppFix Studio — Architecture

## Modules

| Module | Type | Purpose |
|---|---|---|
| `core` | Pure Kotlin/JVM library | Everything that can be tested without Android: APK parsing, archive safety, project detection, analysis rules, repairs, diffs, change application/undo, backups, search, log analysis. |
| `app` | Android application (Compose) | UI, Storage Access Framework imports, Room/DataStore persistence, PackageManager icon extraction, apksig verification. |
| `sample-project` | Separate Gradle build | A small Kotlin + XML-layout app used as a test fixture and bundled into the app as an importable sample. |

Keeping logic in `core` means almost every behaviour is covered by fast JVM unit tests, and CI can run
the same code against a real APK produced by the sample build.

## `core` packages

```
com.appfix.core
├── apk/        Binary XML (AXML) parser + writer, resources.arsc reader, signing-block inspector, ApkInspector
├── archive/    ZIP central-directory reader, SafeZipExtractor, DirectoryZipper
├── project/    ProjectDetector, Gradle script / version catalog reader, ProjectInfo model
├── analysis/   ProjectAnalyzer rules, RepairEngine fixes, ResourceIndex, CrashLogAnalyzer, BuildLogAnalyzer, GradleCompat
├── patch/      ChangeSet model, Diff (java-diff-utils), ChangeApplier (validate / apply / undo / history)
├── backup/     SnapshotManager (full workspace backups)
├── search/     ProjectSearch (search + replace-all as a reviewable ChangeSet)
├── xml/        Offset-tracking XML source parser and formatting-preserving edits
└── util/       Hashing, cancellation, progress, path safety, Base64 (API 24 compatible)
```

### Change pipeline (repairs, editors, AI patches)

Every modification — an automatic repair, a search-and-replace, and later visual-editor changes,
feature generators and AI patches — is expressed as a `ChangeSet` (list of `FileChange(path, before, after)`).

1. A producer computes the change from the files **as they are now** (nothing is written).
2. The UI renders `Diff.structured(change)` for review.
3. `ChangeApplier.validate` rejects unsafe paths (absolute, `..`, outside the workspace) and stale
   proposals (file content no longer equals `before`).
4. `ChangeApplier.apply` records the change in `history/` first, then writes files atomically and
   rolls back if any write fails.
5. `ChangeApplier.undo` restores `before` content, refusing if files were edited afterwards unless the
   user explicitly forces it.

Large changes (3+ files) trigger a full backup first when the setting is on.

### Analysis

`ProjectAnalyzer` produces `Finding`s with a severity (error/warning/info) **and** a certainty:

* **Confirmed** – provably wrong (e.g. malformed XML, removed Gradle configuration, AGP/Gradle mismatch).
* **Likely** – depends on information static analysis cannot see (e.g. a resource that may come from a library).
* **Suggestion** – improvements.

Findings that have a deterministic fix carry `fixLabel` + `fixData`; `RepairEngine.createFix` turns
them into a `ChangeSet`. Current rules: missing Gradle wrapper / wrapper JAR, Gradle too old for AGP,
JCenter, removed dependency configurations, machine-specific `sdk.dir`, missing namespace (AGP 8),
leftover manifest `package`, missing `android:exported` (API 31+), missing launcher activity, hard-coded
`debuggable`, manifest classes missing from sources, malformed resource XML, invalid resource file names,
duplicate resources, undefined resource references, network code without `INTERNET`, SDK level
inconsistencies.

## `app` architecture

* Single activity, Jetpack Compose + Material 3, type-safe Navigation Compose routes.
* Manual dependency container (`AppContainer`) — no DI framework.
* `ProjectRepository` orchestrates imports and calls into `core` on `Dispatchers.IO/Default`.
* Room stores project metadata (`projects` table); reports are cached as JSON next to each project.
* DataStore Preferences stores settings (theme, editor options, current project, auto-backup).

### On-device storage layout (app-private)

```
files/projects/<id>/original/   untouched imported APK (read-only)
files/projects/<id>/workspace/  editable source tree
files/projects/<id>/history/    applied change sets (undo)
files/projects/<id>/backups/    full workspace backups (zip + json)
files/projects/<id>/reports/    apk-report.json, project-info.json, analysis.json, icon.png
cache/imports/                  temporary downloads, deleted after import
```

## Build engine (design for Phase 6)

Phones cannot run the Android SDK + Gradle toolchain reliably, so builds are delegated through a
pluggable interface:

```kotlin
interface BuildBackend {
    suspend fun submit(project: File, request: BuildRequest): BuildHandle
    fun events(handle: BuildHandle): Flow<BuildEvent>   // log lines, status, exit code, duration
    suspend fun cancel(handle: BuildHandle)
    suspend fun artifacts(handle: BuildHandle): List<BuildArtifact>
}
```

Planned backends:

1. **GitHub Actions** — push the workspace to a user-owned repository/branch and dispatch a workflow;
   stream job logs; download the artifact; validate it with `ApkInspector` + apksig.
2. **Self-hosted worker** — an authenticated Node.js service that runs each job in a disposable,
   resource-limited container (CPU, memory, disk, time), with no access to other jobs or secrets.

Build logs are fed into `BuildLogAnalyzer`, which maps errors back to workspace files and offers fixes.

## APK modification (design for Phase 7)

* **Without a worker** (on-device): manifest edits via `AxmlParser` → edit → `AxmlWriter`, swapping
  same-name drawable files, then re-signing with apksig (`ApkSigner`). This does not need resource
  recompilation.
* **With a worker**: Apktool decode/rebuild for resource and Smali changes; JADX for read-only code
  inspection. Output must always be re-signed with the user's key.
* Never supported: signature-check bypass, licence circumvention, integrity-check evasion.
