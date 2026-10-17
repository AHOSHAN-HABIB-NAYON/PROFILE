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
        val raw = mutableListOf<ZipEntryInfo>()
        forEachEntry(repo, item) { entry, _ ->
            val seg = safeSegments(entry.name) ?: return@forEachEntry
            raw += ZipEntryInfo(seg.joinToString("/"), entry.isDirectory, entry.size, entry.compressedSize, entry.time)
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
        files + dirs.filter { d -> files.none { it.path == d } }.map { ZipEntryInfo(it, true, -1, -1, 0) }
    }

    /**
     * Visits each entry with an input stream for its data. Local files use ZipFile (random access);
     * documents from other providers are streamed with ZipInputStream.
     */
    fun forEachEntry(repo: FileRepository, item: FileItem, block: (ZipEntry, InputStream) -> Unit) {
        try {
            visit(repo, item, Charsets.UTF_8, block)
        } catch (e: IllegalArgumentException) {
            // Non-UTF-8 entry names (common with older Windows tools).
            visit(repo, item, fallbackCharset, block)
        }
    }

    private fun visit(repo: FileRepository, item: FileItem, charset: Charset, block: (ZipEntry, InputStream) -> Unit) {
        val path = item.path
        if (item.source == SourceKind.LOCAL && path != null) {
            ZipFile(File(path), charset).use { zip ->
                val entries = zip.entries()
                while (entries.hasMoreElements()) {
                    val e = entries.nextElement()
                    if (e.isDirectory) block(e, java.io.ByteArrayInputStream(ByteArray(0))) else zip.getInputStream(e).use { block(e, it) }
                }
            }
        } else {
            ZipInputStream(repo.openInput(item).buffered(), charset).use { zis ->
                while (true) {
                    val e = zis.nextEntry ?: break
                    block(e, zis)
                    zis.closeEntry()
                }
            }
        }
    }

    fun ensureZip(item: FileItem) {
        if (item.extension != "zip" && item.extension != "jar") throw FileAccessException("Only ZIP archives can be opened in FilePilot")
    }
}
