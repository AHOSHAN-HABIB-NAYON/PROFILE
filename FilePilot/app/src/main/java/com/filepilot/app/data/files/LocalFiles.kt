package com.filepilot.app.data.files

import android.net.Uri
import android.os.Environment
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.SourceKind
import com.filepilot.app.core.util.MimeTypes
import java.io.File

/** Filesystem access through java.io.File, used when the app has full storage access. */
object LocalFiles {
    val primaryRoot: String = Environment.getExternalStorageDirectory().absolutePath

    fun toItem(file: File, countChildren: Boolean = true): FileItem {
        val dir = file.isDirectory
        val parentWritable = file.parentFile?.canWrite() ?: false
        return FileItem(
            name = file.name.ifEmpty { file.absolutePath },
            isDirectory = dir,
            size = if (dir) -1 else file.length(),
            lastModified = file.lastModified(),
            mimeType = if (dir) MimeTypes.DIRECTORY else MimeTypes.fromName(file.name),
            source = SourceKind.LOCAL,
            uri = Uri.fromFile(file),
            path = file.absolutePath,
            childCount = if (dir && countChildren) file.list()?.size ?: -1 else -1,
            canWrite = file.canWrite(),
            canDelete = parentWritable,
            canRename = parentWritable,
        )
    }

    /**
     * Android keeps other apps' private folders (Android/data, Android/obb) out of reach.
     * FilePilot never tries to work around that.
     */
    fun isRestricted(path: String): Boolean {
        val norm = path.trimEnd('/')
        val restricted = listOf("Android/data", "Android/obb")
        return restricted.any { r ->
            val marker = "/$r"
            val idx = norm.indexOf(marker)
            idx >= 0 && (norm.length == idx + marker.length || norm[idx + marker.length] == '/')
        }
    }

    fun list(path: String, showHidden: Boolean): List<FileItem> {
        val dir = File(path)
        if (isRestricted(path)) {
            throw FileAccessException("Android restricts access to other apps' private folders")
        }
        if (!dir.exists()) throw FileAccessException("This folder no longer exists")
        if (!dir.isDirectory) throw FileAccessException("This is not a folder")
        val children = dir.listFiles() ?: throw FileAccessException("FilePilot can't read this folder")
        return children.asSequence()
            .filter { showHidden || !it.name.startsWith(".") }
            .map { toItem(it) }
            .toList()
    }

    /** Validates that [child] stays inside [parent] once resolved (protects against "../" tricks). */
    fun isInside(parent: File, child: File): Boolean {
        val p = parent.canonicalPath.trimEnd('/') + "/"
        val c = child.canonicalPath
        return c.startsWith(p)
    }
}
