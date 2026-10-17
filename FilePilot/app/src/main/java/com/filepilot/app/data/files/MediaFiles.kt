package com.filepilot.app.data.files

import android.content.ContentResolver
import android.content.ContentUris
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import com.filepilot.app.core.model.FileCategory
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.FileType
import com.filepilot.app.core.model.SourceKind
import com.filepilot.app.core.util.MimeTypes
import com.filepilot.app.permissions.AccessState
import java.io.File
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.ensureActive

enum class SearchFilter(val label: String) {
    ALL("All"), IMAGES("Images"), VIDEOS("Videos"), AUDIO("Audio"), DOCUMENTS("Documents"), ARCHIVES("Archives"), APKS("APKs");

    fun matches(item: FileItem): Boolean = when (this) {
        ALL -> true
        IMAGES -> item.type == FileType.IMAGE
        VIDEOS -> item.type == FileType.VIDEO
        AUDIO -> item.type == FileType.AUDIO
        DOCUMENTS -> item.extension in FileType.documentExtensions
        ARCHIVES -> item.type == FileType.ARCHIVE
        APKS -> item.type == FileType.APK
    }
}

/** Result of a category query, including whether the result is limited by missing access. */
data class CategoryResult(val items: List<FileItem>, val limitedToMedia: Boolean, val needsFullAccess: Boolean)

/**
 * Reads the system MediaStore index. Using the index (instead of walking the disk) keeps
 * categories, search and large-file discovery fast and avoids background scanning.
 */
@Suppress("DEPRECATION") // MediaColumns.DATA is still the only way to map index rows to paths with full access.
class MediaFiles(private val resolver: ContentResolver) {

    private val filesUri: Uri = MediaStore.Files.getContentUri("external")

    private val projection = arrayOf(
        MediaStore.MediaColumns._ID,
        MediaStore.MediaColumns.DISPLAY_NAME,
        MediaStore.MediaColumns.SIZE,
        MediaStore.MediaColumns.DATE_MODIFIED,
        MediaStore.MediaColumns.MIME_TYPE,
        MediaStore.MediaColumns.DATA,
    )

    /** Whether the whole Files table (not only media) is readable on this device. */
    fun canQueryAllFiles(access: AccessState): Boolean =
        access.fullAccess || (Build.VERSION.SDK_INT < Build.VERSION_CODES.R && access.images)

    /** Whether MediaStore paths can be opened with java.io.File. */
    private fun pathAccess(access: AccessState): Boolean =
        access.fullAccess || (Build.VERSION.SDK_INT < Build.VERSION_CODES.R && access.images)

    private fun mediaCollections(access: AccessState): List<Uri> = buildList {
        if (access.images) add(MediaStore.Images.Media.EXTERNAL_CONTENT_URI)
        if (access.video) add(MediaStore.Video.Media.EXTERNAL_CONTENT_URI)
        if (access.audio) add(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI)
    }

    suspend fun category(cat: FileCategory, access: AccessState, largeThreshold: Long): CategoryResult {
        val all = canQueryAllFiles(access)
        return when (cat) {
            FileCategory.IMAGES -> media(access.images, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, access)
            FileCategory.VIDEOS -> media(access.video, MediaStore.Video.Media.EXTERNAL_CONTENT_URI, access)
            FileCategory.AUDIO -> media(access.audio, MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, access)
            FileCategory.DOCUMENTS -> filesOnly(all, extensionClause(FileType.documentExtensions), access)
            FileCategory.APKS -> filesOnly(all, extensionClause(setOf("apk", "apks", "xapk")), access)
            FileCategory.ARCHIVES -> filesOnly(all, extensionClause(FileType.archiveExtensions), access)
            FileCategory.DOWNLOADS -> {
                val (sel, args) = downloadsClause()
                withFallback(all, sel, args, MediaStore.MediaColumns.DATE_MODIFIED, access)
            }
            FileCategory.LARGE -> withFallback(
                all, "${MediaStore.MediaColumns.SIZE} >= ?", arrayOf(largeThreshold.toString()),
                MediaStore.MediaColumns.SIZE, access,
            )
            FileCategory.RECENT -> {
                val since = System.currentTimeMillis() / 1000 - RECENT_DAYS * 24 * 3600
                val r = withFallback(
                    all, "${MediaStore.MediaColumns.DATE_MODIFIED} >= ?", arrayOf(since.toString()),
                    MediaStore.MediaColumns.DATE_MODIFIED, access, limit = 300,
                )
                r.copy(items = r.items.filterNot { it.isHidden || it.path?.contains("/.") == true })
            }
            FileCategory.FAVORITES -> CategoryResult(emptyList(), false, false)
        }
    }

    private suspend fun media(allowed: Boolean, collection: Uri, access: AccessState): CategoryResult {
        if (!allowed) return CategoryResult(emptyList(), limitedToMedia = false, needsFullAccess = false)
        val items = run(collection, null, null, MediaStore.MediaColumns.DATE_MODIFIED, access)
        return CategoryResult(items, false, false)
    }

    private suspend fun filesOnly(all: Boolean, selection: Pair<String, Array<String>>, access: AccessState): CategoryResult {
        if (!all) return CategoryResult(emptyList(), limitedToMedia = false, needsFullAccess = true)
        val items = run(filesUri, selection.first, selection.second, MediaStore.MediaColumns.DATE_MODIFIED, access)
        return CategoryResult(items, false, false)
    }

    /** Full Files table when allowed; otherwise the media collections the user granted. */
    private suspend fun withFallback(
        all: Boolean,
        selection: String,
        args: Array<String>,
        sortColumn: String,
        access: AccessState,
        limit: Int = MAX_ROWS,
    ): CategoryResult {
        if (all) return CategoryResult(run(filesUri, selection, args, sortColumn, access, limit), false, false)
        val cols = mediaCollections(access)
        if (cols.isEmpty()) return CategoryResult(emptyList(), false, needsFullAccess = true)
        val merged = cols.flatMap { run(it, selection, args, sortColumn, access, limit) }
        val sorted = if (sortColumn == MediaStore.MediaColumns.SIZE) merged.sortedByDescending { it.size } else merged.sortedByDescending { it.lastModified }
        return CategoryResult(sorted.take(limit), limitedToMedia = true, needsFullAccess = false)
    }

    suspend fun search(query: String, filter: SearchFilter, access: AccessState, limit: Int = 500): CategoryResult {
        val q = query.trim()
        if (q.isEmpty()) return CategoryResult(emptyList(), false, false)
        val escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        val nameClause = "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ? ESCAPE '\\'"
        val nameArg = "%$escaped%"
        val all = canQueryAllFiles(access)
        if (all) {
            val typeClause: Pair<String?, Array<String>> = when (filter) {
                SearchFilter.ALL -> null to emptyArray<String>()
                SearchFilter.IMAGES -> mediaTypeClause(MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE)
                SearchFilter.VIDEOS -> mediaTypeClause(MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO)
                SearchFilter.AUDIO -> mediaTypeClause(MediaStore.Files.FileColumns.MEDIA_TYPE_AUDIO)
                SearchFilter.DOCUMENTS -> extensionClause(FileType.documentExtensions)
                SearchFilter.ARCHIVES -> extensionClause(FileType.archiveExtensions)
                SearchFilter.APKS -> extensionClause(setOf("apk", "apks", "xapk"))
            }
            val (typeSel, typeArgs) = typeClause
            val sel = if (typeSel == null) nameClause else "$nameClause AND ($typeSel)"
            val items = run(filesUri, sel, arrayOf(nameArg) + typeArgs, MediaStore.MediaColumns.DATE_MODIFIED, access, limit, includeDirs = true)
            return CategoryResult(items, false, false)
        }
        val cols = buildList {
            if (access.images && (filter == SearchFilter.ALL || filter == SearchFilter.IMAGES)) add(MediaStore.Images.Media.EXTERNAL_CONTENT_URI)
            if (access.video && (filter == SearchFilter.ALL || filter == SearchFilter.VIDEOS)) add(MediaStore.Video.Media.EXTERNAL_CONTENT_URI)
            if (access.audio && (filter == SearchFilter.ALL || filter == SearchFilter.AUDIO)) add(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI)
        }
        val needsFull = filter in setOf(SearchFilter.ALL, SearchFilter.DOCUMENTS, SearchFilter.ARCHIVES, SearchFilter.APKS)
        val items = cols.flatMap { run(it, nameClause, arrayOf(nameArg), MediaStore.MediaColumns.DATE_MODIFIED, access, limit) }
            .sortedByDescending { it.lastModified }
        return CategoryResult(items.take(limit), limitedToMedia = access.anyMedia, needsFullAccess = needsFull && !access.anyMedia)
    }

    /** All indexed files at least [minSize] bytes, ordered by size (for duplicate detection). */
    suspend fun filesForDuplicateScan(access: AccessState, minSize: Long): List<FileItem> {
        val sel = "${MediaStore.MediaColumns.SIZE} >= ?"
        val args = arrayOf(minSize.toString())
        return if (canQueryAllFiles(access)) {
            run(filesUri, sel, args, MediaStore.MediaColumns.SIZE, access, limit = 50_000)
        } else {
            mediaCollections(access).flatMap { run(it, sel, args, MediaStore.MediaColumns.SIZE, access, limit = 50_000) }
        }
    }

    private fun mediaTypeClause(type: Int): Pair<String, Array<String>> =
        "${MediaStore.Files.FileColumns.MEDIA_TYPE} = ?" to arrayOf(type.toString())

    private fun extensionClause(exts: Set<String>): Pair<String, Array<String>> {
        val parts = exts.map { "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ?" }
        return "(" + parts.joinToString(" OR ") + ")" to exts.map { "%.$it" }.toTypedArray()
    }

    private fun downloadsClause(): Pair<String, Array<String>> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            "${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ?" to arrayOf("Download/%")
        } else {
            "${MediaStore.MediaColumns.DATA} LIKE ?" to arrayOf("${LocalFiles.primaryRoot}/Download/%")
        }

    private suspend fun run(
        collection: Uri,
        selection: String?,
        args: Array<String>?,
        sortColumn: String,
        access: AccessState,
        limit: Int = MAX_ROWS,
        includeDirs: Boolean = false,
    ): List<FileItem> {
        val cursor = try {
            queryCursor(collection, selection, args, sortColumn, limit)
        } catch (_: SecurityException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        } ?: return emptyList()
        val usePaths = pathAccess(access)
        val out = ArrayList<FileItem>()
        cursor.use { c ->
            while (c.moveToNext() && out.size < limit) {
                if (out.size % 200 == 0) coroutineContext.ensureActive()
                val item = rowToItem(collection, c, usePaths, includeDirs) ?: continue
                out.add(item)
            }
        }
        return out
    }

    private fun queryCursor(collection: Uri, selection: String?, args: Array<String>?, sortColumn: String, limit: Int): Cursor? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bundle = Bundle().apply {
                if (selection != null) {
                    putString(ContentResolver.QUERY_ARG_SQL_SELECTION, selection)
                    putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, args)
                }
                putStringArray(ContentResolver.QUERY_ARG_SORT_COLUMNS, arrayOf(sortColumn))
                putInt(ContentResolver.QUERY_ARG_SORT_DIRECTION, ContentResolver.QUERY_SORT_DIRECTION_DESCENDING)
                putInt(ContentResolver.QUERY_ARG_LIMIT, limit)
            }
            resolver.query(collection, projection, bundle, null)
        } else {
            resolver.query(collection, projection, selection, args, "$sortColumn DESC LIMIT $limit")
        }

    private fun rowToItem(collection: Uri, c: Cursor, usePaths: Boolean, includeDirs: Boolean): FileItem? {
        val id = c.getLong(0)
        val path = c.getString(5)
        if (usePaths && path != null) {
            val f = File(path)
            if (!f.exists()) return null
            if (f.isDirectory && !includeDirs) return null
            if (LocalFiles.isRestricted(path)) return null
            return LocalFiles.toItem(f, countChildren = false)
        }
        val name = c.getString(1) ?: path?.substringAfterLast('/') ?: return null
        val mime = c.getString(4)
        if (mime == null && !includeDirs && path != null && File(path).isDirectory) return null
        return FileItem(
            name = name,
            isDirectory = false,
            size = if (c.isNull(2)) -1 else c.getLong(2),
            lastModified = if (c.isNull(3)) 0 else c.getLong(3) * 1000,
            mimeType = MimeTypes.best(name, mime),
            source = SourceKind.MEDIA,
            uri = ContentUris.withAppendedId(collection, id),
        )
    }

    /** Checks a MediaStore item still exists (used for favorites and recents). */
    fun exists(uri: Uri): Boolean = try {
        resolver.query(uri, arrayOf(MediaStore.MediaColumns._ID), null, null, null)?.use { it.moveToFirst() } ?: false
    } catch (_: Exception) {
        false
    }

    companion object {
        const val MAX_ROWS = 3000
        const val RECENT_DAYS = 30L
    }
}
