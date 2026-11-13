package com.webtecit.devicepilot.data

import android.Manifest
import android.app.usage.StorageStatsManager
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Process
import android.os.storage.StorageManager
import android.provider.DocumentsContract
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.coroutines.coroutineContext

enum class JunkKind { TEMP, LOG, THUMBNAILS, APK, EMPTY_FOLDER }

data class JunkGroup(val kind: JunkKind, val files: List<File>, val bytes: Long)

data class AppCache(val packageName: String, val label: String, val cacheBytes: Long)

/** A large file found either on the file system (full edition) or in a user-chosen folder. */
data class BigFile(val name: String, val path: String, val size: Long, val modified: Long, val file: File?, val uri: Uri?)

/**
 * Junk and big-file scanning.
 * - App caches: StorageStatsManager (needs Usage Access) — read-only; clearing goes through Android.
 * - File junk and whole-storage big files: only with "All files access" (full edition).
 * - Folder scan: Storage Access Framework tree the user picked (both editions).
 */
class StorageCleaner(private val context: Context, private val apps: AppsRepository) {

    fun hasAllFilesAccess(): Boolean = when {
        Build.VERSION.SDK_INT >= 30 -> Environment.isExternalStorageManager()
        else -> ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
    }

    /** Per-app cache sizes, largest first. Returns null without Usage Access or on Android 7. */
    suspend fun appCaches(): List<AppCache>? = withContext(Dispatchers.IO) {
        if (Build.VERSION.SDK_INT < 26) return@withContext null
        val ssm = context.getSystemService(Context.STORAGE_STATS_SERVICE) as StorageStatsManager
        val pm = context.packageManager
        @Suppress("DEPRECATION")
        val all = pm.getInstalledApplications(0)
        var permitted = false
        val list = all.mapNotNull { ai ->
            coroutineContext.ensureActive()
            val stats = runCatching {
                ssm.queryStatsForPackage(StorageManager.UUID_DEFAULT, ai.packageName, Process.myUserHandle())
            }.onSuccess { permitted = true }.getOrNull() ?: return@mapNotNull null
            if (stats.cacheBytes <= 0) return@mapNotNull null
            AppCache(ai.packageName, runCatching { ai.loadLabel(pm).toString() }.getOrDefault(ai.packageName), stats.cacheBytes)
        }
        if (!permitted) null else list.sortedByDescending { it.cacheBytes }
    }

    private val root: File get() = Environment.getExternalStorageDirectory()

    /** Walks shared storage (skipping Android/data and Android/obb) once for junk and big files. */
    suspend fun scanFiles(
        bigThreshold: Long = 50L * 1024 * 1024,
        onProgress: (Int) -> Unit = {},
    ): Pair<List<JunkGroup>, List<BigFile>> = withContext(Dispatchers.IO) {
        val job = coroutineContext[Job]
        var seen = 0
        val temp = mutableListOf<File>(); val logs = mutableListOf<File>(); val thumbs = mutableListOf<File>()
        val apks = mutableListOf<File>(); val empty = mutableListOf<File>(); val big = mutableListOf<BigFile>()
        val skip = setOf(File(root, "Android/data").absolutePath, File(root, "Android/obb").absolutePath)

        fun walk(dir: File, depth: Int): Boolean { // returns true if the directory ends up empty
            if (depth > 14 || dir.absolutePath in skip) return false
            val children = dir.listFiles() ?: return false
            var nonEmpty = false
            for (f in children) {
                // Stop promptly when the user cancels or leaves the screen.
                if (job?.isActive == false) throw CancellationException()
                if (++seen % 250 == 0) onProgress(seen)
                if (f.isDirectory) {
                    if (f.name == ".thumbnails" || f.name == ".Thumbnails") {
                        f.walkBottomUp().filter { it.isFile }.forEach { thumbs += it }
                        nonEmpty = true
                        continue
                    }
                    val isEmpty = walk(f, depth + 1)
                    if (isEmpty) empty += f else nonEmpty = true
                } else {
                    nonEmpty = true
                    val n = f.name.lowercase()
                    when {
                        n.endsWith(".tmp") || n.endsWith(".temp") || n.startsWith("~") -> temp += f
                        n.endsWith(".log") -> logs += f
                        n.endsWith(".apk") -> apks += f
                    }
                    val len = f.length()
                    if (len >= bigThreshold) big += BigFile(f.name, f.absolutePath, len, f.lastModified(), f, null)
                }
            }
            return !nonEmpty && depth > 0
        }
        walk(root, 0)
        onProgress(seen)
        fun g(k: JunkKind, l: List<File>) = JunkGroup(k, l, l.sumOf { it.length() })
        listOf(g(JunkKind.TEMP, temp), g(JunkKind.LOG, logs), g(JunkKind.THUMBNAILS, thumbs),
            g(JunkKind.APK, apks), JunkGroup(JunkKind.EMPTY_FOLDER, empty, 0L)) to
            big.sortedByDescending { it.size }.take(200)
    }

    /** Deletes the given files/folders; returns (count, bytes) actually removed. */
    suspend fun deleteFiles(files: Collection<File>): Pair<Int, Long> = withContext(Dispatchers.IO) {
        var n = 0; var bytes = 0L
        for (f in files) {
            val size = if (f.isFile) f.length() else 0L
            val ok = if (f.isDirectory) (f.listFiles()?.isEmpty() == true && f.delete()) else f.delete()
            if (ok) { n++; bytes += size }
        }
        n to bytes
    }

    /** Recursively scans a user-picked folder (SAF tree) for files at or above [threshold]. */
    suspend fun scanTree(
        tree: Uri,
        threshold: Long = 20L * 1024 * 1024,
        onProgress: (Int) -> Unit = {},
    ): List<BigFile> = withContext(Dispatchers.IO) {
        val job = coroutineContext[Job]
        var seen = 0
        val out = mutableListOf<BigFile>()
        val resolver = context.contentResolver
        fun walk(docId: String, path: String, depth: Int) {
            if (depth > 12) return
            val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId)
            val subDirs = mutableListOf<Pair<String, String>>()
            try {
                resolver.query(children, arrayOf(
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_SIZE,
                    DocumentsContract.Document.COLUMN_LAST_MODIFIED), null, null, null)?.use { c ->
                    while (c.moveToNext()) {
                        if (job?.isActive == false) throw CancellationException()
                        if (++seen % 100 == 0) onProgress(seen)
                        val id = c.getString(0); val name = c.getString(1) ?: continue
                        if (c.getString(2) == DocumentsContract.Document.MIME_TYPE_DIR) {
                            subDirs += id to "$path/$name"
                        } else {
                            val size = if (c.isNull(3)) 0L else c.getLong(3)
                            if (size >= threshold) out += BigFile(name, "$path/$name", size, if (c.isNull(4)) 0L else c.getLong(4),
                                null, DocumentsContract.buildDocumentUriUsingTree(tree, id))
                        }
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Unreadable folder: skip it.
            }
            // Visit sub-folders after the cursor is closed so only one is open at a time.
            for ((id, p) in subDirs) walk(id, p, depth + 1)
        }
        val rootId = DocumentsContract.getTreeDocumentId(tree)
        walk(rootId, rootId.substringAfter(':'), 0)
        onProgress(seen)
        out.sortedByDescending { it.size }.take(200)
    }

    /** Deletes a big file (file path or SAF document). */
    suspend fun deleteBig(f: BigFile): Boolean = withContext(Dispatchers.IO) {
        when {
            f.file != null -> f.file.delete()
            f.uri != null -> runCatching { DocumentsContract.deleteDocument(context.contentResolver, f.uri) }.getOrDefault(false)
            else -> false
        }
    }

    @Suppress("unused")
    private fun isUserApp(ai: ApplicationInfo) = ai.flags and ApplicationInfo.FLAG_SYSTEM == 0
}
