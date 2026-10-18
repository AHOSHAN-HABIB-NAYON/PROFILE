package com.appfix.core.branding

import com.appfix.core.patch.ChangeSet
import com.appfix.core.patch.FileChange
import com.appfix.core.project.ModuleType
import com.appfix.core.project.ProjectInfo
import com.appfix.core.resources.ValuesEditor
import com.appfix.core.util.B64
import com.appfix.core.xml.XmlEdits
import com.appfix.core.xml.XmlSource
import java.io.File

class BrandingException(message: String) : RuntimeException(message)

/** A bitmap the app must render for the launcher icon. */
data class IconOutput(val path: String, val sizePx: Int, val kind: Kind) {
    enum class Kind { LEGACY, ROUND, FOREGROUND }
}

data class AppTheme(val styleName: String, val file: String, val parent: String?, val items: Map<String, String>)

/**
 * Branding edits for native Android projects: launcher icon, app name, theme colours, font,
 * activity transitions, splash screen and Lottie. Everything is returned as a reviewable ChangeSet.
 */
class BrandingEditor(private val workspace: File, private val info: ProjectInfo) {
    private val root = if (info.root.isEmpty()) workspace else File(workspace, info.root)
    private fun ws(rel: String) = if (info.root.isEmpty()) rel else "${info.root}/$rel"
    private val module = info.modules.firstOrNull { it.type == ModuleType.APPLICATION } ?: throw BrandingException("No Android application module was found.")
    val resDir: String = module.resDir ?: (if (module.dir.isEmpty()) "src/main/res" else "${module.dir}/src/main/res")
    private val manifestPath = module.manifestPath ?: throw BrandingException("The app module has no AndroidManifest.xml.")
    private fun read(rel: String): String? = File(root, rel).takeIf { it.isFile }?.readText()

    // ------------------------------------------------------------------ Launcher icon

    data class IconNames(val icon: String, val round: String?)

    fun iconNames(): IconNames {
        val app = XmlSource.parse(read(manifestPath)!!).root.child("application") ?: throw BrandingException("No <application> in the manifest")
        fun name(attr: String) = app.androidAttr(attr)?.takeIf { it.startsWith("@mipmap/") || it.startsWith("@drawable/") }?.substringAfter('/')
        return IconNames(name("icon") ?: "ic_launcher", name("roundIcon"))
    }

    /** Bitmaps to render: legacy + round icons for each density and adaptive foregrounds. */
    fun iconOutputs(): List<IconOutput> {
        val names = iconNames()
        val densities = listOf("mdpi" to 1f, "hdpi" to 1.5f, "xhdpi" to 2f, "xxhdpi" to 3f, "xxxhdpi" to 4f)
        val out = mutableListOf<IconOutput>()
        for ((d, scale) in densities) {
            out += IconOutput("$resDir/mipmap-$d/${names.icon}.png", (48 * scale).toInt(), IconOutput.Kind.LEGACY)
            out += IconOutput("$resDir/mipmap-$d/${names.round ?: names.icon + "_round"}.png", (48 * scale).toInt(), IconOutput.Kind.ROUND)
            out += IconOutput("$resDir/mipmap-$d/${names.icon}_foreground.png", (108 * scale).toInt(), IconOutput.Kind.FOREGROUND)
        }
        return out
    }

    /**
     * Builds the icon change from rendered bitmaps ([pngs]: path -> PNG bytes). Existing icon files with
     * the same resource names but other formats (e.g. .webp) are removed so aapt does not report duplicates.
     */
    fun iconChange(pngs: Map<String, ByteArray>, backgroundColor: String): ChangeSet {
        if (ValuesEditor.validate("color", "c", backgroundColor) != null) throw BrandingException("Background must be a colour such as #FFFFFFFF")
        val names = iconNames()
        val roundName = names.round ?: (names.icon + "_round")
        val ourNames = setOf(names.icon, roundName, "${names.icon}_foreground")
        val changes = mutableListOf<FileChange>()
        val resRoot = File(root, resDir)
        // Remove conflicting files (same name, same folder, different extension) and old density-specific copies.
        for (dir in resRoot.listFiles().orEmpty().filter { it.isDirectory && it.name.startsWith("mipmap-") && !it.name.contains("anydpi") }) {
            for (f in dir.listFiles().orEmpty()) {
                if (f.nameWithoutExtension in ourNames && f.extension != "png") {
                    val rel = f.relativeTo(root).invariantSeparatorsPath
                    changes += FileChange(ws(rel), B64.encode(f.readBytes()), null, isBinary = true)
                }
            }
        }
        for ((path, bytes) in pngs) {
            val f = File(root, path)
            changes += FileChange(ws(path), f.takeIf { it.isFile }?.readBytes()?.let(B64::encode), B64.encode(bytes), isBinary = true)
        }
        // Adaptive icons (API 26+), with a monochrome layer for themed icons (API 33+).
        val adaptive = { fg: String -> """
            |<?xml version="1.0" encoding="utf-8"?>
            |<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
            |    <background android:drawable="@color/${names.icon}_background" />
            |    <foreground android:drawable="@mipmap/$fg" />
            |    <monochrome android:drawable="@mipmap/$fg" />
            |</adaptive-icon>
            |""".trimMargin() }
        for (name in listOf(names.icon, roundName)) {
            val path = "$resDir/mipmap-anydpi-v26/$name.xml"
            changes += FileChange(ws(path), read(path), adaptive("${names.icon}_foreground"))
            // An unversioned anydpi copy would shadow the PNGs on API 24-25.
            val unversioned = "$resDir/mipmap-anydpi/$name.xml"
            read(unversioned)?.let { changes += FileChange(ws(unversioned), it, null) }
        }
        changes += colorChange("${names.icon}_background", backgroundColor)
        // Make sure the manifest uses both icons.
        val manifest = read(manifestPath)!!
        var m = manifest
        val app = XmlSource.parse(m).root.child("application")!!
        if (app.androidAttr("icon") == null) m = XmlEdits.setAttribute(m, app, "android:icon", "@mipmap/${names.icon}")
        if (XmlSource.parse(m).root.child("application")!!.androidAttr("roundIcon") == null) {
            m = XmlEdits.setAttribute(m, XmlSource.parse(m).root.child("application")!!, "android:roundIcon", "@mipmap/$roundName")
        }
        if (m != manifest) changes += FileChange(ws(manifestPath), manifest, m)
        return ChangeSet(title = "Replace app icon", source = "branding:icon", changes = merge(changes),
            followUps = listOf("Uninstall and reinstall the app if the launcher keeps showing the old icon (launchers cache icons)."))
    }

    // ------------------------------------------------------------------ App name

    fun appName(): Pair<String, String?> {
        val app = XmlSource.parse(read(manifestPath)!!).root.child("application") ?: throw BrandingException("No <application> in the manifest")
        val label = app.androidAttr("label") ?: return "" to null
        if (label.startsWith("@string/")) {
            val key = label.removePrefix("@string/")
            val value = read("$resDir/values/strings.xml")?.let { t -> runCatching { ValuesEditor.read(t).firstOrNull { it.type == "string" && it.name == key }?.value }.getOrNull() }
            return (value ?: "") to key
        }
        return label to null
    }

    fun appNameChange(newName: String): ChangeSet {
        if (newName.isBlank()) throw BrandingException("The app name cannot be empty")
        val (_, key) = appName()
        val changes = mutableListOf<FileChange>()
        if (key != null) {
            val path = "$resDir/values/strings.xml"
            val before = read(path)
            val after = if (before == null) ValuesEditor.newFile("string", key, newName)
            else if (ValuesEditor.read(before).any { it.type == "string" && it.name == key }) ValuesEditor.setValue(before, "string", key, newName)
            else ValuesEditor.add(before, "string", key, newName)
            changes += FileChange(ws(path), before, after)
        } else {
            // Move a hard-coded label into a string resource.
            val path = "$resDir/values/strings.xml"
            val before = read(path)
            val exists = before?.let { ValuesEditor.read(it).any { e -> e.name == "app_name" } } == true
            val after = when {
                before == null -> ValuesEditor.newFile("string", "app_name", newName)
                exists -> ValuesEditor.setValue(before, "string", "app_name", newName)
                else -> ValuesEditor.add(before, "string", "app_name", newName)
            }
            changes += FileChange(ws(path), before, after)
            val manifest = read(manifestPath)!!
            val app = XmlSource.parse(manifest).root.child("application")!!
            changes += FileChange(ws(manifestPath), manifest, XmlEdits.setAttribute(manifest, app, "android:label", "@string/app_name"))
        }
        return ChangeSet(title = "Rename app to \"$newName\"", source = "branding:name", changes = changes)
    }

    // ------------------------------------------------------------------ Theme

    fun appTheme(): AppTheme? {
        val app = XmlSource.parse(read(manifestPath)!!).root.child("application") ?: return null
        val name = app.androidAttr("theme")?.removePrefix("@style/") ?: return null
        for (file in themeFiles()) {
            val text = read(file) ?: continue
            val doc = runCatching { XmlSource.parse(text) }.getOrNull() ?: continue
            val style = doc.root.childrenNamed("style").firstOrNull { it.attrValue("name") == name } ?: continue
            val items = style.childrenNamed("item").associate { it.attrValue("name").orEmpty() to text.substring(it.startTagEnd, it.endTagStart).trim() }
            return AppTheme(name, file, style.attrValue("parent"), items)
        }
        return null
    }

    private fun themeFiles(): List<String> = File(root, "$resDir/values").listFiles().orEmpty().filter { it.extension == "xml" }
        .sortedBy { if (it.name == "themes.xml") 0 else if (it.name == "styles.xml") 1 else 2 }.map { "$resDir/values/${it.name}" }

    /** Colour items of the app theme, resolved to literal values where possible. */
    fun themeColors(): List<Triple<String, String, String?>> {
        val theme = appTheme() ?: return emptyList()
        val colors = colorValues()
        return theme.items.filter { (k, v) -> k.contains("color", true) || v.startsWith("@color/") || v.startsWith("#") }
            .map { (k, v) -> Triple(k, v, if (v.startsWith("@color/")) colors[v.removePrefix("@color/")] else v.takeIf { it.startsWith("#") }) }
    }

    private fun colorValues(): Map<String, String> = read("$resDir/values/colors.xml")?.let { t ->
        runCatching { ValuesEditor.read(t).filter { it.type == "color" }.associate { it.name to it.value } }.getOrDefault(emptyMap())
    }.orEmpty()

    private fun colorChange(name: String, value: String): FileChange {
        val path = "$resDir/values/colors.xml"
        val before = read(path)
        val after = when {
            before == null -> ValuesEditor.newFile("color", name, value)
            ValuesEditor.read(before).any { it.type == "color" && it.name == name } -> ValuesEditor.setValue(before, "color", name, value)
            else -> ValuesEditor.add(before, "color", name, value)
        }
        return FileChange(ws(path), before, after)
    }

    /**
     * Sets a theme colour. If the item points at @color/x, x is changed (affecting every user of the
     * colour); otherwise a new colour resource is created and referenced.
     */
    fun themeColorChange(item: String, value: String): ChangeSet {
        val theme = appTheme() ?: throw BrandingException("The app theme could not be found in values/")
        if (ValuesEditor.validate("color", "c", value) != null) throw BrandingException("Use a colour such as #FF2753E0")
        val current = theme.items[item]
        val changes = mutableListOf<FileChange>()
        if (current != null && current.startsWith("@color/")) {
            changes += colorChange(current.removePrefix("@color/"), value)
        } else {
            val colorName = "theme_" + item.substringAfter(':').replace(Regex("([a-z])([A-Z])"), "$1_$2").lowercase()
            changes += colorChange(colorName, value)
            changes += setThemeItem(theme, item, "@color/$colorName")
        }
        return ChangeSet(title = "Set $item to $value", source = "branding:theme", changes = merge(changes))
    }

    private fun setThemeItem(theme: AppTheme, item: String, value: String): FileChange {
        val text = read(theme.file)!!
        val doc = XmlSource.parse(text)
        val style = doc.root.childrenNamed("style").first { it.attrValue("name") == theme.styleName }
        val existing = style.childrenNamed("item").firstOrNull { it.attrValue("name") == item }
        val after = if (existing != null) {
            text.substring(0, existing.startTagEnd) + XmlSource.escapeText(value) + text.substring(existing.endTagStart)
        } else {
            XmlEdits.insertChild(text, style, "<item name=\"$item\">${XmlSource.escapeText(value)}</item>")
        }
        XmlSource.parse(after)
        return FileChange(ws(theme.file), text, after)
    }

    /** Sets the default font family for the whole app through the theme (system fonts only). */
    fun fontChange(family: String): ChangeSet {
        val allowed = setOf("sans-serif", "sans-serif-medium", "sans-serif-light", "sans-serif-condensed", "serif", "monospace", "casual", "cursive")
        if (family !in allowed) throw BrandingException("Choose one of: ${allowed.joinToString()}")
        val theme = appTheme() ?: throw BrandingException("The app theme could not be found in values/")
        return ChangeSet(title = "Use $family as the app font", source = "branding:font", changes = listOf(setThemeItem(theme, "android:fontFamily", family)),
            followUps = listOf("Text with an explicit android:fontFamily or Compose typography keeps its own font."))
    }

    // ------------------------------------------------------------------ Transitions

    enum class Transition(val displayName: String) { FADE("Fade"), SLIDE("Slide") }

    /** Applies a fade or slide animation to every activity transition through the theme. */
    fun transitionChange(kind: Transition, durationMs: Int = 250): ChangeSet {
        if (durationMs !in 50..1000) throw BrandingException("Duration must be between 50 and 1000 ms")
        val theme = appTheme() ?: throw BrandingException("The app theme could not be found in values/")
        val anim = "$resDir/anim"
        fun alpha(from: Float, to: Float) = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<alpha xmlns:android=\"http://schemas.android.com/apk/res/android\"\n    android:duration=\"$durationMs\"\n    android:fromAlpha=\"$from\"\n    android:toAlpha=\"$to\"\n    android:interpolator=\"@android:interpolator/fast_out_slow_in\" />\n"
        fun slide(from: String, to: String) = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<translate xmlns:android=\"http://schemas.android.com/apk/res/android\"\n    android:duration=\"$durationMs\"\n    android:fromXDelta=\"$from\"\n    android:toXDelta=\"$to\"\n    android:interpolator=\"@android:interpolator/fast_out_slow_in\" />\n"
        val files = if (kind == Transition.FADE) mapOf(
            "appfix_open_enter" to alpha(0f, 1f), "appfix_open_exit" to alpha(1f, 0.6f), "appfix_close_enter" to alpha(0.6f, 1f), "appfix_close_exit" to alpha(1f, 0f),
        ) else mapOf(
            "appfix_open_enter" to slide("100%", "0%"), "appfix_open_exit" to slide("0%", "-30%"), "appfix_close_enter" to slide("-30%", "0%"), "appfix_close_exit" to slide("0%", "100%"),
        )
        val changes = files.map { (n, c) -> FileChange(ws("$anim/$n.xml"), read("$anim/$n.xml"), c) }.toMutableList()
        // Window animation style referenced from the app theme.
        val stylesPath = theme.file
        var text = read(stylesPath)!!
        val doc = XmlSource.parse(text)
        val styleName = "AppFix.ActivityAnimation"
        val styleXml = "<style name=\"$styleName\" parent=\"@android:style/Animation.Activity\">\n" +
            "    <item name=\"android:activityOpenEnterAnimation\">@anim/appfix_open_enter</item>\n" +
            "    <item name=\"android:activityOpenExitAnimation\">@anim/appfix_open_exit</item>\n" +
            "    <item name=\"android:activityCloseEnterAnimation\">@anim/appfix_close_enter</item>\n" +
            "    <item name=\"android:activityCloseExitAnimation\">@anim/appfix_close_exit</item>\n</style>"
        if (doc.root.childrenNamed("style").none { it.attrValue("name") == styleName }) text = XmlEdits.insertChild(text, doc.root, styleXml)
        val themeNow = theme
        val withStyle = text
        val itemChange = run {
            val d = XmlSource.parse(withStyle)
            val style = d.root.childrenNamed("style").first { it.attrValue("name") == themeNow.styleName }
            val existing = style.childrenNamed("item").firstOrNull { it.attrValue("name") == "android:windowAnimationStyle" }
            if (existing != null) withStyle.substring(0, existing.startTagEnd) + "@style/$styleName" + withStyle.substring(existing.endTagStart)
            else XmlEdits.insertChild(withStyle, style, "<item name=\"android:windowAnimationStyle\">@style/$styleName</item>")
        }
        XmlSource.parse(itemChange)
        changes += FileChange(ws(stylesPath), read(stylesPath), itemChange)
        return ChangeSet(title = "${kind.displayName} transitions between screens", source = "branding:transition", changes = changes,
            followUps = listOf("Applies to activity transitions. Compose navigation animations are configured in code."))
    }

    // ------------------------------------------------------------------ Splash screen

    /**
     * Sets the Android 12+ splash screen background and icon. Projects using androidx core-splashscreen
     * get their Theme.SplashScreen style updated; others get a values-v31 copy of the app theme.
     */
    fun splashChange(backgroundColor: String, iconDrawable: String?): ChangeSet {
        if (ValuesEditor.validate("color", "c", backgroundColor) != null) throw BrandingException("Use a colour such as #FFFFFFFF")
        val icon = iconDrawable?.takeIf { it.isNotBlank() }
        if (icon != null && !icon.matches(Regex("@(drawable|mipmap)/[a-z0-9_]+"))) throw BrandingException("Icon must be a @drawable/ or @mipmap/ resource")
        val changes = mutableListOf(colorChange("splash_background", backgroundColor))
        val theme = appTheme() ?: throw BrandingException("The app theme could not be found in values/")
        val splashStyle = if (theme.parent?.startsWith("Theme.SplashScreen") == true) theme else null
        if (splashStyle != null) {
            changes += setThemeItem(splashStyle, "windowSplashScreenBackground", "@color/splash_background")
            if (icon != null) {
                val t = changes.last()
                val text = t.after!!
                val doc = XmlSource.parse(text)
                val style = doc.root.childrenNamed("style").first { it.attrValue("name") == splashStyle.styleName }
                val existing = style.childrenNamed("item").firstOrNull { it.attrValue("name") == "windowSplashScreenAnimatedIcon" }
                val after = if (existing != null) text.substring(0, existing.startTagEnd) + icon + text.substring(existing.endTagStart)
                else XmlEdits.insertChild(text, style, "<item name=\"windowSplashScreenAnimatedIcon\">$icon</item>")
                changes[changes.lastIndex] = t.copy(after = after)
            }
        } else {
            // values-v31 override: a full copy of the theme plus the splash attributes.
            val path = "$resDir/values-v31/themes.xml"
            val before = read(path)
            val baseText = read(theme.file)!!
            val baseStyle = XmlSource.parse(baseText).root.childrenNamed("style").first { it.attrValue("name") == theme.styleName }
            val items = baseStyle.childrenNamed("item").filter { it.attrValue("name") !in setOf("android:windowSplashScreenBackground", "android:windowSplashScreenAnimatedIcon") }
                .joinToString("\n") { "    " + baseText.substring(it.start, it.end).trim() }
            val extra = buildString {
                append("    <item name=\"android:windowSplashScreenBackground\">@color/splash_background</item>")
                if (icon != null) append("\n    <item name=\"android:windowSplashScreenAnimatedIcon\">$icon</item>")
            }
            val parent = theme.parent?.let { " parent=\"$it\"" }.orEmpty()
            val style = "<style name=\"${theme.styleName}\"$parent>\n" + (if (items.isNotEmpty()) "$items\n" else "") + "$extra\n</style>"
            val after = if (before == null) {
                "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<resources>\n" + style.lines().joinToString("\n") { "    $it" } + "\n</resources>\n"
            } else {
                val doc = XmlSource.parse(before)
                val existing = doc.root.childrenNamed("style").firstOrNull { it.attrValue("name") == theme.styleName }
                val removed = if (existing != null) XmlEdits.removeNode(before, existing) else before
                XmlEdits.insertChild(removed, XmlSource.parse(removed).root, style)
            }
            XmlSource.parse(after)
            changes += FileChange(ws(path), before, after)
        }
        return ChangeSet(title = "Customise splash screen", source = "branding:splash", changes = merge(changes),
            followUps = listOf("The system splash screen appears on Android 12+; with androidx core-splashscreen it also appears on older versions."))
    }

    // ------------------------------------------------------------------ Lottie

    /** Copies a Lottie JSON animation into res/raw and adds the Lottie dependency if needed. */
    fun lottieChange(name: String, json: String, version: String = LOTTIE_VERSION): ChangeSet {
        if (!name.matches(Regex("[a-z][a-z0-9_]{0,60}"))) throw BrandingException("Name must use lowercase letters, digits and _")
        if (!json.trimStart().startsWith("{") || !json.contains("\"layers\"")) throw BrandingException("This does not look like a Lottie animation (JSON with \"layers\").")
        if (json.length > 5_000_000) throw BrandingException("Animation is larger than 5 MB")
        val changes = mutableListOf<FileChange>()
        val raw = "$resDir/raw/$name.json"
        changes += FileChange(ws(raw), read(raw), json)
        val buildFile = module.buildFile ?: throw BrandingException("The app module has no build file")
        val build = read(buildFile)!!
        if (!build.contains("com.airbnb.android:lottie") && !build.contains("libs.lottie")) {
            val kts = buildFile.endsWith(".kts")
            val line = if (kts) "implementation(\"com.airbnb.android:lottie:$version\")" else "implementation 'com.airbnb.android:lottie:$version'"
            val m = Regex("""(?m)^([ \t]*)dependencies\s*\{[ \t]*\n""").findAll(build).lastOrNull() ?: throw BrandingException("No dependencies { } block found in $buildFile")
            val indent = m.groupValues[1] + "    "
            val after = build.substring(0, m.range.last + 1) + indent + line + "\n" + build.substring(m.range.last + 1)
            changes += FileChange(ws(buildFile), build, after)
        }
        return ChangeSet(title = "Add Lottie animation $name", source = "branding:lottie", changes = changes,
            followUps = listOf("Add it to a layout with the visual editor's Lottie component, or use LottieAnimationView with app:lottie_rawRes=\"@raw/$name\".", "Lottie needs a network-free build of the dependency; sync Gradle after applying."))
    }

    companion object {
        const val LOTTIE_VERSION = "6.6.7"

        fun merge(changes: List<FileChange>): List<FileChange> {
            val out = LinkedHashMap<String, FileChange>()
            for (c in changes) {
                val prev = out[c.path]
                out[c.path] = if (prev == null) c else FileChange(c.path, prev.before, c.after, c.isBinary)
            }
            return out.values.filter { it.before != it.after }
        }
    }
}

