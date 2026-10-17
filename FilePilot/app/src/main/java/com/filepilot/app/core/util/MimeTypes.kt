package com.filepilot.app.core.util

import android.webkit.MimeTypeMap

object MimeTypes {
    const val DIRECTORY = "vnd.android.document/directory"
    const val UNKNOWN = "application/octet-stream"

    private val overrides = mapOf(
        "md" to "text/markdown",
        "log" to "text/plain",
        "kt" to "text/plain",
        "kts" to "text/plain",
        "gradle" to "text/plain",
        "yml" to "text/plain",
        "yaml" to "text/plain",
        "toml" to "text/plain",
        "ini" to "text/plain",
        "conf" to "text/plain",
        "cfg" to "text/plain",
        "properties" to "text/plain",
        "json" to "application/json",
        "apk" to "application/vnd.android.package-archive",
        "opus" to "audio/ogg",
        "heic" to "image/heic",
        "heif" to "image/heif",
        "avif" to "image/avif",
        "mkv" to "video/x-matroska",
        "7z" to "application/x-7z-compressed",
        "rar" to "application/vnd.rar",
    )

    fun fromName(name: String): String {
        val ext = name.substringAfterLast('.', "").lowercase()
        if (ext.isEmpty()) return UNKNOWN
        return overrides[ext] ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: UNKNOWN
    }

    /** MediaStore and providers sometimes report generic types; prefer the extension when it is more specific. */
    fun best(name: String, reported: String?): String {
        val byName = fromName(name)
        return when {
            reported.isNullOrBlank() -> byName
            reported == UNKNOWN && byName != UNKNOWN -> byName
            else -> reported
        }
    }
}
