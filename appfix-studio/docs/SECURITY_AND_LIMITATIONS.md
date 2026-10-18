# Security and compatibility limitations

AppFix Studio is meant for apps **you own or are authorised to modify**. It does not implement signature
bypass, licence circumvention, credential theft, malware injection or security-control evasion.

## Import safety

| Threat | Mitigation |
|---|---|
| Zip-slip / path traversal | Any entry with an absolute path, a drive letter, `..` segments or a NUL byte aborts the whole import. Resolved paths are re-checked against the canonical project directory. |
| Symbolic links | Detected from the ZIP central directory's Unix mode bits and never created. |
| Zip bombs | Per-file (512 MB), total (2 GB), entry-count (50 000) and compression-ratio limits; actual bytes written are counted, so lying headers are caught. |
| Encrypted archives | Rejected. |
| Executable payloads | `.exe .dll .bat .cmd .ps1 .vbs .msi …` are skipped and listed. Shell scripts such as `gradlew` are kept but never executed on the device. |
| Partial imports | Any failure or cancellation deletes everything written so far. |
| GitHub tokens | Used for a single HTTPS request and never stored. |

## Change safety

* All file changes go through `ChangeApplier`, which rejects paths outside the workspace and stale
  proposals, writes atomically and records undo information first.
* Automatic fixes are shown as diffs and applied only after the user confirms.
* Backups can be created at any time and are created automatically before larger fixes.

## What static analysis cannot do

* It cannot detect every runtime problem. A clean report does not mean the app works.
* Library resources and classes are invisible, so some "Likely" findings may be false positives.
* Gradle scripts are pattern-matched, not executed; values computed in code are not resolved.

## APK limitations

* Decompiled Java/Kotlin (JADX) is not the original source and is usually not rebuildable.
* Smali edits require Dalvik bytecode knowledge and can easily break an app.
* Flutter, React Native (especially Hermes), Unity/IL2CPP and Xamarin/.NET apps keep their logic in
  formats that cannot be meaningfully edited from an APK. Use the source project.
* Obfuscated apps, native libraries, encrypted assets and server-side controls limit what can change.
* Any rebuilt APK must be re-signed. A different signing key means the APK cannot update an existing
  installation, and apps with signature or integrity checks may refuse to run.
* To publish an update to an existing Play Store app you need the original upload/signing key.

## Signing material

* Keystores, passwords and API keys are never committed to the repository (see `.gitignore`).
* CI release signing (when added) will read secrets from GitHub repository secrets only and will never
  upload signing material as an artifact.

## Builds

* A normal Android phone cannot reliably run the full Android SDK and Gradle toolchain, so AppFix Studio
  does not pretend to build on-device. Builds will run on CI or an isolated cloud worker.
