package com.appfix.core.project

import java.io.File

/**
 * Detects the project type and Android build layout of an extracted source tree.
 * Detection is static and heuristic; it never runs project scripts.
 */
object ProjectDetector {
    private val ignoredDirs = setOf(".git", "build", ".gradle", ".idea", "node_modules", ".dart_tool", "Pods", ".kotlin", ".cxx")

    /** Finds the most likely project root inside [workspace], descending through wrapper folders. */
    fun findRoot(workspace: File, maxDepth: Int = 3): File {
        fun score(dir: File): Int {
            val names = dir.list()?.toSet() ?: return 0
            return when {
                "pubspec.yaml" in names -> 100
                "settings.gradle" in names || "settings.gradle.kts" in names -> 90
                "package.json" in names && "android" in names -> 85
                "ProjectSettings" in names && "Assets" in names -> 80
                "package.json" in names -> 60
                "build.gradle" in names || "build.gradle.kts" in names -> 50
                names.any { it.endsWith(".csproj") || it.endsWith(".sln") } -> 40
                "AndroidManifest.xml" in names -> 30
                else -> 0
            }
        }
        var best = workspace to score(workspace)
        fun walk(dir: File, depth: Int) {
            if (depth > maxDepth) return
            val children = dir.listFiles()?.filter { it.isDirectory && it.name !in ignoredDirs && !it.name.startsWith(".") } ?: return
            for (c in children) {
                val s = score(c)
                // Prefer shallower roots on ties (e.g. a React Native root over its android/ folder).
                if (s > best.second) best = c to s
                walk(c, depth + 1)
            }
        }
        if (best.second < 90) walk(workspace, 1)
        return best.first
    }

    fun detect(workspace: File): ProjectInfo {
        val root = findRoot(workspace)
        val rootRel = root.relativeTo(workspace).invariantSeparatorsPath.let { if (it == ".") "" else it }
        val notes = mutableListOf<String>()
        fun f(rel: String) = File(root, rel)
        val names = root.list()?.toSet().orEmpty()

        val packageJson = f("package.json").takeIf { it.isFile }?.readTextLimited()
        val pubspec = f("pubspec.yaml").takeIf { it.isFile }?.readTextLimited()
        var framework = when {
            pubspec != null && Regex("""sdk:\s*flutter""").containsMatchIn(pubspec) -> Framework.FLUTTER
            packageJson != null && packageJson.contains("\"@capacitor/android\"") -> Framework.CAPACITOR
            packageJson != null && packageJson.contains("\"expo\"") -> Framework.EXPO
            packageJson != null && packageJson.contains("\"react-native\"") -> Framework.REACT_NATIVE
            packageJson != null && (packageJson.contains("\"cordova-android\"") || f("config.xml").isFile) -> Framework.CORDOVA
            "ProjectSettings" in names && "Assets" in names -> Framework.UNITY
            names.any { it.endsWith(".csproj") || it.endsWith(".sln") } -> Framework.XAMARIN
            else -> Framework.UNKNOWN
        }

        val androidDir: String? = when (framework) {
            Framework.FLUTTER, Framework.REACT_NATIVE, Framework.EXPO, Framework.CAPACITOR ->
                "android".takeIf { f("android").isDirectory }
            Framework.CORDOVA -> "platforms/android".takeIf { f("platforms/android").isDirectory }
            Framework.UNKNOWN -> when {
                hasGradle(root) -> ""
                f("android").isDirectory && hasGradle(f("android")) -> "android"
                else -> null
            }
            else -> null
        }
        val gradleRoot = androidDir?.let { if (it.isEmpty()) root else f(it) }

        var modules = emptyList<GradleModule>()
        var gradleVersion: String? = null
        var agp: String? = null
        var kotlin: String? = null
        var hasWrapper = false
        var hasWrapperJar = false
        var kts = false
        if (gradleRoot != null) {
            val g = gradleRoot
            val settingsFile = listOf("settings.gradle.kts", "settings.gradle").map { File(g, it) }.firstOrNull { it.isFile }
            kts = settingsFile?.name?.endsWith(".kts") == true || File(g, "build.gradle.kts").isFile
            val catalog = File(g, "gradle/libs.versions.toml").takeIf { it.isFile }?.readTextLimited()?.let(GradleScripts::parseCatalog)
            val included = settingsFile?.readTextLimited()?.let(GradleScripts::includedModules).orEmpty()
            val modulePaths = if (included.isEmpty()) listOf(":") else included
            val prefix = if (androidDir.isNullOrEmpty()) "" else "$androidDir/"
            val scripts = mutableListOf<String>()
            listOf("build.gradle", "build.gradle.kts").map { File(g, it) }.filter { it.isFile }.forEach { scripts += it.readTextLimited() }
            settingsFile?.let { scripts += it.readTextLimited() }
            modules = modulePaths.mapNotNull { path ->
                val dir = path.removePrefix(":").replace(':', '/')
                val moduleDir = if (dir.isEmpty()) g else File(g, dir)
                if (!moduleDir.isDirectory) {
                    notes += "Module $path is listed in settings but its folder is missing."
                    return@mapNotNull null
                }
                val build = listOf("build.gradle.kts", "build.gradle").map { File(moduleDir, it) }.firstOrNull { it.isFile }
                val text = build?.readTextLimited().orEmpty()
                if (build != null && dir.isNotEmpty()) scripts += text
                val relDir = (prefix + dir).trimEnd('/')
                GradleScripts.parseModule(
                    gradlePath = path,
                    dir = relDir,
                    buildFile = build?.let { (if (relDir.isEmpty()) "" else "$relDir/") + it.name },
                    build = text,
                    catalog = catalog,
                    exists = { File(root, it).exists() },
                )
            }
            val wrapperProps = File(g, "gradle/wrapper/gradle-wrapper.properties")
            hasWrapper = wrapperProps.isFile && (File(g, "gradlew").isFile || File(g, "gradlew.bat").isFile)
            hasWrapperJar = File(g, "gradle/wrapper/gradle-wrapper.jar").isFile
            gradleVersion = wrapperProps.takeIf { it.isFile }?.readTextLimited()?.let(GradleScripts::gradleVersionFromWrapper)
            agp = GradleScripts.agpVersion(scripts, catalog)
            kotlin = GradleScripts.kotlinVersion(scripts, catalog)
            if (framework == Framework.UNKNOWN) {
                framework = when {
                    scripts.any { it.contains("kotlin(\"multiplatform\")") || it.contains("kotlin.multiplatform") || it.contains("kotlinMultiplatform") } -> Framework.KOTLIN_MULTIPLATFORM
                    modules.any { it.type != ModuleType.OTHER } -> Framework.ANDROID_NATIVE
                    else -> Framework.GRADLE_JVM
                }
            }
        } else if (framework == Framework.UNKNOWN && f("AndroidManifest.xml").isFile) {
            notes += "Found an AndroidManifest.xml without a Gradle build. This may be decoded APK output (Apktool) rather than a source project."
        }

        var kt = 0
        var java = 0
        var layouts = 0
        var composeFiles = 0
        var total = 0
        val scanRoot = gradleRoot ?: root
        scanRoot.walkTopDown().onEnter { it.name !in ignoredDirs }.maxDepth(14).forEach { file ->
            if (!file.isFile) return@forEach
            total++
            when (file.extension) {
                "kt" -> { kt++; if (composeFiles < 1 && file.length() < 512 * 1024 && file.readTextLimited().contains("@Composable")) composeFiles++ }
                "java" -> java++
                "xml" -> if (file.parentFile?.name?.startsWith("layout") == true) layouts++
            }
        }
        val languages = buildList {
            if (kt > 0) add("Kotlin")
            if (java > 0) add("Java")
            if (framework == Framework.FLUTTER) add("Dart")
            if (framework in setOf(Framework.REACT_NATIVE, Framework.EXPO, Framework.CAPACITOR, Framework.CORDOVA)) add("JavaScript/TypeScript")
            if (framework == Framework.UNITY || framework == Framework.XAMARIN) add("C#")
        }
        val toolkits = buildList {
            if (composeFiles > 0 || modules.any { it.usesCompose }) add("Jetpack Compose")
            if (layouts > 0) add("XML Views")
        }
        when (framework) {
            Framework.FLUTTER -> notes += "Flutter apps need the Flutter SDK to build. Native Android files under android/ can be edited here."
            Framework.REACT_NATIVE, Framework.EXPO -> notes += "React Native apps need Node.js and npm dependencies to build; use a cloud build worker."
            Framework.UNITY -> notes += "Unity projects must be exported/built from the Unity Editor. Only browsing and text editing are supported."
            Framework.XAMARIN -> notes += ".NET projects need the .NET SDK and Android workload. Only browsing and text editing are supported."
            Framework.CORDOVA, Framework.CAPACITOR -> notes += "Hybrid web apps: edit the web assets, then sync and build with the framework CLI on a build worker."
            else -> Unit
        }
        if (androidDir != null && !hasWrapper) notes += "No Gradle wrapper found; builds need a matching Gradle installation."
        return ProjectInfo(
            root = rootRel,
            framework = framework,
            languages = languages,
            uiToolkits = toolkits,
            androidDir = androidDir,
            modules = modules,
            gradleVersion = gradleVersion,
            agpVersion = agp,
            kotlinVersion = kotlin,
            hasGradleWrapper = hasWrapper,
            hasWrapperJar = hasWrapperJar,
            usesKotlinDsl = kts,
            sourceFileCount = total,
            notes = notes,
        )
    }

    private fun hasGradle(dir: File) = listOf("settings.gradle", "settings.gradle.kts", "build.gradle", "build.gradle.kts").any { File(dir, it).isFile }
}

internal fun File.readTextLimited(limit: Long = 4L * 1024 * 1024): String =
    if (length() > limit) "" else readText()
