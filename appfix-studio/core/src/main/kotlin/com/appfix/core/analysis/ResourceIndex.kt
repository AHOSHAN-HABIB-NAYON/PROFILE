package com.appfix.core.analysis

import com.appfix.core.xml.XmlSource
import com.appfix.core.xml.XmlSyntaxException
import java.io.File

/** Resources defined by the project's local `res/` folders. Library resources are not visible. */
class ResourceIndex private constructor(
    val defined: Map<String, Set<String>>,
    /** (type/name, qualifier) -> files, used to find duplicate definitions. */
    val valueDefinitions: Map<Pair<String, String>, List<String>>,
    val parseErrors: List<Triple<String, Int, String>>,
    val badFileNames: List<String>,
    /** (type, name, file) for resources or ids that use a Java keyword as their name. */
    val reservedNames: List<Triple<String, String, String>> = emptyList(),
) {
    fun has(type: String, name: String): Boolean {
        val normalizedType = when (type) { "array", "string-array", "integer-array" -> "array"; else -> type }
        val key = name.replace('.', '_')
        return defined[normalizedType]?.let { key in it || name in it } == true
    }

    companion object {
        private val valueTags = mapOf(
            "string" to "string", "color" to "color", "dimen" to "dimen", "style" to "style", "bool" to "bool",
            "integer" to "integer", "array" to "array", "string-array" to "array", "integer-array" to "array",
            "plurals" to "plurals", "attr" to "attr", "declare-styleable" to "styleable", "fraction" to "fraction",
            "drawable" to "drawable", "id" to "id",
        )
        private val fileTypes = setOf("drawable", "mipmap", "layout", "anim", "animator", "xml", "raw", "font", "menu", "navigation", "color", "transition", "interpolator")
        private val validFileName = Regex("^[a-z0-9_]+(\\.9)?$")

        /** [resDirs] are absolute res directories; [relativize] converts a file to a workspace path. */
        fun build(resDirs: List<File>, relativize: (File) -> String): ResourceIndex {
            val defined = HashMap<String, MutableSet<String>>()
            val defs = HashMap<Pair<String, String>, MutableList<String>>()
            val errors = mutableListOf<Triple<String, Int, String>>()
            val badNames = mutableListOf<String>()
            val reserved = mutableListOf<Triple<String, String, String>>()
            var currentFile = ""
            fun add(type: String, name: String) {
                defined.getOrPut(type) { HashSet() } += name.replace('.', '_')
                if (com.appfix.core.util.JavaNames.isReserved(name)) reserved += Triple(type, name, currentFile)
            }
            for (res in resDirs) {
                for (folder in res.listFiles().orEmpty().filter { it.isDirectory }) {
                    val type = folder.name.substringBefore('-')
                    val qualifier = folder.name.substringAfter('-', "")
                    for (file in folder.listFiles().orEmpty().filter { it.isFile }) {
                        if (file.name.startsWith(".")) continue
                        currentFile = relativize(file)
                        if (type == "values") {
                            if (file.extension != "xml") continue
                            val text = file.readText()
                            try {
                                val doc = XmlSource.parse(text)
                                for (node in doc.root.children) {
                                    val name = node.attrValue("name") ?: continue
                                    val t = if (node.name == "item") node.attrValue("type") ?: continue else valueTags[node.name] ?: continue
                                    add(t, name)
                                    if (t != "attr" && t != "id" && t != "styleable") defs.getOrPut("$t/$name" to qualifier) { mutableListOf() } += relativize(file)
                                    if (node.name == "declare-styleable") node.childrenNamed("attr").forEach { a -> a.attrValue("name")?.let { add("attr", it) } }
                                }
                            } catch (e: XmlSyntaxException) {
                                errors += Triple(relativize(file), e.line, e.message ?: "Invalid XML")
                            }
                        } else if (type in fileTypes) {
                            val base = file.name.substringBefore('.')
                            val nameNoExt = file.name.removeSuffix(".${file.extension}")
                            if (!validFileName.matches(nameNoExt)) badNames += relativize(file)
                            add(type, base)
                            if (file.extension == "xml") {
                                val text = file.readText()
                                try {
                                    val doc = XmlSource.parse(text)
                                    doc.root.descendants().forEach { n ->
                                        n.attributes.forEach { a -> Regex("@\\+id/([A-Za-z0-9_.]+)").find(a.value)?.let { add("id", it.groupValues[1]) } }
                                    }
                                } catch (e: XmlSyntaxException) {
                                    errors += Triple(relativize(file), e.line, e.message ?: "Invalid XML")
                                }
                            }
                        }
                    }
                }
            }
            return ResourceIndex(defined, defs, errors, badNames, reserved.distinct())
        }

        /** Resource prefixes and style families that come from AndroidX / Material libraries. */
        val libraryPrefixes = listOf("abc_", "mtrl_", "material_", "design_", "m3_", "m3c_", "notification_", "compat_", "browser_actions", "exo_", "common_google", "googleg_", "cardview_", "androidx_", "fastscroll_", "tooltip_", "test_")
        val libraryStyleFamilies = listOf("Theme.", "Widget.", "TextAppearance.", "ShapeAppearance.", "ThemeOverlay.", "Base.", "Platform.", "Animation.", "RtlOverlay.", "CardView", "MaterialAlertDialog.", "Material3", "Theme_", "Widget_")
    }
}
