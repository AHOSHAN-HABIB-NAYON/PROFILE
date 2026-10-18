package com.appfix.core.analysis

import kotlinx.serialization.Serializable
import java.io.File

@Serializable
enum class BuildOutcome { SUCCESS, FAILURE, UNKNOWN }

@Serializable
data class BuildLogReport(val outcome: BuildOutcome, val failedTask: String?, val findings: List<Finding>)

/**
 * Extracts actionable errors from Gradle / Kotlin / Java / AAPT2 build output.
 * File paths from the build machine are mapped back to workspace paths when possible.
 */
object BuildLogAnalyzer {
    fun analyze(log: String, workspace: File? = null, projectRoot: String = ""): BuildLogReport {
        val lines = log.lines()
        val findings = mutableListOf<Finding>()
        val outcome = when {
            lines.any { it.contains("BUILD FAILED") || it.contains("FAILURE: Build failed") } -> BuildOutcome.FAILURE
            lines.any { it.contains("BUILD SUCCESSFUL") } -> BuildOutcome.SUCCESS
            else -> BuildOutcome.UNKNOWN
        }
        val failedTask = Regex("""Execution failed for task '([^']+)'""").find(log)?.groupValues?.get(1)
        val fileIndex by lazy { workspace?.let(::indexFiles).orEmpty() }
        fun map(path: String): String? {
            val p = path.removePrefix("file://").replace('\\', '/')
            if (workspace == null) return null
            // Longest suffix of the build-machine path that exists in the workspace wins.
            val parts = p.split('/').filter { it.isNotEmpty() }
            for (i in parts.indices) {
                val suffix = parts.drop(i).joinToString("/")
                fileIndex[suffix]?.let { return it }
            }
            return null
        }
        fun add(rule: String, sev: Severity, cert: Certainty, cat: String, title: String, desc: String, path: String? = null, line: Int? = null,
                fix: String? = null, fixLabel: String? = null, fixData: Map<String, String> = emptyMap()) {
            findings += Finding(rule, sev, cert, cat, title, desc, file = path?.let(::map) ?: path?.takeIf { workspace == null }, line = line,
                suggestedFix = fix, fixLabel = fixLabel, fixData = fixData)
        }

        for (raw in lines) {
            val line = raw.trim()
            Regex("""^e:\s+(?:file://)?(/?[^:]+\.(?:kt|kts)):(\d+):(\d+)\s+(.+)$""").find(line)?.let {
                add("build.kotlin_error", Severity.ERROR, Certainty.CONFIRMED, Categories.CODE, "Kotlin: ${it.groupValues[4].take(140)}", it.groupValues[4], it.groupValues[1], it.groupValues[2].toInt())
                return@let
            } ?: Regex("""^e:\s+(/?[^:]+\.(?:kt|kts)):\s*\((\d+),\s*(\d+)\):\s+(.+)$""").find(line)?.let {
                add("build.kotlin_error", Severity.ERROR, Certainty.CONFIRMED, Categories.CODE, "Kotlin: ${it.groupValues[4].take(140)}", it.groupValues[4], it.groupValues[1], it.groupValues[2].toInt())
            }
            Regex("""^(/?\S+\.java):(\d+):\s+error:\s+(.+)$""").find(line)?.let {
                add("build.java_error", Severity.ERROR, Certainty.CONFIRMED, Categories.CODE, "Java: ${it.groupValues[3].take(140)}", it.groupValues[3], it.groupValues[1], it.groupValues[2].toInt())
            }
            Regex("""(?:ERROR:\s*)?(/?\S+\.xml):(\d+):\s+AAPT:\s+error:\s+(.+)$""").find(line)?.let {
                add("build.aapt_error", Severity.ERROR, Certainty.CONFIRMED, Categories.RESOURCES, "Resource error: ${it.groupValues[3].take(140)}", it.groupValues[3], it.groupValues[1], it.groupValues[2].toInt(),
                    fix = if (it.groupValues[3].contains("not found")) "Define the missing resource or fix the reference." else null)
            }
            Regex("""(/?\S*AndroidManifest\.xml):(\d+):\d+(?:-\d+:\d+)?\s+Error:\s*$""").find(line)?.let {
                add("build.manifest_merger", Severity.ERROR, Certainty.CONFIRMED, Categories.MANIFEST, "Manifest merger error", "See the next lines of the log for details.", it.groupValues[1], it.groupValues[2].toInt())
            }
        }
        Regex("""Manifest merger failed\s*:\s*(.+)""").find(log)?.let { m ->
            val msg = m.groupValues[1].trim()
            if (msg.contains("android:exported")) {
                add("build.manifest_exported", Severity.ERROR, Certainty.CONFIRMED, Categories.MANIFEST, "android:exported must be set explicitly", msg,
                    fix = "Run the project analysis: it can add android:exported automatically.")
            } else {
                add("build.manifest_merger", Severity.ERROR, Certainty.CONFIRMED, Categories.MANIFEST, "Manifest merger failed", msg)
            }
        }
        Regex("""Minimum supported Gradle version is ([\d.]+)\. Current version is ([\d.]+)""").find(log)?.let { m ->
            val props = workspace?.let { findWrapperProps(it, projectRoot) }
            add("gradle.version_too_old", Severity.ERROR, Certainty.CONFIRMED, Categories.BUILD, "Gradle ${m.groupValues[2]} is too old",
                "The Android Gradle Plugin needs Gradle ${m.groupValues[1]} or newer.", fix = "Update the wrapper to Gradle ${m.groupValues[1]}.",
                fixLabel = props?.let { "Use Gradle ${m.groupValues[1]}" }, fixData = props?.let { mapOf("path" to it, "gradleVersion" to m.groupValues[1]) }.orEmpty())
        }
        Regex("""Dependency '([^']+)' requires libraries and applications that\s+depend on it to compile against version (\d+) or later""").findAll(log).map { it }.toList().maxByOrNull { it.groupValues[2].toInt() }?.let { m ->
            val build = workspace?.let { findAppBuildFile(it, projectRoot) }
            add("build.compile_sdk_too_low", Severity.ERROR, Certainty.CONFIRMED, Categories.SDK, "compileSdk must be ${m.groupValues[2]} or higher",
                "${m.groupValues[1]} requires compileSdk ${m.groupValues[2]}.", fix = "Raise compileSdk to ${m.groupValues[2]}.",
                fixLabel = build?.let { "Set compileSdk to ${m.groupValues[2]}" }, fixData = build?.let { mapOf("path" to it, "compileSdk" to m.groupValues[2]) }.orEmpty())
        }
        Regex("""Could not (?:resolve|find)\s+(?:all files for configuration\s+)?([\w.\-]+:[\w.\-]+(?::[\w.\-+]+)?)""").findAll(log).map { it.groupValues[1] }.distinct().take(10).forEach { dep ->
            add("build.dependency_unresolved", Severity.ERROR, Certainty.CONFIRMED, Categories.BUILD, "Could not resolve $dep",
                "The dependency could not be downloaded. The version may not exist, a repository (google(), mavenCentral()) may be missing, or the network was unavailable.",
                fix = "Check the coordinates and version, and that the repositories block includes the repository hosting it.")
        }
        if (log.contains("SDK location not found")) add("build.sdk_missing", Severity.ERROR, Certainty.CONFIRMED, Categories.BUILD, "Android SDK not found",
            "The build machine has no ANDROID_HOME or sdk.dir.", fix = "Set ANDROID_HOME on the build machine.")
        Regex("""Unsupported class file major version (\d+)""").find(log)?.let {
            add("build.jdk_too_new", Severity.ERROR, Certainty.CONFIRMED, Categories.BUILD, "JDK is too new for this Gradle version",
                "Gradle cannot read class files of major version ${it.groupValues[1]} (Java ${it.groupValues[1].toInt() - 44}).", fix = "Use an older JDK (for example 17) or upgrade Gradle.")
        }
        Regex("""Android Gradle plugin requires Java (\d+) to run""").find(log)?.let {
            add("build.jdk_too_old", Severity.ERROR, Certainty.CONFIRMED, Categories.BUILD, "Java ${it.groupValues[1]}+ is required", it.value, fix = "Run the build with JDK ${it.groupValues[1]} or newer.")
        }
        Regex("""Duplicate class ([\w.$]+) found in modules ([^\n]+)""").find(log)?.let {
            add("build.duplicate_class", Severity.ERROR, Certainty.CONFIRMED, Categories.BUILD, "Duplicate class ${it.groupValues[1]}",
                "Two dependencies contain the same class: ${it.groupValues[2].take(200)}", fix = "Exclude one of the conflicting dependencies or align their versions.")
        }
        if (Regex("""Namespace not specified""").containsMatchIn(log)) add("build.namespace", Severity.ERROR, Certainty.CONFIRMED, Categories.BUILD,
            "Namespace not specified", "AGP 8+ requires namespace in the module's android { } block.", fix = "Run the project analysis to move the manifest package to namespace.")
        Regex("""Could not find method (compile|testCompile|provided|apk)\(\)""").find(log)?.let {
            add("build.removed_configuration", Severity.ERROR, Certainty.CONFIRMED, Categories.BUILD, "'${it.groupValues[1]}' configuration was removed",
                it.value, fix = "Run the project analysis: it can replace removed configurations automatically.")
        }
        if (outcome == BuildOutcome.FAILURE && findings.isEmpty()) {
            val what = Regex("""\* What went wrong:\s*\n([^\n]+(?:\n[^*\n][^\n]*){0,4})""").find(log)?.groupValues?.get(1)?.trim()
            add("build.failed", Severity.ERROR, Certainty.CONFIRMED, Categories.BUILD, "Build failed" + (failedTask?.let { " in $it" } ?: ""),
                what ?: "No recognised error pattern. Read the full log for details.")
        }
        return BuildLogReport(outcome, failedTask, findings.distinctBy { it.key })
    }

    private fun indexFiles(ws: File): Map<String, String> {
        val map = HashMap<String, String>()
        ws.walkTopDown().onEnter { it.name !in setOf("build", ".gradle", ".git", "node_modules") }.filter { it.isFile }.forEach { f ->
            val rel = f.relativeTo(ws).invariantSeparatorsPath
            val parts = rel.split('/')
            for (i in parts.indices) map.putIfAbsent(parts.drop(i).joinToString("/"), rel)
        }
        return map
    }

    private fun findWrapperProps(ws: File, root: String): String? =
        ws.walkTopDown().maxDepth(5).firstOrNull { it.isFile && it.name == "gradle-wrapper.properties" && it.invariantSeparatorsPath.contains(root) }?.relativeTo(ws)?.invariantSeparatorsPath

    private fun findAppBuildFile(ws: File, root: String): String? =
        ws.walkTopDown().maxDepth(5).onEnter { it.name != "build" }.firstOrNull { f ->
            f.isFile && (f.name == "build.gradle" || f.name == "build.gradle.kts") && f.readText().let {
                (it.contains("com.android.application") || it.contains("android.application")) && Regex("""(?m)^\s*android\s*\{""").containsMatchIn(it)
            }
        }?.relativeTo(ws)?.invariantSeparatorsPath?.takeIf { it.contains(root) }
}
