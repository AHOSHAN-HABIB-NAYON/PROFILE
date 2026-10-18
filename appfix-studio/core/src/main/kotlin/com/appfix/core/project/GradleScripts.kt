package com.appfix.core.project

/** Heuristic, regex-based reader for Gradle build scripts (Groovy and Kotlin DSL). */
object GradleScripts {
    data class VersionCatalog(val versions: Map<String, String>, val pluginIds: Map<String, String>) {
        fun version(key: String): String? = versions[key] ?: versions[key.replace('.', '-')] ?: versions[key.replace('.', '_')]
            ?: versions.entries.firstOrNull { it.key.replace('-', '.').replace('_', '.').equals(key, true) }?.value
    }

    fun parseCatalog(text: String): VersionCatalog {
        val versions = linkedMapOf<String, String>()
        val pluginIds = linkedMapOf<String, String>()
        var section = ""
        val pluginVersions = mutableListOf<Pair<String, String>>()
        for (raw in text.lines()) {
            val line = raw.substringBefore('#').trim()
            if (line.startsWith("[")) { section = line.trim('[', ']').trim(); continue }
            val m = Regex("^([A-Za-z0-9_.-]+)\\s*=\\s*(.+)$").find(line) ?: continue
            val key = m.groupValues[1]
            val value = m.groupValues[2].trim()
            when (section) {
                "versions" -> Regex("^\"([^\"]*)\"").find(value)?.let { versions[key] = it.groupValues[1] }
                "plugins" -> {
                    Regex("id\\s*=\\s*\"([^\"]+)\"").find(value)?.let { pluginIds[key] = it.groupValues[1] }
                    Regex("version\\.ref\\s*=\\s*\"([^\"]+)\"").find(value)?.let { pluginVersions += key to it.groupValues[1] }
                }
            }
        }
        return VersionCatalog(versions, pluginIds)
    }

    fun includedModules(settings: String): List<String> {
        val out = linkedSetOf<String>()
        val cleaned = stripComments(settings)
        for (m in Regex("""include\s*\(?([^\n)]*)""").findAll(cleaned)) {
            for (s in Regex("""["']([^"']+)["']""").findAll(m.groupValues[1])) {
                val p = s.groupValues[1]
                out += if (p.startsWith(":")) p else ":$p"
            }
        }
        return out.toList()
    }

    fun stripComments(text: String): String =
        text.replace(Regex("/\\*.*?\\*/", RegexOption.DOT_MATCHES_ALL), " ").lines().joinToString("\n") { line ->
            // Drop // comments that are not inside a string (good enough for build scripts).
            val idx = line.indexOf("//")
            if (idx >= 0 && line.substring(0, idx).count { it == '"' } % 2 == 0 && line.substring(0, idx).count { it == '\'' } % 2 == 0 &&
                !line.substring(0, idx).endsWith(":")
            ) line.substring(0, idx) else line
        }

    fun moduleType(build: String, catalog: VersionCatalog?): ModuleType {
        val t = stripComments(build)
        val aliases = Regex("""alias\s*\(\s*libs\.plugins\.([A-Za-z0-9_.]+)\s*\)""").findAll(t).map { it.groupValues[1] }.toList()
        val aliasIds = aliases.mapNotNull { a -> catalog?.pluginIds?.entries?.firstOrNull { it.key.replace('-', '.').replace('_', '.') == a }?.value ?: a }
        val all = t + "\n" + aliasIds.joinToString("\n")
        return when {
            Regex("""com\.android\.application|android[.-]application|androidApplication""").containsMatchIn(all) -> ModuleType.APPLICATION
            Regex("""com\.android\.library|android[.-]library|androidLibrary|com\.android\.kotlin\.multiplatform\.library""").containsMatchIn(all) -> ModuleType.LIBRARY
            else -> ModuleType.OTHER
        }
    }

    private fun intValue(build: String, keys: List<String>, catalog: VersionCatalog?): Int? {
        for (k in keys) {
            val m = Regex("""\b$k\b\s*(?:=|\s)\s*([^\n]+)""").find(build) ?: continue
            val v = m.groupValues[1].trim()
            Regex("^(\\d+)").find(v)?.let { return it.groupValues[1].toInt() }
            Regex("""libs\.versions\.([A-Za-z0-9_.]+)\.get\(\)""").find(v)?.let { r -> catalog?.version(r.groupValues[1])?.toIntOrNull()?.let { return it } }
            Regex("""(?:release|version)\(\s*(\d+)\s*\)""").find(v)?.let { return it.groupValues[1].toInt() }
            Regex("""android-(\d+)""").find(v)?.let { return it.groupValues[1].toInt() }
        }
        return null
    }

    private fun stringValue(build: String, key: String): String? =
        Regex("""\b$key\b\s*(?:=\s*)?["']([^"'\n]+)["']""").find(build)?.groupValues?.get(1)

    fun parseModule(gradlePath: String, dir: String, buildFile: String?, build: String, catalog: VersionCatalog?, exists: (String) -> Boolean): GradleModule {
        val t = stripComments(build)
        val prefix = if (dir.isEmpty()) "" else "$dir/"
        val manifest = "${prefix}src/main/AndroidManifest.xml".takeIf(exists)
        val res = "${prefix}src/main/res".takeIf(exists)
        return GradleModule(
            gradlePath = gradlePath,
            dir = dir,
            buildFile = buildFile,
            type = moduleType(t, catalog),
            namespace = stringValue(t, "namespace"),
            applicationId = stringValue(t, "applicationId"),
            compileSdk = intValue(t, listOf("compileSdk", "compileSdkVersion"), catalog),
            minSdk = intValue(t, listOf("minSdk", "minSdkVersion"), catalog),
            targetSdk = intValue(t, listOf("targetSdk", "targetSdkVersion"), catalog),
            versionCode = intValue(t, listOf("versionCode"), catalog),
            versionName = stringValue(t, "versionName"),
            manifestPath = manifest,
            resDir = res,
            usesCompose = Regex("""compose\s*(=\s*)?true|kotlin\.plugin\.compose|plugins\.kotlin\.compose|compose\.compiler|libs\.plugins\.compose""").containsMatchIn(t),
        )
    }

    fun gradleVersionFromWrapper(props: String): String? =
        Regex("""distributionUrl\s*=.*gradle-([0-9][0-9A-Za-z.\-]*?)-(?:bin|all)\.zip""").find(props)?.groupValues?.get(1)

    fun agpVersion(scripts: List<String>, catalog: VersionCatalog?): String? {
        catalog?.let { c ->
            listOf("agp", "androidGradlePlugin", "android-gradle-plugin", "androidGradle", "android-gradle", "gradlePlugin", "android")
                .firstNotNullOfOrNull { c.versions[it] }?.let { return it }
            c.versions.entries.firstOrNull { it.key.contains("agp", true) }?.let { return it.value }
        }
        for (s in scripts) {
            Regex("""com\.android\.tools\.build:gradle:([0-9][^"'\s)]*)""").find(s)?.let { return it.groupValues[1] }
            Regex("""id\s*\(?\s*["']com\.android\.(?:application|library)["']\s*\)?\s*version\s*["']([^"']+)["']""").find(s)?.let { return it.groupValues[1] }
        }
        return null
    }

    fun kotlinVersion(scripts: List<String>, catalog: VersionCatalog?): String? {
        catalog?.versions?.let { v -> (v["kotlin"] ?: v["kotlinVersion"] ?: v["kotlin-version"])?.let { return it } }
        for (s in scripts) {
            Regex("""kotlin-gradle-plugin:([0-9][^"'\s)]*)""").find(s)?.let { return it.groupValues[1] }
            Regex("""(?:org\.jetbrains\.kotlin\.(?:android|jvm|multiplatform)["']\s*\)?|kotlin\(\s*"(?:android|jvm|multiplatform)"\s*\))\s*version\s*["']([^"']+)["']""").find(s)?.let { return it.groupValues[1] }
            Regex("""kotlin_version\s*=\s*["']([^"']+)["']""").find(s)?.let { return it.groupValues[1] }
        }
        return null
    }
}
