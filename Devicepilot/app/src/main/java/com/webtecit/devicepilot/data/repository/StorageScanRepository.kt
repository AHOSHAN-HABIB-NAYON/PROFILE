package com.webtecit.devicepilot.data.repository

import android.Manifest
import android.app.PendingIntent
import android.app.RecoverableSecurityException
import android.content.ContentUris
import android.content.Context
import android.content.IntentSender
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import com.webtecit.devicepilot.domain.model.CategoryStat
import com.webtecit.devicepilot.domain.model.DuplicateGroup
import com.webtecit.devicepilot.domain.model.FileCategory
import com.webtecit.devicepilot.domain.model.FileItem
import com.webtecit.devicepilot.domain.model.FolderScanResult
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.io.File
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.coroutineContext

/** Level of media access the user granted. Android 14 adds "selected photos only". */
enum class MediaAccess { FULL, PARTIAL, NONE }

/** Result of a delete request: either done, or the system must ask the user first. */
sealed interface DeleteOutcome {
    data class Deleted(val count: Int, val failed: Int) : DeleteOutcome
    data class NeedsUserConsent(val intentSender: IntentSender, val pending: List<FileItem>) : DeleteOutcome
}

object FileClassifier {
    private val documentExt = setOf("pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "odt", "ods", "odp", "csv", "epub", "md")
    private val archiveExt = setOf("zip", "rar", "7z", "tar", "gz", "bz2", "xz")
    private val imageExt = setOf("jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "dng")
    private val videoExt = setOf("mp4", "mkv", "webm", "3gp", "mov", "avi", "m4v")
    private val audioExt = setOf("mp3", "m4a", "aac", "wav", "ogg", "opus", "flac", "amr")
    val tempExt = setOf("tmp", "temp", "log", "bak", "old", "part", "crdownload")

    fun classify(name: String, mime: String?, relativePath: String? = null): FileCategory {
        val ext = name.substringAfterLast('.', "").lowercase()
        return when {
            ext == "apk" || ext == "apks" || ext == "xapk" || mime == "application/vnd.android.package-archive" -> FileCategory.APKS
            mime?.startsWith("image/") == true || ext in imageExt -> FileCategory.IMAGES
            mime?.startsWith("video/") == true || ext in videoExt -> FileCategory.VIDEOS
            mime?.startsWith("audio/") == true || ext in audioExt -> FileCategory.AUDIO
            ext in archiveExt -> FileCategory.ARCHIVES
            ext in documentExt || mime?.startsWith("text/") == true || mime == "application/pdf" -> FileCategory.DOCUMENTS
            relativePath?.startsWith("Download", ignoreCase = true) == true -> FileCategory.DOWNLOADS
            else -> FileCategory.OTHER
        }
    }

    fun isTemporary(name: String): Boolean = name.substringAfterLast('.', "").lowercase() in tempExt
}

@Singleton
class StorageScanRepository @Inject constructor(@ApplicationContext private val context: Context) {

    private val resolver get() = context.contentResolver

    // ------------------------------------------------------------------ permissions

    fun mediaPermissions(): Array<String> = when {
        Build.VERSION.SDK_INT >= 34 -> arrayOf(
            Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO,
            Manifest.permission.READ_MEDIA_AUDIO, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED,
        )
        Build.VERSION.SDK_INT >= 33 -> arrayOf(
            Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO, Manifest.permission.READ_MEDIA_AUDIO,
        )
        Build.VERSION.SDK_INT <= Build.VERSION_CODES.P -> arrayOf(
            Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE,
        )
        else -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }

    fun mediaAccess(): MediaAccess {
        fun granted(p: String) = ContextCompat.checkSelfPermission(context, p) == PackageManager.PERMISSION_GRANTED
        return when {
            Build.VERSION.SDK_INT >= 33 -> when {
                granted(Manifest.permission.READ_MEDIA_IMAGES) || granted(Manifest.permission.READ_MEDIA_VIDEO) ||
                    granted(Manifest.permission.READ_MEDIA_AUDIO) -> MediaAccess.FULL
                Build.VERSION.SDK_INT >= 34 && granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) -> MediaAccess.PARTIAL
                else -> MediaAccess.NONE
            }
            granted(Manifest.permission.READ_EXTERNAL_STORAGE) -> MediaAccess.FULL
            else -> MediaAccess.NONE
        }
    }

    /** Android 13+ only exposes media through MediaStore; documents and APKs need a user-picked folder. */
    val nonMediaVisibleThroughMediaStore: Boolean get() = Build.VERSION.SDK_INT < 33

    // ------------------------------------------------------------------ MediaStore queries

    private val filesUri: Uri = MediaStore.Files.getContentUri("external")

    // In-memory results shared between storage screens so each screen does not rescan.
    @Volatile private var mediaCache: List<FileItem>? = null
    @Volatile var lastFolderScan: FolderScanResult? = null
        private set

    suspend fun mediaFiles(force: Boolean = false): List<FileItem> {
        if (!force) mediaCache?.let { return it }
        return allMediaFiles().also { mediaCache = it }
    }

    fun forget(items: Collection<FileItem>) {
        val uris = items.map { it.uri }.toSet()
        mediaCache = mediaCache?.filterNot { it.uri in uris }
        lastFolderScan = lastFolderScan?.let { r ->
            r.copy(files = r.files.filterNot { it.uri in uris }, emptyFolders = r.emptyFolders.filterNot { it.uri in uris })
        }
    }

    fun invalidate() { mediaCache = null }

    /** Folders the user granted earlier through the system folder picker. */
    fun persistedFolders(): List<Uri> =
        resolver.persistedUriPermissions.filter { it.isReadPermission && DocumentsContract.isTreeUri(it.uri) }.map { it.uri }

    fun persistFolder(uri: Uri) {
        runCatching {
            resolver.takePersistableUriPermission(
                uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            )
        }
    }

    suspend fun allMediaFiles(): List<FileItem> = withContext(Dispatchers.IO) {
        val projection = buildList {
            add(MediaStore.Files.FileColumns._ID)
            add(MediaStore.Files.FileColumns.DISPLAY_NAME)
            add(MediaStore.Files.FileColumns.SIZE)
            add(MediaStore.Files.FileColumns.MIME_TYPE)
            add(MediaStore.Files.FileColumns.DATE_MODIFIED)
            add(MediaStore.Files.FileColumns.MEDIA_TYPE)
            if (Build.VERSION.SDK_INT >= 29) add(MediaStore.Files.FileColumns.RELATIVE_PATH)
            @Suppress("DEPRECATION")
            add(MediaStore.Files.FileColumns.DATA)
        }.toTypedArray()
        val selection = "${MediaStore.Files.FileColumns.SIZE} > 0"
        val out = ArrayList<FileItem>()
        try {
            resolver.query(filesUri, projection, selection, null, null)?.use { c ->
                readFiles(c, out)
            }
        } catch (e: SecurityException) {
            // Permission revoked while scanning.
        }
        out
    }

    private suspend fun readFiles(c: Cursor, out: MutableList<FileItem>) {
        val idCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID)
        val nameCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
        val sizeCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
        val mimeCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MIME_TYPE)
        val dateCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_MODIFIED)
        val typeCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MEDIA_TYPE)
        val relCol = if (Build.VERSION.SDK_INT >= 29) c.getColumnIndex(MediaStore.Files.FileColumns.RELATIVE_PATH) else -1
        @Suppress("DEPRECATION")
        val dataCol = c.getColumnIndex(MediaStore.Files.FileColumns.DATA)
        while (c.moveToNext()) {
            coroutineContext.ensureActive()
            val id = c.getLong(idCol)
            val name = c.getString(nameCol) ?: continue
            val mime = c.getString(mimeCol)
            val rel = if (relCol >= 0) c.getString(relCol) else null
            val data = if (dataCol >= 0) c.getString(dataCol) else null
            val location = rel ?: data?.let { File(it).parent?.substringAfter("/0/", it) } ?: ""
            val mediaType = c.getInt(typeCol)
            val uri = when (mediaType) {
                MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE -> ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
                MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO -> ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)
                MediaStore.Files.FileColumns.MEDIA_TYPE_AUDIO -> ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id)
                else -> ContentUris.withAppendedId(filesUri, id)
            }
            if (c.isNull(sizeCol)) continue
            out += FileItem(
                uri = uri,
                name = name,
                sizeBytes = c.getLong(sizeCol),
                location = location.trimEnd('/'),
                mimeType = mime,
                modifiedMillis = c.getLong(dateCol) * 1000,
                category = FileClassifier.classify(name, mime, rel ?: data?.substringAfter("/0/")),
            )
        }
    }

    fun categoryStats(files: List<FileItem>): List<CategoryStat> =
        files.groupBy { it.category }
            .map { (cat, list) -> CategoryStat(cat, list.size, list.sumOf { it.sizeBytes }) }
            .sortedByDescending { it.bytes }

    // ------------------------------------------------------------------ duplicates

    /**
     * Finds byte-identical files. Files are first grouped by size (cheap); only same-size files
     * are hashed with SHA-256, so a match is a true duplicate, not a guess.
     */
    suspend fun findDuplicates(
        files: List<FileItem>,
        onProgress: (done: Int, total: Int) -> Unit,
    ): List<DuplicateGroup> = withContext(Dispatchers.IO) {
        val candidates = files.filter { it.sizeBytes > 0 }.groupBy { it.sizeBytes }.values.filter { it.size > 1 }
        val total = candidates.sumOf { it.size }
        var done = 0
        val groups = ArrayList<DuplicateGroup>()
        for (sameSize in candidates) {
            val byHash = HashMap<String, MutableList<FileItem>>()
            for (file in sameSize) {
                coroutineContext.ensureActive()
                val hash = hash(file.uri)
                if (hash != null) byHash.getOrPut(hash) { mutableListOf() } += file
                done++
                onProgress(done, total)
            }
            byHash.forEach { (hash, list) -> if (list.size > 1) groups += DuplicateGroup(hash, list.sortedBy { it.modifiedMillis }) }
        }
        groups.sortedByDescending { it.recoverableBytes }
    }

    private suspend fun hash(uri: Uri): String? {
        return try {
            val digest = MessageDigest.getInstance("SHA-256")
            val input = resolver.openInputStream(uri) ?: return null
            input.use {
                val buffer = ByteArray(256 * 1024)
                while (true) {
                    coroutineContext.ensureActive()
                    val n = it.read(buffer)
                    if (n < 0) break
                    digest.update(buffer, 0, n)
                }
            }
            digest.digest().joinToString("") { b -> "%02x".format(b) }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }

    // ------------------------------------------------------------------ user-picked folder (SAF)

    suspend fun scanTree(treeUri: Uri, onProgress: (files: Int) -> Unit): FolderScanResult = withContext(Dispatchers.IO) {
        val rootId = DocumentsContract.getTreeDocumentId(treeUri)
        val files = ArrayList<FileItem>()
        val empty = ArrayList<FileItem>()
        var folders = 0
        val rootName = rootId.substringAfter(':').ifBlank { "Selected folder" }

        // Iterative DFS keeps memory flat on deep trees.
        val stack = ArrayDeque<Pair<String, String>>() // documentId to display path
        stack.addLast(rootId to rootName)
        while (stack.isNotEmpty()) {
            coroutineContext.ensureActive()
            val (docId, path) = stack.removeLast()
            folders++
            val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, docId)
            var childCount = 0
            try {
                resolver.query(
                    childrenUri,
                    arrayOf(
                        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                        DocumentsContract.Document.COLUMN_MIME_TYPE,
                        DocumentsContract.Document.COLUMN_SIZE,
                        DocumentsContract.Document.COLUMN_LAST_MODIFIED,
                    ),
                    null, null, null,
                )?.use { c ->
                    while (c.moveToNext()) {
                        childCount++
                        val id = c.getString(0) ?: continue
                        val name = c.getString(1) ?: continue
                        val mime = c.getString(2)
                        if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                            stack.addLast(id to "$path/$name")
                        } else {
                            val size = if (c.isNull(3)) 0 else c.getLong(3)
                            files += FileItem(
                                uri = DocumentsContract.buildDocumentUriUsingTree(treeUri, id),
                                name = name,
                                sizeBytes = size,
                                location = path,
                                mimeType = mime,
                                modifiedMillis = if (c.isNull(4)) 0 else c.getLong(4),
                                category = FileClassifier.classify(name, mime),
                                fromDocumentTree = true,
                            )
                            if (files.size % 50 == 0) onProgress(files.size)
                        }
                    }
                }
            } catch (e: Exception) {
                continue
            }
            if (childCount == 0 && docId != rootId) {
                empty += FileItem(
                    uri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId),
                    name = path.substringAfterLast('/'),
                    sizeBytes = 0,
                    location = path.substringBeforeLast('/'),
                    mimeType = DocumentsContract.Document.MIME_TYPE_DIR,
                    modifiedMillis = 0,
                    category = FileCategory.OTHER,
                    fromDocumentTree = true,
                )
            }
        }
        onProgress(files.size)
        FolderScanResult(rootName, files, empty, files.size, folders).also { lastFolderScan = it }
    }

    // ------------------------------------------------------------------ own cache

    fun ownCacheBytes(): Long =
        listOfNotNull(context.cacheDir, context.externalCacheDir).sumOf { dirSize(it) }

    suspend fun clearOwnCache(): Long = withContext(Dispatchers.IO) {
        val before = ownCacheBytes()
        listOfNotNull(context.cacheDir, context.externalCacheDir).forEach { dir ->
            dir.listFiles()?.forEach { it.deleteRecursively() }
        }
        before - ownCacheBytes()
    }

    private fun dirSize(dir: File): Long =
        if (!dir.exists()) 0 else dir.walkTopDown().filter { it.isFile }.sumOf { it.length() }

    // ------------------------------------------------------------------ deletion (always after user confirmation in the UI)

    suspend fun delete(items: List<FileItem>): DeleteOutcome = withContext(Dispatchers.IO) {
        val tree = items.filter { it.fromDocumentTree }
        val media = items.filterNot { it.fromDocumentTree }
        var deleted = 0
        var failed = 0
        tree.forEach { item ->
            val ok = runCatching { DocumentsContract.deleteDocument(resolver, item.uri) }.getOrDefault(false)
            if (ok) deleted++ else failed++
        }
        if (media.isEmpty()) return@withContext DeleteOutcome.Deleted(deleted, failed)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // The system shows its own confirmation dialog for files owned by other apps.
            val pending: PendingIntent = MediaStore.createDeleteRequest(resolver, media.map { it.uri })
            return@withContext DeleteOutcome.NeedsUserConsent(pending.intentSender, media)
        }
        val remaining = media.toMutableList()
        val iterator = remaining.iterator()
        while (iterator.hasNext()) {
            val item = iterator.next()
            try {
                if (resolver.delete(item.uri, null, null) > 0) deleted++ else failed++
                iterator.remove()
            } catch (e: SecurityException) {
                if (Build.VERSION.SDK_INT == Build.VERSION_CODES.Q && e is RecoverableSecurityException) {
                    return@withContext DeleteOutcome.NeedsUserConsent(e.userAction.actionIntent.intentSender, remaining)
                }
                failed++
                iterator.remove()
            }
        }
        DeleteOutcome.Deleted(deleted, failed)
    }

    /** Which of [items] still exist (used after deletes, including after a system consent dialog). */
    suspend fun stillExisting(items: List<FileItem>): List<FileItem> = withContext(Dispatchers.IO) {
        items.filter { item ->
            runCatching { resolver.query(item.uri, null, null, null, null)?.use { it.count > 0 } ?: false }
                .getOrDefault(false)
        }
    }
}
