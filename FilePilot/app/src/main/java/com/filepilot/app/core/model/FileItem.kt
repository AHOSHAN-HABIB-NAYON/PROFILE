package com.filepilot.app.core.model

import android.net.Uri
import org.json.JSONObject

/** Where a file comes from. Each source supports a different set of operations. */
enum class SourceKind {
    /** A real filesystem path, reachable through java.io.File. */
    LOCAL,

    /** A document inside a folder the user picked with the system folder picker. */
    SAF,

    /** A MediaStore entry (photo, video, audio) without direct path access. */
    MEDIA,
}

/**
 * A single file or folder, independent of how it is accessed.
 * SAF and MediaStore items have no filesystem path; always use [uri] for those.
 */
data class FileItem(
    val name: String,
    val isDirectory: Boolean,
    val size: Long,
    val lastModified: Long,
    val mimeType: String,
    val source: SourceKind,
    val uri: Uri,
    val path: String? = null,
    val treeUri: Uri? = null,
    val documentId: String? = null,
    val childCount: Int = -1,
    val canWrite: Boolean = false,
    val canDelete: Boolean = false,
    val canRename: Boolean = false,
) {
    /** Stable identity used for favorites, recents and selection. */
    val id: String
        get() = when (source) {
            SourceKind.LOCAL -> "local:$path"
            SourceKind.SAF -> "saf:$treeUri|$documentId"
            SourceKind.MEDIA -> "media:$uri"
        }

    val extension: String
        get() = if (isDirectory) "" else name.substringAfterLast('.', "").lowercase()

    val isHidden: Boolean get() = name.startsWith(".")

    val type: FileType get() = FileType.of(this)

    /** Where to browse when this folder is opened. */
    fun asLocation(): Location? = when {
        !isDirectory -> null
        source == SourceKind.LOCAL && path != null -> Location.Local(path)
        source == SourceKind.SAF && treeUri != null && documentId != null ->
            Location.Saf(treeUri, documentId, name)
        else -> null
    }

    fun toJson(): JSONObject = JSONObject().apply {
        put("name", name)
        put("dir", isDirectory)
        put("size", size)
        put("mod", lastModified)
        put("mime", mimeType)
        put("src", source.name)
        put("uri", uri.toString())
        path?.let { put("path", it) }
        treeUri?.let { put("tree", it.toString()) }
        documentId?.let { put("doc", it) }
        put("w", canWrite)
        put("d", canDelete)
        put("r", canRename)
    }

    companion object {
        fun fromJson(o: JSONObject): FileItem = FileItem(
            name = o.getString("name"),
            isDirectory = o.optBoolean("dir"),
            size = o.optLong("size", -1),
            lastModified = o.optLong("mod", 0),
            mimeType = o.optString("mime", "application/octet-stream"),
            source = runCatching { SourceKind.valueOf(o.getString("src")) }.getOrDefault(SourceKind.LOCAL),
            uri = Uri.parse(o.getString("uri")),
            path = if (o.has("path")) o.getString("path") else null,
            treeUri = if (o.has("tree")) Uri.parse(o.getString("tree")) else null,
            documentId = if (o.has("doc")) o.getString("doc") else null,
            canWrite = o.optBoolean("w"),
            canDelete = o.optBoolean("d"),
            canRename = o.optBoolean("r"),
        )

        fun fromJsonString(s: String): FileItem? = runCatching { fromJson(JSONObject(s)) }.getOrNull()
    }
}
