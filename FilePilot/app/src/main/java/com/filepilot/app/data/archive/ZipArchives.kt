package com.filepilot.app.data.archive

import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.SourceKind
import com.filepilot.app.data.files.FileAccessException
import com.filepilot.app.data.files.FileRepository
import java.io.File
import java.io.InputStream
import java.nio.charset.Charset
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class ZipEntryInfo(
    /** Normalized path inside the archive, without a trailing slash. */
    val path: String,
    val isDirectory: Boolean,
    val size: Long,
    val compressedSize: Long,
    val time: Long,
) {
    val name: String get() = path.substringAfterLast('/')
    val parent: String get() = path.substringBeforeLast('/', "")
}

/** ZIP reading with strict path validation. Entries that try to escape the target folder are rejected. */
object ZipArchives {
    private val fallbackCharset: Charset = Charset.forName("IBM437")

    /**
     * Splits an entry name into safe path segments, or returns null for names that are absolute,
     * contain "..", or otherwise could write outside the extraction folder ("Zip Slip").
     */
    fun safeSegments(rawName: String): List<String>? {
        val name = rawName.replace('\\', '/')
        if (name.startsWith("/")) return null
        if (name.length >= 2 && name[1] == ':') return null
        val segments = name.split('/').filter { it.isNotEmpty() && it != "." }
        if (segments.isEmpty()) return null
        if (segments.any { it == ".." || it.contains('\u0000') }) return null
        return segments
    }

    suspend fun list(repo: FileRepository, item: FileItem): List<ZipEntryInfo> = withContext(Dispatchers.IO) {
        // Listing reads only the ZIP's central directory; no entry data is decompressed.
        fun read(charset: Charset): List<ZipEntryInfo> {
            val out = mutableListOf<ZipEntryInfo>()
            visit(repo, item, charset, listOnly = true) { entry, _ ->
                val seg = safeSegments(entry.name) ?: return@visit
                out += ZipEntryInfo(seg.joinToString("/"), entry.isDirectory, entry.size, entry.compressedSize, entry.time)
            }
            return out
        }
        val raw = try {
            read(Charsets.UTF_8)
        } catch (e: IllegalArgumentException) {
            read(fallbackCharset)
        }
        // Many archives omit explicit folder entries; synthesize them so browsing works.
        val dirs = HashSet<String>()
        raw.filter { it.isDirectory }.forEach { dirs += it.path }
        raw.forEach { e ->
            var p = e.parent
            while (p.isNotEmpty()) {
                dirs += p
                p = p.substringBeforeLast('/', "")
            }
        }
        val files = raw.filterNot { it.isDirectory }.distinctBy { it.path }
        val filePaths = files.mapTo(HashSet()) { it.path }
        files + dirs.filter { it !in filePaths }.map { ZipEntryInfo(it, true, -1, -1, 0) }
    }

    /**
     * Visits each entry with an input stream for its data. Local files use ZipFile (random access);
     * documents from other providers are streamed with ZipInputStream.
     */
    /** UTF-8 unless the archive's names only decode as the legacy DOS code page. */
    fun charsetFor(repo: FileRepository, item: FileItem): Charset = try {
        visit(repo, item, Charsets.UTF_8, listOnly = true) { _, _ -> }
        Charsets.UTF_8
    } catch (e: IllegalArgumentException) {
        fallbackCharset
    }

    fun forEachEntry(
        repo: FileRepository,
        item: FileItem,
        listOnly: Boolean = false,
        charset: Charset = charsetFor(repo, item),
        block: (ZipEntry, InputStream) -> Unit,
    ) = visit(repo, item, charset, listOnly, block)

    private val empty get() = java.io.ByteArrayInputStream(ByteArray(0))

    private fun visit(repo: FileRepository, item: FileItem, charset: Charset, listOnly: Boolean, block: (ZipEntry, InputStream) -> Unit) {
        val path = item.path
        if (item.source == SourceKind.LOCAL && path != null) {
            ZipFile(File(path), charset).use { visitZipFile(it, listOnly, block) }
            return
        }
        // Documents from other providers: random access through the file descriptor when the
        // provider is backed by a real file, which avoids streaming the whole archive.
        val pfd = runCatching { repo.resolver.openFileDescriptor(item.uri, "r") }.getOrNull()
        if (pfd != null) {
            var started = false
            val tracked: (ZipEntry, InputStream) -> Unit = { e, input ->
                started = true
                block(e, input)
            }
            val viaFd = runCatching {
                pfd.use { fd -> ZipFile(File("/proc/self/fd/${fd.fd}"), charset).use { visitZipFile(it, listOnly, tracked) } }
            }
            if (viaFd.isSuccess) return
            val error = viaFd.exceptionOrNull()!!
            // Only fall back if nothing was processed yet; otherwise the work would run twice.
            if (started || error is IllegalArgumentException) throw error
        }
        ZipInputStream(repo.openInput(item).buffered(), charset).use { zis ->
            while (true) {
                val e = zis.nextEntry ?: break
                block(e, zis)
                zis.closeEntry()
            }
        }
    }

    private fun visitZipFile(zip: ZipFile, listOnly: Boolean, block: (ZipEntry, InputStream) -> Unit) {
        val entries = zip.entries()
        while (entries.hasMoreElements()) {
            val e = entries.nextElement()
            if (e.isDirectory || listOnly) block(e, empty) else zip.getInputStream(e).use { block(e, it) }
        }
    }

    fun ensureZip(item: FileItem) {
        if (item.extension != "zip" && item.extension != "jar") throw FileAccessException("Only ZIP archives can be opened in FilePilot")
    }
}
