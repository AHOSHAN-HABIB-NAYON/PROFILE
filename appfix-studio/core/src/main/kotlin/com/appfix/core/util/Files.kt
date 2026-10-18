package com.appfix.core.util

import java.io.File

object PathSafety {
    /** Returns true when [child] (after resolving `..` and symlinks) is inside [root]. */
    fun isInside(root: File, child: File): Boolean {
        val r = root.canonicalFile
        val c = child.canonicalFile
        return c == r || c.path.startsWith(r.path + File.separator)
    }

    /**
     * Validates a project-relative path supplied by a user, an archive or an AI patch.
     * Returns the normalised forward-slash form, or null when the path is unsafe.
     */
    fun normalizeRelative(path: String): String? {
        if (path.isEmpty() || path.length > 1024) return null
        if (path.indexOf('\u0000') >= 0) return null
        val p = path.replace('\\', '/')
        if (p.startsWith("/")) return null
        if (p.length >= 2 && p[1] == ':' && p[0].isLetter()) return null // C:\...
        val parts = p.split('/').filter { it.isNotEmpty() && it != "." }
        if (parts.isEmpty()) return null
        if (parts.any { it == ".." }) return null
        return parts.joinToString("/")
    }

    /** Resolves a relative path against [root], returning null if it would escape [root]. */
    fun resolveInside(root: File, relative: String): File? {
        val norm = normalizeRelative(relative) ?: return null
        val f = File(root, norm)
        return if (isInside(root, f)) f else null
    }
}

object TextFiles {
    /** Binary-by-extension check first, then a NUL-byte sniff of the first [sniffBytes] bytes. */
    fun isProbablyText(file: File, sniffBytes: Int = 8000): Boolean {
        val ext = file.extension.lowercase()
        if (ext in setOf("png", "jpg", "jpeg", "webp", "gif", "jar", "aar", "apk", "aab", "so", "dex", "zip", "keystore", "jks", "ttf", "otf", "mp3", "mp4", "ogg", "class")) return false
        if (!file.isFile) return false
        if (file.length() == 0L) return true
        file.inputStream().use { input ->
            val buf = ByteArray(sniffBytes)
            val n = input.read(buf)
            if (n <= 0) return true
            for (i in 0 until n) if (buf[i] == 0.toByte()) return false
        }
        return true
    }

    fun languageFor(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
        "kt", "kts" -> "kotlin"
        "java" -> "java"
        "xml", "svg" -> "xml"
        "json" -> "json"
        "gradle" -> "groovy"
        "html", "htm" -> "html"
        "css" -> "css"
        "js", "jsx", "ts", "tsx" -> "javascript"
        "dart" -> "dart"
        "smali" -> "smali"
        "properties", "pro" -> "properties"
        "yaml", "yml" -> "yaml"
        "toml" -> "toml"
        "md" -> "markdown"
        else -> "text"
    }
}
