package com.filepilot.app.core.util

object FileNames {
    private val forbidden = charArrayOf('/', '\u0000')
    private val windowsUnsafe = charArrayOf('\\', ':', '*', '?', '"', '<', '>', '|')

    /** Returns an error message, or null when [name] is a valid file name. */
    fun validate(name: String): String? {
        val trimmed = name.trim()
        return when {
            trimmed.isEmpty() -> "Enter a name"
            trimmed == "." || trimmed == ".." -> "This name is reserved"
            trimmed.any { it in forbidden } -> "Names can't contain /"
            trimmed.toByteArray(Charsets.UTF_8).size > 255 -> "Name is too long"
            else -> null
        }
    }

    /** Make a name safe for SD cards and SAF providers that reject FAT-incompatible characters. */
    fun sanitize(name: String): String {
        val cleaned = name.map { if (it in forbidden || it in windowsUnsafe || it.code < 32) '_' else it }
            .joinToString("").trim().trimEnd('.')
        return cleaned.ifEmpty { "file" }
    }

    /** "report.pdf" -> "report (1).pdf" etc. until [exists] returns false. Never overwrites. */
    fun unique(name: String, isDirectory: Boolean, exists: (String) -> Boolean): String {
        if (!exists(name)) return name
        val dot = if (isDirectory) -1 else name.lastIndexOf('.')
        val base = if (dot > 0) name.substring(0, dot) else name
        val ext = if (dot > 0) name.substring(dot) else ""
        var i = 1
        while (true) {
            val candidate = "$base ($i)$ext"
            if (!exists(candidate)) return candidate
            i++
        }
    }
}
