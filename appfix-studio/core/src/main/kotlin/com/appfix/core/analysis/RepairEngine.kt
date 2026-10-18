package com.appfix.core.analysis

import com.appfix.core.patch.ChangeSet
import com.appfix.core.patch.FileChange
import com.appfix.core.util.PathSafety
import com.appfix.core.xml.XmlEdits
import com.appfix.core.xml.XmlSource
import java.io.File

/** Template files used by fixes that add the Gradle wrapper. Supplied by the app from its assets. */
data class FixResources(
    val gradlewScript: String? = null,
    val gradlewBat: String? = null,
    /** Base64 of gradle-wrapper.jar. */
    val wrapperJarBase64: String? = null,
)

class FixNotAvailableException(message: String) : RuntimeException(message)

/**
 * Generates deterministic fixes for findings. Fixes are computed from the files as they are *now*
 * and returned as a [ChangeSet] for review; nothing is written here.
 */
class RepairEngine(private val workspace: File, private val resources: FixResources = FixResources()) {

    fun createFix(f: Finding): ChangeSet {
        if (!f.hasFix) throw FixNotAvailableException("No automatic fix for this finding")
        val changes: List<FileChange> = when (f.ruleId) {
            "gradle.no_wrapper", "gradle.no_wrapper_jar" -> wrapper(f)
            "gradle.version_too_old" -> listOf(gradleVersion(f.data("path"), f.data("gradleVersion")))
            "gradle.jcenter" -> listOf(jcenter(f.data("path")))
            "gradle.removed_configuration" -> listOf(configurations(f.data("path")))
            "gradle.local_sdk_dir" -> listOf(localProperties(f.data("path")))
            "module.namespace_missing" -> namespace(f.data("buildFile"), f.data("manifest"), f.data("namespace"))
            "manifest.package_attribute" -> listOf(editXml(f.data("path")) { text, doc -> XmlEdits.removeAttribute(text, doc.root, "package") })
            "manifest.exported_missing" -> listOf(editXml(f.data("path")) { text, doc ->
                val node = doc.root.child("application")?.childrenNamed(f.data("tag"))?.firstOrNull { (it.androidAttr("name") ?: "") == f.data("name") }
                    ?: throw FixNotAvailableException("The component is no longer in the manifest")
                XmlEdits.setAttribute(text, node, "android:exported", "true")
            })
            "manifest.hardcoded_debuggable" -> listOf(editXml(f.data("path")) { text, doc ->
                XmlEdits.removeAttribute(text, doc.root.child("application") ?: throw FixNotAvailableException("No <application>"), "android:debuggable")
            })
            "manifest.internet_permission", "crash.missing_permission" -> listOf(addPermission(f.data("path"), f.data("permission")))
            "manifest.activity_not_declared" -> listOf(declareActivity(f.data("path"), f.data("name")))
            "resources.missing_reference" -> listOf(addValue(f.data("path"), f.data("type"), f.data("name")))
            "sdk.target_above_compile", "build.compile_sdk_too_low" -> listOf(compileSdk(f.data("path"), f.data("compileSdk").toInt()))
            else -> throw FixNotAvailableException("No automatic fix for ${f.ruleId}")
        }
        val real = changes.filter { it.before != it.after }
        if (real.isEmpty()) throw FixNotAvailableException("The files already contain this fix")
        return ChangeSet(
            title = f.fixLabel!!,
            description = f.title,
            source = "repair:${f.ruleId}",
            changes = real,
            followUps = listOf("Rebuild the project to confirm the problem is resolved."),
        )
    }

    private fun Finding.data(key: String) = fixData[key] ?: throw FixNotAvailableException("Fix data '$key' is missing")

    private fun file(rel: String): File = PathSafety.resolveInside(workspace, rel) ?: throw FixNotAvailableException("Unsafe path $rel")

    private fun read(rel: String): String? = file(rel).takeIf { it.isFile }?.readText()

    private fun modify(rel: String, transform: (String) -> String): FileChange {
        val before = read(rel) ?: throw FixNotAvailableException("$rel no longer exists")
        return FileChange(rel, before, transform(before))
    }

    private fun editXml(rel: String, edit: (String, com.appfix.core.xml.XmlDocumentSource) -> String): FileChange = modify(rel) { text ->
        val out = edit(text, XmlSource.parse(text))
        XmlSource.parse(out) // Validate the result before proposing it.
        out
    }

    private fun wrapper(f: Finding): List<FileChange> {
        val dir = f.fixData["gradleDir"].orEmpty()
        fun p(rel: String) = if (dir.isEmpty()) rel else "$dir/$rel"
        val out = mutableListOf<FileChange>()
        val jar = resources.wrapperJarBase64 ?: throw FixNotAvailableException("The wrapper JAR template is not available in this build of AppFix Studio")
        if (read(p("gradle/wrapper/gradle-wrapper.jar")) == null) out += FileChange(p("gradle/wrapper/gradle-wrapper.jar"), null, jar, isBinary = true)
        if (f.fixData["jarOnly"] != "true") {
            val version = f.fixData["gradleVersion"] ?: "8.14.3"
            if (read(p("gradle/wrapper/gradle-wrapper.properties")) == null) {
                out += FileChange(p("gradle/wrapper/gradle-wrapper.properties"), null, wrapperProperties(version))
            }
            if (read(p("gradlew")) == null) resources.gradlewScript?.let { out += FileChange(p("gradlew"), null, it) }
            if (read(p("gradlew.bat")) == null) resources.gradlewBat?.let { out += FileChange(p("gradlew.bat"), null, it) }
        }
        return out
    }

    fun wrapperProperties(version: String) = """
        distributionBase=GRADLE_USER_HOME
        distributionPath=wrapper/dists
        distributionUrl=https\://services.gradle.org/distributions/gradle-$version-bin.zip
        networkTimeout=10000
        validateDistributionUrl=true
        zipStoreBase=GRADLE_USER_HOME
        zipStorePath=wrapper/dists

    """.trimIndent()

    private fun gradleVersion(rel: String, version: String) = modify(rel) { text ->
        val updated = text.replace(Regex("""(distributionUrl\s*=.*gradle-)[0-9][0-9A-Za-z.\-]*?(-(?:bin|all)\.zip)"""), "$1$version$2")
        // A pinned checksum belongs to the old distribution and would fail verification.
        updated.lines().filterNot { it.trim().startsWith("distributionSha256Sum") }.joinToString("\n")
    }

    private fun jcenter(rel: String) = modify(rel) { text ->
        val call = Regex("""\bjcenter\s*\(\s*\)""")
        if (text.contains("mavenCentral()")) {
            text.lines().filterNot { it.trim().matches(Regex("""jcenter\s*\(\s*\)""")) }.joinToString("\n").replace(call, "mavenCentral()")
        } else {
            var first = true
            text.lines().mapNotNull { line ->
                if (call.containsMatchIn(line)) {
                    if (first) { first = false; line.replace(call, "mavenCentral()") } else if (line.trim().matches(Regex("""jcenter\s*\(\s*\)"""))) null else line.replace(call, "mavenCentral()")
                } else line
            }.joinToString("\n")
        }
    }

    private fun configurations(rel: String) = modify(rel) { text ->
        val map = mapOf(
            "compile" to "implementation", "testCompile" to "testImplementation", "androidTestCompile" to "androidTestImplementation",
            "debugCompile" to "debugImplementation", "releaseCompile" to "releaseImplementation", "provided" to "compileOnly", "apk" to "runtimeOnly",
        )
        Regex("""(?m)^(\s*)(compile|testCompile|androidTestCompile|provided|apk|debugCompile|releaseCompile)(\s*[('"])""").replace(text) {
            it.groupValues[1] + map.getValue(it.groupValues[2]) + it.groupValues[3]
        }
    }

    private fun localProperties(rel: String): FileChange {
        val before = read(rel) ?: throw FixNotAvailableException("$rel no longer exists")
        val after = before.lines().filterNot { it.trim().startsWith("sdk.dir") }.joinToString("\n")
        val meaningful = after.lines().any { it.isNotBlank() && !it.trim().startsWith("#") }
        return FileChange(rel, before, if (meaningful) after else null)
    }

    private fun namespace(buildRel: String, manifestRel: String, ns: String): List<FileChange> {
        val build = modify(buildRel) { text -> insertIntoAndroidBlock(text, if (buildRel.endsWith(".kts")) "namespace = \"$ns\"" else "namespace '$ns'") }
        val manifest = editXml(manifestRel) { text, doc -> XmlEdits.removeAttribute(text, doc.root, "package") }
        return listOf(build, manifest)
    }

    /** Inserts [line] as the first statement of the top-level `android { }` block. */
    fun insertIntoAndroidBlock(text: String, line: String): String {
        val m = Regex("""(?m)^([ \t]*)android\s*\{[ \t]*\n?""").find(text) ?: throw FixNotAvailableException("No android { } block found in the build file")
        val outer = m.groupValues[1].replace("\n", "")
        val nextLine = text.substring(m.range.last + 1).lineSequence().firstOrNull { it.isNotBlank() }
        val indent = nextLine?.takeWhile { it == ' ' || it == '\t' }?.takeIf { it.length > outer.length } ?: "$outer    "
        val insertAt = m.range.last + 1
        val needsNewline = !m.value.endsWith("\n")
        return text.substring(0, insertAt) + (if (needsNewline) "\n" else "") + indent + line + "\n" + text.substring(insertAt)
    }

    private fun addPermission(rel: String, permission: String) = editXml(rel) { text, doc ->
        if (doc.root.childrenNamed("uses-permission").any { it.androidAttr("name") == permission }) throw FixNotAvailableException("Permission already declared")
        val app = doc.root.children.indexOfFirst { it.name == "application" }
        XmlEdits.insertChild(text, doc.root, "<uses-permission android:name=\"$permission\" />", index = if (app < 0) null else app)
    }

    private fun declareActivity(rel: String, name: String) = editXml(rel) { text, doc ->
        val app = doc.root.child("application") ?: throw FixNotAvailableException("No <application> element")
        if (app.childrenNamed("activity").any { it.androidAttr("name") == name }) throw FixNotAvailableException("Activity already declared")
        XmlEdits.insertChild(text, app, "<activity\n    android:name=\"$name\"\n    android:exported=\"false\" />")
    }

    private fun addValue(rel: String, type: String, name: String): FileChange {
        val value = when (type) {
            "string" -> XmlSource.escapeText(name.split('_', '.').filter { it.isNotEmpty() }.joinToString(" ").replaceFirstChar { it.uppercase() })
            "color" -> "#FF6750A4"
            "dimen" -> "16dp"
            else -> throw FixNotAvailableException("Cannot create @$type placeholders")
        }
        val element = "<$type name=\"$name\">$value</$type>"
        val existing = read(rel)
        if (existing == null) {
            return FileChange(rel, null, "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<resources>\n    $element\n</resources>\n")
        }
        return editXml(rel) { text, doc -> XmlEdits.insertChild(text, doc.root, element) }
    }

    private fun compileSdk(rel: String, version: Int) = modify(rel) { text ->
        val r = Regex("""(\bcompileSdk(?:Version)?\b\s*(?:=\s*)?)(\d+)""")
        if (!r.containsMatchIn(text)) throw FixNotAvailableException("compileSdk is not a literal number in this build file; edit it manually")
        r.replace(text) { it.groupValues[1] + version }
    }
}
