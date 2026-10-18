package com.appfix.core.generator

import com.appfix.core.layout.ClickAction
import com.appfix.core.layout.ClickActions
import com.appfix.core.layout.ClickSpec
import com.appfix.core.layout.ComponentKind
import com.appfix.core.layout.LayoutCapabilities
import com.appfix.core.layout.LayoutEditor
import com.appfix.core.patch.ChangeSet
import com.appfix.core.patch.FileChange
import com.appfix.core.project.GradleModule
import com.appfix.core.project.ModuleType
import com.appfix.core.project.ProjectInfo
import com.appfix.core.resources.ValuesEditor
import com.appfix.core.xml.XmlEdits
import com.appfix.core.xml.XmlSource
import java.io.File

enum class FeatureKind(val displayName: String, val prefix: String, val className: String) {
    ABOUT("About page", "about", "AboutActivity"),
    CONTACT("Contact page", "contact", "ContactActivity"),
    PRIVACY("Privacy policy page", "privacy", "PrivacyPolicyActivity"),
    HELP("Help / FAQ page", "help", "HelpActivity"),
    SETTINGS("Settings page", "settings", "SettingsActivity"),
    ONBOARDING("Intro / onboarding screens", "onboarding", "OnboardingActivity"),
}

data class FeatureOptions(
    val title: String = "",
    val description: String = "",
    val email: String = "",
    val website: String = "",
    val policyText: String = "",
    /** Adds a button to the launcher activity's layout that opens the new screen (XML projects only). */
    val addEntryButton: Boolean = true,
)

/** Facts about the project that decide how code is generated. */
data class ProjectStyle(
    val module: GradleModule,
    val namespace: String,
    val kotlin: Boolean,
    val compose: Boolean,
    val appCompat: Boolean,
    val material3Compose: Boolean,
    val hasMaterial: Boolean,
    val sourceRoot: String,
    val resDir: String,
    val manifest: String,
    val launcherLayout: String?,
    val launcherClass: String?,
)

data class GeneratedFeature(val plan: List<String>, val change: ChangeSet, val warnings: List<String>)

class GeneratorException(message: String) : RuntimeException(message)

/**
 * Generates new screens for supported native Android projects. It inspects the project first
 * (language, UI toolkit, AppCompat/Material, launcher activity) and only produces a reviewable
 * [ChangeSet]; nothing is written until the user applies it.
 */
class FeatureGenerator(private val workspace: File, private val info: ProjectInfo) {
    private val root = if (info.root.isEmpty()) workspace else File(workspace, info.root)
    private fun ws(rootRel: String) = if (info.root.isEmpty()) rootRel else "${info.root}/$rootRel"

    fun inspect(): ProjectStyle {
        if (info.androidDir == null) throw GeneratorException("Feature generation needs a native Android Gradle project (found ${info.framework.displayName}).")
        val module = info.modules.firstOrNull { it.type == ModuleType.APPLICATION } ?: throw GeneratorException("No Android application module was found.")
        val namespace = module.namespace ?: module.applicationId ?: throw GeneratorException("The app module has no namespace; run the Repair center first.")
        val manifest = module.manifestPath ?: throw GeneratorException("The app module has no AndroidManifest.xml.")
        val res = module.resDir ?: (if (module.dir.isEmpty()) "src/main/res" else "${module.dir}/src/main/res")
        val build = module.buildFile?.let { File(root, it).takeIf(File::isFile)?.readText() }.orEmpty()
        val catalog = File(root, "${info.androidDir.let { if (it.isEmpty()) "" else "$it/" }}gradle/libs.versions.toml").takeIf { it.isFile }?.readText().orEmpty()
        val deps = build + "\n" + catalog
        val src = listOf("src/main/java", "src/main/kotlin").map { if (module.dir.isEmpty()) it else "${module.dir}/$it" }.filter { File(root, it).isDirectory }
        val sources = src.flatMap { d -> File(root, d).walkTopDown().filter { it.isFile && (it.extension == "kt" || it.extension == "java") }.toList() }
        val kotlin = sources.count { it.extension == "kt" } >= sources.count { it.extension == "java" } && (sources.isNotEmpty() || build.contains("kotlin"))
        val manifestText = File(root, manifest).readText()
        val launcher = launcherActivity(manifestText, namespace)
        val launcherFile = launcher?.let { cls -> sources.firstOrNull { it.nameWithoutExtension == cls.substringAfterLast('.') } }
        val launcherText = launcherFile?.readText().orEmpty()
        val launcherLayout = Regex("""R\.layout\.(\w+)""").find(launcherText)?.groupValues?.get(1)
            ?: Regex("""(\w+)Binding\.inflate""").find(launcherText)?.groupValues?.get(1)?.let { b -> b.replace(Regex("([a-z0-9])([A-Z])"), "$1_$2").lowercase() }
        val compose = (module.usesCompose || launcherText.contains("setContent")) && launcherLayout == null
        val sourceRoot = src.firstOrNull { d -> launcherFile?.path?.contains(File(root, d).path) == true } ?: src.firstOrNull() ?: (if (module.dir.isEmpty()) "src/main/java" else "${module.dir}/src/main/java")
        return ProjectStyle(
            module = module, namespace = namespace, kotlin = kotlin, compose = compose,
            appCompat = deps.contains("appcompat"), material3Compose = deps.contains("material3"), hasMaterial = deps.contains("com.google.android.material") || Regex("""material\s*=""").containsMatchIn(catalog),
            sourceRoot = sourceRoot, resDir = res, manifest = manifest, launcherLayout = launcherLayout,
            launcherClass = launcher,
        )
    }

    private fun launcherActivity(manifest: String, ns: String): String? = runCatching {
        val doc = XmlSource.parse(manifest)
        val act = doc.root.child("application")?.childrenNamed("activity")?.firstOrNull { a ->
            a.childrenNamed("intent-filter").any { f -> f.childrenNamed("category").any { it.androidAttr("name") == "android.intent.category.LAUNCHER" } }
        }
        act?.androidAttr("name")?.let { if (it.startsWith(".")) ns + it else if (!it.contains('.')) "$ns.$it" else it }
    }.getOrNull()

    fun generate(kind: FeatureKind, options: FeatureOptions = FeatureOptions()): GeneratedFeature {
        if (kind == FeatureKind.CONTACT && options.email.isBlank() && options.website.isBlank()) throw GeneratorException("Enter an email address or a website for the contact page.")
        if (options.email.isNotBlank() && !options.email.trim().matches(Regex("[^@\\s]+@[^@\\s]+\\.[^@\\s]+"))) throw GeneratorException("The email address is not valid.")
        val style = inspect()
        val p = kind.prefix
        val cls = kind.className
        val ext = if (style.kotlin) "kt" else "java"
        val pkgPath = style.namespace.replace('.', '/')
        val classFile = "${style.sourceRoot}/$pkgPath/$cls.$ext"
        if (File(root, classFile).exists()) throw GeneratorException("$cls already exists in the project.")
        val manifestText = File(root, style.manifest).readText()
        if (manifestText.contains(".$cls\"") || manifestText.contains("${style.namespace}.$cls\"")) throw GeneratorException("$cls is already declared in the manifest.")
        if (style.compose && !style.kotlin) throw GeneratorException("Compose screens can only be generated for Kotlin projects.")

        val strings = linkedMapOf<String, String>()
        val title = options.title.ifBlank { kind.displayName.substringBefore(" page").substringBefore(" /") }
        strings["${p}_title"] = title
        when (kind) {
            FeatureKind.ABOUT -> {
                strings["${p}_version"] = "Version %1\$s"
                strings["${p}_description"] = options.description.ifBlank { "Describe what your app does and who made it." }
            }
            FeatureKind.CONTACT -> {
                strings["${p}_description"] = options.description.ifBlank { "We usually reply within two working days." }
                if (options.email.isNotBlank()) strings["${p}_email_button"] = "Email us"
                if (options.website.isNotBlank()) strings["${p}_website_button"] = "Visit our website"
                strings["${p}_no_app"] = "No app is available to handle this action"
            }
            FeatureKind.PRIVACY -> {
                strings["${p}_body"] = options.policyText.ifBlank { "Replace this text with your privacy policy. Explain what data the app collects, why, how long it is kept and how users can contact you." }
                if (options.website.isNotBlank()) strings["${p}_website_button"] = "Read the full policy"
                strings["${p}_no_app"] = "No app is available to open the link"
            }
            FeatureKind.HELP -> {
                strings["${p}_q1"] = "How do I get started?"
                strings["${p}_a1"] = "Replace this answer with instructions for your app."
                strings["${p}_q2"] = "Where is my data stored?"
                strings["${p}_a2"] = "Explain where and how the app stores data."
                strings["${p}_q3"] = "How can I contact support?"
                strings["${p}_a3"] = options.email.ifBlank { "Add your support contact details here." }
            }
            FeatureKind.ONBOARDING -> {
                strings["${p}_title"] = options.title.ifBlank { "Welcome" }
                strings["${p}_page1_title"] = options.title.ifBlank { "Welcome" }
                strings["${p}_page1_body"] = options.description.ifBlank { "Say what the app does in one sentence." }
                strings["${p}_page2_title"] = "Stay organised"
                strings["${p}_page2_body"] = "Describe a key feature here."
                strings["${p}_page3_title"] = "You're all set"
                strings["${p}_page3_body"] = "Explain how to get started."
                strings["${p}_next"] = "Next"
                strings["${p}_skip"] = "Skip"
                strings["${p}_done"] = "Get started"
            }
            FeatureKind.SETTINGS -> {
                strings["${p}_dark_theme"] = "Dark theme"
                strings["${p}_dark_theme_summary"] = "Use a dark colour scheme"
                strings["${p}_notifications"] = "Notifications"
                strings["${p}_notifications_summary"] = "Saved on this device only"
            }
        }
        val changes = mutableListOf<FileChange>()
        val plan = mutableListOf<String>()
        val warnings = mutableListOf<String>()
        plan += "Detected: ${if (style.kotlin) "Kotlin" else "Java"}, ${if (style.compose) "Jetpack Compose" else "XML layouts"}, " +
            (if (style.appCompat) "AppCompat" else "platform Activity") + ", package ${style.namespace}"
        val layoutName = "activity_$p"
        if (style.compose) {
            changes += FileChange(ws(classFile), null, ComposeTemplates.activity(kind, style, options))
            plan += "Create $classFile (a ComponentActivity hosting a Compose screen)"
            if (kind == FeatureKind.SETTINGS) warnings += "The dark-theme switch is stored, but your app theme must read the \"dark_theme\" preference to apply it."
        } else {
            val layoutPath = "${style.resDir}/layout/$layoutName.xml"
            if (File(root, layoutPath).exists()) throw GeneratorException("$layoutPath already exists.")
            changes += FileChange(ws(layoutPath), null, ViewTemplates.layout(kind, style, options, File(root, style.resDir)))
            changes += FileChange(ws(classFile), null, ViewTemplates.activity(kind, style, options))
            plan += "Create $layoutPath"
            plan += "Create $classFile"
            if (kind == FeatureKind.SETTINGS && !style.appCompat) warnings += "Without AppCompat the dark-theme switch is saved but not applied automatically."
        }
        // Strings
        val stringsPath = "${style.resDir}/values/strings.xml"
        val stringsFile = File(root, stringsPath)
        val before = stringsFile.takeIf { it.isFile }?.readText()
        var text = before
        val existing = before?.let { runCatching { ValuesEditor.read(it).map { e -> e.name }.toSet() }.getOrElse { throw GeneratorException("strings.xml is not valid XML; fix it first.") } }.orEmpty()
        for ((k, v) in strings) {
            if (k in existing) { warnings += "@string/$k already exists and was kept"; continue }
            text = if (text == null) ValuesEditor.newFile("string", k, v) else ValuesEditor.add(text, "string", k, v)
        }
        if (text != before) {
            changes += FileChange(ws(stringsPath), before, text)
            plan += "Add ${strings.size} string resource(s) to $stringsPath"
        }
        // Manifest
        val manifestDoc = XmlSource.parse(manifestText)
        val app = manifestDoc.root.child("application") ?: throw GeneratorException("The manifest has no <application> element.")
        val newManifest = XmlEdits.insertChild(manifestText, app, "<activity\n    android:name=\".$cls\"\n    android:exported=\"false\"\n    android:label=\"@string/${p}_title\" />")
        XmlSource.parse(newManifest)
        changes += FileChange(ws(style.manifest), manifestText, newManifest)
        plan += "Declare $cls in ${style.manifest} (not exported)"

        // Entry point
        if (kind == FeatureKind.ONBOARDING) {
            val inject = firstLaunchHook(style, cls)
            changes += inject.first
            plan += inject.second
        } else if (options.addEntryButton) {
            val entry = entryPoint(style, cls, title)
            if (entry != null) {
                changes += entry.first
                plan += entry.second
            } else {
                warnings += if (style.compose) "Open the new screen from your UI with: startActivity(Intent(context, $cls::class.java))"
                else "No launcher layout was found to add a button to; start $cls from your code."
            }
        }
        // Merge repeated paths (strings.xml may be touched by the entry point).
        val merged = mergeChanges(changes)
        return GeneratedFeature(
            plan = plan,
            change = ChangeSet(title = "Add ${kind.displayName}", description = plan.joinToString("\n"), source = "generator:${kind.name.lowercase()}", changes = merged,
                followUps = listOf("Rebuild the project to confirm it compiles.", "Edit the generated text in Strings & colours.")),
            warnings = warnings,
        )
    }

    /** Starts [cls] from the launcher activity until the user has finished onboarding. */
    private fun firstLaunchHook(style: ProjectStyle, cls: String): Pair<FileChange, String> {
        val launcher = style.launcherClass ?: throw GeneratorException("No launcher activity was found to show onboarding from.")
        val src = listOf(File(root, style.sourceRoot)).flatMap { d -> d.walkTopDown().filter { it.isFile && it.nameWithoutExtension == launcher.substringAfterLast('.') && (it.extension == "kt" || it.extension == "java") }.toList() }.firstOrNull()
            ?: throw GeneratorException("The launcher activity source (${launcher.substringAfterLast('.')}) was not found.")
        val text = src.readText()
        if (text.contains("$cls::class.java") || text.contains("$cls.class")) throw GeneratorException("${src.name} already opens $cls.")
        val anchor = Regex("""super\.onCreate\s*\(""").find(text) ?: throw GeneratorException("Could not find super.onCreate(...) in ${src.name}")
        var depth = 0
        var i = anchor.range.last
        while (i < text.length) { when (text[i]) { '(' -> depth++; ')' -> { depth--; if (depth == 0) break } }; i++ }
        var end = i + 1
        if (end < text.length && text[end] == ';') end++
        val lineStart = text.lastIndexOf('\n', anchor.range.first) + 1
        val indent = text.substring(lineStart).takeWhile { it == ' ' || it == '\t' }
        val kotlin = src.extension == "kt"
        val hook = if (kotlin) {
            "if (!getSharedPreferences(\"onboarding\", MODE_PRIVATE).getBoolean(\"done\", false)) {\n    startActivity(android.content.Intent(this, $cls::class.java))\n}"
        } else {
            "if (!getSharedPreferences(\"onboarding\", MODE_PRIVATE).getBoolean(\"done\", false)) {\n    startActivity(new android.content.Intent(this, $cls.class));\n}"
        }
        val block = "\n" + hook.lines().joinToString("\n") { indent + it }
        val after = text.substring(0, end) + block + text.substring(end)
        return FileChange(ws(src.relativeTo(root).invariantSeparatorsPath), text, after) to "Show $cls on first launch from ${src.name}"
    }

    /** Adds a button to the launcher layout and a click handler that opens [cls]. */
    private fun entryPoint(style: ProjectStyle, cls: String, title: String): Pair<List<FileChange>, String>? {
        val layoutName = style.launcherLayout ?: return null
        if (style.compose) return null
        val layoutPath = "${style.resDir}/layout/$layoutName.xml"
        val layoutFile = File(root, layoutPath).takeIf { it.isFile } ?: return null
        val layoutText = layoutFile.readText()
        val tree = runCatching { LayoutEditor.parse(layoutText) }.getOrNull() ?: return null
        val container = tree.flatten().firstOrNull { it.simpleTag == "LinearLayout" } ?: (if (tree.isContainer) tree else return null)
        val caps = LayoutCapabilities(style.hasMaterial, style.appCompat, false)
        val inserted = try {
            LayoutEditor.insert(layoutText, container.path, null, ComponentKind.BUTTON, caps, LayoutEditor.declaredIds(layoutText) + allIds(style), label = title)
        } catch (e: Exception) {
            return null
        }
        val sourceRoots = listOf(File(root, style.sourceRoot))
        val host = ClickActions.findHost(sourceRoots, root, layoutName) ?: return null
        val hostText = File(root, host.path).readText()
        val handler = try {
            ClickActions.addHandler(hostText, host, inserted.newId, ClickSpec(ClickAction.OPEN_SCREEN, "${style.namespace}.$cls"))
        } catch (e: Exception) {
            return null
        }
        val stringsPath = "${style.resDir}/values/strings.xml"
        val stringsBefore = File(root, stringsPath).takeIf { it.isFile }?.readText()
        var s = stringsBefore
        for ((k, v) in inserted.strings + handler.strings) s = if (s == null) ValuesEditor.newFile("string", k, v) else ValuesEditor.add(s, "string", k, v)
        val list = mutableListOf(FileChange(ws(layoutPath), layoutText, inserted.layoutText), FileChange(ws(host.path), hostText, handler.source))
        if (s != stringsBefore) list += FileChange(ws(stringsPath), stringsBefore, s)
        return list to "Add a \"$title\" button to $layoutName.xml and open $cls from ${host.path.substringAfterLast('/')}"
    }

    private fun allIds(style: ProjectStyle): Set<String> =
        File(root, "${style.resDir}/layout").listFiles().orEmpty().flatMap { LayoutEditor.declaredIds(it.readText()) }.toSet()

    companion object {
        /** Combines several changes to the same file into one before→after change. */
        fun mergeChanges(changes: List<FileChange>): List<FileChange> {
            val byPath = LinkedHashMap<String, FileChange>()
            for (c in changes) {
                val prev = byPath[c.path]
                byPath[c.path] = if (prev == null) c else {
                    // Re-apply: the later change was computed from the original file, so merge string additions.
                    if (c.path.endsWith("strings.xml") && prev.after != null && c.after != null) {
                        val added = runCatching { ValuesEditor.read(c.after).filter { e -> prev.after.let { !it.contains("name=\"${e.name}\"") } } }.getOrDefault(emptyList())
                        var t: String = prev.after
                        for (e in added) t = ValuesEditor.add(t, e.type, e.name, e.value)
                        FileChange(c.path, prev.before, t)
                    } else c.copy(before = prev.before)
                }
            }
            return byPath.values.toList()
        }
    }
}
