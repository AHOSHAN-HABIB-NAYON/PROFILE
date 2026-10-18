package com.appfix.core.analysis

import com.appfix.core.project.GradleModule
import com.appfix.core.project.ModuleType
import com.appfix.core.project.ProjectInfo
import com.appfix.core.util.CancelToken
import com.appfix.core.xml.XmlDocumentSource
import com.appfix.core.xml.XmlNode
import com.appfix.core.xml.XmlSource
import com.appfix.core.xml.XmlSyntaxException
import java.io.File

/**
 * Static analysis of a source project. Rules only report what can be determined from files; they
 * cannot see library resources, generated code, or runtime behaviour.
 */
class ProjectAnalyzer(private val workspace: File) {

    private class Ctx(val ws: File, val info: ProjectInfo, val cancel: CancelToken) {
        val root = if (info.root.isEmpty()) ws else File(ws, info.root)
        val findings = mutableListOf<Finding>()
        var files = 0
        fun wsPath(rootRel: String) = if (info.root.isEmpty()) rootRel else "${info.root}/$rootRel"
        fun file(rootRel: String) = File(root, rootRel)
        val gradleDir: String? = info.androidDir
        fun gradlePath(rel: String) = if (gradleDir.isNullOrEmpty()) rel else "$gradleDir/$rel"
        val manifests = HashMap<String, XmlDocumentSource?>()
    }

    fun analyze(info: ProjectInfo, cancel: CancelToken = CancelToken.NONE): AnalysisReport {
        val start = System.currentTimeMillis()
        val ctx = Ctx(workspace, info, cancel)
        if (info.androidDir == null) {
            ctx.findings += Finding(
                "project.no_android_build", Severity.INFO, Certainty.CONFIRMED, Categories.PROJECT,
                "No Android Gradle build found",
                "This project (${info.framework.displayName}) has no Gradle Android build that AppFix Studio can analyse. Files can still be browsed and edited.",
                suggestedFix = info.buildCommand?.let { "Build with: $it" },
            )
        } else {
            checkGradleSetup(ctx)
            for (m in info.modules) {
                cancel.throwIfCancelled()
                checkModule(ctx, m)
            }
            checkResources(ctx)
            checkSources(ctx)
        }
        val limitations = listOf(
            "Static analysis cannot detect every runtime problem. Rebuild and test the app to confirm fixes.",
            "Resources and classes provided by libraries are not visible, so some missing-reference findings may be false positives.",
            "Gradle scripts are read with pattern matching, not executed; values computed in code are not resolved.",
        )
        val ordered = ctx.findings.distinctBy { it.key }.sortedWith(compareBy({ it.severity.ordinal }, { it.certainty.ordinal }, { it.category }, { it.file }, { it.line }))
        return AnalysisReport(ordered, ctx.files, System.currentTimeMillis() - start, limitations)
    }

    // ---------------------------------------------------------------- Gradle

    private fun checkGradleSetup(ctx: Ctx) {
        val info = ctx.info
        val propsRel = ctx.gradlePath("gradle/wrapper/gradle-wrapper.properties")
        if (!info.hasGradleWrapper) {
            ctx.findings += Finding(
                "gradle.no_wrapper", Severity.WARNING, Certainty.CONFIRMED, Categories.BUILD,
                "Gradle wrapper is missing",
                "The project has no gradlew script and wrapper properties. Build servers and CI need the wrapper to use the correct Gradle version.",
                file = ctx.wsPath(propsRel),
                likelyCause = "The wrapper files were not committed or were left out of the archive.",
                suggestedFix = "Add the Gradle wrapper (gradlew, gradlew.bat, gradle/wrapper/*).",
                fixLabel = "Add Gradle wrapper",
                fixData = mapOf("gradleDir" to ctx.wsPath(info.androidDir.orEmpty()).trimEnd('/'), "gradleVersion" to recommendedGradle(info)),
            )
        } else if (!info.hasWrapperJar) {
            ctx.findings += Finding(
                "gradle.no_wrapper_jar", Severity.ERROR, Certainty.CONFIRMED, Categories.BUILD,
                "gradle-wrapper.jar is missing",
                "gradlew cannot start without gradle/wrapper/gradle-wrapper.jar.",
                file = ctx.wsPath(ctx.gradlePath("gradle/wrapper/gradle-wrapper.jar")),
                likelyCause = "*.jar files are often excluded by .gitignore rules.",
                suggestedFix = "Restore the wrapper JAR.",
                fixLabel = "Add wrapper JAR",
                fixData = mapOf("gradleDir" to ctx.wsPath(info.androidDir.orEmpty()).trimEnd('/'), "jarOnly" to "true"),
            )
        }
        val agp = info.agpVersion
        val gradle = info.gradleVersion
        if (agp != null && gradle != null) {
            val min = GradleCompat.minGradleFor(agp)
            if (min != null && GradleCompat.compare(gradle, min) < 0) {
                ctx.findings += Finding(
                    "gradle.version_too_old", Severity.ERROR, Certainty.CONFIRMED, Categories.BUILD,
                    "Gradle $gradle is too old for Android Gradle Plugin $agp",
                    "AGP $agp requires Gradle $min or newer. The build fails with \"Minimum supported Gradle version is $min\".",
                    file = ctx.wsPath(propsRel),
                    likelyCause = "AGP was upgraded without upgrading the Gradle wrapper.",
                    suggestedFix = "Set distributionUrl to Gradle $min.",
                    fixLabel = "Use Gradle $min",
                    fixData = mapOf("path" to ctx.wsPath(propsRel), "gradleVersion" to min),
                )
            }
        }
        // Scan all Gradle scripts for removed APIs.
        val scripts = gradleScripts(ctx)
        for (rel in scripts) {
            val text = ctx.file(rel).readText()
            ctx.files++
            val jLine = lineOfRegex(text, Regex("""\bjcenter\s*\(\s*\)"""))
            if (jLine != null) {
                ctx.findings += Finding(
                    "gradle.jcenter", Severity.WARNING, Certainty.CONFIRMED, Categories.BUILD,
                    "JCenter repository is used",
                    "JCenter is read-only and being shut down; dependency resolution through it is unreliable.",
                    file = ctx.wsPath(rel), line = jLine,
                    suggestedFix = "Replace jcenter() with mavenCentral().",
                    fixLabel = "Replace with mavenCentral()",
                    fixData = mapOf("path" to ctx.wsPath(rel)),
                )
            }
            val dep = Regex("""(?m)^\s*(compile|testCompile|androidTestCompile|provided|apk|debugCompile|releaseCompile)\s*[('"]""").find(text)
            if (dep != null) {
                ctx.findings += Finding(
                    "gradle.removed_configuration", Severity.ERROR, Certainty.CONFIRMED, Categories.BUILD,
                    "Removed dependency configuration '${dep.groupValues[1]}'",
                    "'compile', 'provided' and 'apk' were removed in Gradle 7. Builds fail with \"Could not find method ${dep.groupValues[1]}()\".",
                    file = ctx.wsPath(rel), line = XmlSource.lineOf(text, dep.range.first + 1),
                    suggestedFix = "Use implementation / compileOnly / runtimeOnly / testImplementation.",
                    fixLabel = "Update configurations",
                    fixData = mapOf("path" to ctx.wsPath(rel)),
                )
            }
        }
        val local = ctx.file(ctx.gradlePath("local.properties"))
        if (local.isFile && Regex("(?m)^\\s*sdk\\.dir\\s*=").containsMatchIn(local.readText())) {
            ctx.findings += Finding(
                "gradle.local_sdk_dir", Severity.INFO, Certainty.CONFIRMED, Categories.BUILD,
                "local.properties contains a machine-specific sdk.dir",
                "This path belongs to the computer that created the project and is usually wrong elsewhere.",
                file = ctx.wsPath(ctx.gradlePath("local.properties")),
                suggestedFix = "Remove sdk.dir; build machines set ANDROID_HOME instead.",
                fixLabel = "Remove sdk.dir",
                fixData = mapOf("path" to ctx.wsPath(ctx.gradlePath("local.properties"))),
            )
        }
    }

    private fun gradleScripts(ctx: Ctx): List<String> {
        val out = mutableListOf<String>()
        listOf("settings.gradle", "settings.gradle.kts", "build.gradle", "build.gradle.kts").map(ctx::gradlePath).filter { ctx.file(it).isFile }.forEach { out += it }
        ctx.info.modules.mapNotNull { it.buildFile }.filter { ctx.file(it).isFile && it !in out }.forEach { out += it }
        return out
    }

    private fun recommendedGradle(info: ProjectInfo): String = info.agpVersion?.let(GradleCompat::minGradleFor) ?: info.gradleVersion ?: "8.14.3"

    // ---------------------------------------------------------------- Modules & manifests

    private fun checkModule(ctx: Ctx, m: GradleModule) {
        if (m.type == ModuleType.OTHER) return
        val agpMajor = GradleCompat.major(ctx.info.agpVersion)
        val manifestRel = m.manifestPath
        var doc: XmlDocumentSource? = null
        if (manifestRel == null) {
            if (m.type == ModuleType.APPLICATION) {
                ctx.findings += Finding(
                    "manifest.missing", Severity.ERROR, Certainty.CONFIRMED, Categories.MANIFEST,
                    "AndroidManifest.xml is missing in ${m.gradlePath}",
                    "Application modules need src/main/AndroidManifest.xml.",
                    file = ctx.wsPath(if (m.dir.isEmpty()) "src/main/AndroidManifest.xml" else "${m.dir}/src/main/AndroidManifest.xml"),
                    suggestedFix = "Restore the manifest from version control or a backup.",
                )
            }
        } else {
            val text = ctx.file(manifestRel).readText()
            ctx.files++
            try {
                doc = XmlSource.parse(text)
            } catch (e: XmlSyntaxException) {
                ctx.findings += Finding(
                    "manifest.malformed", Severity.ERROR, Certainty.CONFIRMED, Categories.MANIFEST,
                    "AndroidManifest.xml is not valid XML",
                    e.message ?: "Syntax error",
                    file = ctx.wsPath(manifestRel), line = e.line,
                    suggestedFix = "Open the file at the reported line and correct the XML.",
                )
            }
        }
        ctx.manifests[m.gradlePath] = doc
        val pkgAttr = doc?.root?.attrValue("package")

        // Namespace (required since AGP 8.0).
        if (m.namespace == null && (agpMajor == null || agpMajor >= 8)) {
            val certainty = if (agpMajor != null) Certainty.CONFIRMED else Certainty.LIKELY
            ctx.findings += Finding(
                "module.namespace_missing", Severity.ERROR, certainty, Categories.BUILD,
                "Module ${m.gradlePath} has no namespace",
                "Android Gradle Plugin 8+ requires `namespace` in the android { } block" + (if (agpMajor == null) " (AGP version could not be determined)." else "."),
                file = m.buildFile?.let(ctx::wsPath),
                likelyCause = if (pkgAttr != null) "The project still uses the manifest package attribute (\"$pkgAttr\") from AGP 7." else null,
                suggestedFix = if (pkgAttr != null) "Move package=\"$pkgAttr\" to namespace = \"$pkgAttr\"." else "Add namespace = \"your.package.name\".",
                fixLabel = if (pkgAttr != null && m.buildFile != null) "Move package to namespace" else null,
                fixData = if (pkgAttr != null && m.buildFile != null) mapOf("buildFile" to ctx.wsPath(m.buildFile), "manifest" to ctx.wsPath(manifestRel!!), "namespace" to pkgAttr) else emptyMap(),
            )
        } else if (m.namespace != null && pkgAttr != null && (agpMajor ?: 8) >= 8) {
            ctx.findings += Finding(
                "manifest.package_attribute", Severity.ERROR, Certainty.LIKELY, Categories.MANIFEST,
                "Manifest still sets package=\"$pkgAttr\"",
                "With AGP 8+, the package attribute in source manifests is no longer supported; the namespace from the build file is used instead.",
                file = ctx.wsPath(manifestRel!!), line = doc?.root?.line,
                suggestedFix = "Remove the package attribute.",
                fixLabel = "Remove package attribute",
                fixData = mapOf("path" to ctx.wsPath(manifestRel)),
            )
        }

        // SDK levels.
        val usesSdk = doc?.root?.child("uses-sdk")
        val minSdk = m.minSdk ?: usesSdk?.androidAttr("minSdkVersion")?.toIntOrNull()
        val targetSdk = m.targetSdk ?: usesSdk?.androidAttr("targetSdkVersion")?.toIntOrNull()
        val compileSdk = m.compileSdk
        if (minSdk != null && targetSdk != null && minSdk > targetSdk) {
            ctx.findings += Finding("sdk.min_above_target", Severity.ERROR, Certainty.CONFIRMED, Categories.SDK,
                "minSdk ($minSdk) is higher than targetSdk ($targetSdk)", "minSdk must not be greater than targetSdk.",
                file = m.buildFile?.let(ctx::wsPath), suggestedFix = "Lower minSdk or raise targetSdk.")
        }
        if (compileSdk != null && targetSdk != null && targetSdk > compileSdk) {
            ctx.findings += Finding("sdk.target_above_compile", Severity.WARNING, Certainty.CONFIRMED, Categories.SDK,
                "targetSdk ($targetSdk) is higher than compileSdk ($compileSdk)", "Compile against at least the API level you target.",
                file = m.buildFile?.let(ctx::wsPath), suggestedFix = "Set compileSdk to $targetSdk or higher.",
                fixLabel = m.buildFile?.let { "Set compileSdk to $targetSdk" },
                fixData = m.buildFile?.let { mapOf("path" to ctx.wsPath(it), "compileSdk" to targetSdk.toString()) }.orEmpty())
        }
        if (m.type == ModuleType.APPLICATION && targetSdk != null && targetSdk < 35) {
            ctx.findings += Finding("sdk.target_outdated", Severity.INFO, Certainty.SUGGESTION, Categories.SDK,
                "targetSdk $targetSdk is outdated",
                "Google Play raises its minimum target API level every year, so new uploads usually need a recent targetSdk. Check the current Play policy before publishing.",
                file = m.buildFile?.let(ctx::wsPath),
                suggestedFix = "Raise targetSdk after testing behaviour changes for each newer API level.")
        }
        if (doc == null) return

        // Components.
        val app = doc.root.child("application")
        val ns = m.namespace ?: pkgAttr ?: m.applicationId
        for (tag in listOf("activity", "activity-alias", "service", "receiver")) {
            for (c in app?.childrenNamed(tag).orEmpty()) {
                if (c.childrenNamed("intent-filter").isNotEmpty() && c.attr("android:exported") == null) {
                    val target31 = targetSdk?.let { it >= 31 }
                    if (target31 == false) continue
                    ctx.findings += Finding(
                        "manifest.exported_missing", Severity.ERROR, if (target31 == true) Certainty.CONFIRMED else Certainty.LIKELY, Categories.MANIFEST,
                        "<$tag ${c.androidAttr("name") ?: ""}> needs android:exported",
                        "Since Android 12 (API 31), components with intent filters must declare android:exported. The manifest merger fails otherwise.",
                        file = ctx.wsPath(manifestRel!!), line = c.line,
                        suggestedFix = "Add android:exported=\"true\" (the behaviour it had before API 31).",
                        fixLabel = "Add android:exported=\"true\"",
                        fixData = mapOf("path" to ctx.wsPath(manifestRel), "tag" to tag, "name" to (c.androidAttr("name") ?: "")),
                    )
                }
            }
        }
        if (m.type == ModuleType.APPLICATION) {
            val hasLauncher = app?.children.orEmpty().filter { it.name == "activity" || it.name == "activity-alias" }.any(::isLauncher)
            if (!hasLauncher) {
                ctx.findings += Finding("manifest.no_launcher", Severity.WARNING, Certainty.SUGGESTION, Categories.MANIFEST,
                    "No launcher activity", "No activity has the MAIN/LAUNCHER intent filter, so the app will not appear in the launcher. This can be intentional (for example a library-like or TV app).",
                    file = ctx.wsPath(manifestRel!!), line = app?.line)
            }
            app?.attr("android:debuggable")?.let {
                ctx.findings += Finding("manifest.hardcoded_debuggable", Severity.WARNING, Certainty.CONFIRMED, Categories.MANIFEST,
                    "android:debuggable is hard-coded", "Gradle sets debuggable per build type. Hard-coding it can ship a debuggable release build and fails release lint checks.",
                    file = ctx.wsPath(manifestRel!!), line = app.line, suggestedFix = "Remove the attribute.",
                    fixLabel = "Remove android:debuggable", fixData = mapOf("path" to ctx.wsPath(manifestRel)))
            }
        }
        // Declared classes that do not exist in local sources.
        if (ns != null) {
            val classes = declaredClasses(ctx)
            for (tag in listOf("activity", "service", "receiver", "provider")) {
                for (c in app?.childrenNamed(tag).orEmpty()) {
                    val raw = c.androidAttr("name") ?: continue
                    val fq = if (raw.startsWith(".")) ns + raw else if (!raw.contains('.')) "$ns.$raw" else raw
                    if (!fq.startsWith("$ns.")) continue
                    if (fq !in classes) {
                        ctx.findings += Finding("manifest.class_missing", Severity.WARNING, Certainty.LIKELY, Categories.MANIFEST,
                            "$tag class $fq not found",
                            "The manifest declares $fq but no matching Kotlin or Java class was found in this project. Launching it would crash with ClassNotFoundException.",
                            file = ctx.wsPath(manifestRel!!), line = c.line,
                            likelyCause = "The class was renamed, moved, or deleted.",
                            suggestedFix = "Update android:name or restore the class.")
                    }
                }
            }
        }
    }

    private fun isLauncher(n: XmlNode) = n.childrenNamed("intent-filter").any { f ->
        f.childrenNamed("action").any { it.androidAttr("name") == "android.intent.action.MAIN" } &&
            f.childrenNamed("category").any { it.androidAttr("name") == "android.intent.category.LAUNCHER" }
    }

    private var classCache: Set<String>? = null

    private fun declaredClasses(ctx: Ctx): Set<String> {
        classCache?.let { return it }
        val out = HashSet<String>()
        for (f in sourceFiles(ctx)) {
            val text = f.readText()
            val pkg = Regex("""(?m)^\s*package\s+([\w.]+)""").find(text)?.groupValues?.get(1)
            Regex("""(?m)^\s*(?:(?:public|internal|private|open|abstract|final|data|sealed|enum|inner|annotation)\s+)*(?:class|object|interface)\s+(\w+)""")
                .findAll(text).forEach { out += if (pkg != null) "$pkg.${it.groupValues[1]}" else it.groupValues[1] }
        }
        classCache = out
        return out
    }

    private var sourceCache: List<File>? = null

    private fun sourceFiles(ctx: Ctx): List<File> {
        sourceCache?.let { return it }
        val out = mutableListOf<File>()
        for (m in ctx.info.modules) {
            val src = ctx.file(if (m.dir.isEmpty()) "src" else "${m.dir}/src")
            if (!src.isDirectory) continue
            src.listFiles().orEmpty().filter { it.isDirectory && it.name != "test" && it.name != "androidTest" && !it.name.startsWith("test") }.forEach { set ->
                set.walkTopDown().filter { it.isFile && (it.extension == "kt" || it.extension == "java") && it.length() < 2 * 1024 * 1024 }.forEach { out += it }
            }
        }
        sourceCache = out
        return out
    }

    // ---------------------------------------------------------------- Resources

    private fun checkResources(ctx: Ctx) {
        val resDirs = ctx.info.modules.mapNotNull { m -> m.resDir?.let { ctx.file(it) } }.filter { it.isDirectory }
        if (resDirs.isEmpty()) return
        val index = ResourceIndex.build(resDirs) { it.relativeTo(ctx.ws).invariantSeparatorsPath }
        for ((path, line, msg) in index.parseErrors) {
            ctx.findings += Finding("resources.malformed_xml", Severity.ERROR, Certainty.CONFIRMED, Categories.RESOURCES,
                "Invalid XML in ${path.substringAfterLast('/')}", msg, file = path, line = line,
                suggestedFix = "Fix the XML syntax at the reported line.")
        }
        for (path in index.badFileNames) {
            ctx.findings += Finding("resources.invalid_file_name", Severity.ERROR, Certainty.CONFIRMED, Categories.RESOURCES,
                "Invalid resource file name: ${path.substringAfterLast('/')}",
                "Resource file names may only contain lowercase a–z, 0–9 and underscores. aapt2 rejects other names.",
                file = path, suggestedFix = "Rename the file (and update references to it).")
        }
        for ((type, name, file) in index.reservedNames) {
            ctx.findings += Finding("resources.reserved_name", Severity.ERROR, Certainty.CONFIRMED, Categories.RESOURCES,
                "@$type/$name uses a reserved Java keyword",
                "\"$name\" is a Java keyword, so it cannot be a resource name or view id (aapt fails with \"not a valid resource name\").",
                file = file, suggestedFix = "Rename it, for example to ${name}_view, and update references.")
        }
        for ((key, files) in index.valueDefinitions) {
            if (files.size > 1) {
                ctx.findings += Finding("resources.duplicate", Severity.ERROR, Certainty.CONFIRMED, Categories.RESOURCES,
                    "Duplicate resource @${key.first}", "@${key.first} is defined ${files.size} times in values${if (key.second.isEmpty()) "" else "-" + key.second}: ${files.distinct().joinToString()}.",
                    file = files.first(), suggestedFix = "Keep one definition.")
            }
        }
        // References from XML resources and manifests.
        val refRegex = Regex("""@(string|color|dimen|drawable|mipmap|layout|style|bool|integer|array|anim|animator|xml|raw|font|menu|navigation|plurals|id)/([A-Za-z0-9_.]+)""")
        val missing = linkedMapOf<Pair<String, String>, Pair<String, Int>>()
        fun checkRef(type: String, name: String, file: String, line: Int) {
            if (index.has(type, name)) return
            if (ResourceIndex.libraryPrefixes.any { name.startsWith(it) }) return
            if (type == "style" && ResourceIndex.libraryStyleFamilies.any { name.startsWith(it) }) return
            missing.putIfAbsent(type to name, file to line)
        }
        val xmlFiles = resDirs.flatMap { r -> r.walkTopDown().filter { it.isFile && it.extension == "xml" }.toList() } +
            ctx.info.modules.mapNotNull { it.manifestPath }.map { ctx.file(it) }.filter { it.isFile }
        for (f in xmlFiles) {
            ctx.cancel.throwIfCancelled()
            ctx.files++
            val text = f.readText()
            for (m in refRegex.findAll(text)) {
                checkRef(m.groupValues[1], m.groupValues[2], f.relativeTo(ctx.ws).invariantSeparatorsPath, XmlSource.lineOf(text, m.range.first))
            }
        }
        val codeRef = Regex("""(?<![\w.])R\.(string|color|dimen|drawable|mipmap|layout|style|bool|integer|array|anim|animator|xml|raw|font|menu|navigation|plurals|id)\.(\w+)""")
        for (f in sourceFiles(ctx)) {
            ctx.cancel.throwIfCancelled()
            ctx.files++
            val text = f.readText()
            // Files that import another package's R class are skipped to avoid false positives.
            val localR = ctx.info.modules.flatMap { listOfNotNull(it.namespace, it.applicationId) }.map { "$it.R" }.toSet()
            val importsForeignR = Regex("""(?m)^\s*import\s+([\w.]+\.R)\s*$""").findAll(text).any { it.groupValues[1] !in localR }
            if (importsForeignR) continue
            for (m in codeRef.findAll(text)) checkRef(m.groupValues[1], m.groupValues[2], f.relativeTo(ctx.ws).invariantSeparatorsPath, XmlSource.lineOf(text, m.range.first))
        }
        val firstValues = resDirs.first()
        for ((key, loc) in missing.entries.take(60)) {
            val (type, name) = key
            val fixable = type == "string" || type == "color" || type == "dimen"
            val valuesFile = File(firstValues, "values/${if (type == "string") "strings" else if (type == "color") "colors" else "dimens"}.xml")
            ctx.findings += Finding("resources.missing_reference", Severity.ERROR, Certainty.LIKELY, Categories.RESOURCES,
                "@$type/$name is not defined",
                "@$type/$name is referenced but not defined in this project's res folders. If it is not provided by a library, the build fails with \"resource $type/$name not found\".",
                file = loc.first, line = loc.second,
                likelyCause = "The resource was renamed or deleted, or it comes from a dependency.",
                suggestedFix = if (fixable) "Define the $type, or correct the reference." else "Add the missing $type resource or correct the reference.",
                fixLabel = if (fixable) "Add placeholder $type" else null,
                fixData = if (fixable) mapOf("path" to valuesFile.relativeTo(ctx.ws).invariantSeparatorsPath, "type" to type, "name" to name) else emptyMap(),
            )
        }
    }

    // ---------------------------------------------------------------- Sources

    private fun checkSources(ctx: Ctx) {
        val app = ctx.info.appModule ?: return
        val appManifest = ctx.manifests[app.gradlePath] ?: return
        val permissions = ctx.manifests.values.filterNotNull().flatMap { d -> d.root.childrenNamed("uses-permission").mapNotNull { it.androidAttr("name") } }.toSet()
        if ("android.permission.INTERNET" in permissions) return
        val network = Regex("""HttpURLConnection|OkHttpClient|Retrofit\.Builder|\bURL\s*\(\s*"https?:|loadUrl\s*\(\s*"https?:|HttpClient\s*\(|Volley\.newRequestQueue|Socket\s*\(""")
        val hit = sourceFiles(ctx).firstNotNullOfOrNull { f -> val t = f.readText(); network.find(t)?.let { f to XmlSource.lineOf(t, it.range.first) } }
        if (hit != null) {
            ctx.findings += Finding("manifest.internet_permission", Severity.WARNING, Certainty.LIKELY, Categories.MANIFEST,
                "Network code without INTERNET permission",
                "${hit.first.name} uses networking APIs, but no manifest declares android.permission.INTERNET. Network calls would fail with a SecurityException or UnknownHostException.",
                file = hit.first.relativeTo(ctx.ws).invariantSeparatorsPath, line = hit.second,
                suggestedFix = "Add <uses-permission android:name=\"android.permission.INTERNET\" />.",
                fixLabel = "Add INTERNET permission",
                fixData = mapOf("path" to ctx.wsPath(app.manifestPath!!), "permission" to "android.permission.INTERNET"))
        }
        if (appManifest.root.child("application") == null) {
            ctx.findings += Finding("manifest.no_application", Severity.ERROR, Certainty.CONFIRMED, Categories.MANIFEST,
                "Manifest has no <application> element", "An app manifest must contain <application>.", file = ctx.wsPath(app.manifestPath!!))
        }
    }

    private fun lineOfRegex(text: String, r: Regex): Int? = r.find(text)?.let { XmlSource.lineOf(text, it.range.first) }
}
