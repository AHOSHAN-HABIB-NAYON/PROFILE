package com.webtecit.filepilot.core.archive

import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

data class ArchiveEntry(val path: String, val size: Long, val compressedSize: Long, val isDirectory: Boolean, val time: Long)

/** ZIP reading, extraction and creation with protection against path-traversal ("Zip Slip"). */
object ZipTools {

    /** Extracts [input] into [target]. Entries that would land outside [target] are refused. Returns files written. */
    suspend fun extract(input: InputStream, target: File, only: Set<String>? = null): Int {
        target.mkdirs()
        val base = target.canonicalFile
        var count = 0
        ZipInputStream(input.buffered()).use { zip ->
            while (true) {
                currentCoroutineContext().ensureActive()
                val entry = zip.nextEntry ?: break
                if (only != null && only.none { entry.name == it || entry.name.startsWith(it.trimEnd('/') + "/") }) continue
                val out = safeChild(base, entry.name)
                    ?: throw SecurityException("The archive contains an unsafe path: ${entry.name}")
                if (entry.isDirectory) {
                    out.mkdirs()
                } else {
                    out.parentFile?.mkdirs()
                    out.outputStream().use { zip.copyTo(it, 256 * 1024) }
                    if (entry.time > 0) out.setLastModified(entry.time)
                    count++
                }
            }
        }
        return count
    }

    fun list(input: InputStream): List<ArchiveEntry> {
        val out = ArrayList<ArchiveEntry>()
        ZipInputStream(input.buffered()).use { zip ->
            while (true) {
                val e = zip.nextEntry ?: break
                var size = e.size
                if (size < 0 && !e.isDirectory) size = zip.readBytes().size.toLong()
                out += ArchiveEntry(e.name, size, e.compressedSize, e.isDirectory, e.time)
            }
        }
        return out
    }

    /** The file an entry maps to, or null when the entry escapes [base]. */
    fun safeChild(base: File, name: String): File? {
        if (name.startsWith("/") || name.startsWith("\\") || name.contains('\u0000')) return null
        val file = File(base, name).canonicalFile
        val b = base.canonicalPath
        return if (file.path == b || file.path.startsWith(b + File.separator)) file else null
    }

    /** Writes [sources] (files or folders) into a ZIP stream; folder contents keep their relative paths. */
    suspend fun zip(sources: List<File>, output: OutputStream, skip: (File) -> Boolean = { false }): Int {
        var count = 0
        ZipOutputStream(output.buffered()).use { zip ->
            suspend fun add(file: File, path: String) {
                currentCoroutineContext().ensureActive()
                if (skip(file)) return
                if (file.isDirectory) {
                    zip.putNextEntry(ZipEntry("$path/").apply { time = file.lastModified() })
                    zip.closeEntry()
                    file.listFiles()?.sortedBy { it.name }?.forEach { add(it, "$path/${it.name}") }
                } else {
                    zip.putNextEntry(ZipEntry(path).apply { time = file.lastModified() })
                    file.inputStream().use { it.copyTo(zip, 256 * 1024) }
                    zip.closeEntry()
                    count++
                }
            }
            sources.forEach { add(it, it.name) }
        }
        return count
    }
}
