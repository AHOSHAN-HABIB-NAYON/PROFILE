package com.appfix.core.build

import com.appfix.core.analysis.GradleCompat
import com.appfix.core.project.Framework
import com.appfix.core.project.ProjectInfo
import kotlinx.serialization.Serializable
import java.io.File

@Serializable
enum class BuildVariant(val displayName: String, val gradleTask: String) {
    DEBUG_APK("Debug APK (installable for testing)", "assembleDebug"),
    RELEASE_APK("Release APK (unsigned — sign it on this device)", "assembleRelease"),
    RELEASE_AAB("Release App Bundle (AAB, for Google Play)", "bundleRelease"),
}

data class UploadFile(val path: String, val size: Long, val executable: Boolean)

data class UploadPlan(val files: List<UploadFile>, val totalBytes: Long, val excluded: List<String>, val warnings: List<String>)

class BuildPlanException(message: String) : RuntimeException(message)

/** Decides what is uploaded to the build worker and which commands run there. */
object BuildPlanner {
    const val WORKFLOW_PATH = ".github/workflows/appfix-build.yml"
    const val BRANCH_PREFIX = "appfix-build/"
    const val MAX_FILES = 4000
    const val MAX_TOTAL_BYTES = 80L * 1024 * 1024
    const val MAX_FILE_BYTES = 40L * 1024 * 1024

    private val skipDirs = setOf("build", ".gradle", ".idea", ".git", ".cxx", ".externalNativeBuild", "node_modules", ".dart_tool", ".kotlin", "Pods", ".expo")
    /** Signing material and machine-local files are never uploaded. */
    private val secretPatterns = listOf(
        Regex(".*\\.(jks|keystore|p12|pfx|pem|key)$", RegexOption.IGNORE_CASE),
        Regex("(^|.*/)keystore\\.properties$"), Regex("(^|.*/)signing\\.properties$"), Regex("(^|.*/)local\\.properties$"),
        Regex("(^|.*/)\\.env(\\..*)?$"),
    )

    fun isSecret(path: String) = secretPatterns.any { it.matches(path) }

    fun uploadPlan(projectRoot: File): UploadPlan {
        val files = mutableListOf<UploadFile>()
        val excluded = mutableListOf<String>()
        val warnings = mutableListOf<String>()
        var total = 0L
        projectRoot.walkTopDown().onEnter { it == projectRoot || it.name !in skipDirs }.filter { it.isFile }.forEach { f ->
            val rel = f.relativeTo(projectRoot).invariantSeparatorsPath
            when {
                rel == WORKFLOW_PATH -> excluded += "$rel (replaced by the AppFix build workflow)"
                isSecret(rel) -> excluded += "$rel (signing material / local configuration is never uploaded)"
                f.length() > MAX_FILE_BYTES -> excluded += "$rel (larger than ${MAX_FILE_BYTES / 1024 / 1024} MB)"
                else -> {
                    total += f.length()
                    files += UploadFile(rel, f.length(), f.name == "gradlew" || f.extension == "sh")
                }
            }
        }
        if (files.size > MAX_FILES) throw BuildPlanException("The project has ${files.size} files; cloud builds support up to $MAX_FILES.")
        if (total > MAX_TOTAL_BYTES) throw BuildPlanException("The project is ${total / 1024 / 1024} MB; cloud builds support up to ${MAX_TOTAL_BYTES / 1024 / 1024} MB.")
        if (excluded.any { it.contains("signing material") }) warnings += "Keystores and signing files were left out. Release builds are produced unsigned and signed on this device."
        return UploadPlan(files.sortedBy { it.path }, total, excluded, warnings)
    }

    /** JDK required by the project's Android Gradle Plugin. */
    fun jdkFor(info: ProjectInfo): String {
        val major = GradleCompat.major(info.agpVersion)
        val minor = info.agpVersion?.let { GradleCompat.majorMinor(it) }?.substringAfter('.')?.toIntOrNull() ?: 0
        return when {
            major == null -> "17"
            major >= 8 -> "17"
            major == 7 && minor >= 0 -> "11"
            else -> "8"
        }
    }

    fun workflow(info: ProjectInfo, variant: BuildVariant): String {
        val androidDir = info.androidDir
        val projectRoot = "."
        val gradleDir = when {
            androidDir == null -> null
            androidDir.isEmpty() -> "."
            else -> androidDir
        }
        val jdk = jdkFor(info)
        val steps = StringBuilder()
        fun step(s: String) = steps.append(s.trimIndent().prependIndent("      ")).append("\n")
        step("""
            - uses: actions/checkout@v4
            - uses: actions/setup-java@v4
              with:
                distribution: temurin
                java-version: "$jdk"
        """)
        val flutterTask = when (variant) { BuildVariant.DEBUG_APK -> "apk --debug"; BuildVariant.RELEASE_APK -> "apk --release"; BuildVariant.RELEASE_AAB -> "appbundle --release" }
        when (info.framework) {
            Framework.FLUTTER -> step("""
                - uses: subosito/flutter-action@v2
                  with:
                    channel: stable
                - name: Build
                  run: |
                    flutter pub get
                    flutter build $flutterTask
            """)
            Framework.REACT_NATIVE, Framework.EXPO, Framework.CAPACITOR, Framework.CORDOVA -> {
                step("""
                    - uses: actions/setup-node@v4
                      with:
                        node-version: "20"
                    - name: Install JavaScript dependencies
                      run: |
                        if [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile; elif [ -f package-lock.json ]; then npm ci; else npm install; fi
                """)
                if (info.framework == Framework.EXPO && androidDir == null) step("""
                    - name: Generate native Android project
                      run: npx expo prebuild --platform android --no-install
                """)
                if (info.framework == Framework.CAPACITOR) step("""
                    - name: Sync web assets
                      run: |
                        npm run build --if-present
                        npx cap sync android
                """)
                if (info.framework == Framework.CORDOVA) step("""
                    - name: Build
                      run: npx cordova build android ${if (variant == BuildVariant.DEBUG_APK) "--debug" else "--release"}
                """) else step(gradleStep(gradleDir ?: "android", variant))
            }
            else -> {
                if (gradleDir == null) throw BuildPlanException("${info.framework.displayName} projects cannot be built by AppFix Studio's cloud build.")
                step("- uses: gradle/actions/setup-gradle@v4")
                step(gradleStep(gradleDir, variant))
            }
        }
        step("""
            - name: Upload outputs
              uses: actions/upload-artifact@v4
              with:
                name: appfix-output
                if-no-files-found: error
                retention-days: 7
                path: |
                  **/build/outputs/apk/**/*.apk
                  **/build/outputs/bundle/**/*.aab
                  **/build/app/outputs/flutter-apk/*.apk
                  **/build/app/outputs/bundle/**/*.aab
                  **/platforms/android/app/build/outputs/**/*.apk
        """)
        return """
            |# Generated by AppFix Studio. Runs on GitHub-hosted runners in your own repository.
            |name: AppFix Studio build
            |on:
            |  push:
            |    branches: ["$BRANCH_PREFIX**"]
            |permissions:
            |  contents: read
            |concurrency:
            |  group: ${'$'}{{ github.ref }}
            |  cancel-in-progress: true
            |jobs:
            |  build:
            |    runs-on: ubuntu-latest
            |    timeout-minutes: 40
            |    defaults:
            |      run:
            |        working-directory: $projectRoot
            |    steps:
            |""".trimMargin() + "\n" + steps.toString()
    }

    private fun gradleStep(dir: String, variant: BuildVariant) = """
        - name: Build with Gradle
          working-directory: $dir
          run: |
            if [ -f ./gradlew ]; then chmod +x ./gradlew && ./gradlew ${variant.gradleTask} --stacktrace; else gradle ${variant.gradleTask} --stacktrace; fi
    """

    /** Picks the most relevant output from an extracted artifact directory. */
    fun pickOutput(dir: File, variant: BuildVariant): File? {
        val files = dir.walkTopDown().filter { it.isFile }.toList()
        val wanted = if (variant == BuildVariant.RELEASE_AAB) "aab" else "apk"
        val candidates = files.filter { it.extension == wanted }
        return candidates.sortedWith(compareBy({ if (it.name.contains("androidTest")) 1 else 0 }, { if (it.name.contains("universal")) 0 else 1 }, { -it.length() })).firstOrNull()
    }
}
