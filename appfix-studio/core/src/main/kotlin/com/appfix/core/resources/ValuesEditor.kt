package com.appfix.core.resources

import com.appfix.core.xml.XmlEdits
import com.appfix.core.xml.XmlSource
import java.io.File

data class ValueEntry(
    val type: String,
    val name: String,
    /** Value as the user sees it (Android escapes removed). */
    val value: String,
    /** Raw XML between the tags. */
    val raw: String,
    val translatable: Boolean,
    val line: Int,
    /** True when the value contains markup or child elements and cannot be edited as plain text. */
    val isComplex: Boolean,
)

data class ValuesFile(val path: String, val qualifier: String, val entries: List<ValueEntry>)

class ResourceEditException(message: String) : RuntimeException(message)

/**
 * Reads and edits simple values resources (`<string>`, `<color>`, `<dimen>`, `<bool>`, `<integer>`)
 * while keeping the rest of the file byte-for-byte unchanged.
 */
object ValuesEditor {
    val editableTypes = setOf("string", "color", "dimen", "bool", "integer")
    private val namePattern = Regex("^[A-Za-z_][A-Za-z0-9_.]*$")
    private val colorPattern = Regex("^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
    private val dimenPattern = Regex("^-?\\d+(\\.\\d+)?(dp|sp|px|pt|in|mm|dip)$")

    fun read(text: String): List<ValueEntry> {
        val doc = XmlSource.parse(text)
        if (doc.root.name != "resources") throw ResourceEditException("Root element is <${doc.root.name}>, expected <resources>")
        return doc.root.children.filter { it.name in editableTypes }.mapNotNull { n ->
            val name = n.attrValue("name") ?: return@mapNotNull null
            val raw = if (n.selfClosing) "" else text.substring(n.startTagEnd, n.endTagStart)
            val complex = n.children.isNotEmpty() || raw.contains("<![CDATA[")
            ValueEntry(n.name, name, if (complex) raw.trim() else unescape(raw), raw, n.attrValue("translatable") != "false", n.line, complex)
        }
    }

    /** Finds values folders of a module's res directory. Returns (relative path, qualifier). */
    fun valuesFiles(resDir: File, fileName: String): List<Pair<File, String>> =
        resDir.listFiles().orEmpty()
            .filter { it.isDirectory && (it.name == "values" || it.name.startsWith("values-")) }
            .map { File(it, fileName) to it.name.removePrefix("values").removePrefix("-") }
            .filter { it.first.isFile }
            .sortedBy { it.second }

    fun validate(type: String, name: String, value: String): String? {
        if (!namePattern.matches(name)) return "Names may contain letters, digits, '_' and '.', and must not start with a digit."
        if (com.appfix.core.util.JavaNames.isReserved(name)) return "\"$name\" is a reserved Java keyword and cannot be used as a resource name."
        return when (type) {
            "color" -> if (colorPattern.matches(value.trim()) || value.trim().startsWith("@color/") || value.trim().startsWith("@android:color/")) null else "Use #RGB, #ARGB, #RRGGBB or #AARRGGBB, or a @color/ reference."
            "dimen" -> if (dimenPattern.matches(value.trim()) || value.trim().startsWith("@dimen/")) null else "Use a number with a unit, for example 16dp or 14sp."
            "bool" -> if (value.trim() == "true" || value.trim() == "false") null else "Use true or false."
            "integer" -> if (value.trim().toIntOrNull() != null || value.trim().startsWith("@integer/")) null else "Use a whole number."
            else -> null
        }
    }

    fun setValue(text: String, type: String, name: String, value: String): String {
        validate(type, name, value)?.let { throw ResourceEditException(it) }
        val doc = XmlSource.parse(text)
        val node = doc.root.children.firstOrNull { it.name == type && it.attrValue("name") == name }
            ?: throw ResourceEditException("@$type/$name is not defined in this file")
        if (node.children.isNotEmpty()) throw ResourceEditException("@$type/$name contains markup; edit it in the code editor")
        val encoded = encode(type, value)
        val out = if (node.selfClosing) {
            val close = text.lastIndexOf("/>", node.startTagEnd)
            text.substring(0, close).trimEnd() + ">" + encoded + "</$type>" + text.substring(node.startTagEnd)
        } else {
            text.substring(0, node.startTagEnd) + encoded + text.substring(node.endTagStart)
        }
        XmlSource.parse(out)
        return out
    }

    fun add(text: String, type: String, name: String, value: String): String {
        validate(type, name, value)?.let { throw ResourceEditException(it) }
        val doc = XmlSource.parse(text)
        if (doc.root.children.any { it.name == type && it.attrValue("name") == name }) throw ResourceEditException("@$type/$name already exists")
        val out = XmlEdits.insertChild(text, doc.root, "<$type name=\"$name\">${encode(type, value)}</$type>")
        XmlSource.parse(out)
        return out
    }

    fun remove(text: String, type: String, name: String): String {
        val doc = XmlSource.parse(text)
        val node = doc.root.children.firstOrNull { it.name == type && it.attrValue("name") == name }
            ?: throw ResourceEditException("@$type/$name is not defined in this file")
        return XmlEdits.removeNode(text, node)
    }

    fun newFile(type: String, name: String, value: String): String {
        validate(type, name, value)?.let { throw ResourceEditException(it) }
        return "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<resources>\n    <$type name=\"$name\">${encode(type, value)}</$type>\n</resources>\n"
    }

    private fun encode(type: String, value: String) = if (type == "string") escape(value) else XmlSource.escapeText(value.trim())

    /**
     * Escapes text for an Android string resource: XML special characters, apostrophes and quotes,
     * newlines/tabs, and a leading @ or ? (which would otherwise be read as a reference).
     */
    fun escape(value: String): String {
        val sb = StringBuilder()
        value.forEachIndexed { i, c ->
            when (c) {
                '&' -> sb.append("&amp;")
                '<' -> sb.append("&lt;")
                '>' -> sb.append("&gt;")
                '\'' -> sb.append("\\'")
                '"' -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                '\n' -> sb.append("\\n")
                '\t' -> sb.append("\\t")
                '@', '?' -> if (i == 0) sb.append('\\').append(c) else sb.append(c)
                else -> sb.append(c)
            }
        }
        var s = sb.toString()
        // Leading/trailing spaces are collapsed by aapt unless quoted.
        if (s.startsWith(" ") || s.endsWith(" ") || s.contains("  ")) s = "\"$s\""
        return s
    }

    fun unescape(raw: String): String {
        var s = raw.trim()
        val quoted = s.length >= 2 && s.startsWith("\"") && s.endsWith("\"") && !s.endsWith("\\\"")
        if (quoted) s = s.substring(1, s.length - 1)
        s = XmlSource.unescape(s)
        val sb = StringBuilder()
        var i = 0
        while (i < s.length) {
            val c = s[i]
            if (c == '\\' && i + 1 < s.length) {
                when (val n = s[i + 1]) {
                    'n' -> sb.append('\n')
                    't' -> sb.append('\t')
                    'u' -> if (i + 5 < s.length) { s.substring(i + 2, i + 6).toIntOrNull(16)?.let { sb.append(it.toChar()) }; i += 4 } else sb.append(n)
                    else -> sb.append(n)
                }
                i += 2
            } else {
                if (!quoted && c.isWhitespace()) {
                    if (sb.isEmpty() || !sb.last().isWhitespace()) sb.append(' ')
                } else sb.append(c)
                i++
            }
        }
        return sb.toString()
    }
}
