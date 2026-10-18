package com.appfix.core.apk

/**
 * Model of a compiled Android binary XML document (AndroidManifest.xml or res/ XML inside an APK).
 */
data class AxmlElement(
    val name: String,
    val namespace: String? = null,
    val attributes: List<AxmlAttribute> = emptyList(),
    val children: List<AxmlElement> = emptyList(),
    val lineNumber: Int = 0,
    val text: String? = null,
) {
    fun attr(name: String, namespace: String? = AxmlAttribute.ANDROID_NS): AxmlAttribute? =
        attributes.firstOrNull { it.name == name && (namespace == null || it.namespace == namespace) }
            ?: AndroidAttrs.idFor(name)?.let { id -> attributes.firstOrNull { it.resourceId == id } }

    fun androidValue(name: String): String? = attr(name)?.displayValue()

    fun childrenNamed(name: String): List<AxmlElement> = children.filter { it.name == name }

    /** Depth-first search for all descendants (including this element) with [name]. */
    fun findAll(name: String): List<AxmlElement> {
        val out = mutableListOf<AxmlElement>()
        fun walk(e: AxmlElement) {
            if (e.name == name) out += e
            e.children.forEach(::walk)
        }
        walk(this)
        return out
    }
}

data class AxmlAttribute(
    val namespace: String?,
    val name: String,
    val resourceId: Int,
    /** Raw string value if the attribute was stored as a string, else null. */
    val rawValue: String?,
    val type: Int,
    val data: Int,
) {
    fun displayValue(): String = rawValue ?: when (type) {
        TYPE_NULL -> ""
        TYPE_REFERENCE -> "@0x%08x".format(data)
        TYPE_ATTRIBUTE -> "?0x%08x".format(data)
        TYPE_STRING -> ""
        TYPE_FLOAT -> java.lang.Float.intBitsToFloat(data).toString()
        TYPE_DIMENSION -> complexToString(data, DIMENSION_UNITS)
        TYPE_FRACTION -> complexToString(data, arrayOf("%", "%p"))
        TYPE_INT_DEC -> data.toString()
        TYPE_INT_HEX -> "0x%x".format(data)
        TYPE_INT_BOOLEAN -> (data != 0).toString()
        in TYPE_FIRST_COLOR..TYPE_LAST_COLOR -> "#%08x".format(data)
        else -> "0x%08x".format(data)
    }

    val isReference: Boolean get() = type == TYPE_REFERENCE && rawValue == null

    fun intValue(): Int? = when {
        type in TYPE_INT_DEC..TYPE_INT_BOOLEAN || type in TYPE_FIRST_COLOR..TYPE_LAST_COLOR -> data
        rawValue != null -> rawValue.trim().toIntOrNull()
        else -> null
    }

    fun booleanValue(): Boolean? = when {
        type == TYPE_INT_BOOLEAN -> data != 0
        rawValue != null -> rawValue.trim().lowercase().toBooleanStrictOrNull()
        else -> null
    }

    companion object {
        const val ANDROID_NS = "http://schemas.android.com/apk/res/android"
        const val TYPE_NULL = 0x00
        const val TYPE_REFERENCE = 0x01
        const val TYPE_ATTRIBUTE = 0x02
        const val TYPE_STRING = 0x03
        const val TYPE_FLOAT = 0x04
        const val TYPE_DIMENSION = 0x05
        const val TYPE_FRACTION = 0x06
        const val TYPE_DYNAMIC_REFERENCE = 0x07
        const val TYPE_INT_DEC = 0x10
        const val TYPE_INT_HEX = 0x11
        const val TYPE_INT_BOOLEAN = 0x12
        const val TYPE_FIRST_COLOR = 0x1c
        const val TYPE_LAST_COLOR = 0x1f

        private val DIMENSION_UNITS = arrayOf("px", "dp", "sp", "pt", "in", "mm")
        private val RADIX_MULTS = floatArrayOf(1f / (1 shl 8), 1f / (1 shl 15), 1f / (1 shl 23), 1f / (1 shl 31))

        private fun complexToString(data: Int, units: Array<String>): String {
            val mantissa = (data shr 8).toFloat()
            val radix = (data shr 4) and 0x3
            val unit = data and 0xf
            val value = mantissa * RADIX_MULTS[radix]
            val u = units.getOrElse(unit) { "?" }
            return if (value == value.toInt().toFloat()) "${value.toInt()}$u" else "$value$u"
        }

        fun string(namespace: String?, name: String, value: String, resourceId: Int = AndroidAttrs.idFor(name) ?: 0) =
            AxmlAttribute(namespace, name, resourceId, value, TYPE_STRING, -1)

        fun int(namespace: String?, name: String, value: Int, resourceId: Int = AndroidAttrs.idFor(name) ?: 0) =
            AxmlAttribute(namespace, name, resourceId, null, TYPE_INT_DEC, value)

        fun bool(namespace: String?, name: String, value: Boolean, resourceId: Int = AndroidAttrs.idFor(name) ?: 0) =
            AxmlAttribute(namespace, name, resourceId, null, TYPE_INT_BOOLEAN, if (value) -1 else 0)
    }
}

data class AxmlDocument(
    val root: AxmlElement,
    /** prefix -> uri for namespaces declared in the document. */
    val namespaces: Map<String, String> = mapOf("android" to AxmlAttribute.ANDROID_NS),
) {
    /** Human-readable source-like XML. Resource references are shown as hex IDs. */
    fun toXmlString(): String {
        val sb = StringBuilder("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n")
        val uriToPrefix = namespaces.entries.associate { it.value to it.key }
        fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")
        fun write(e: AxmlElement, depth: Int, isRoot: Boolean) {
            val indent = "    ".repeat(depth)
            sb.append(indent).append('<').append(e.name)
            if (isRoot) namespaces.forEach { (p, u) -> sb.append(" xmlns:").append(p).append("=\"").append(esc(u)).append('"') }
            for (a in e.attributes) {
                val prefix = a.namespace?.let { uriToPrefix[it] ?: "ns" }
                val n = a.name.ifEmpty { AndroidAttrs.nameFor(a.resourceId) ?: "attr_0x%08x".format(a.resourceId) }
                sb.append(if (e.attributes.size > 2) "\n$indent    " else " ")
                if (prefix != null) sb.append(prefix).append(':')
                sb.append(n).append("=\"").append(esc(a.displayValue())).append('"')
            }
            if (e.children.isEmpty() && e.text == null) {
                sb.append(" />\n")
            } else {
                sb.append(">")
                if (e.text != null) sb.append(esc(e.text))
                if (e.children.isNotEmpty()) {
                    sb.append('\n')
                    e.children.forEach { write(it, depth + 1, false) }
                    sb.append(indent)
                }
                sb.append("</").append(e.name).append(">\n")
            }
        }
        write(root, 0, true)
        return sb.toString()
    }
}

/** Framework attribute resource IDs (android.R.attr) used when attribute names are stripped/obfuscated. */
object AndroidAttrs {
    private val ids = mapOf(
        "theme" to 0x01010000, "label" to 0x01010001, "icon" to 0x01010002, "name" to 0x01010003,
        "permission" to 0x01010006, "exported" to 0x01010010, "debuggable" to 0x0101000f,
        "enabled" to 0x0101000e, "process" to 0x01010011, "hasCode" to 0x0101000c,
        "minSdkVersion" to 0x0101020c, "versionCode" to 0x0101021b, "versionName" to 0x0101021c,
        "targetSdkVersion" to 0x01010270, "maxSdkVersion" to 0x01010271, "testOnly" to 0x01010272,
        "allowBackup" to 0x01010280, "required" to 0x0101028e, "extractNativeLibs" to 0x010104ea,
        "usesCleartextTraffic" to 0x010104ec, "roundIcon" to 0x0101052c,
        "compileSdkVersion" to 0x01010572, "compileSdkVersionCodename" to 0x01010573,
        "authorities" to 0x01010018, "scheme" to 0x01010027, "host" to 0x01010028,
        "value" to 0x01010024, "resource" to 0x01010025, "glEsVersion" to 0x01010281,
    )
    private val names = ids.entries.associate { it.value to it.key }

    fun idFor(name: String): Int? = ids[name]
    fun nameFor(id: Int): String? = names[id]
}
