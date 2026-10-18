# Release packaging

## Builds

| Build | How | Signing |
|---|---|---|
| Debug | `./gradlew :app:assembleDebug` | Android debug key; app id `com.appfix.studio.debug` |
| Release (local) | `./gradlew :app:assembleRelease` | Unsigned (`app-release-unsigned.apk`) unless the variables below are set |
| Release (CI check) | every push | Signed with a throwaway key generated on the runner, only so the device smoke test can install it |
| Release (published) | push a tag `appfix-studio-vX.Y.Z` | The owner's upload key from repository secrets |

Release builds use R8 (code shrinking and optimisation) and resource shrinking. Keep rules are in
`app/proguard-rules.pro`. Every CI run installs the minified build on an API 24 emulator and an API 35
emulator, walks the main screens and imports the sample project. A missing keep rule therefore fails CI
instead of crashing for users.
`mapping.txt` is attached to each release for de-obfuscating stack traces.

## Signing from the environment

The build reads signing data only from environment variables. Nothing is stored in Gradle files or
`keystore.properties`:

```bash
export APPFIX_RELEASE_KEYSTORE=/secure/path/upload.p12
export APPFIX_RELEASE_KEY_ALIAS=upload
read -rs APPFIX_RELEASE_STORE_PASSWORD; export APPFIX_RELEASE_STORE_PASSWORD
./gradlew :app:assembleRelease :app:bundleRelease
```

## Publishing a release

1. Create an upload key, either in AppFix Studio (Signing → New keystore) or with `keytool`. Store it outside
   the repository and back it up. Losing it means you cannot update the app.
2. Add the repository secrets `APPFIX_RELEASE_KEYSTORE_BASE64` (`base64 -w0 upload.p12`),
   `APPFIX_RELEASE_STORE_PASSWORD`, `APPFIX_RELEASE_KEY_ALIAS` and, optionally, `APPFIX_RELEASE_KEY_PASSWORD`.
3. Bump `versionCode` / `versionName` in `app/build.gradle.kts`, then push the tag
   `appfix-studio-v<versionName>`.
4. `.github/workflows/appfix-studio-release.yml` runs the tests and lint, builds the signed APK and AAB,
   verifies the APK signature, and creates a GitHub release with the APK, AAB, mapping file and SHA-256 sums.
   It fails with a clear error if the secrets are missing.
