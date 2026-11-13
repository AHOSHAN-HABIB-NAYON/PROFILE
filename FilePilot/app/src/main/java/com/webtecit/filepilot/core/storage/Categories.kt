package com.webtecit.filepilot.core.storage

import android.content.Context
import android.provider.MediaStore
import com.webtecit.filepilot.core.common.IoDispatcher
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext

enum class Category(val label: String, val kind: FileKind) {
    IMAGES("Images", FileKind.IMAGE),
    VIDEOS("Videos", FileKind.VIDEO),
    AUDIO("Audio", FileKind.AUDIO),
    DOCUMENTS("Documents", FileKind.DOCUMENT),
    APKS("APKs", FileKind.APK),
    ARCHIVES("Archives", FileKind.ARCHIVE),
    LARGE("Large files", FileKind.OTHER),
    RECENT("Recent files", FileKind.OTHER);

    val id: String get() = CategoryFileSystem.PREFIX + name
}

data class CategorySummary(val category: Category, val count: Int, val bytes: Long)

/** Finds files by type through Android's media index (MediaStore), which is fast even on full phones. */
@Singleton
class CategoryRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    @IoDispatcher private val io: CoroutineDispatcher,
) {
    private val uri = MediaStore.Files.getContentUri("external")
    private val docExt = listOf("pdf", "doc", "docx", "odt", "rtf", "txt", "md", "xls", "xlsx", "ods", "csv", "ppt", "pptx", "odp", "epub", "html", "htm", "json", "xml")
    private val apkExt = listOf("apk", "xapk", "apks", "apkm")
    private val archiveExt = listOf("zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz")

    private fun selection(category: Category): Pair<String, Array<String>> {
        val type = MediaStore.Files.FileColumns.MEDIA_TYPE
        fun ext(list: List<String>) =
            list.joinToString(" OR ") { "${MediaStore.Files.FileColumns.DISPLAY_NAME} LIKE ?" } to list.map { "%.$it" }.toTypedArray()
        return when (category) {
            Category.IMAGES -> "$type = ${MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE}" to emptyArray()
            Category.VIDEOS -> "$type = ${MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO}" to emptyArray()
            Category.AUDIO -> "$type = ${MediaStore.Files.FileColumns.MEDIA_TYPE_AUDIO}" to emptyArray()
            Category.DOCUMENTS -> ext(docExt)
            Category.APKS -> ext(apkExt)
            Category.ARCHIVES -> ext(archiveExt)
            Category.LARGE -> "${MediaStore.Files.FileColumns.SIZE} > ?" to arrayOf(LARGE_BYTES.toString())
            Category.RECENT -> "${MediaStore.Files.FileColumns.DATE_MODIFIED} > ? AND ${MediaStore.Files.FileColumns.SIZE} > 0" to
                arrayOf(((System.currentTimeMillis() - 7L * 24 * 3600 * 1000) / 1000).toString())
        }
    }

    suspend fun summaries(): List<CategorySummary> = coroutineScope {
        listOf(Category.IMAGES, Category.VIDEOS, Category.AUDIO, Category.DOCUMENTS, Category.APKS, Category.ARCHIVES)
            .map { c -> async(io) { summary(c) } }
            .map { it.await() }
    }

    private fun summary(category: Category): CategorySummary {
        val (sel, args) = selection(category)
        var count = 0
        var bytes = 0L
        runCatching {
            context.contentResolver.query(uri, arrayOf(MediaStore.Files.FileColumns.SIZE), sel, args, null)?.use { c ->
                while (c.moveToNext()) {
                    count++
                    bytes += c.getLong(0)
                }
            }
        }
        return CategorySummary(category, count, bytes)
    }

    @Suppress("DEPRECATION")
    suspend fun list(category: Category): List<FileItem> = withContext(io) {
        val (sel, args) = selection(category)
        val order = when (category) {
            Category.LARGE -> "${MediaStore.Files.FileColumns.SIZE} DESC"
            else -> "${MediaStore.Files.FileColumns.DATE_MODIFIED} DESC"
        }
        val projection = arrayOf(
            MediaStore.Files.FileColumns.DATA,
            MediaStore.Files.FileColumns.DISPLAY_NAME,
            MediaStore.Files.FileColumns.SIZE,
            MediaStore.Files.FileColumns.DATE_MODIFIED,
            MediaStore.Files.FileColumns.MIME_TYPE,
        )
        val out = ArrayList<FileItem>()
        val cursor = try {
            context.contentResolver.query(uri, projection, sel, args, order)
        } catch (e: SecurityException) {
            throw FsException(FsError.ACCESS_DENIED, "Allow storage access to see your ${category.label.lowercase()}.", e)
        } ?: return@withContext out
        cursor.use { c ->
            while (c.moveToNext() && out.size < MAX_ITEMS) {
                val path = c.getString(0) ?: continue
                val name = c.getString(1) ?: File(path).name
                if (File(path).isDirectory) continue
                out += FileItem(
                    id = path,
                    name = name,
                    isDirectory = false,
                    size = c.getLong(2),
                    lastModified = c.getLong(3) * 1000,
                    mimeType = c.getString(4) ?: FileTypes.mimeOf(name),
                )
            }
        }
        out
    }

    companion object {
        const val LARGE_BYTES = 50_000_000L
        const val MAX_ITEMS = 20_000
    }
}

/**
 * A read-only virtual folder per category ("cat:IMAGES"), so the browser shows categories with
 * all its tools. The items themselves are ordinary files with paths.
 */
class CategoryFileSystem(private val repository: CategoryRepository) : FileSystem {
    override fun handles(id: String) = id.startsWith(PREFIX)
    private fun categoryOf(id: String) = runCatching { Category.valueOf(id.removePrefix(PREFIX)) }.getOrNull()
        ?: throw FsException(FsError.NOT_FOUND, "Unknown category.")

    override suspend fun list(dirId: String) = repository.list(categoryOf(dirId))
    override suspend fun stat(id: String): FileItem? = null
    override fun parentId(id: String): String? = null
    override fun nameOf(id: String) = runCatching { categoryOf(id).label }.getOrDefault("Category")
    private fun readOnly(): Nothing = throw FsException(FsError.NOT_SUPPORTED, "Categories are collections of files. Open a folder to create or paste items.")
    override suspend fun createDirectory(parentId: String, name: String): FileItem = readOnly()
    override suspend fun createFile(parentId: String, name: String): FileItem = readOnly()
    override suspend fun rename(id: String, newName: String): FileItem = readOnly()
    override suspend fun delete(id: String) = readOnly()
    override val nativeRecursiveDelete = false
    override suspend fun childOf(parentId: String, name: String): FileItem? = null
    override fun openInput(id: String): InputStream = readOnly()
    override fun openOutput(id: String): OutputStream = readOnly()
    override suspend fun moveFast(item: FileItem, targetParentId: String, newName: String): FileItem? = null
    override suspend fun freeSpace(dirId: String): Long? = null
    override fun isAncestor(ancestorId: String, id: String) = false
    override fun displayPath(id: String) = nameOf(id)

    companion object {
        const val PREFIX = "cat:"
    }
}
