package com.filepilot.app.core.model

import android.net.Uri

/** A browsable folder. */
sealed interface Location {
    data class Local(val path: String) : Location

    /**
     * A folder inside a SAF tree. [name] is the folder's display name, kept so the
     * breadcrumb can be shown without another query.
     */
    data class Saf(val treeUri: Uri, val documentId: String, val name: String) : Location

    fun encode(): String = when (this) {
        is Local -> "local\u0001$path"
        is Saf -> "saf\u0001$treeUri\u0001$documentId\u0001$name"
    }

    companion object {
        fun decode(s: String?): Location? {
            if (s.isNullOrEmpty()) return null
            val parts = s.split('\u0001')
            return when (parts.firstOrNull()) {
                "local" -> parts.getOrNull(1)?.let { Local(it) }
                "saf" -> if (parts.size >= 4) Saf(Uri.parse(parts[1]), parts[2], parts[3]) else null
                else -> null
            }
        }
    }
}
